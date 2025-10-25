"""Routing simulator utilities for the Console MCP backend."""

from __future__ import annotations

from dataclasses import dataclass
import re
from typing import Iterable, Mapping, MutableMapping, Sequence, TYPE_CHECKING

from .bandit import BanditStrategy, compute_lane_bandit_weights

from ..prices import list_price_entries
from ..schemas import (
    ProviderSummary,
    RoutingCostProjection,
    RoutingDistributionEntry,
    RoutingLatencyProjection,
    RoutingRouteProfile,
    RoutingSimulationContext,
    RoutingSimulationResponse,
)

if TYPE_CHECKING:  # pragma: no cover - type checking helper
    from ..prices import PriceEntryRecord


LANE_BASELINES: Mapping[str, dict[str, float]] = {
    "economy": {"cost": 12.0, "latency": 2400.0},
    "balanced": {"cost": 19.0, "latency": 1500.0},
    "turbo": {"cost": 32.0, "latency": 780.0},
}

DEFAULT_STRATEGY = "balanced"

STRATEGY_WEIGHTS: Mapping[str, Mapping[str, float]] = {
    "balanced": {"economy": 0.3, "balanced": 0.5, "turbo": 0.2},
    "finops": {"economy": 0.55, "balanced": 0.35, "turbo": 0.1},
    "latency": {"economy": 0.1, "balanced": 0.35, "turbo": 0.55},
    "resilience": {"economy": 0.25, "balanced": 0.45, "turbo": 0.3},
}

BANDIT_STRATEGIES: Mapping[str, BanditStrategy] = {
    "bandit_thompson": BanditStrategy.THOMPSON,
    "bandit_ucb": BanditStrategy.UCB,
}

LANES: tuple[str, ...] = ("economy", "balanced", "turbo")

_LANE_MATCHER = re.compile(r"lane\s*==\s*['\"]?(economy|balanced|turbo)['\"]?", re.IGNORECASE)
_PROVIDER_MATCHER = re.compile(
    r"provider[_\s-]*id\s*==\s*['\"]?([a-z0-9_.:-]+)['\"]?",
    re.IGNORECASE,
)


@dataclass(frozen=True)
class RouteProfile:
    """Calculated attributes for a provider participating in the plan."""

    id: str
    provider: ProviderSummary
    lane: str
    cost_per_million: float
    latency_p95: float
    reliability: float
    capacity_score: float


@dataclass(frozen=True)
class DistributionEntry:
    """Share of the volume allocated to a specific route."""

    route: RouteProfile
    share: float
    tokens_millions: float
    cost: float


@dataclass(frozen=True)
class RoutingIntent:
    """Intent configuration passed by the frontend during simulation."""

    intent: str
    description: str | None
    tags: tuple[str, ...]
    default_tier: str
    fallback_provider_id: str | None


@dataclass(frozen=True)
class RoutingRule:
    """Custom rule that alters the simulated distribution."""

    id: str
    description: str | None
    intent: str | None
    matcher: str
    target_tier: str | None
    provider_id: str | None
    weight: float | None


@dataclass(frozen=True)
class PlanResult:
    """Aggregated metrics computed for a simulation."""

    context: "SimulationContext"
    cost: "CostProjection"
    latency: "LatencyProjection"
    distribution: tuple[DistributionEntry, ...]
    excluded_route: RouteProfile | None


@dataclass(frozen=True)
class SimulationContext:
    """Describes the scenario evaluated by the simulator."""

    strategy_id: str
    provider_ids: tuple[str, ...]
    volume_millions: float
    failover_id: str | None


@dataclass(frozen=True)
class CostProjection:
    """Cost figures estimated for the simulated scenario."""

    total: float
    per_million: float


@dataclass(frozen=True)
class LatencyProjection:
    """Latency and reliability estimates for the simulated scenario."""

    avg_latency: float
    reliability_score: float


def _hash_string(value: str) -> int:
    hash_value = 0
    for char in value:
        hash_value = (hash_value << 5) - hash_value + ord(char)
        hash_value &= 0xFFFFFFFF
    return abs(hash_value)


def _seeded_mod(value: str, modulo: int) -> int:
    if modulo <= 0:
        raise ValueError("Modulo must be greater than zero")
    return _hash_string(value) % modulo


def _determine_lane(provider: ProviderSummary) -> str:
    seed = _seeded_mod(f"{provider.id}-lane", 100)
    if seed < 35:
        return "economy"
    if seed < 82:
        return "balanced"
    return "turbo"


def _baseline_cost_per_million(provider: ProviderSummary, lane: str) -> float:
    base = LANE_BASELINES[lane]["cost"]
    multiplier = 0.82 + _seeded_mod(f"{provider.id}-cost", 35) / 100.0
    return round(base * multiplier, 2)


def _baseline_latency(provider: ProviderSummary, lane: str) -> float:
    base = LANE_BASELINES[lane]["latency"]
    multiplier = 0.78 + _seeded_mod(f"{provider.id}-lat", 40) / 100.0
    return round(base * multiplier, 0)


def _baseline_reliability(provider: ProviderSummary) -> float:
    base = 90 + _seeded_mod(f"{provider.id}-rel", 9)
    extra = _seeded_mod(f"{provider.id}-rel2", 6) / 10.0
    return round(base + extra, 1)


def _baseline_capacity(provider: ProviderSummary) -> float:
    return 60 + _seeded_mod(f"{provider.id}-cap", 50)


def _cost_from_price_entries(
    price_entries: Mapping[str, list["PriceEntryRecord"]],
    provider: ProviderSummary,
    lane: str,
) -> float:
    entries = price_entries.get(provider.id)
    if not entries:
        return _baseline_cost_per_million(provider, lane)

    best: float | None = None
    for entry in entries:
        input_cost = entry.input_cost_per_1k or 0.0
        output_cost = entry.output_cost_per_1k or 0.0
        unit_cost_per_million = (input_cost + output_cost) * 1000.0
        if best is None or unit_cost_per_million < best:
            best = unit_cost_per_million

    if best is None:
        return _baseline_cost_per_million(provider, lane)
    return round(best, 2)


def build_routes(providers: Iterable[ProviderSummary]) -> tuple[RouteProfile, ...]:
    price_entries: MutableMapping[str, list["PriceEntryRecord"]] = {}
    for entry in list_price_entries():
        price_entries.setdefault(entry.provider_id, []).append(entry)

    routes: list[RouteProfile] = []
    for provider in providers:
        lane = _determine_lane(provider)
        routes.append(
            RouteProfile(
                id=provider.id,
                provider=provider,
                lane=lane,
                cost_per_million=_cost_from_price_entries(price_entries, provider, lane),
                latency_p95=_baseline_latency(provider, lane),
                reliability=_baseline_reliability(provider),
                capacity_score=_baseline_capacity(provider),
            )
        )
    return tuple(routes)


def _normalise_lane_weights(weights: Mapping[str, float]) -> dict[str, float]:
    total = sum(value for value in weights.values() if value > 0)
    if total <= 0:
        return {lane: 1.0 / len(LANES) for lane in LANES}
    return {lane: (value / total) if value > 0 else 0.0 for lane, value in weights.items()}


def _derive_lane_weights(
    base_weights: Mapping[str, float],
    intents: Sequence[RoutingIntent],
    rules: Sequence[RoutingRule],
) -> dict[str, float]:
    weights = {lane: base_weights.get(lane, 0.0) for lane in LANES}

    if intents:
        counts: MutableMapping[str, float] = {lane: 0.0 for lane in LANES}
        for intent in intents:
            lane = intent.default_tier
            if lane in counts:
                counts[lane] += 1.0
        total = sum(counts.values())
        if total > 0:
            for lane, base in weights.items():
                intent_share = counts[lane] / total
                if base > 0:
                    weights[lane] = (base + intent_share) / 2.0
                else:
                    weights[lane] = intent_share

    targeted_lanes = {rule.target_tier for rule in rules if rule.target_tier}
    for lane in targeted_lanes:
        if lane in weights:
            weights[lane] = weights.get(lane, 0.0) + 0.05

    return _normalise_lane_weights(weights)


def _intent_fallback_boosts(intents: Sequence[RoutingIntent]) -> dict[str, float]:
    boosts: dict[str, float] = {}
    for intent in intents:
        provider_id = intent.fallback_provider_id
        if not provider_id:
            continue
        boosts[provider_id] = boosts.get(provider_id, 0.0) + 0.05
    return boosts


def _resolve_rule_filters(rule: RoutingRule) -> tuple[str | None, str | None]:
    lane_filter = rule.target_tier
    provider_filter = rule.provider_id

    matcher = rule.matcher or ""
    lane_match = _LANE_MATCHER.findall(matcher)
    provider_match = _PROVIDER_MATCHER.findall(matcher)

    if lane_match:
        lane_filter = lane_match[-1].lower()
    if provider_match:
        provider_filter = provider_match[-1]

    return lane_filter, provider_filter


def _rule_matches_route(route: RouteProfile, rule: RoutingRule) -> bool:
    lane_filter, provider_filter = _resolve_rule_filters(rule)

    if lane_filter and route.lane != lane_filter:
        return False
    if provider_filter and route.provider.id != provider_filter:
        return False
    return True


def _rule_multipliers(
    routes: Sequence[RouteProfile], rules: Sequence[RoutingRule]
) -> dict[str, float]:
    multipliers: dict[str, float] = {route.id: 1.0 for route in routes}
    for rule in rules:
        if rule.weight is not None and rule.weight > 0:
            continue
        for route in routes:
            if not _rule_matches_route(route, rule):
                continue
            boost = 0.1
            if rule.provider_id:
                boost += 0.05
            if rule.target_tier:
                boost += 0.02
            multipliers[route.id] = multipliers.get(route.id, 1.0) * (1.0 + boost)
    return multipliers


def _apply_explicit_rules(
    distribution: Sequence[DistributionEntry],
    rules: Sequence[RoutingRule],
    volume_millions: float,
) -> list[DistributionEntry]:
    effective_rules = [rule for rule in rules if rule.weight is not None and rule.weight > 0]
    if not effective_rules or volume_millions <= 0:
        return list(distribution)

    assigned: dict[str, float] = {}
    total_assigned = 0.0

    for rule in effective_rules:
        matches = [entry for entry in distribution if _rule_matches_route(entry.route, rule)]
        if not matches:
            continue
        fraction = min(max(rule.weight, 0.0), 100.0) / 100.0
        if fraction <= 0:
            continue
        share_each = fraction / len(matches)
        for entry in matches:
            assigned[entry.route.id] = assigned.get(entry.route.id, 0.0) + share_each
        total_assigned += fraction

    if total_assigned <= 0:
        return list(distribution)

    total_assigned = min(total_assigned, 1.0)
    remaining_fraction = 1.0 - total_assigned
    total_share = sum(entry.share for entry in distribution)

    adjusted: list[DistributionEntry] = []
    for entry in distribution:
        base_ratio = entry.share / total_share if total_share > 0 else 0.0
        redistributed_share = base_ratio * remaining_fraction + assigned.get(entry.route.id, 0.0)
        tokens = volume_millions * redistributed_share
        adjusted.append(
            DistributionEntry(
                route=entry.route,
                share=redistributed_share,
                tokens_millions=tokens,
                cost=tokens * entry.route.cost_per_million,
            )
        )

    return adjusted


def _finalise_distribution(distribution: Sequence[DistributionEntry]) -> tuple[DistributionEntry, ...]:
    final: list[DistributionEntry] = []
    for entry in distribution:
        final.append(
            DistributionEntry(
                route=entry.route,
                share=round(entry.share, 4),
                tokens_millions=round(entry.tokens_millions, 4),
                cost=round(entry.cost, 2),
            )
        )
    return tuple(final)


def compute_plan(
    routes: Iterable[RouteProfile],
    strategy_id: str,
    failover_id: str | None,
    volume_millions: float,
    *,
    intents: Sequence[RoutingIntent] | None = None,
    rules: Sequence[RoutingRule] | None = None,
) -> PlanResult:
    bandit_strategy = BANDIT_STRATEGIES.get(strategy_id)
    strategy = STRATEGY_WEIGHTS.get(strategy_id, STRATEGY_WEIGHTS[DEFAULT_STRATEGY])

    routes_seq = tuple(routes)
    provider_ids = tuple(route.provider.id for route in routes_seq)
    normalized_failover = failover_id if failover_id and failover_id != "none" else None

    intents_seq: tuple[RoutingIntent, ...] = tuple(intents or ())
    rules_seq: tuple[RoutingRule, ...] = tuple(rules or ())

    context = SimulationContext(
        strategy_id=strategy_id,
        provider_ids=provider_ids,
        volume_millions=volume_millions,
        failover_id=normalized_failover,
    )

    if not routes_seq:
        empty_cost = CostProjection(total=0.0, per_million=0.0)
        empty_latency = LatencyProjection(avg_latency=0.0, reliability_score=0.0)
        return PlanResult(
            context=context,
            cost=empty_cost,
            latency=empty_latency,
            distribution=tuple(),
            excluded_route=None,
        )

    excluded = None
    active_routes: list[RouteProfile] = []
    for route in routes_seq:
        if failover_id and failover_id != "none" and route.id == failover_id:
            excluded = route
            continue
        active_routes.append(route)

    if not active_routes:
        empty_cost = CostProjection(total=0.0, per_million=0.0)
        empty_latency = LatencyProjection(avg_latency=0.0, reliability_score=0.0)
        return PlanResult(
            context=context,
            cost=empty_cost,
            latency=empty_latency,
            distribution=tuple(),
            excluded_route=excluded,
        )

    lane_weights = _derive_lane_weights(strategy, intents_seq, rules_seq)
    fallback_boosts = _intent_fallback_boosts(intents_seq)
    multiplicative_rules = _rule_multipliers(tuple(active_routes), rules_seq)

    lane_groups: MutableMapping[str, dict[str, object]] = {}
    for lane in LANES:
        lane_routes = [route for route in active_routes if route.lane == lane]
        capacity_total = sum(route.capacity_score for route in lane_routes)
        lane_groups[lane] = {
            "routes": lane_routes,
            "weight": lane_weights.get(lane, 0.0),
            "capacity_total": capacity_total,
        }

    total_weight = sum(
        group["weight"]
        for group in lane_groups.values()
        if group["routes"] and group["weight"] > 0
    )

    distribution: list[DistributionEntry] = []
    if total_weight == 0:
        total_weight = 1.0

    for lane, group in lane_groups.items():
        routes_in_lane: list[RouteProfile] = group["routes"]  # type: ignore[assignment]
        if not routes_in_lane:
            continue
        lane_weight = group["weight"]  # type: ignore[assignment]
        lane_share = lane_weight / total_weight if total_weight > 0 else 0.0

        if bandit_strategy is not None:
            route_weights = compute_lane_bandit_weights(
                routes_in_lane,
                lane=lane,
                strategy=bandit_strategy,
            )
        else:
            route_weights = {route.id: route.capacity_score for route in routes_in_lane}

        weight_total = sum(route_weights.values())
        if weight_total <= 0:
            weight_total = sum(route.capacity_score for route in routes_in_lane)
        if weight_total <= 0:
            weight_total = len(routes_in_lane)

        for route in routes_in_lane:
            route_weight = route_weights.get(route.id)
            if route_weight is None or route_weight < 0:
                route_weight = route.capacity_score if route.capacity_score > 0 else 1.0
            multiplier = multiplicative_rules.get(route.id, 1.0)
            multiplier += fallback_boosts.get(route.provider.id, 0.0)
            if multiplier <= 0:
                multiplier = 1.0
            adjusted_weight = route_weight * multiplier
            share = lane_share * (adjusted_weight / weight_total if weight_total > 0 else 0.0)
            tokens = volume_millions * share
            cost = tokens * route.cost_per_million
            distribution.append(
                DistributionEntry(
                    route=route,
                    share=share,
                    tokens_millions=tokens,
                    cost=cost,
                )
            )

    distribution = _apply_explicit_rules(distribution, rules_seq, volume_millions)
    distribution_tuple = _finalise_distribution(distribution)

    total_cost = sum(entry.cost for entry in distribution_tuple)
    cost_per_million = total_cost / volume_millions if volume_millions > 0 else 0.0

    avg_latency = 0.0
    reliability_score = 0.0
    for entry in distribution_tuple:
        avg_latency += entry.route.latency_p95 * entry.share
        reliability_score += entry.route.reliability * entry.share

    cost_projection = CostProjection(
        total=round(total_cost, 2),
        per_million=round(cost_per_million, 2),
    )
    latency_projection = LatencyProjection(
        avg_latency=round(avg_latency, 2),
        reliability_score=round(reliability_score, 2),
    )

    return PlanResult(
        context=context,
        cost=cost_projection,
        latency=latency_projection,
        distribution=distribution_tuple,
        excluded_route=excluded,
    )


def _route_profile_to_schema(route: RouteProfile) -> RoutingRouteProfile:
    return RoutingRouteProfile(
        id=route.id,
        provider=route.provider,
        lane=route.lane,
        cost_per_million=route.cost_per_million,
        latency_p95=route.latency_p95,
        reliability=route.reliability,
        capacity_score=route.capacity_score,
    )


def render_plan_result(plan: PlanResult) -> RoutingSimulationResponse:
    """Convert a computed plan into the API response schema."""

    distribution = [
        RoutingDistributionEntry(
            route=_route_profile_to_schema(entry.route),
            share=entry.share,
            tokens_millions=entry.tokens_millions,
            cost=entry.cost,
        )
        for entry in plan.distribution
    ]

    excluded = (
        _route_profile_to_schema(plan.excluded_route)
        if plan.excluded_route is not None
        else None
    )

    return RoutingSimulationResponse(
        context=RoutingSimulationContext(
            strategy=plan.context.strategy_id,
            provider_ids=list(plan.context.provider_ids),
            provider_count=len(plan.context.provider_ids),
            volume_millions=plan.context.volume_millions,
            failover_provider_id=plan.context.failover_id,
        ),
        cost=RoutingCostProjection(
            total_usd=plan.cost.total,
            cost_per_million_usd=plan.cost.per_million,
        ),
        latency=RoutingLatencyProjection(
            avg_latency_ms=plan.latency.avg_latency,
            reliability_score=plan.latency.reliability_score,
        ),
        distribution=distribution,
        excluded_route=excluded,
    )


def build_simulation_response(
    providers: Iterable[ProviderSummary],
    *,
    strategy_id: str,
    failover_id: str | None,
    volume_millions: float,
    intents: Sequence[RoutingIntent] | None = None,
    rules: Sequence[RoutingRule] | None = None,
) -> RoutingSimulationResponse:
    """Execute the simulator for the given providers and serialize the response."""

    routes = build_routes(providers)
    plan = compute_plan(
        routes,
        strategy_id,
        failover_id,
        volume_millions,
        intents=intents,
        rules=rules,
    )
    return render_plan_result(plan)


__all__ = [
    "LANE_BASELINES",
    "DEFAULT_STRATEGY",
    "STRATEGY_WEIGHTS",
    "RouteProfile",
    "DistributionEntry",
    "RoutingIntent",
    "RoutingRule",
    "PlanResult",
    "SimulationContext",
    "CostProjection",
    "LatencyProjection",
    "build_routes",
    "compute_plan",
    "render_plan_result",
    "build_simulation_response",
]
