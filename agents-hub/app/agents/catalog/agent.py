"""Deterministic sample agent that surfaces an in-memory product catalogue."""

from __future__ import annotations

from pathlib import Path
from typing import Any, Iterable, Mapping

from app.schemas.manifest import AgentManifest
from app.schemas.manifest import load_manifest as _load_manifest

from ..orchestration import ExecutionState, GraphBackedAgent

_DEFAULT_LIMIT = 5
_MAX_LIMIT = 10

_CATALOG: tuple[dict[str, Any], ...] = (
    {
        "sku": "SKU-001",
        "name": "Stainless Steel Water Bottle",
        "category": "Hydration",
        "price": 24.99,
        "tags": ("water", "outdoor", "insulated"),
        "description": "Keeps drinks cold for up to 24 hours with a leak-proof lid.",
    },
    {
        "sku": "SKU-002",
        "name": "Ceramic Travel Mug",
        "category": "Hydration",
        "price": 18.5,
        "tags": ("coffee", "tea", "commute"),
        "description": "Double-walled ceramic mug with silicone sleeve for a secure grip.",
    },
    {
        "sku": "SKU-003",
        "name": "Organic Cotton Tote Bag",
        "category": "Accessories",
        "price": 16.0,
        "tags": ("shopping", "reusable", "eco"),
        "description": "Durable tote bag with reinforced handles and interior pocket.",
    },
    {
        "sku": "SKU-004",
        "name": "Desk Organizer Set",
        "category": "Workspace",
        "price": 32.0,
        "tags": ("office", "storage", "productivity"),
        "description": "Stackable organizers to keep stationery and cables tidy.",
    },
    {
        "sku": "SKU-005",
        "name": "Wireless Charging Pad",
        "category": "Electronics",
        "price": 39.95,
        "tags": ("charging", "qi", "desk"),
        "description": "Slim aluminium pad compatible with most Qi-enabled devices.",
    },
)


def _lower(value: str) -> str:
    return value.casefold()


def _iter_manifest_tools(manifest: AgentManifest) -> Iterable[Any]:
    for tool in manifest.tools:
        yield tool


class CatalogAgent(GraphBackedAgent):
    """Simple deterministic agent that performs substring filtering over the static dataset."""

    def __init__(self, manifest: AgentManifest | Mapping[str, Any]) -> None:
        if not isinstance(manifest, AgentManifest):
            manifest = AgentManifest.model_validate(manifest)
        super().__init__(manifest)
        self.default_limit = _DEFAULT_LIMIT
        self._catalog = [dict(item) for item in _CATALOG]

    def _execute_tool(self, state: ExecutionState) -> dict[str, list[dict[str, Any]]]:
        payload = state.payload
        query = _lower(str(payload.get("query", "")).strip())

        limit = payload.get("limit")
        limit_value = self.default_limit
        if isinstance(limit, int) and limit > 0:
            limit_value = min(limit, _MAX_LIMIT)

        if not query:
            matches = list(self._catalog)
        else:
            matches = [
                item
                for item in self._catalog
                if query in _lower(item["name"])
                or query in _lower(item["category"])
                or any(query in _lower(tag) for tag in item.get("tags", ()))
            ]

        return {"items": [dict(item) for item in matches[:limit_value]]}

    def _post_process(self, state: ExecutionState) -> dict[str, list[dict[str, Any]]]:
        return dict(state.result)

    def _degraded_payload(self, reason: str) -> dict[str, Any]:
        return {"items": [], "status": "degraded", "reason": reason}

    def _hitl_blocked_payload(self, checkpoint: Any) -> dict[str, Any]:
        return {
            "items": [],
            "status": "hitl_blocked",
            "checkpoint": getattr(checkpoint, "name", str(checkpoint)),
            "reason": getattr(checkpoint, "description", None) or "Manual approval required",
        }


def build_agent(manifest: dict[str, Any]) -> CatalogAgent:
    """Factory used by the registry to construct the deterministic catalogue agent."""

    return CatalogAgent(manifest=manifest)


def get_tools() -> list[Any]:
    """Return tool metadata derived from the manifest for introspection APIs."""

    manifest = _load_manifest(Path(__file__).resolve().parent)
    return list(_iter_manifest_tools(manifest))


__all__ = ["CatalogAgent", "build_agent", "get_tools"]
