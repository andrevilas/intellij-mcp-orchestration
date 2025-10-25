"""Helpers for FinOps exports consumed by the API routes and docs."""

from __future__ import annotations

import csv
import io
import json
from dataclasses import dataclass
from datetime import datetime

from console_mcp_server.telemetry import render_telemetry_export


@dataclass(frozen=True)
class FinOpsExport:
    """Container for FinOps telemetry export payloads."""

    document: str
    media_type: str


EXPECTED_HEADERS = (
    "timestamp",
    "provider_id",
    "tool",
    "route",
    "status",
    "tokens_in",
    "tokens_out",
    "duration_ms",
    "cost_estimated_usd",
)


class ExportValidationError(ValueError):
    """Raised when an export document does not contain the expected structure."""


def export_finops_telemetry(
    fmt: str,
    *,
    start: datetime | None = None,
    end: datetime | None = None,
    provider_id: str | None = None,
    route: str | None = None,
) -> FinOpsExport:
    """Generate and validate a FinOps telemetry export in the requested format."""

    document, media_type = render_telemetry_export(
        fmt,
        start=start,
        end=end,
        provider_id=provider_id,
        route=route,
    )
    _validate_document(fmt, document)
    return FinOpsExport(document=document, media_type=media_type)


def _validate_document(fmt: str, document: str) -> None:
    fmt_key = fmt.lower()
    if fmt_key == "csv":
        _validate_csv(document)
        return
    if fmt_key == "html":
        _validate_html(document)
        return
    if fmt_key == "json":
        _validate_json(document)
        return
    raise ExportValidationError(f"Unsupported FinOps export format: {fmt}")


def _validate_csv(document: str) -> None:
    buffer = io.StringIO(document)
    reader = csv.reader(buffer)
    try:
        header = next(reader)
    except StopIteration as exc:  # pragma: no cover - defensive guard
        raise ExportValidationError("CSV export missing header row") from exc
    if tuple(header[: len(EXPECTED_HEADERS)]) != EXPECTED_HEADERS:
        raise ExportValidationError(
            "CSV export missing expected FinOps telemetry columns"
        )
    first_row = next(reader, None)
    if first_row is None:
        raise ExportValidationError("CSV export does not contain telemetry events")


def _validate_html(document: str) -> None:
    lowered = document.lower()
    if "<table" not in lowered or "</table>" not in lowered:
        raise ExportValidationError("HTML export must contain a <table> element")
    required_markers = ("<th scope=\"col\">provider</th>", "<th scope=\"col\">cost (usd)</th>", "<th scope=\"col\">tokens in</th>")
    if not all(marker in lowered for marker in required_markers):
        raise ExportValidationError("HTML export missing FinOps telemetry fields")


def _validate_json(document: str) -> None:
    try:
        payload = json.loads(document)
    except json.JSONDecodeError as exc:  # pragma: no cover - defensive guard
        raise ExportValidationError("JSON export is not valid JSON") from exc
    if not isinstance(payload, list) or not payload:
        raise ExportValidationError("JSON export must contain at least one event")
    sample = payload[0]
    if not all(key in sample for key in EXPECTED_HEADERS):
        raise ExportValidationError(
            "JSON export missing expected FinOps telemetry keys"
        )
