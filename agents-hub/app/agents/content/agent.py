"""Deterministic CTA generator agent implementation."""

from __future__ import annotations

from pathlib import Path
from typing import Any, Mapping

from app.schemas.manifest import AgentManifest
from app.schemas.manifest import load_manifest as _load_manifest

from ..orchestration import ExecutionState, GraphBackedAgent

_TEMPLATES: dict[str, str] = {
    "playful": "Let's make {product}{audience_text} your next obsession. Tap to explore!",
    "formal": "Introduce {product}{audience_text} to your collection today.",
    "urgent": "Act now{audience_text}! {product} is ready when you are.",
    "confident": "Own the spotlight with {product}{audience_text}. Claim yours now.",
}
_DEFAULT_TEMPLATE = "Discover {product}{audience_text} today."


def _normalise_whitespace(value: str) -> str:
    return " ".join(value.split())


def _format_audience(audience: str | None) -> str:
    if not audience:
        return ""
    cleaned = _normalise_whitespace(str(audience).strip())
    if not cleaned:
        return ""
    return f" for {cleaned}"


def _select_template(tone: str) -> str:
    key = _normalise_whitespace(tone).casefold()
    return _TEMPLATES.get(key, _DEFAULT_TEMPLATE)


class ContentAgent(GraphBackedAgent):
    """Small deterministic agent that maps tone and product into a CTA string."""

    def __init__(self, manifest: AgentManifest | Mapping[str, Any]) -> None:
        if not isinstance(manifest, AgentManifest):
            manifest = AgentManifest.model_validate(manifest)
        super().__init__(manifest)

    def _execute_tool(self, state: ExecutionState) -> dict[str, str]:
        payload = state.payload or {}
        tone = str(payload.get("tone", "")).strip()
        product_title = str(payload.get("product_title", "")).strip()
        audience = payload.get("audience")

        product = _normalise_whitespace(product_title)
        template = _select_template(tone)
        cta = template.format(product=product, audience_text=_format_audience(audience))
        return {"cta": cta}

    def _post_process(self, state: ExecutionState) -> dict[str, str]:
        return dict(state.result)

    def _degraded_payload(self, reason: str) -> dict[str, Any]:
        return {"cta": "", "status": "degraded", "reason": reason}

    def _hitl_blocked_payload(self, checkpoint: Any) -> dict[str, Any]:
        return {
            "cta": "",
            "status": "hitl_blocked",
            "checkpoint": getattr(checkpoint, "name", str(checkpoint)),
            "reason": getattr(checkpoint, "description", None) or "Manual approval required",
        }


def build_agent(manifest: dict[str, Any]) -> ContentAgent:
    """Factory used by the registry to construct the CTA agent."""

    return ContentAgent(manifest=manifest)


def get_tools() -> list[Any]:
    manifest = _load_manifest(Path(__file__).resolve().parent)
    return list(manifest.tools)


__all__ = ["ContentAgent", "build_agent", "get_tools"]
