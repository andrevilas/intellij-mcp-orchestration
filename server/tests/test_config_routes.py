"""Integration tests for configuration assistant endpoints."""

from __future__ import annotations

import console_mcp_server.routes as routes
from fastapi.testclient import TestClient

from console_mcp_server.config_assistant.plan_executor import PlanExecutionResult
from console_mcp_server.schemas_plan import PlanExecutionMode, PlanExecutionStatus

pytest_plugins = ["tests.test_routes"]


def test_chat_endpoint_without_intent_returns_greeting(client: TestClient) -> None:
    response = client.post(
        "/api/v1/config/chat",
        json={"message": "olá"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert "Olá" in payload["reply"]
    assert payload["plan"] is None


def test_chat_endpoint_with_intent_returns_plan(client: TestClient) -> None:
    response = client.post(
        "/api/v1/config/chat",
        json={
            "message": "preciso adicionar agente",
            "intent": "add_agent",
            "payload": {"agent_name": "atlas", "repository": "agents"},
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["plan"]["intent"] == "add_agent"
    assert payload["plan"]["steps"]


def test_plan_endpoint_validates_payload(client: TestClient) -> None:
    response = client.post(
        "/api/v1/config/plan",
        json={"intent": "add_agent", "payload": {}},
    )

    assert response.status_code == 400
    assert "Missing required field" in response.json()["detail"]


def test_plan_endpoint_returns_plan(client: TestClient) -> None:
    response = client.post(
        "/api/v1/config/plan",
        json={
            "intent": "edit_finops",
            "payload": {"report_id": "monthly"},
        },
    )

    assert response.status_code == 200
    plan = response.json()["plan"]
    assert plan["intent"] == "edit_finops"
    assert plan["diffs"]


def test_apply_endpoint_supports_dry_run(client: TestClient, monkeypatch) -> None:
    plan_response = client.post(
        "/api/v1/config/plan",
        json={
            "intent": "generate_artifact",
            "payload": {"artifact_path": "generated/foo.json"},
        },
    )
    plan_response.raise_for_status()
    plan = plan_response.json()["plan"]

    expected = PlanExecutionResult(
        record_id="rec-dry",
        plan_id="plan-dry-run",
        mode=PlanExecutionMode.DRY_RUN,
        status=PlanExecutionStatus.PENDING,
        branch=None,
        base_branch="main",
        commit_sha=None,
        diff_stat=" 1 file changed, 1 insertion(+)",
        diff_patch="--- a\n+++ b\n",
        hitl_required=False,
        message="Dry-run executado com sucesso.",
    )

    class DummyExecutor:
        def __init__(self, result: PlanExecutionResult):
            self.result = result
            self.invocations: dict[str, dict[str, object]] = {}

        def dry_run(self, **kwargs):
            self.invocations["dry_run"] = kwargs
            return self.result

        def apply(self, **kwargs):  # pragma: no cover - defensive
            raise AssertionError("apply should not be invoked during dry-run")

    executor = DummyExecutor(expected)
    monkeypatch.setattr(routes, "get_plan_executor", lambda: executor)

    response = client.post(
        "/api/v1/config/apply",
        json={
            "plan_id": "plan-dry-run",
            "plan": plan,
            "patch": expected.diff_patch,
            "mode": PlanExecutionMode.DRY_RUN.value,
            "actor": "Dry Runner",
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == PlanExecutionStatus.PENDING.value
    assert body["mode"] == PlanExecutionMode.DRY_RUN.value
    assert body["plan_id"] == "plan-dry-run"
    assert body["diff"]["stat"] == expected.diff_stat
    assert executor.invocations["dry_run"]["plan_id"] == "plan-dry-run"


def test_apply_endpoint_executes_plan_steps(client: TestClient, monkeypatch) -> None:
    plan_response = client.post(
        "/api/v1/config/plan",
        json={
            "intent": "add_agent",
            "payload": {"agent_name": "demo", "repository": "agents"},
        },
    )
    plan_response.raise_for_status()
    plan = plan_response.json()["plan"]

    expected = PlanExecutionResult(
        record_id="rec-apply",
        plan_id="plan-apply",
        mode=PlanExecutionMode.BRANCH_PR,
        status=PlanExecutionStatus.COMPLETED,
        branch="chore/config-assistant/plan-apply",
        base_branch="main",
        commit_sha="abc1234",
        diff_stat=" 2 files changed",
        diff_patch="diff --git a b",
        hitl_required=True,
        message="Plano aplicado em branch dedicada.",
    )

    class DummyExecutor:
        def __init__(self, result: PlanExecutionResult):
            self.result = result
            self.invocations: dict[str, dict[str, object]] = {}

        def dry_run(self, **kwargs):  # pragma: no cover - defensive
            raise AssertionError("dry_run should not execute during apply")

        def apply(self, **kwargs):
            self.invocations["apply"] = kwargs
            return self.result

    executor = DummyExecutor(expected)
    monkeypatch.setattr(routes, "get_plan_executor", lambda: executor)

    response = client.post(
        "/api/v1/config/apply",
        json={
            "plan_id": "plan-apply",
            "plan": plan,
            "patch": expected.diff_patch,
            "mode": PlanExecutionMode.BRANCH_PR.value,
            "actor": "Executor",
            "actor_email": "executor@example.com",
            "commit_message": "chore: onboard demo agent",
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == PlanExecutionStatus.COMPLETED.value
    assert body["mode"] == PlanExecutionMode.BRANCH_PR.value
    assert body["branch"] == expected.branch
    assert body["hitl_required"] is True
    assert executor.invocations["apply"]["mode"] is PlanExecutionMode.BRANCH_PR


def test_onboard_endpoint_uses_repository_name_when_missing(client: TestClient) -> None:
    response = client.post(
        "/api/v1/config/mcp/onboard",
        json={
            "repository": "agents/new-agent",
            "capabilities": ["chat", "planning"],
        },
    )

    assert response.status_code == 200
    plan = response.json()["plan"]
    assert plan["intent"] == "add_agent"
    assert any("new-agent" in diff["path"] for diff in plan["diffs"])


def test_policy_patch_endpoint_returns_plan(client: TestClient) -> None:
    response = client.patch(
        "/api/v1/config/policies",
        json={
            "policy_id": "spend-guard",
            "changes": {"monthly_spend_limit": 1000},
        },
    )

    assert response.status_code == 200
    plan = response.json()["plan"]
    assert plan["intent"] == "edit_policies"


def test_reload_endpoint_returns_plan_with_message(client: TestClient) -> None:
    response = client.post(
        "/api/v1/config/reload",
        json={
            "artifact_path": "generated/cache.json",
            "owner": "finops",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["plan"]["intent"] == "generate_artifact"
    assert "Plano gerado" in payload["message"]
