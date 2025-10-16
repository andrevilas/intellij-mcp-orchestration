"""Adaptive routing helpers powered by multi-armed bandit algorithms."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
import math
from random import Random
from typing import Iterable, Mapping, Sequence, TYPE_CHECKING

if TYPE_CHECKING:  # pragma: no cover - used only for typing
    from ..telemetry import TelemetryRouteBreakdown
    from . import RouteProfile


@dataclass(frozen=True)
class BanditObservation:
    """Aggregated telemetry metrics consumed by the bandit algorithms."""

    provider_id: str
    lane: str
    run_count: int
    success_rate: float
    avg_latency_ms: float
    cost_per_run: float


class BanditStrategy(str):
    """Supported exploration strategies for telemetry driven routing."""

    THOMPSON = "thompson"
    UCB = "ucb"


def _stable_seed(value: str) -> int:
    seed = 0
    for char in value:
        seed = (seed * 31 + ord(char)) & 0xFFFFFFFF
    return seed or 1


def _resolve_window(
    reference: datetime | None, lookback_days: int
) -> tuple[datetime, datetime]:
    now = reference or datetime.now(timezone.utc)
    if now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)
    lookback = max(1, lookback_days)
    start = now - timedelta(days=lookback)
    return start, now


def _build_observation(metric: "TelemetryRouteBreakdown") -> BanditObservation:
    run_count = max(0, metric.run_count)
    success_rate = min(max(metric.success_rate, 0.0), 1.0)
    cost_per_run = metric.cost_usd / run_count if run_count else 0.0
    return BanditObservation(
        provider_id=metric.provider_id,
        lane=metric.lane,
        run_count=run_count,
        success_rate=success_rate,
        avg_latency_ms=max(metric.avg_latency_ms, 0.0),
        cost_per_run=max(cost_per_run, 0.0),
    )


def _load_observations(
    *, lane: str, lookback_days: int, reference: datetime | None
) -> tuple[BanditObservation, ...]:
    from ..telemetry import query_route_breakdown

    start, end = _resolve_window(reference, lookback_days)
    metrics = query_route_breakdown(start=start, end=end, lane=lane)
    return tuple(_build_observation(metric) for metric in metrics)


def _fallback_weight(route: "RouteProfile") -> float:
    if route.capacity_score > 0:
        return route.capacity_score
    return 1.0


def _normalise(weights: Mapping[str, float]) -> dict[str, float]:
    total = sum(value for value in weights.values() if value > 0)
    if total <= 0:
        return {key: 0.0 for key in weights}
    return {key: value / total if value > 0 else 0.0 for key, value in weights.items()}


def compute_lane_bandit_weights(
    routes: Sequence["RouteProfile"],
    *,
    lane: str,
    strategy: BanditStrategy,
    lookback_days: int = 7,
    reference: datetime | None = None,
    random: Random | None = None,
    metrics: Iterable["TelemetryRouteBreakdown"] | None = None,
) -> dict[str, float]:
    """Return relative weights for the provided routes using telemetry driven bandits."""

    if not routes:
        return {}

    observations: tuple[BanditObservation, ...]
    if metrics is None:
        observations = _load_observations(
            lane=lane, lookback_days=lookback_days, reference=reference
        )
    else:
        observations = tuple(_build_observation(metric) for metric in metrics)

    by_provider = {obs.provider_id: obs for obs in observations}
    rng = random or Random(_stable_seed(lane))

    costs = [obs.cost_per_run for obs in observations if obs.cost_per_run > 0]
    latencies = [obs.avg_latency_ms for obs in observations if obs.avg_latency_ms > 0]
    avg_cost = sum(costs) / len(costs) if costs else 1.0
    avg_latency = sum(latencies) / len(latencies) if latencies else 1.0
    total_runs = sum(obs.run_count for obs in observations)

    weights: dict[str, float] = {}
    for route in routes:
        observation = by_provider.get(route.provider.id)
        if observation is None or observation.run_count <= 0:
            weights[route.id] = _fallback_weight(route)
            continue

        cost_norm = observation.cost_per_run / avg_cost if avg_cost > 0 else 1.0
        latency_norm = observation.avg_latency_ms / avg_latency if avg_latency > 0 else 1.0
        efficiency = (1.0 / (1.0 + cost_norm)) * (1.0 / (1.0 + latency_norm))

        if strategy == BanditStrategy.THOMPSON:
            successes = int(round(observation.success_rate * observation.run_count))
            failures = max(observation.run_count - successes, 0)
            sample = rng.betavariate(successes + 1, failures + 1)
            weight = sample * efficiency
        elif strategy == BanditStrategy.UCB:
            avg_reward = observation.success_rate * efficiency
            exploration = math.sqrt(
                2.0 * math.log(max(total_runs, 1) + 1) / (observation.run_count + 1)
            )
            weight = avg_reward + exploration
        else:  # pragma: no cover - defensive guard
            weight = _fallback_weight(route)

        weights[route.id] = max(weight, 0.0)

    normalised = _normalise(weights)
    if any(value > 0 for value in normalised.values()):
        return normalised

    # When all weights are zero fall back to capacity driven distribution.
    fallback = {route.id: _fallback_weight(route) for route in routes}
    return _normalise(fallback)


__all__ = ["BanditStrategy", "BanditObservation", "compute_lane_bandit_weights"]

