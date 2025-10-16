from __future__ import annotations

from console_mcp_server.config import ProviderConfig
import console_mcp_server.routing as routing_module
from console_mcp_server.routing import RouteProfile, compute_plan
from console_mcp_server.routing.bandit import (
    BanditStrategy,
    compute_lane_bandit_weights,
)
from console_mcp_server.schemas import ProviderSummary
from console_mcp_server.telemetry import TelemetryRouteBreakdown


def _provider(identifier: str) -> ProviderSummary:
    base = ProviderConfig(
        id=identifier,
        name=identifier.title(),
        command="noop",
        description="",
        tags=[],
        capabilities=[],
        transport="stdio",
    )
    return ProviderSummary(**base.model_dump(), is_available=True)


def _route(identifier: str, lane: str, capacity: float = 50.0) -> RouteProfile:
    provider = _provider(identifier)
    return RouteProfile(
        id=identifier,
        provider=provider,
        lane=lane,
        cost_per_million=20.0,
        latency_p95=800.0,
        reliability=95.0,
        capacity_score=capacity,
    )


def test_bandit_thompson_prioritises_successful_routes() -> None:
    routes = (_route("alpha", "balanced"), _route("beta", "balanced"))
    metrics = (
        TelemetryRouteBreakdown(
            route_id="alpha:default",
            provider_id="alpha",
            provider_name="Alpha",
            route=None,
            lane="balanced",
            run_count=120,
            tokens_in=10_000,
            tokens_out=12_000,
            cost_usd=45.0,
            avg_latency_ms=780.0,
            success_rate=0.96,
        ),
        TelemetryRouteBreakdown(
            route_id="beta:default",
            provider_id="beta",
            provider_name="Beta",
            route=None,
            lane="balanced",
            run_count=120,
            tokens_in=10_000,
            tokens_out=12_000,
            cost_usd=60.0,
            avg_latency_ms=950.0,
            success_rate=0.82,
        ),
    )

    weights = compute_lane_bandit_weights(
        routes,
        lane="balanced",
        strategy=BanditStrategy.THOMPSON,
        metrics=metrics,
    )

    assert weights[routes[0].id] > weights[routes[1].id]


def test_bandit_ucb_rewards_exploration_for_sparse_routes() -> None:
    routes = (_route("alpha", "economy"), _route("beta", "economy"))
    metrics = (
        TelemetryRouteBreakdown(
            route_id="alpha:default",
            provider_id="alpha",
            provider_name="Alpha",
            route=None,
            lane="economy",
            run_count=200,
            tokens_in=15_000,
            tokens_out=15_000,
            cost_usd=80.0,
            avg_latency_ms=1100.0,
            success_rate=0.9,
        ),
        TelemetryRouteBreakdown(
            route_id="beta:default",
            provider_id="beta",
            provider_name="Beta",
            route=None,
            lane="economy",
            run_count=5,
            tokens_in=400,
            tokens_out=500,
            cost_usd=4.0,
            avg_latency_ms=600.0,
            success_rate=0.78,
        ),
    )

    weights = compute_lane_bandit_weights(
        routes,
        lane="economy",
        strategy=BanditStrategy.UCB,
        metrics=metrics,
    )

    assert weights[routes[1].id] > weights[routes[0].id]


def test_compute_plan_uses_bandit_weights(monkeypatch) -> None:
    routes = (
        _route("alpha", "balanced", capacity=10),
        _route("beta", "balanced", capacity=90),
    )

    def fake_weights(
        lane_routes: tuple[RouteProfile, ...] | list[RouteProfile],
        *,
        lane: str,
        strategy: BanditStrategy,
        **_: object,
    ) -> dict[str, float]:
        assert lane == "balanced"
        assert strategy == BanditStrategy.UCB
        return {lane_routes[0].id: 1.0, lane_routes[1].id: 3.0}

    monkeypatch.setattr(routing_module, "compute_lane_bandit_weights", fake_weights)

    plan = compute_plan(routes, "bandit_ucb", failover_id=None, volume_millions=10.0)

    shares = {entry.route.id: entry.share for entry in plan.distribution}
    assert shares["beta"] > shares["alpha"]
