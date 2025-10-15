"""Integration-style tests covering the sample deterministic agents."""

from __future__ import annotations

from pathlib import Path
import sys

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

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

    first = agent.invoke({"query": "organizer"})
    second = agent.invoke({"query": "organizer"})
    assert first == second
    assert first["items"] == [{
        "sku": "SKU-004",
        "name": "Desk Organizer Set",
        "category": "Workspace",
        "price": 32.0,
        "tags": ("office", "storage", "productivity"),
        "description": "Stackable organizers to keep stationery and cables tidy.",
    }]

    limited = agent.invoke({"query": " ", "limit": 2})
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
    first = agent.invoke(payload)
    second = agent.invoke(payload)
    assert first == second
    assert first["cta"] == (
        "Let's make Aurora Lamp for design lovers your next obsession. Tap to explore!"
    )

    neutral = agent.invoke({"tone": "mellow", "product_title": "Aurora Lamp"})
    assert neutral == {"cta": "Discover Aurora Lamp today."}


def test_content_get_tools_matches_manifest() -> None:
    manifest = _build_manifest(_CONTENT_DIR)
    tools_from_manifest = list(manifest.tools)
    tools_from_runtime = list(get_content_tools())
    assert tools_from_manifest == tools_from_runtime
