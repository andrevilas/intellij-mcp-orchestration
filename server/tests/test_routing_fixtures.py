from __future__ import annotations

import importlib
from pathlib import Path

import pytest

from console_mcp_server.fixtures import load_response_fixture
from console_mcp_server.schemas import RoutingSimulationResponse


REPO_ROOT = Path(__file__).resolve().parents[2]
MANIFEST_PATH = REPO_ROOT / "config/console-mcp/servers.example.json"


def test_routing_fixture_matches_deterministic_simulation(
    monkeypatch: pytest.MonkeyPatch,
    database,
) -> None:
    monkeypatch.setenv("CONSOLE_MCP_SERVERS_PATH", str(MANIFEST_PATH))

    import console_mcp_server.config as config_module
    import console_mcp_server.registry as registry_module
    import console_mcp_server.routing as routing_module

    config = importlib.reload(config_module)
    registry = importlib.reload(registry_module)
    routing = importlib.reload(routing_module)

    registry.provider_registry = registry.ProviderRegistry(settings=config.get_settings())
    routing.provider_registry = registry.provider_registry

    database.reset_state()
    database.bootstrap_database()

    expected = load_response_fixture(RoutingSimulationResponse, "routing_simulation")
    assert expected is not None, "routing_simulation.json fixture should be present"

    actual = routing.build_simulation_response(
        registry.provider_registry.providers,
        strategy_id=routing.DEFAULT_STRATEGY,
        failover_id=None,
        volume_millions=10.0,
    )

    assert actual.model_dump() == expected.model_dump()
