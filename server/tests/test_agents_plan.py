from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from console_mcp_server import routes
from console_mcp_server.config_assistant.intents import AssistantIntent
from console_mcp_server.config_assistant.plan_executor import PlanPreview
from console_mcp_server.security import Role
from .test_config_routes import _seed_user

sys.path.append(str(Path(__file__).resolve().parents[2]))

pytest_plugins = ["tests.test_routes"]


@pytest.fixture()
def auth_header(database, client: TestClient) -> dict[str, str]:
    token = "console-token"
    _seed_user(database, token=token, roles={Role.VIEWER, Role.PLANNER, Role.APPROVER})
    return {"Authorization": f"Bearer {token}"}


def test_agent_plan_endpoint_returns_diffs(
    client: TestClient, auth_header: dict[str, str], monkeypatch: pytest.MonkeyPatch
) -> None:
    preview = PlanPreview(
        branch="feature/add-sentinel-watcher",
        base_branch="main",
        commit_message="feat: adicionar agent Sentinel",
        pull_request_title="feat: adicionar agent Sentinel",
        pull_request_body="Adicionar agent Sentinel ao agents-hub",
        pull_request_provider="github",
    )

    class DummyExecutor:
        def __init__(self, preview_payload: PlanPreview) -> None:
            self._preview = preview_payload
            self.invocations: list[dict[str, Any]] = []

        def preview_execution(self, plan_id: str, *, plan, commit_message: str) -> PlanPreview:
            self.invocations.append({"plan_id": plan_id, "commit_message": commit_message, "plan": plan})
            return self._preview

    executor = DummyExecutor(preview)
    monkeypatch.setattr(routes, "get_plan_executor", lambda: executor)

    response = client.post(
        "/api/v1/config/agents/plan",
        json={
            "agent": {
                "slug": "sentinel-watcher",
                "repository": "agents-hub",
                "manifest": {
                    "name": "sentinel-watcher",
                    "title": "Sentinel Watcher",
                    "capabilities": ["monitoring", "alerts"],
                    "tools": [
                        {
                            "name": "check_signal",
                            "description": "Valida o estado do sinal.",
                            "schema": {"type": "object", "properties": {"signal": {"type": "string"}}},
                        }
                    ],
                },
            }
        },
        headers=auth_header,
    )

    assert response.status_code == 200
    payload = response.json()
    plan = payload["plan"]
    assert plan["intent"] == AssistantIntent.ADD_AGENT.value
    assert plan["summary"].startswith("Adicionar agente sentinel-watcher")

    diffs = plan["diffs"]
    assert len(diffs) == 3
    assert all("diff --git" in diff["diff"] for diff in diffs)
    assert any(diff["path"].endswith("agent.yaml") for diff in diffs)
    assert any("SentinelWatcherAgent" in diff["diff"] for diff in diffs)

    preview_payload = payload["preview"]
    assert preview_payload["branch"] == preview.branch
    assert preview_payload["pull_request"]["title"] == preview.pull_request_title

    assert executor.invocations, "preview_execution must be invoked"
    first_call = executor.invocations[0]
    assert first_call["plan_id"].startswith("add-agent-")
    assert first_call["commit_message"].startswith("feat: adicionar agent")


def test_agent_plan_endpoint_rejects_empty_manifest(
    client: TestClient, auth_header: dict[str, str]
) -> None:
    response = client.post(
        "/api/v1/config/agents/plan",
        json={
            "agent": {
                "slug": "sentinel",
                "repository": "agents-hub",
                "manifest": "",
            }
        },
        headers=auth_header,
    )

    assert response.status_code == 400
    body = response.json()
    assert "Manifesto do agent" in body["detail"]
