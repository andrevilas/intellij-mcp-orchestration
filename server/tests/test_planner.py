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
    assert [step.id for step in plan.steps[:2]] == ["discover-server", "scaffold-agent"]
    assert plan.steps[-2].id == "reload-agents-hub"
    assert len(plan.steps) == 5

    diff_paths = {diff.path for diff in plan.diffs}
    assert "agents-hub/app/agents/sentinel/agent.yaml" in diff_paths
    assert "agents-hub/app/agents/sentinel/agent.py" in diff_paths
    assert "agents-hub/mcp-registry.yaml" in diff_paths
    assert sum(1 for diff in plan.diffs if diff.change_type == "create") >= 3

    impacts = {risk.impact for risk in plan.risks}
    assert "high" in impacts
    assert any("reload" in risk.title.lower() for risk in plan.risks)


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
