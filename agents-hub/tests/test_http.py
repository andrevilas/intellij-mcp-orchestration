"""HTTP level tests for the FastAPI application."""

from __future__ import annotations

import logging


def test_health_endpoint(test_client) -> None:
    response = test_client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"ok": True}


def test_list_agents_returns_registered_metadata(settings, create_agent, app, test_client) -> None:
    create_agent("atlas")
    create_agent("zephyr")
    app.state.registry.reload()

    response = test_client.get("/agents")
    assert response.status_code == 200
    payload = response.json()
    assert sorted(agent["name"] for agent in payload["agents"]) == ["atlas", "zephyr"]


def test_get_agent_returns_details(settings, create_agent, app, test_client) -> None:
    create_agent("orion", manifest_overrides={"title": "Orion"})
    app.state.registry.reload()

    response = test_client.get("/agents/orion")
    assert response.status_code == 200
    assert response.json()["agent"]["title"] == "Orion"


def test_invoke_agent_success(settings, create_agent, app, test_client) -> None:
    create_agent("echo")
    app.state.registry.reload()

    response = test_client.post(
        "/agents/echo/invoke",
        json={"input": {"message": "hello"}},
    )
    assert response.status_code == 200
    assert response.json()["result"]["echo"] == {"message": "hello"}


def test_invoke_agent_validation_error(settings, create_agent, app, test_client) -> None:
    validation_code = """
from __future__ import annotations

from typing import Any, Mapping

from app.errors import ValidationError


class ValidatingAgent:
    def __init__(self, manifest: dict[str, Any]):
        self.manifest = manifest

    async def ainvoke(
        self,
        payload: Mapping[str, Any] | None = None,
        config: Mapping[str, Any] | None = None,
    ) -> dict[str, Any]:
        payload_dict = dict(payload or {})
        if "message" not in payload_dict:
            raise ValidationError("Missing 'message' in payload")
        return {"echo": payload_dict}


def build_agent(manifest: dict[str, Any]) -> ValidatingAgent:
    return ValidatingAgent(manifest)


def get_tools() -> list[dict[str, Any]]:
    return []
"""
    create_agent("validator", code=validation_code)
    app.state.registry.reload()

    response = test_client.post(
        "/agents/validator/invoke",
        json={"input": {}},
    )
    assert response.status_code == 400
    body = response.json()
    assert body["status"] == "error"
    assert "Missing 'message' in payload" in body["error"]


def test_unknown_agent_returns_404(app, test_client) -> None:
    response = test_client.get("/agents/unknown")
    assert response.status_code == 404


def test_invoke_unknown_agent_returns_404(app, test_client) -> None:
    response = test_client.post("/agents/unknown/invoke", json={"input": {}})
    assert response.status_code == 404


def test_agent_runtime_error_returns_500(settings, create_agent, app, test_client, caplog) -> None:
    failing_code = """
from __future__ import annotations

from typing import Any, Mapping


class FailingAgent:
    def __init__(self, manifest: dict[str, Any]):
        self.manifest = manifest

    async def ainvoke(
        self,
        payload: Mapping[str, Any] | None = None,
        config: Mapping[str, Any] | None = None,
    ) -> dict[str, Any]:
        raise RuntimeError("boom")


def build_agent(manifest: dict[str, Any]) -> FailingAgent:
    return FailingAgent(manifest)


def get_tools() -> list[dict[str, Any]]:
    return []
"""
    create_agent("explosive", code=failing_code)
    app.state.registry.reload()

    with caplog.at_level(logging.ERROR):
        response = test_client.post("/agents/explosive/invoke", json={"input": {}})

    assert response.status_code == 500
    body = response.json()
    assert body["status"] == "error"
    assert body["error"] == "Invocation of agent 'explosive' failed"
    assert any("agent.invoke.error" in record.getMessage() for record in caplog.records)
