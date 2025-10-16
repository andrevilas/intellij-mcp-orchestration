import json
import os
from datetime import datetime, timezone
from pathlib import Path

import console_mcp_server.routes as routes
from sqlalchemy import text
from starlette.testclient import TestClient

from console_mcp_server.config_assistant.plan_executor import PlanExecutionResult
from console_mcp_server.schemas_plan import PlanExecutionMode, PlanExecutionStatus
from console_mcp_server.security import Role, hash_token

pytest_plugins = ["tests.test_routes"]


def _create_user(database, *, token: str) -> None:
    now = datetime.now(tz=timezone.utc).isoformat()
    with database.session_scope() as session:
        session.execute(
            text(
                """
                INSERT INTO users (id, name, email, api_token_hash, created_at, updated_at)
                VALUES (:id, :name, :email, :hash, :created_at, :updated_at)
                ON CONFLICT(id) DO UPDATE SET
                    api_token_hash = excluded.api_token_hash,
                    updated_at = excluded.updated_at
                """
            ),
            {
                "id": "audit-user",
                "name": "Audit User",
                "email": "audit@example.com",
                "hash": hash_token(token),
                "created_at": now,
                "updated_at": now,
            },
        )
        for role in (Role.VIEWER, Role.PLANNER, Role.APPROVER):
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
                    "user_id": "audit-user",
                    "role_name": role.value,
                    "assigned_at": now,
                    "assigned_by": "pytest",
                },
            )


def _read_audit_entries() -> list[dict[str, object]]:
    path = Path(os.environ["CONSOLE_MCP_AUDIT_LOG_PATH"])
    if not path.exists():
        return []
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def _audit_headers(database, client: TestClient) -> dict[str, str]:
    token = "audit-token"
    _create_user(database, token=token)
    return {"Authorization": f"Bearer {token}"}


def test_audit_log_persists_events(client: TestClient, database, monkeypatch) -> None:
    headers = _audit_headers(database, client)

    expected = PlanExecutionResult(
        record_id="audit-record",
        plan_id="audit-plan",
        mode=PlanExecutionMode.DRY_RUN,
        status=PlanExecutionStatus.PENDING,
        branch=None,
        base_branch="main",
        commit_sha=None,
        diff_stat=" 1 file changed",
        diff_patch="--- a\n+++ b\n",
        hitl_required=False,
        message="Dry-run executado com sucesso.",
        approval_id=None,
    )

    class StubExecutor:
        def dry_run(self, **kwargs):
            return expected

        def submit_for_approval(self, **kwargs):  # pragma: no cover - defensive
            raise AssertionError("submit_for_approval should not be called in audit test")

        def finalize_approval(self, *_, **__):  # pragma: no cover - defensive
            raise AssertionError("finalize_approval should not be called in audit test")

        def approve_request(self, *_, **__):  # pragma: no cover - defensive
            raise AssertionError("approve_request should not be called in audit test")

        def reject_request(self, *_, **__):  # pragma: no cover - defensive
            raise AssertionError("reject_request should not be called in audit test")

    monkeypatch.setattr(routes, "get_plan_executor", lambda: StubExecutor())

    plan_response = client.post(
        "/api/v1/config/plan",
        json={"intent": "add_agent", "payload": {"agent_name": "audit", "repository": "repo"}},
        headers=headers,
    )
    assert plan_response.status_code == 200

    apply_response = client.post(
        "/api/v1/config/apply",
        json={
            "plan_id": "audit-plan",
            "plan": plan_response.json()["plan"],
            "patch": expected.diff_patch,
            "mode": PlanExecutionMode.DRY_RUN.value,
            "actor": "Auditor",
        },
        headers=headers,
    )
    assert apply_response.status_code == 200

    entries = _read_audit_entries()
    assert any(entry["action"] == "config.plan" for entry in entries)
    assert any(entry["action"] == "config.apply.dry_run" for entry in entries)

    with database.session_scope() as session:
        rows = session.execute(
            text("SELECT action, resource FROM audit_events ORDER BY created_at")
        ).all()

    actions = [row[0] for row in rows]
    assert "config.plan" in actions
    assert "config.apply.dry_run" in actions
