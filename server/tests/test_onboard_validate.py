from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from console_mcp_server import routes
from console_mcp_server.config_assistant import planner as planner_module
from console_mcp_server.config_assistant.mcp_client import MCPDiscoveryResult
from console_mcp_server.config_assistant.validation import MCPValidationOutcome
from console_mcp_server.security import Role

from .test_config_routes import _seed_user


pytest_plugins = ["tests.test_routes"]


def test_onboard_validate_only_runs_validation(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
    database,
) -> None:
    discovery = MCPDiscoveryResult(
        server_info={"name": "demo"},
        capabilities={"tools": True},
        tools=(),
        schemas=(),
        transport="websocket",
    )
    outcome = MCPValidationOutcome(
        endpoint="wss://demo.example/ws",
        transport="websocket",
        discovery=discovery,
        expected_tools=("ping",),
        missing_tools=(),
    )

    def _unexpected_plan(*_args, **_kwargs):  # pragma: no cover - defensive guard
        raise AssertionError("Plan generation should be skipped during validation")

    monkeypatch.setattr(routes, "_build_plan", _unexpected_plan)
    monkeypatch.setattr(routes, "get_plan_executor", _unexpected_plan)

    calls: list[dict[str, object]] = []

    def _validate(payload):
        calls.append(payload)
        return outcome

    monkeypatch.setattr(routes, "validate_server", _validate)
    monkeypatch.setattr(planner_module, "validate_server", _validate)

    token = "console-token"
    _seed_user(database, token=token, roles={Role.PLANNER, Role.VIEWER})

    response = client.post(
        "/api/v1/config/mcp/onboard",
        json={
            "repository": "agents/demo-agent",
            "capabilities": [],
            "endpoint": "wss://demo.example/ws",
            "intent": "validate",
        },
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["plan"] is None
    assert body["preview"] is None
    validation = body["validation"]
    assert validation["endpoint"] == outcome.endpoint
    assert validation["transport"] == outcome.transport
    assert calls
    payload = calls[0]
    assert payload["endpoint"] == "wss://demo.example/ws"


def test_onboard_validate_requires_endpoint(
    client: TestClient,
    database,
) -> None:
    token = "console-token"
    _seed_user(database, token=token, roles={Role.PLANNER, Role.VIEWER})

    response = client.post(
        "/api/v1/config/mcp/onboard",
        json={
            "repository": "agents/demo-agent",
            "intent": "validate",
        },
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 400
    assert "Endpoint" in response.json()["detail"]
