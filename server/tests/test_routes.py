"""Integration-style tests for the FastAPI console server."""

from __future__ import annotations

from pathlib import Path

import importlib

import pytest
from fastapi.testclient import TestClient

def resolve_repo_root(start: Path) -> Path:
    for candidate in (start,) + tuple(start.parents):
        manifest = candidate / 'config/console-mcp/servers.example.json'
        if manifest.exists():
            return candidate
    raise RuntimeError('Unable to locate repository root containing config/console-mcp/servers.example.json')


REPO_ROOT = resolve_repo_root(Path(__file__).resolve().parent)
MANIFEST_PATH = REPO_ROOT / 'config/console-mcp/servers.example.json'


@pytest.fixture()
def client(monkeypatch: pytest.MonkeyPatch) -> TestClient:
    monkeypatch.setenv('CONSOLE_MCP_SERVERS_PATH', str(MANIFEST_PATH))
    assert MANIFEST_PATH.exists()

    import console_mcp_server.config as config_module
    import console_mcp_server.registry as registry_module
    import console_mcp_server.routes as routes_module
    import console_mcp_server.main as main_module

    config = importlib.reload(config_module)
    registry = importlib.reload(registry_module)
    importlib.reload(routes_module)
    main = importlib.reload(main_module)

    registry.provider_registry = registry.ProviderRegistry(settings=config.get_settings())
    registry.session_registry = registry.SessionRegistry()

    with TestClient(main.app) as test_client:
        yield test_client

    registry.session_registry = registry.SessionRegistry()


def test_healthz_endpoint_reports_ok(client: TestClient) -> None:
    response = client.get('/api/v1/healthz')

    assert response.status_code == 200
    payload = response.json()
    assert payload['status'] == 'ok'
    assert 'timestamp' in payload


def test_providers_endpoint_uses_example_manifest(client: TestClient) -> None:
    response = client.get('/api/v1/providers')

    assert response.status_code == 200
    payload = response.json()
    provider_ids = {provider['id'] for provider in payload['providers']}

    assert len(payload['providers']) == 4
    assert {'gemini', 'codex', 'glm46', 'claude'} <= provider_ids
    assert all(provider['is_available'] for provider in payload['providers'])


def test_session_provisioning_flow(client: TestClient) -> None:
    list_before = client.get('/api/v1/sessions')
    assert list_before.status_code == 200
    assert list_before.json()['sessions'] == []

    create_response = client.post(
        '/api/v1/providers/gemini/sessions',
        json={'reason': 'Automated test', 'client': 'pytest-suite'},
    )

    assert create_response.status_code == 200
    body = create_response.json()

    assert body['provider']['id'] == 'gemini'
    assert body['session']['provider_id'] == 'gemini'
    assert body['session']['reason'] == 'Automated test'
    assert body['session']['client'] == 'pytest-suite'

    list_after = client.get('/api/v1/sessions')
    assert list_after.status_code == 200

    sessions = list_after.json()['sessions']
    assert any(session['id'] == body['session']['id'] for session in sessions)
