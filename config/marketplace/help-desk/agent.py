from __future__ import annotations

from typing import Any, Mapping


def run(payload: Mapping[str, Any] | None = None, *, tool_name: str | None = None) -> dict[str, Any]:
    request = payload or {}
    subject = request.get("subject", "Solicitação")
    urgency = request.get("urgency", "normal").lower()
    queue = "prioridade" if urgency in {"alta", "critica"} else "padrão"

    return {
        "status": "queued",
        "subject": subject,
        "queue": queue,
        "tool": tool_name or "triage",
    }
