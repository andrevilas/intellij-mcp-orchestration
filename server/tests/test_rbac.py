from datetime import datetime, timezone

from sqlalchemy import text
from starlette.testclient import TestClient

from console_mcp_server.security import Role, hash_token

pytest_plugins = ["tests.test_routes"]


def _provision_user(database, *, token: str, roles: set[Role]) -> None:
    hashed = hash_token(token)
    now = datetime.now(tz=timezone.utc).isoformat()
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
                "id": f"user-{token}",
                "name": "RBAC User",
                "email": "rbac@example.com",
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
                    "user_id": f"user-{token}",
                    "role_name": role.value,
                    "assigned_at": now,
                    "assigned_by": "pytest",
                },
            )


def test_config_routes_require_authorization(client: TestClient) -> None:
    response = client.post(
        "/api/v1/config/plan",
        json={"intent": "add_agent", "payload": {"agent_name": "demo", "repository": "repo"}},
    )

    assert response.status_code == 401
    assert response.json()["detail"] == "Missing Authorization header"


def test_invalid_token_is_rejected(client: TestClient, database) -> None:
    _provision_user(database, token="valid-token", roles={Role.PLANNER})

    response = client.post(
        "/api/v1/config/plan",
        json={"intent": "add_agent", "payload": {"agent_name": "demo", "repository": "repo"}},
        headers={"Authorization": "Bearer wrong-token"},
    )

    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid credentials"


def test_missing_role_returns_forbidden(client: TestClient, database) -> None:
    token = "viewer-only"
    _provision_user(database, token=token, roles={Role.VIEWER})

    response = client.post(
        "/api/v1/config/plan",
        json={"intent": "add_agent", "payload": {"agent_name": "demo", "repository": "repo"}},
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 403
    assert "Permissão insuficiente" in response.json()["detail"]


def test_approver_role_required_for_reload(client: TestClient, database) -> None:
    token = "planner-only"
    _provision_user(database, token=token, roles={Role.PLANNER})

    response = client.post(
        "/api/v1/config/reload",
        json={
            "artifact_type": "agent.readme",
            "target_path": "generated/out.md",
        },
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 403
    assert "Permissão insuficiente" in response.json()["detail"]
