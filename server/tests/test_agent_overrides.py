import sys
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from console_mcp_server import routes
from console_mcp_server.change_plans import ChangePlanStore
from console_mcp_server.schemas_plan import PlanExecutionMode, PlanExecutionStatus
from console_mcp_server.security import Role

from .test_config_routes import _seed_user


sys.path.append(str(Path(__file__).resolve().parents[2]))

pytest_plugins = ["tests.test_routes"]


@pytest.fixture()
def auth_header(database, client: TestClient) -> dict[str, str]:
    token = "console-token"
    _seed_user(database, token=token, roles={Role.VIEWER, Role.PLANNER, Role.APPROVER})
    return {"Authorization": f"Bearer {token}"}


def test_agent_layer_plan_returns_plan_response(
    database, client: TestClient, auth_header: dict[str, str]
) -> None:
    database.bootstrap_database()

    response = client.post(
        "/api/v1/config/agents/catalog-search/plan",
        json={
            "layer": "policies",
            "changes": {"rateLimit": 42},
            "note": "Ajustar rate limit",
        },
        headers=auth_header,
    )

    assert response.status_code == 200
    payload = response.json()

    assert payload["plan_id"]
    assert payload["patch"].startswith("diff --git")
    assert payload["message"] == "Ajustar rate limit"

    plan_payload = payload["plan_payload"]
    assert plan_payload["intent"] == "agent_policies_override"
    assert plan_payload["summary"].startswith("Atualizar camada Policies do agente catalog-search")

    admin_plan = payload["plan"]
    assert admin_plan["author"] == "Config User"
    assert admin_plan["scope"] == "Policies"

    diff_entry = payload["diffs"][0]
    assert diff_entry["file"].endswith("catalog-search/overrides/policies.json")


def test_agent_layer_apply_passes_scope_metadata(
    database, client: TestClient, auth_header: dict[str, str], monkeypatch: pytest.MonkeyPatch
) -> None:
    database.bootstrap_database()

    captured: dict[str, Any] = {}

    def fake_execute(
        payload: routes.ApplyPlanRequest,
        http_request: Any,
        *,
        resource: str,
        action_prefix: str,
        log_prefix: str,
        metadata: dict[str, Any] | None = None,
    ) -> routes.ApplyPlanResponse:
        captured["resource"] = resource
        captured["metadata"] = metadata or {}
        return routes.ApplyPlanResponse(
            status=PlanExecutionStatus.COMPLETED,
            mode=PlanExecutionMode.BRANCH_PR,
            plan_id=payload.plan_id,
            record_id="record-1",
            branch="feature/branch",
            base_branch="main",
            commit_sha="abc123",
            diff=routes.PlanExecutionDiff(stat="1 file changed", patch=payload.patch or ""),
            hitl_required=False,
            message="ok",
            approval_id=None,
            pull_request=None,
        )

    monkeypatch.setattr(routes, "_execute_plan_application", fake_execute)

    plan_payload = {
        "intent": "agent_policies_override",
        "summary": "Atualizar camada Policies do agente catalog-search",
        "status": "pending",
        "steps": [],
        "diffs": [],
        "risks": [],
        "approval_rules": [],
    }

    request_payload = {
        "plan_id": "plan-123",
        "plan": plan_payload,
        "patch": "diff --git a/file b/file",
        "actor": "Console MCP",
        "actor_email": "agents@example.com",
        "commit_message": "chore: atualizar policies",
        "mode": "branch_pr",
        "layer": "policies",
    }

    response = client.post(
        "/api/v1/config/agents/catalog-search/apply",
        json=request_payload,
        headers=auth_header,
    )

    assert response.status_code == 200
    metadata = captured.get("metadata", {})
    assert metadata["scope"]["agent_id"] == "catalog-search"
    assert metadata["layer"] == "policies"
    assert metadata["agent"] == "catalog-search"


def test_agent_history_endpoint_filters_by_layer(
    database, client: TestClient, auth_header: dict[str, str]
) -> None:
    database.bootstrap_database()
    store = ChangePlanStore()

    store.create(
        plan_id="plan-1",
        actor="Console",
        mode=PlanExecutionMode.BRANCH_PR,
        status=PlanExecutionStatus.COMPLETED,
        diff_stat="1 file changed",
        diff_patch="diff --git a/file b/file",
        risks=(),
        metadata={
            "scope": {"type": "agent", "agent_id": "catalog-search", "layer": "policies"},
            "plan_summary": "Atualizar policies",
            "plan_payload": {
                "intent": "agent_policies_override",
                "summary": "Atualizar policies",
                "status": "pending",
                "steps": [],
                "diffs": [],
                "risks": [],
            },
        },
    )

    store.create(
        plan_id="plan-2",
        actor="Console",
        mode=PlanExecutionMode.BRANCH_PR,
        status=PlanExecutionStatus.COMPLETED,
        diff_stat="1 file changed",
        diff_patch="diff --git a/file b/file",
        risks=(),
        metadata={
            "scope": {"type": "agent", "agent_id": "catalog-search", "layer": "routing"},
            "plan_summary": "Atualizar routing",
        },
    )

    store.create(
        plan_id="plan-3",
        actor="Console",
        mode=PlanExecutionMode.BRANCH_PR,
        status=PlanExecutionStatus.COMPLETED,
        diff_stat="1 file changed",
        diff_patch="diff --git a/file b/file",
        risks=(),
        metadata={
            "scope": {"type": "agent", "agent_id": "outro-agent", "layer": "policies"},
            "plan_summary": "Ignorar",
        },
    )

    response = client.get(
        "/api/v1/config/agents/catalog-search/history?layer=policies",
        headers=auth_header,
    )

    assert response.status_code == 200
    payload = response.json()
    items = payload["items"]
    assert len(items) == 1

    item = items[0]
    assert item["plan_id"] == "plan-1"
    assert item["layer"] == "policies"
    assert item["summary"] == "Atualizar policies"
    assert item["plan_payload"]["summary"] == "Atualizar policies"
