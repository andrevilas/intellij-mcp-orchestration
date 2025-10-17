"""Routing simulator utilities for the Console MCP backend."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, Mapping, MutableMapping, TYPE_CHECKING

from .bandit import BanditStrategy, compute_lane_bandit_weights

from ..prices import list_price_entries
from ..schemas import ProviderSummary

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
class PlanResult:
    """Aggregated metrics computed for a simulation."""

    total_cost: float
    cost_per_million: float
    avg_latency: float
    reliability_score: float
    distribution: tuple[DistributionEntry, ...]
    excluded_route: RouteProfile | None


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


def compute_plan(
    routes: Iterable[RouteProfile],
    strategy_id: str,
    failover_id: str | None,
    volume_millions: float,
) -> PlanResult:
    bandit_strategy = BANDIT_STRATEGIES.get(strategy_id)
    strategy = STRATEGY_WEIGHTS.get(strategy_id, STRATEGY_WEIGHTS[DEFAULT_STRATEGY])

    routes_seq = tuple(routes)
    if not routes_seq:
        return PlanResult(
            total_cost=0.0,
            cost_per_million=0.0,
            avg_latency=0.0,
            reliability_score=0.0,
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
        return PlanResult(
            total_cost=0.0,
            cost_per_million=0.0,
            avg_latency=0.0,
            reliability_score=0.0,
            distribution=tuple(),
            excluded_route=excluded,
        )

    lane_groups: MutableMapping[str, dict[str, object]] = {}
    for lane in ("economy", "balanced", "turbo"):
        lane_routes = [route for route in active_routes if route.lane == lane]
        capacity_total = sum(route.capacity_score for route in lane_routes)
        lane_groups[lane] = {
            "routes": lane_routes,
            "weight": strategy.get(lane, 0.0),
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
        lane_share = lane_weight / total_weight

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
            share = lane_share * (route_weight / weight_total)
            tokens = volume_millions * share
            cost = tokens * route.cost_per_million
            distribution.append(
                DistributionEntry(
                    route=route,
                    share=round(share, 4),
                    tokens_millions=round(tokens, 4),
                    cost=round(cost, 2),
                )
            )

    total_cost = sum(entry.cost for entry in distribution)
    cost_per_million = total_cost / volume_millions if volume_millions > 0 else 0.0

    avg_latency = 0.0
    reliability_score = 0.0
    for entry in distribution:
        avg_latency += entry.route.latency_p95 * entry.share
        reliability_score += entry.route.reliability * entry.share

    return PlanResult(
        total_cost=round(total_cost, 2),
        cost_per_million=round(cost_per_million, 2),
        avg_latency=round(avg_latency, 2),
        reliability_score=round(reliability_score, 2),
        distribution=tuple(distribution),
        excluded_route=excluded,
    )
