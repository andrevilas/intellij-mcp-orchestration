"""Integration-style tests covering the sample deterministic agents."""

from __future__ import annotations

from pathlib import Path
import sys

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

import copy

from app.agents.catalog.agent import build_agent as build_catalog_agent
from app.agents.catalog.agent import get_tools as get_catalog_tools
from app.agents.content.agent import build_agent as build_content_agent
from app.agents.content.agent import get_tools as get_content_tools
from app.schemas.manifest import AgentManifest, load_manifest

_BASE_DIR = Path(__file__).resolve().parents[1] / "app" / "agents"
_CATALOG_DIR = _BASE_DIR / "catalog"
_CONTENT_DIR = _BASE_DIR / "content"


def _build_manifest(path: Path) -> AgentManifest:
    manifest = load_manifest(path)
    # Ensure manifests are compatible with the published schema.
    assert isinstance(manifest, AgentManifest)
    return manifest


def _as_payload(manifest: AgentManifest) -> dict[str, object]:
    return manifest.model_dump(mode="json", by_alias=True)


def test_catalog_agent_filters_and_limits_deterministically() -> None:
    manifest = _build_manifest(_CATALOG_DIR)
    agent = build_catalog_agent(_as_payload(manifest))

    approval_config = copy.deepcopy(_CATALOG_APPROVAL_CONFIG)
    first = agent.invoke({"query": "organizer"}, approval_config)
    second = agent.invoke({"query": "organizer"}, approval_config)
    assert first == second
    assert first["items"] == [{
        "sku": "SKU-004",
        "name": "Desk Organizer Set",
        "category": "Workspace",
        "price": 32.0,
        "tags": ("office", "storage", "productivity"),
        "description": "Stackable organizers to keep stationery and cables tidy.",
    }]

    limited = agent.invoke({"query": " ", "limit": 2}, approval_config)
    assert [item["sku"] for item in limited["items"]] == ["SKU-001", "SKU-002"]


def test_catalog_get_tools_matches_manifest() -> None:
    manifest = _build_manifest(_CATALOG_DIR)
    tools_from_manifest = list(manifest.tools)
    tools_from_runtime = list(get_catalog_tools())
    assert tools_from_manifest == tools_from_runtime


def test_content_agent_generates_repeatable_cta() -> None:
    manifest = _build_manifest(_CONTENT_DIR)
    agent = build_content_agent(_as_payload(manifest))

    payload = {
        "tone": "playful",
        "product_title": "Aurora Lamp",
        "audience": "design lovers",
    }
    approval_config = copy.deepcopy(_CONTENT_APPROVAL_CONFIG)
    first = agent.invoke(payload, approval_config)
    second = agent.invoke(payload, approval_config)
    assert first == second
    assert first["cta"] == (
        "Let's make Aurora Lamp for design lovers your next obsession. Tap to explore!"
    )

    neutral = agent.invoke({"tone": "mellow", "product_title": "Aurora Lamp"}, approval_config)
    assert neutral == {"cta": "Discover Aurora Lamp today."}


def test_catalog_agent_requires_hitl_approval() -> None:
    manifest = _build_manifest(_CATALOG_DIR)
    agent = build_catalog_agent(_as_payload(manifest))

    blocked = agent.invoke({"query": "organizer"})
    assert blocked["status"] == "hitl_blocked"
    assert blocked["checkpoint"] == "Data quality audit"


def test_catalog_finops_cache_and_budget_snapshot() -> None:
    manifest = _build_manifest(_CATALOG_DIR)
    agent = build_catalog_agent(_as_payload(manifest))

    config = _merge_configs(
        _CATALOG_APPROVAL_CONFIG,
        {"overrides": {"finops": {"cache": {"enabled": True}}}},
        {"metadata": {"requestId": "cache-test"}},
    )

    payload = {"query": "bag"}
    first = agent.invoke(payload, copy.deepcopy(config))
    second = agent.invoke(payload, copy.deepcopy(config))

    assert first == second
    snapshot = agent.finops_snapshot
    assert snapshot["cache_size"] == 1
    assert any(event["name"] == "finops.cache.hit" for event in agent.telemetry)
    assert {event["request_id"] for event in agent.telemetry} == {"cache-test"}


def test_catalog_finops_degrades_when_budget_exhausted() -> None:
    manifest = _build_manifest(_CATALOG_DIR)
    agent = build_catalog_agent(_as_payload(manifest))

    config = _merge_configs(
        _CATALOG_APPROVAL_CONFIG,
        {
            "overrides": {
                "finops": {
                    "model_tiers": {"preferred": "balanced"},
                    "cost": {"balanced": 10_000, "economy": 10_000},
                    "graceful_degradation": {"strategy": "stub"},
                }
            }
        },
    )

    degraded = agent.invoke({"query": "organizer"}, config)
    assert degraded["status"] == "degraded"
    assert degraded["reason"] == "budget_exhausted"


def test_content_agent_hitl_gating() -> None:
    manifest = _build_manifest(_CONTENT_DIR)
    agent = build_content_agent(_as_payload(manifest))

    blocked = agent.invoke({"tone": "playful", "product_title": "Aurora"})
    assert blocked["status"] == "hitl_blocked"
    assert blocked["checkpoint"] == "Compliance review"


def test_content_agent_finops_fallback_to_economy() -> None:
    manifest = _build_manifest(_CONTENT_DIR)
    agent = build_content_agent(_as_payload(manifest))

    config = _merge_configs(
        _CONTENT_APPROVAL_CONFIG,
        {
            "overrides": {
                "finops": {
                    "model_tiers": {
                        "preferred": "turbo",
                        "fallbacks": ["economy"],
                        "mapping": {"economy": "mock-economy"},
                    },
                    "cost": {"turbo": 10_000, "economy": 1},
                }
            }
        },
    )

    agent.invoke({"tone": "formal", "product_title": "Aurora"}, config)
    routing_events = [event for event in agent.telemetry if event["name"] == "node.routing"]
    assert routing_events
    last_payload = routing_events[-1]["payload"]
    assert last_payload["tier"] == "economy"
    assert last_payload["model"] == "mock-economy"


def test_content_get_tools_matches_manifest() -> None:
    manifest = _build_manifest(_CONTENT_DIR)
    tools_from_manifest = list(manifest.tools)
    tools_from_runtime = list(get_content_tools())
    assert tools_from_manifest == tools_from_runtime
_CATALOG_APPROVAL_CONFIG = {
    "overrides": {"hitl": {"decisions": {"Data quality audit": True}}},
}

_CONTENT_APPROVAL_CONFIG = {
    "overrides": {
        "hitl": {"decisions": {"Compliance review": True, "Final approval": True}}
    }
}


def _merge_configs(*configs: dict[str, object]) -> dict[str, object]:
    merged: dict[str, object] = {"overrides": {}, "parameters": {}, "metadata": {}}
    for config in configs:
        overrides = config.get("overrides") if isinstance(config, dict) else None
        if isinstance(overrides, dict):
            merged_overrides = merged.setdefault("overrides", {})
            for key, value in overrides.items():
                if isinstance(value, dict):
                    node = merged_overrides.setdefault(key, {})
                    node.update(value)
                else:
                    merged_overrides[key] = value
        for section in ("parameters", "metadata"):
            section_value = config.get(section) if isinstance(config, dict) else None
            if isinstance(section_value, dict):
                merged.setdefault(section, {}).update(section_value)
    return merged
