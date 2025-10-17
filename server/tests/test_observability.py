from __future__ import annotations

from datetime import datetime, timezone

import pytest
from sqlalchemy import text

from console_mcp_server.observability import load_preferences, save_preferences
from console_mcp_server.schemas import (
    ObservabilityEvalRunRequest,
    ObservabilityProviderSettings,
    ObservabilityProviderType,
)
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
                "name": "Observability User",
                "email": "observability@example.com",
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


def test_preferences_roundtrip(database) -> None:
    tracing = ObservabilityProviderSettings(
        provider=ObservabilityProviderType.LANGSMITH,
        project="langsmith-project",
    )
    values, updated = save_preferences({"tracing": tracing})

    assert "tracing" in values
    assert values["tracing"].provider is ObservabilityProviderType.LANGSMITH
    assert updated is not None

    metrics = ObservabilityProviderSettings(
        provider=ObservabilityProviderType.OTLP,
        endpoint="https://collector.example.com/v1/traces",
        headers={"x-team": "finops"},
    )
    values, _ = save_preferences({"metrics": metrics})

    assert "metrics" in values
    assert values["metrics"].headers == {"x-team": "finops"}

    values, _ = save_preferences({"tracing": None})

    assert "tracing" not in values

    refreshed, _ = load_preferences()
    assert "metrics" in refreshed
    assert refreshed["metrics"].provider is ObservabilityProviderType.OTLP


def test_preferences_endpoints_enforce_roles(client, database) -> None:
    response = client.get("/api/v1/observability/preferences")
    assert response.status_code == 401

    _provision_user(database, token="viewer", roles={Role.VIEWER})
    response = client.get(
        "/api/v1/observability/preferences",
        headers={"Authorization": "Bearer viewer"},
    )
    assert response.status_code == 403

    _provision_user(database, token="planner", roles={Role.PLANNER})
    response = client.get(
        "/api/v1/observability/preferences",
        headers={"Authorization": "Bearer planner"},
    )
    assert response.status_code == 200

    payload = {
        "tracing": {
            "provider": "langsmith",
            "project": "demo",
        }
    }
    response = client.put(
        "/api/v1/observability/preferences",
        json=payload,
        headers={"Authorization": "Bearer planner"},
    )
    assert response.status_code == 403

    _provision_user(database, token="approver", roles={Role.APPROVER})
    response = client.put(
        "/api/v1/observability/preferences",
        json=payload,
        headers={"Authorization": "Bearer approver"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["tracing"]["provider"] == "langsmith"


def test_observability_metrics_and_tracing(client, database, telemetry_dataset) -> None:
    token = "metrics"
    _provision_user(database, token=token, roles={Role.PLANNER})

    headers = {"Authorization": f"Bearer {token}"}
    metrics_response = client.get("/api/v1/observability/metrics", headers=headers)

    assert metrics_response.status_code == 200
    metrics_payload = metrics_response.json()
    assert metrics_payload["totals"]["runs"] == 4
    assert metrics_payload["totals"]["tokens_in"] == 5400
    assert metrics_payload["totals"]["tokens_out"] == 2500
    assert pytest.approx(metrics_payload["totals"]["success_rate"], rel=1e-3) == 0.5
    assert len(metrics_payload["providers"]) == 2
    assert metrics_payload["kpis"]["total_cost_usd"] >= 2.8

    tracing_response = client.get("/api/v1/observability/tracing", headers=headers)
    assert tracing_response.status_code == 200
    tracing_payload = tracing_response.json()
    assert len(tracing_payload["providers"]) == 2
    provider_ids = {entry["provider_id"] for entry in tracing_payload["providers"]}
    assert {"gemini", "glm46"} <= provider_ids


def test_eval_run_uses_metrics_snapshot(client, database, telemetry_dataset) -> None:
    token = "eval"
    _provision_user(database, token=token, roles={Role.PLANNER})

    payload = ObservabilityEvalRunRequest(
        preset_id="latency-regression",
        provider_id="gemini",
    ).model_dump()

    response = client.post(
        "/api/v1/observability/evals/run",
        json=payload,
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 201
    data = response.json()
    assert data["provider_id"] == "gemini"
    assert data["status"] == "completed"
    assert data["evaluated_runs"] == 2
    assert pytest.approx(data["success_rate"], rel=1e-3) == 0.5
    assert "2 execuções" in data["summary"]
