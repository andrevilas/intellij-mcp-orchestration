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
    assert plan.context, "planner must suggest contextual references for add_agent"
    assert all(ref.path.startswith("docs/") for ref in plan.context)
    assert all(ref.score >= 0.0 for ref in plan.context)


@pytest.mark.parametrize(
    "intent,payload",
    [
        (AssistantIntent.EDIT_POLICIES, {"policy_id": "spend-guard"}),
        (AssistantIntent.EDIT_FINOPS, {"report_id": "q2-forecast"}),
        (
            AssistantIntent.GENERATE_ARTIFACT,
            {
                "artifact_type": "agent.manifest",
                "target_path": "agents-hub/app/agents/generated/agent.yaml",
            },
        ),
        (
            AssistantIntent.CREATE_FLOW,
            {
                "flow_id": "flow-a",
                "graph": {
                    "id": "flow-a",
                    "label": "Flow A",
                    "entry": "start",
                    "exit": "end",
                    "nodes": [
                        {"id": "start", "type": "state", "label": "Start", "config": {}},
                        {"id": "end", "type": "state", "label": "End", "config": {}},
                    ],
                    "edges": [
                        {"id": "edge-start-end", "source": "start", "target": "end"},
                    ],
                },
                "target_path": "agents-hub/app/agents/flow-a/agent.py",
            },
        ),
    ],
)
def test_plan_intent_handles_supported_intents(intent: AssistantIntent, payload: dict[str, str]) -> None:
    plan = plan_intent(intent, payload)

    assert plan.intent == intent.value
    assert plan.steps, "planner must return at least one step"
    assert plan.diffs, "planner must return at least one diff"
    assert plan.risks, "planner must capture known risks"
    assert isinstance(plan.context, list)


def test_plan_intent_generate_artifact_includes_write_action() -> None:
    plan = plan_intent(
        AssistantIntent.GENERATE_ARTIFACT,
        {
            "artifact_type": "agent.langgraph",
            "target_path": "agents-hub/app/agents/sentinel/agent.py",
        },
    )

    write_steps = [step for step in plan.steps if any(action.type == "write_file" for action in step.actions)]
    assert write_steps, "generate_artifact plans must include a write_file action"
    action = write_steps[0].actions[0]
    assert action.path.endswith("agents-hub/app/agents/sentinel/agent.py")
    assert "SentinelAgent" in action.contents
    assert plan.context == []


def test_plan_intent_validates_required_fields() -> None:
    with pytest.raises(ValueError):
        plan_intent(AssistantIntent.ADD_AGENT, {})


def test_plan_intent_create_flow_generates_actions_for_langgraph() -> None:
    graph_payload = {
        "id": "flow-x",
        "label": "Flow X",
        "entry": "inicio",
        "exit": "fim",
        "nodes": [
            {"id": "inicio", "type": "state", "label": "Início", "config": {}},
            {"id": "revisao", "type": "checkpoint", "label": "Revisão HITL", "config": {}},
            {"id": "fim", "type": "state", "label": "Fim", "config": {}},
        ],
        "edges": [
            {"id": "edge-1", "source": "inicio", "target": "revisao"},
            {"id": "edge-2", "source": "revisao", "target": "fim"},
        ],
    }

    plan = plan_intent(
        AssistantIntent.CREATE_FLOW,
        {
            "flow_id": "flow-x",
            "graph": graph_payload,
            "target_path": "agents-hub/app/agents/flow-x/agent.py",
            "baseline_agent_code": "# antigo\n",
        },
    )

    assert plan.intent == AssistantIntent.CREATE_FLOW.value
    assert any(step.id == "compile-agent" for step in plan.steps)
    checkpoint_steps = [step for step in plan.steps if "checkpoint" in step.id]
    assert checkpoint_steps, "deve existir etapa para checkpoints"
    assert plan.diffs and plan.diffs[0].path.endswith("flow-x/agent.py")
    assert any("checkpoint" in risk.title.lower() for risk in plan.risks)
    assert plan.context, "create_flow deve sugerir referências de RAG"
