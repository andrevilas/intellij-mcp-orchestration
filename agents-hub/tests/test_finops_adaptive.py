from __future__ import annotations

from app.agents.orchestration import FinOpsController
from app.agents.orchestration import FinOpsBudgetExceeded  # noqa: F401 - re-export guard
from app.agents.orchestration import ObservabilityReporter
from app.schemas.manifest import (
    FinOpsABExperiment,
    FinOpsABVariant,
    FinOpsAdaptiveBudget,
    FinOpsBudget,
    FinOpsConfig,
    RoutingConfig,
    RoutingTier,
)


def _build_controller() -> FinOpsController:
    adaptive = FinOpsAdaptiveBudget(
        enabled=True,
        target_utilization=0.6,
        lookback_days=7,
        max_increase_pct=0.3,
        max_decrease_pct=0.4,
        cost_weight=1.0,
        latency_weight=0.5,
        latency_threshold_ms=900.0,
        min_amount=50.0,
        max_amount=150.0,
    )
    budget = FinOpsBudget(amount=100.0, currency="USD", adaptive=adaptive)
    experiment = FinOpsABExperiment(
        id="exp-balanced",
        lane=RoutingTier.BALANCED,
        variants=[
            FinOpsABVariant(
                name="control",
                traffic_percentage=0.5,
                cost_per_request=80.0,
                latency_p95_ms=950.0,
            ),
            FinOpsABVariant(
                name="challenger",
                traffic_percentage=0.5,
                cost_per_request=60.0,
                latency_p95_ms=650.0,
                is_winner=True,
            ),
        ],
    )
    config = FinOpsConfig(
        cost_center="core",
        budgets={RoutingTier.BALANCED: budget},
        alerts=[],
        ab_history=[experiment],
    )
    return FinOpsController(config, RoutingConfig())


def test_adaptive_budget_reacts_to_utilisation() -> None:
    controller = _build_controller()
    budget = controller._config.budgets[RoutingTier.BALANCED]
    tier_key = RoutingTier.BALANCED.value

    low_usage_amount = controller._effective_budget_amount("session", tier_key, budget)
    assert low_usage_amount >= budget.amount

    controller._session_usage[("session", tier_key)] = 90.0
    high_usage_amount = controller._effective_budget_amount("session", tier_key, budget)
    assert high_usage_amount <= budget.amount


def test_finops_snapshot_exposes_adaptive_state() -> None:
    controller = _build_controller()
    reporter = ObservabilityReporter(None)
    decision = controller.prepare_execution(
        tool_name="demo",
        payload={},
        candidate_tiers=[RoutingTier.BALANCED],
        overrides={},
        parameters={"estimated_cost": 20},
        metadata={},
        reporter=reporter,
    )
    assert decision.tier == RoutingTier.BALANCED

    snapshot = controller.snapshot()
    assert snapshot["cache_size"] == 0
    assert "balanced" in snapshot["budgets"]
    balanced = snapshot["budgets"]["balanced"]
    assert balanced["adaptive_enabled"] is True
    assert balanced["effective"] >= balanced["configured"]
