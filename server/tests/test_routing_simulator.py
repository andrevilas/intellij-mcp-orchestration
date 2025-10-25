from __future__ import annotations

import importlib
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from console_mcp_server.fixtures import load_response_fixture
from console_mcp_server.routing import (
    DEFAULT_STRATEGY,
    RouteProfile,
    RoutingIntent,
    RoutingRule,
    build_simulation_response,
    compute_plan,
)
from console_mcp_server.schemas import ProviderSummary, RoutingSimulationResponse


REPO_ROOT = Path(__file__).resolve().parents[2]
MANIFEST_PATH = REPO_ROOT / "config/console-mcp/servers.example.json"


def _provider(provider_id: str, *, name: str | None = None) -> ProviderSummary:
    return ProviderSummary(
        id=provider_id,
        name=name or provider_id.capitalize(),
        command=f"/{provider_id}",
        description="",
        tags=[],
        capabilities=["chat"],
        transport="stdio",
    )


def _route(
    provider_id: str,
    *,
    lane: str,
    cost: float,
    latency: float,
    reliability: float,
    capacity: float,
) -> RouteProfile:
    provider = _provider(provider_id)
    return RouteProfile(
        id=provider_id,
        provider=provider,
        lane=lane,
        cost_per_million=cost,
        latency_p95=latency,
        reliability=reliability,
        capacity_score=capacity,
    )


@pytest.fixture()
def client(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> TestClient:
    monkeypatch.setenv("CONSOLE_MCP_SERVERS_PATH", str(MANIFEST_PATH))
    secrets_path = tmp_path / "secrets.json"
    monkeypatch.setenv("CONSOLE_MCP_SECRETS_PATH", str(secrets_path))
    db_path = tmp_path / "console.db"
    monkeypatch.setenv("CONSOLE_MCP_DB_PATH", str(db_path))
    audit_path = tmp_path / "audit.log"
    monkeypatch.setenv("CONSOLE_MCP_AUDIT_LOG_PATH", str(audit_path))

    import console_mcp_server.config as config_module
    import console_mcp_server.registry as registry_module
    import console_mcp_server.secrets as secrets_module
    import console_mcp_server.secret_validation as secret_validation_module
    import console_mcp_server.database as database_module
    import console_mcp_server.routes as routes_module
    import console_mcp_server.config_assistant.rag as rag_module
    import console_mcp_server.supervisor as supervisor_module
    import console_mcp_server.main as main_module

    config = importlib.reload(config_module)
    registry = importlib.reload(registry_module)
    secrets = importlib.reload(secrets_module)
    secret_validation = importlib.reload(secret_validation_module)
    database = importlib.reload(database_module)
    supervisor = importlib.reload(supervisor_module)
    rag = importlib.reload(rag_module)
    rag.rag_service.reset()
    importlib.reload(routes_module)
    main = importlib.reload(main_module)

    registry.provider_registry = registry.ProviderRegistry(settings=config.get_settings())
    registry.session_registry = registry.SessionRegistry()
    secrets.secret_store = secrets.SecretStore(path=secrets_path)
    secret_validation.secret_store = secrets.secret_store
    secret_validation.provider_registry = registry.provider_registry
    database.reset_state()
    supervisor.process_supervisor.prune(only_finished=False)

    with TestClient(main.app, raise_server_exceptions=False) as test_client:
        yield test_client

    registry.session_registry = registry.SessionRegistry()
    database.reset_state()
    supervisor.process_supervisor.stop_all()
    supervisor.process_supervisor.prune(only_finished=False)


def test_compute_plan_intents_influence_lane_weights() -> None:
    routes = (
        _route("alpha", lane="economy", cost=12.0, latency=1500.0, reliability=95.0, capacity=70.0),
        _route("beta", lane="balanced", cost=18.0, latency=1100.0, reliability=96.0, capacity=75.0),
        _route("gamma", lane="turbo", cost=30.0, latency=800.0, reliability=94.0, capacity=80.0),
    )

    base_plan = compute_plan(routes, DEFAULT_STRATEGY, None, 12.0)
    turbo_base = next(entry for entry in base_plan.distribution if entry.route.lane == "turbo")

    intents = (
        RoutingIntent(
            intent="growth",
            description=None,
            tags=("priority",),
            default_tier="turbo",
            fallback_provider_id="gamma",
        ),
        RoutingIntent(
            intent="support",
            description=None,
            tags=("customers",),
            default_tier="balanced",
            fallback_provider_id="beta",
        ),
        RoutingIntent(
            intent="ops",
            description=None,
            tags=(),
            default_tier="turbo",
            fallback_provider_id="gamma",
        ),
    )

    with_intents = compute_plan(routes, DEFAULT_STRATEGY, None, 12.0, intents=intents)
    turbo_adjusted = next(entry for entry in with_intents.distribution if entry.route.lane == "turbo")

    assert turbo_adjusted.share > turbo_base.share
    assert turbo_adjusted.tokens_millions > turbo_base.tokens_millions


def test_compute_plan_applies_rule_weights() -> None:
    routes = (
        _route("alpha", lane="balanced", cost=16.0, latency=900.0, reliability=96.0, capacity=80.0),
        _route("beta", lane="balanced", cost=15.0, latency=950.0, reliability=95.0, capacity=70.0),
        _route("gamma", lane="turbo", cost=28.0, latency=700.0, reliability=93.0, capacity=65.0),
    )

    rule = RoutingRule(
        id="reserve-gamma",
        description=None,
        intent=None,
        matcher="provider_id == 'gamma'",
        target_tier=None,
        provider_id="gamma",
        weight=40.0,
    )

    base_plan = compute_plan(routes, "finops", None, 20.0)
    base_gamma = next(entry for entry in base_plan.distribution if entry.route.id == "gamma")

    plan = compute_plan(routes, "finops", None, 20.0, rules=(rule,))
    gamma_entry = next(entry for entry in plan.distribution if entry.route.id == "gamma")

    expected_share = base_gamma.share * (1 - 0.4) + 0.4
    assert pytest.approx(gamma_entry.share, rel=1e-3) == pytest.approx(expected_share, rel=1e-3)
    assert gamma_entry.share > base_gamma.share
    assert pytest.approx(gamma_entry.tokens_millions, rel=1e-3) == pytest.approx(
        gamma_entry.share * 20.0,
        rel=1e-3,
    )


def test_simulation_endpoint_accepts_intents_and_rules(client) -> None:
    payload = {
        "provider_ids": ["gemini", "codex", "glm46"],
        "strategy": "finops",
        "failover_provider_id": None,
        "volume_millions": 12,
        "intents": [
            {
                "intent": "growth-outreach",
                "description": "Campanhas outbound",
                "tags": ["growth"],
                "default_tier": "turbo",
                "fallback_provider_id": "codex",
            },
            {
                "intent": "customer-support",
                "description": "Atendimento",
                "tags": ["support", "chat"],
                "default_tier": "balanced",
                "fallback_provider_id": "gemini",
            },
        ],
        "custom_rules": [
            {
                "id": "reserve-codex",
                "description": "Reserva parte do volume para Codex",
                "matcher": "provider_id == 'codex'",
                "provider_id": "codex",
                "weight": 25,
            }
        ],
    }

    response = client.post("/api/v1/routing/simulate", json=payload)
    assert response.status_code == 200
    body = response.json()

    assert body["context"]["strategy"] == "finops"
    assert set(body["context"]["provider_ids"]) == {"gemini", "codex", "glm46"}

    import console_mcp_server.routing as routing_module
    import console_mcp_server.registry as registry_module

    providers = [
        provider
        for provider in registry_module.provider_registry.providers
        if provider.id in payload["provider_ids"]
    ]

    intents = tuple(
        routing_module.RoutingIntent(
            intent=item["intent"],
            description=item.get("description"),
            tags=tuple(tag for tag in item.get("tags", []) if tag),
            default_tier=item["default_tier"],
            fallback_provider_id=item.get("fallback_provider_id"),
        )
        for item in payload["intents"]
    )

    rules = tuple(
        routing_module.RoutingRule(
            id=item["id"],
            description=item.get("description"),
            intent=item.get("intent"),
            matcher=item["matcher"],
            target_tier=item.get("target_tier"),
            provider_id=item.get("provider_id"),
            weight=float(item["weight"]) if item.get("weight") is not None else None,
        )
        for item in payload["custom_rules"]
    )

    expected = routing_module.build_simulation_response(
        providers,
        strategy_id=payload["strategy"],
        failover_id=payload["failover_provider_id"],
        volume_millions=float(payload["volume_millions"]),
        intents=intents,
        rules=rules,
    )

    assert body == expected.model_dump()


def test_routing_fixture_with_overrides_matches_simulation(
    monkeypatch: pytest.MonkeyPatch,
    database,
) -> None:
    repo_root = Path(__file__).resolve().parents[2]
    manifest_path = repo_root / "config/console-mcp/servers.example.json"
    monkeypatch.setenv("CONSOLE_MCP_SERVERS_PATH", str(manifest_path))

    import console_mcp_server.config as config_module
    import console_mcp_server.registry as registry_module
    import console_mcp_server.routing as routing_module

    config = importlib.reload(config_module)
    registry = importlib.reload(registry_module)
    routing = importlib.reload(routing_module)

    registry.provider_registry = registry.ProviderRegistry(settings=config.reload_settings())
    routing.provider_registry = registry.provider_registry

    database.reset_state()
    database.bootstrap_database()

    expected = load_response_fixture(RoutingSimulationResponse, "routing/plan_with_overrides")
    assert expected is not None, "plan_with_overrides.json fixture should exist"

    intents = (
        routing.RoutingIntent(
            intent="customer-support",
            description="Atendimento ao cliente",
            tags=("support", "chat"),
            default_tier="balanced",
            fallback_provider_id="gemini",
        ),
        routing.RoutingIntent(
            intent="growth-outreach",
            description="Campanhas outbound",
            tags=("growth",),
            default_tier="turbo",
            fallback_provider_id="codex",
        ),
        routing.RoutingIntent(
            intent="internal-automation",
            description="Automação interna",
            tags=("automation",),
            default_tier="economy",
            fallback_provider_id=None,
        ),
    )

    rules = (
        routing.RoutingRule(
            id="reserve-codex",
            description="Reserva parte do volume para Codex",
            intent="growth-outreach",
            matcher="provider_id == 'codex'",
            target_tier=None,
            provider_id="codex",
            weight=25.0,
        ),
        routing.RoutingRule(
            id="boost-turbo",
            description="Aumenta prioridade do tier turbo",
            intent=None,
            matcher="lane == 'turbo'",
            target_tier="turbo",
            provider_id=None,
            weight=None,
        ),
    )

    actual = routing.build_simulation_response(
        routing.provider_registry.providers,
        strategy_id="finops",
        failover_id=None,
        volume_millions=12.0,
        intents=intents,
        rules=rules,
    )

    assert actual.model_dump() == expected.model_dump()
