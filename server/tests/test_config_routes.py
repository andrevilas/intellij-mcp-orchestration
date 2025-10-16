"""Integration tests for configuration assistant endpoints."""

from __future__ import annotations

from fastapi.testclient import TestClient

from console_mcp_server.schemas_plan import PlanExecutionStatus

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


def test_apply_endpoint_supports_dry_run(client: TestClient) -> None:
    plan_response = client.post(
        "/api/v1/config/plan",
        json={
            "intent": "generate_artifact",
            "payload": {"artifact_path": "generated/foo.json"},
        },
    )
    plan_response.raise_for_status()
    plan = plan_response.json()["plan"]

    dry_run = client.post(
        "/api/v1/config/apply",
        json={"plan": plan, "dry_run": True},
    )

    assert dry_run.status_code == 200
    body = dry_run.json()
    assert body["status"] == PlanExecutionStatus.PENDING.value
    assert body["applied_steps"] == []


def test_apply_endpoint_executes_plan_steps(client: TestClient) -> None:
    plan_response = client.post(
        "/api/v1/config/plan",
        json={
            "intent": "add_agent",
            "payload": {"agent_name": "demo", "repository": "agents"},
        },
    )
    plan_response.raise_for_status()
    plan = plan_response.json()["plan"]

    executed = client.post(
        "/api/v1/config/apply",
        json={"plan": plan},
    )

    assert executed.status_code == 200
    body = executed.json()
    assert body["status"] == PlanExecutionStatus.COMPLETED.value
    assert body["applied_steps"]


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
