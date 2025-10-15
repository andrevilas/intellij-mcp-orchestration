"""Deterministic CTA generator agent implementation."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Mapping

from app.schemas.manifest import load_manifest as _load_manifest

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


@dataclass(slots=True)
class ContentAgent:
    """Small deterministic agent that maps tone and product into a CTA string."""

    manifest: dict[str, Any] = field(repr=False)

    def invoke(
        self,
        payload: Mapping[str, Any] | None = None,
        config: Mapping[str, Any] | None = None,
    ) -> dict[str, str]:
        del config

        payload = payload or {}
        tone = str(payload.get("tone", "")).strip()
        product_title = str(payload.get("product_title", "")).strip()
        audience = payload.get("audience")

        product = _normalise_whitespace(product_title)
        template = _select_template(tone)
        cta = template.format(product=product, audience_text=_format_audience(audience))
        return {"cta": cta}


def build_agent(manifest: dict[str, Any]) -> ContentAgent:
    """Factory used by the registry to construct the CTA agent."""

    return ContentAgent(manifest=manifest)


def get_tools() -> list[Any]:
    manifest = _load_manifest(Path(__file__).resolve().parent)
    return list(manifest.tools)


__all__ = ["ContentAgent", "build_agent", "get_tools"]
