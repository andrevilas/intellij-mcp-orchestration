"""Integration tests for configuration assistant endpoints."""

from __future__ import annotations

from datetime import datetime, timezone

import pytest
import console_mcp_server.routes as routes
from fastapi.testclient import TestClient
from sqlalchemy import text

from console_mcp_server.config_assistant.plan_executor import PlanExecutionResult
from console_mcp_server.schemas_plan import PlanExecutionMode, PlanExecutionStatus
from console_mcp_server.security import hash_token, Role

pytest_plugins = ["tests.test_routes"]


def _seed_user(database, *, token: str, roles: set[Role]) -> None:
    hashed = hash_token(token)
    now = datetime.now(tz=timezone.utc).isoformat()
    user_id = "user-config"
    with database.session_scope() as session:
        session.execute(
            text(
                """
                INSERT INTO users (id, name, email, api_token_hash, created_at, updated_at)
                VALUES (:id, :name, :email, :hash, :created_at, :updated_at)
                ON CONFLICT(id) DO UPDATE SET
                    name = excluded.name,
                    email = excluded.email,
                    api_token_hash = excluded.api_token_hash,
                    updated_at = excluded.updated_at
                """
            ),
            {
                "id": user_id,
                "name": "Config User",
                "email": "config@example.com",
                "hash": hashed,
                "created_at": now,
                "updated_at": now,
            },
        )
        for role in roles:
            session.execute(
                text(
                    """
                    INSERT OR REPLACE INTO user_roles (user_id, role_id, assigned_at, assigned_by)
                    VALUES (
                        :user_id,
                        (SELECT id FROM roles WHERE name = :role_name),
                        :assigned_at,
                        :assigned_by
                    )
                    """
                ),
                {
                    "user_id": user_id,
                    "role_name": role.value,
                    "assigned_at": now,
                    "assigned_by": "pytest",
                },
            )


@pytest.fixture()
def auth_header(database, client: TestClient) -> dict[str, str]:
    token = "console-token"
    _seed_user(database, token=token, roles={Role.VIEWER, Role.PLANNER, Role.APPROVER})
    return {"Authorization": f"Bearer {token}"}


def test_chat_endpoint_without_intent_returns_greeting(
    client: TestClient, auth_header: dict[str, str]
) -> None:
    response = client.post(
        "/api/v1/config/chat",
        json={"message": "olá"},
        headers=auth_header,
    )

    assert response.status_code == 200
    payload = response.json()
    assert "Olá" in payload["reply"]
    assert payload["plan"] is None


def test_chat_endpoint_with_intent_returns_plan(
    client: TestClient, auth_header: dict[str, str]
) -> None:
    response = client.post(
        "/api/v1/config/chat",
        json={
            "message": "preciso adicionar agente",
            "intent": "add_agent",
            "payload": {"agent_name": "atlas", "repository": "agents"},
        },
        headers=auth_header,
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["plan"]["intent"] == "add_agent"
    assert payload["plan"]["steps"]


def test_plan_endpoint_validates_payload(
    client: TestClient, auth_header: dict[str, str]
) -> None:
    response = client.post(
        "/api/v1/config/plan",
        json={"intent": "add_agent", "payload": {}},
        headers=auth_header,
    )

    assert response.status_code == 400
    assert "Missing required field" in response.json()["detail"]


def test_plan_endpoint_returns_plan(
    client: TestClient, auth_header: dict[str, str]
) -> None:
    response = client.post(
        "/api/v1/config/plan",
        json={
            "intent": "edit_finops",
            "payload": {"report_id": "monthly"},
        },
        headers=auth_header,
    )

    assert response.status_code == 200
    plan = response.json()["plan"]
    assert plan["intent"] == "edit_finops"
    assert plan["diffs"]


def test_apply_endpoint_supports_dry_run(
    client: TestClient, monkeypatch, auth_header: dict[str, str]
) -> None:
    plan_response = client.post(
        "/api/v1/config/plan",
        json={
            "intent": "generate_artifact",
            "payload": {
                "artifact_type": "agent.manifest",
                "target_path": "agents-hub/app/agents/foo/agent.yaml",
            },
        },
        headers=auth_header,
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
        headers=auth_header,
    )

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == PlanExecutionStatus.PENDING.value
    assert body["mode"] == PlanExecutionMode.DRY_RUN.value
    assert body["plan_id"] == "plan-dry-run"
    assert body["diff"]["stat"] == expected.diff_stat
    assert executor.invocations["dry_run"]["plan_id"] == "plan-dry-run"


def test_apply_endpoint_executes_plan_steps(
    client: TestClient, monkeypatch, auth_header: dict[str, str]
) -> None:
    plan_response = client.post(
        "/api/v1/config/plan",
        json={
            "intent": "add_agent",
            "payload": {"agent_name": "demo", "repository": "agents"},
        },
        headers=auth_header,
    )
    plan_response.raise_for_status()
    plan = plan_response.json()["plan"]

    submission = PlanExecutionResult(
        record_id="rec-apply",
        plan_id="plan-apply",
        mode=PlanExecutionMode.BRANCH_PR,
        status=PlanExecutionStatus.PENDING,
        branch=None,
        base_branch="main",
        commit_sha=None,
        diff_stat=" 2 files changed",
        diff_patch="diff --git a b",
        hitl_required=True,
        message="Plano enviado para aprovação HITL.",
        approval_id="approval-123",
    )
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
        message="Plano aplicado após aprovação.",
        approval_id="approval-123",
    )

    class DummyExecutor:
        def __init__(self, submission: PlanExecutionResult, final: PlanExecutionResult):
            self.submission = submission
            self.final = final
            self.invocations: dict[str, list[dict[str, object]]] = {
                "submit": [],
                "approve": [],
                "finalize": [],
            }

        def dry_run(self, **kwargs):  # pragma: no cover - defensive
            raise AssertionError("dry_run should not execute during apply")

        def submit_for_approval(self, **kwargs):
            self.invocations["submit"].append(kwargs)
            return self.submission

        def approve_request(self, approval_id: str, *, approver_id: str, reason: str | None = None):
            self.invocations["approve"].append(
                {"approval_id": approval_id, "approver_id": approver_id, "reason": reason}
            )

        def finalize_approval(self, approval_id: str, *, hitl_callback=None):
            self.invocations["finalize"].append({"approval_id": approval_id})
            if hitl_callback:
                hitl_callback(self.final)
            return self.final

        def reject_request(self, *_, **__):  # pragma: no cover - defensive
            raise AssertionError("reject should not be invoked in approval happy-path")

    executor = DummyExecutor(submission, expected)
    monkeypatch.setattr(routes, "get_plan_executor", lambda: executor)

    submission_response = client.post(
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
        headers=auth_header,
    )

    assert submission_response.status_code == 200
    submission_body = submission_response.json()
    assert submission_body["status"] == PlanExecutionStatus.PENDING.value
    assert submission_body["hitl_required"] is True
    approval_id = submission_body["approval_id"]

    approval_response = client.post(
        "/api/v1/config/apply",
        json={
            "plan_id": "plan-apply",
            "approval_id": approval_id,
            "approval_decision": "approve",
        },
        headers=auth_header,
    )

    assert approval_response.status_code == 200
    body = approval_response.json()
    assert body["status"] == PlanExecutionStatus.COMPLETED.value
    assert body["mode"] == PlanExecutionMode.BRANCH_PR.value
    assert body["branch"] == expected.branch
    assert body["hitl_required"] is True
    assert body["approval_id"] == approval_id
    assert executor.invocations["submit"]
    assert executor.invocations["approve"][0]["approval_id"] == approval_id
    assert executor.invocations["finalize"][0]["approval_id"] == approval_id


def test_onboard_endpoint_uses_repository_name_when_missing(
    client: TestClient, auth_header: dict[str, str]
) -> None:
    response = client.post(
        "/api/v1/config/mcp/onboard",
        json={
            "repository": "agents/new-agent",
            "capabilities": ["chat", "planning"],
        },
        headers=auth_header,
    )

    assert response.status_code == 200
    plan = response.json()["plan"]
    assert plan["intent"] == "add_agent"
    assert any("new-agent" in diff["path"] for diff in plan["diffs"])


def test_policy_patch_endpoint_returns_plan(
    client: TestClient, auth_header: dict[str, str]
) -> None:
    response = client.patch(
        "/api/v1/config/policies",
        json={
            "policy_id": "spend-guard",
            "changes": {"monthly_spend_limit": 1000},
        },
        headers=auth_header,
    )

    assert response.status_code == 200
    plan = response.json()["plan"]
    assert plan["intent"] == "edit_policies"


def test_reload_endpoint_returns_plan_with_message(
    client: TestClient, auth_header: dict[str, str]
) -> None:
    response = client.post(
        "/api/v1/config/reload",
        json={
            "artifact_type": "finops.checklist",
            "target_path": "generated/cache.md",
            "parameters": {"owner": "finops"},
        },
        headers=auth_header,
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["plan"]["intent"] == "generate_artifact"
    assert any(step["actions"] for step in payload["plan"]["steps"])
    assert "Plano gerado" in payload["message"]
