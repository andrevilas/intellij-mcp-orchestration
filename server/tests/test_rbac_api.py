from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import text
from starlette.testclient import TestClient

from console_mcp_server.security import Role, hash_token

pytest_plugins = ["tests.test_routes"]


def _seed_user(
    database,
    *,
    user_id: str,
    name: str,
    email: str | None,
    token: str,
    roles: set[Role],
    token_name: str = "Primary",
) -> None:
    """Provision a user + bearer token directly in the database for tests."""

    database.bootstrap_database()
    now = datetime.now(tz=timezone.utc).isoformat()
    token_hash = hash_token(token)
    with database.session_scope() as session:
        session.execute(
            text(
                """
                INSERT OR REPLACE INTO users (id, name, email, api_token_hash, created_at, updated_at)
                VALUES (:id, :name, :email, :token_hash, :created_at, :updated_at)
                """
            ),
            {
                "id": user_id,
                "name": name,
                "email": email,
                "token_hash": token_hash,
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
        session.execute(
            text(
                """
                INSERT OR REPLACE INTO user_tokens (
                    id,
                    user_id,
                    name,
                    token_hash,
                    prefix,
                    scopes,
                    created_at,
                    updated_at,
                    last_used_at,
                    expires_at,
                    revoked_at
                ) VALUES (
                    :id,
                    :user_id,
                    :name,
                    :token_hash,
                    :prefix,
                    :scopes,
                    :created_at,
                    :updated_at,
                    NULL,
                    NULL,
                    NULL
                )
                """
            ),
            {
                "id": f"token-{user_id}",
                "user_id": user_id,
                "name": token_name,
                "token_hash": token_hash,
                "prefix": token[:4],
                "scopes": "[]",
                "created_at": now,
                "updated_at": now,
            },
        )


def test_security_user_crud_flow(client: TestClient, database) -> None:
    admin_token = "admin-secret"
    _seed_user(
        database,
        user_id="user-admin",
        name="Admin",
        email="admin@example.com",
        token=admin_token,
        roles={Role.APPROVER},
    )

    headers = {"Authorization": f"Bearer {admin_token}"}

    create_response = client.post(
        "/api/v1/security/users",
        json={"name": "New Operator", "email": "operator@example.com", "roles": ["viewer"]},
        headers=headers,
    )
    assert create_response.status_code == 201
    create_payload = create_response.json()
    assert create_payload["secret"]
    created_user = create_payload["user"]
    assert created_user["name"] == "New Operator"
    assert created_user["roles"] == ["viewer"]
    assert created_user["status"] == "active"

    user_id = created_user["id"]

    list_response = client.get("/api/v1/security/users", headers=headers)
    assert list_response.status_code == 200
    users = list_response.json()["users"]
    assert any(user["id"] == user_id for user in users)

    read_response = client.get(f"/api/v1/security/users/{user_id}", headers=headers)
    assert read_response.status_code == 200
    read_payload = read_response.json()["user"]
    assert read_payload["email"] == "operator@example.com"

    update_response = client.put(
        f"/api/v1/security/users/{user_id}",
        json={"name": "Ops Approver", "roles": ["approver"]},
        headers=headers,
    )
    assert update_response.status_code == 200
    updated_user = update_response.json()["user"]
    assert updated_user["name"] == "Ops Approver"
    assert updated_user["roles"] == ["approver"]

    delete_response = client.delete(f"/api/v1/security/users/{user_id}", headers=headers)
    assert delete_response.status_code == 204

    list_after_delete = client.get("/api/v1/security/users", headers=headers)
    assert list_after_delete.status_code == 200
    remaining = list_after_delete.json()["users"]
    assert all(user["id"] != user_id for user in remaining)


def test_security_api_keys_rotation_flow(client: TestClient, database) -> None:
    admin_token = "approver-secret"
    _seed_user(
        database,
        user_id="user-approver",
        name="Sec Admin",
        email="security@example.com",
        token=admin_token,
        roles={Role.APPROVER},
    )

    headers = {"Authorization": f"Bearer {admin_token}"}

    owner_response = client.post(
        "/api/v1/security/users",
        json={"name": "Service Account", "email": None, "roles": ["viewer"]},
        headers=headers,
    )
    assert owner_response.status_code == 201
    owner_payload = owner_response.json()
    owner_id = owner_payload["user"]["id"]

    create_key_response = client.post(
        "/api/v1/security/api-keys",
        json={"user_id": owner_id, "name": "integration", "scopes": ["mcp.sessions.create"]},
        headers=headers,
    )
    assert create_key_response.status_code == 201
    key_payload = create_key_response.json()
    key_id = key_payload["key"]["id"]
    original_secret = key_payload["secret"]
    assert key_payload["key"]["status"] == "active"

    rotate_response = client.post(
        f"/api/v1/security/api-keys/{key_id}/rotate",
        json={"expires_at": None},
        headers=headers,
    )
    assert rotate_response.status_code == 200
    rotated_payload = rotate_response.json()
    assert rotated_payload["key"]["id"] == key_id
    assert rotated_payload["secret"] != original_secret

    revoke_response = client.delete(f"/api/v1/security/api-keys/{key_id}", headers=headers)
    assert revoke_response.status_code == 204

    list_keys = client.get("/api/v1/security/api-keys", headers=headers)
    assert list_keys.status_code == 200
    keys = list_keys.json()["keys"]
    target = next((item for item in keys if item["id"] == key_id), None)
    assert target is not None
    assert target["status"] == "revoked"


def test_security_routes_require_approver_role(client: TestClient, database) -> None:
    planner_token = "planner-secret"
    _seed_user(
        database,
        user_id="user-planner",
        name="Planner",
        email="planner@example.com",
        token=planner_token,
        roles={Role.PLANNER},
    )

    response = client.get(
        "/api/v1/security/users",
        headers={"Authorization": f"Bearer {planner_token}"},
    )
    assert response.status_code == 403
    assert "Permissão insuficiente" in response.json()["detail"]
