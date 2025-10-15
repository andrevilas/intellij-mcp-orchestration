"""Shared utilities for parsing telemetry JSONL records.

The FinOps pipeline ingests telemetry emitted by heterogeneous MCP
wrappers.  Each wrapper historically produced slightly different field
names (for example, ``prompt_tokens`` vs. ``tokens_in``).  The
``TelemetryLogRecord`` dataclass defined here normalizes those variants
into a unified in-memory representation that can be persisted by the
console backend.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Mapping

_TOKEN_IN_KEYS: tuple[str, ...] = (
    "tokens_in",
    "input_tokens",
    "prompt_tokens",
    "request_tokens",
)
_TOKEN_OUT_KEYS: tuple[str, ...] = (
    "tokens_out",
    "output_tokens",
    "completion_tokens",
    "response_tokens",
)
_DURATION_KEYS: tuple[str, ...] = (
    "duration_ms",
    "latency_ms",
    "latencyMs",
    "elapsed_ms",
    "elapsedMs",
)
_STATUS_KEYS: tuple[str, ...] = ("status", "state", "result")
_STATUS_NORMALIZATION: dict[str, str] = {
    "ok": "success",
    "completed": "success",
    "success": "success",
    "succeeded": "success",
    "pass": "success",
    "passed": "success",
    "failed": "error",
    "failure": "error",
    "error": "error",
    "exception": "error",
    "denied": "denied",
    "blocked": "denied",
}
_TIMESTAMP_KEYS: tuple[str, ...] = (
    "ts",
    "timestamp",
    "time",
    "created_at",
    "logged_at",
)
_ROUTE_KEYS: tuple[str, ...] = (
    "route",
    "profile",
    "target_route",
    "route_id",
)
_COST_KEYS: tuple[str, ...] = (
    "cost_estimated_usd",
    "cost_usd",
    "estimated_cost_usd",
    "total_cost_usd",
    "price_usd",
)
_METADATA_KEYS: tuple[str, ...] = ("metadata", "details", "extra", "info")
_TOOL_KEYS: tuple[str, ...] = ("tool", "model", "name", "service", "target")


def _extract_first_mapping(
    payload: Mapping[str, Any], keys: tuple[str, ...]
) -> Mapping[str, Any] | None:
    for key in keys:
        value = payload.get(key)
        if isinstance(value, Mapping):
            return dict(value)
    return None


def _extract_first_str(
    payload: Mapping[str, Any], keys: tuple[str, ...], *, required: bool = False
) -> str | None:
    for key in keys:
        value = payload.get(key)
        if isinstance(value, str):
            stripped = value.strip()
            if stripped:
                return stripped
        elif isinstance(value, datetime):
            return _datetime_to_iso(value)
    if required:
        raise ValueError("telemetry record missing required string field")
    return None


def _extract_first_numeric(payload: Mapping[str, Any], keys: tuple[str, ...]) -> int:
    for key in keys:
        value = payload.get(key)
        try:
            if value is None:
                continue
            if isinstance(value, bool):
                continue
            if isinstance(value, (int, float)):
                return int(value)
            if isinstance(value, str) and value.strip():
                return int(float(value))
        except (TypeError, ValueError):
            continue
    return 0


def _extract_first_float(
    payload: Mapping[str, Any], keys: tuple[str, ...]
) -> float | None:
    for key in keys:
        value = payload.get(key)
        if value is None:
            continue
        try:
            if isinstance(value, bool):
                continue
            if isinstance(value, (int, float)):
                return float(value)
            if isinstance(value, str) and value.strip():
                return float(value)
        except (TypeError, ValueError):
            continue
    return None


def _datetime_to_iso(value: datetime) -> str:
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    else:
        value = value.astimezone(timezone.utc)
    return value.isoformat()


@dataclass(frozen=True)
class TelemetryLogRecord:
    """Normalized representation of a raw telemetry JSON record."""

    ts: str
    tool: str
    route: str | None
    tokens_in: int = 0
    tokens_out: int = 0
    duration_ms: int = 0
    status: str = "unknown"
    cost_estimated_usd: float | None = None
    metadata: dict[str, Any] = field(default_factory=dict)

    @classmethod
    def from_payload(cls, payload: Mapping[str, Any]) -> "TelemetryLogRecord":
        """Parse a telemetry payload emitted by any MCP wrapper.

        Parameters
        ----------
        payload:
            Raw dictionary parsed from a JSONL line.

        Returns
        -------
        TelemetryLogRecord
            Normalized representation of the telemetry record.

        Raises
        ------
        ValueError
            If required fields are missing or empty.
        TypeError
            If *payload* is not a mapping.
        """

        if not isinstance(payload, Mapping):
            raise TypeError("telemetry payload must be a mapping")

        timestamp = _extract_first_str(payload, _TIMESTAMP_KEYS, required=True)
        tool = _extract_first_str(payload, _TOOL_KEYS, required=True)
        route = _extract_first_str(payload, _ROUTE_KEYS, required=False)

        status_raw = _extract_first_str(payload, _STATUS_KEYS, required=False)
        normalized_status = _normalize_status(status_raw)

        metadata = _extract_first_mapping(payload, _METADATA_KEYS) or {}

        return cls(
            ts=timestamp,
            tool=tool,
            route=route,
            tokens_in=_extract_first_numeric(payload, _TOKEN_IN_KEYS),
            tokens_out=_extract_first_numeric(payload, _TOKEN_OUT_KEYS),
            duration_ms=_extract_first_numeric(payload, _DURATION_KEYS),
            status=normalized_status,
            cost_estimated_usd=_extract_first_float(payload, _COST_KEYS),
            metadata=dict(metadata),
        )

    def to_dict(self) -> dict[str, Any]:
        """Return a JSON-serializable representation of the record."""

        return {
            "ts": self.ts,
            "tool": self.tool,
            "route": self.route,
            "tokens_in": self.tokens_in,
            "tokens_out": self.tokens_out,
            "duration_ms": self.duration_ms,
            "status": self.status,
            "cost_estimated_usd": self.cost_estimated_usd,
            "metadata": dict(self.metadata),
        }


def _normalize_status(value: str | None) -> str:
    if value is None:
        return "unknown"
    lowered = value.strip().lower()
    if not lowered:
        return "unknown"
    return _STATUS_NORMALIZATION.get(lowered, lowered)


__all__ = ["TelemetryLogRecord"]

