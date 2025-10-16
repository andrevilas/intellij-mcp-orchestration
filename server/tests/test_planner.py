"""Unit tests exercising the configuration planner."""

from __future__ import annotations

import pytest

from console_mcp_server.config_assistant.intents import AssistantIntent
from console_mcp_server.config_assistant.planner import plan_intent


def test_plan_intent_add_agent_generates_expected_structure() -> None:
    plan = plan_intent(
        AssistantIntent.ADD_AGENT,
        {"agent_name": "sentinel", "repository": "agents-hub"},
    )

    assert plan.intent == AssistantIntent.ADD_AGENT.value
    assert len(plan.steps) == 3
    assert plan.steps[0].id == "scaffold-agent"
    assert any(diff.change_type == "create" for diff in plan.diffs)
    assert any(risk.impact == "high" for risk in plan.risks)


@pytest.mark.parametrize(
    "intent,payload",
    [
        (AssistantIntent.EDIT_POLICIES, {"policy_id": "spend-guard"}),
        (AssistantIntent.EDIT_FINOPS, {"report_id": "q2-forecast"}),
        (
            AssistantIntent.GENERATE_ARTIFACT,
            {"artifact_path": "generated/summary.json"},
        ),
    ],
)
def test_plan_intent_handles_supported_intents(intent: AssistantIntent, payload: dict[str, str]) -> None:
    plan = plan_intent(intent, payload)

    assert plan.intent == intent.value
    assert plan.steps, "planner must return at least one step"
    assert plan.diffs, "planner must return at least one diff"
    assert plan.risks, "planner must capture known risks"


def test_plan_intent_validates_required_fields() -> None:
    with pytest.raises(ValueError):
        plan_intent(AssistantIntent.ADD_AGENT, {})
