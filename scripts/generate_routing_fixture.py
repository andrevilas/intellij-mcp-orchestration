#!/usr/bin/env python3
"""Regenerate deterministic routing fixtures used by the UI and tests."""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from tempfile import TemporaryDirectory

import structlog


def _configure_environment(repo_root: Path) -> None:
    os.environ.setdefault(
        "CONSOLE_MCP_SERVERS_PATH",
        str(repo_root / "config/console-mcp/servers.example.json"),
    )


def main() -> None:
    repo_root = Path(__file__).resolve().parents[1]
    sys.path.append(str(repo_root / "server/src"))
    _configure_environment(repo_root)

    from console_mcp_server import config, database, registry
    from console_mcp_server.routing import (
        DEFAULT_STRATEGY,
        RoutingIntent,
        RoutingRule,
        build_simulation_response,
    )

    settings = config.reload_settings()
    registry.provider_registry = registry.ProviderRegistry(settings=settings)

    with TemporaryDirectory(prefix="routing-fixture-") as tmp_dir:
        db_path = Path(tmp_dir) / "console.db"
        os.environ["CONSOLE_MCP_DB_PATH"] = str(db_path)
        database.reset_state()
        database.bootstrap_database()

        response = build_simulation_response(
            registry.provider_registry.providers,
            strategy_id=DEFAULT_STRATEGY,
            failover_id=None,
            volume_millions=10.0,
        )

        scenario_intents = (
            RoutingIntent(
                intent="customer-support",
                description="Atendimento ao cliente",
                tags=("support", "chat"),
                default_tier="balanced",
                fallback_provider_id="gemini",
            ),
            RoutingIntent(
                intent="growth-outreach",
                description="Campanhas outbound",
                tags=("growth",),
                default_tier="turbo",
                fallback_provider_id="codex",
            ),
            RoutingIntent(
                intent="internal-automation",
                description="Automação interna",
                tags=("automation",),
                default_tier="economy",
                fallback_provider_id=None,
            ),
        )

        scenario_rules = (
            RoutingRule(
                id="reserve-codex",
                description="Reserva parte do volume para Codex",
                intent="growth-outreach",
                matcher="provider_id == 'codex'",
                target_tier=None,
                provider_id="codex",
                weight=25.0,
            ),
            RoutingRule(
                id="boost-turbo",
                description="Aumenta prioridade do tier turbo",
                intent=None,
                matcher="lane == 'turbo'",
                target_tier="turbo",
                provider_id=None,
                weight=None,
            ),
        )

        custom_response = build_simulation_response(
            registry.provider_registry.providers,
            strategy_id="finops",
            failover_id=None,
            volume_millions=12.0,
            intents=scenario_intents,
            rules=scenario_rules,
        )

    payload = response.model_dump(mode="json")
    output_paths = (
        repo_root / "server/routes/fixtures/routing_simulation.json",
        repo_root / "tests/fixtures/backend/routing_simulation.json",
    )

    serialized = json.dumps(payload, indent=2) + "\n"

    for path in output_paths:
        path.write_text(serialized, encoding="utf-8")
        structlog.get_logger(__name__).info("routing_fixture.written", path=str(path))

    routing_dir = repo_root / "server/routes/fixtures/routing"
    tests_routing_dir = repo_root / "tests/fixtures/backend/routing"
    routing_dir.mkdir(parents=True, exist_ok=True)
    tests_routing_dir.mkdir(parents=True, exist_ok=True)

    custom_payload = custom_response.model_dump(mode="json")
    custom_serialized = json.dumps(custom_payload, indent=2) + "\n"
    custom_paths = (
        routing_dir / "plan_with_overrides.json",
        tests_routing_dir / "plan_with_overrides.json",
    )

    for path in custom_paths:
        path.write_text(custom_serialized, encoding="utf-8")
        structlog.get_logger(__name__).info("routing_fixture.written", path=str(path))


if __name__ == "__main__":
    main()
