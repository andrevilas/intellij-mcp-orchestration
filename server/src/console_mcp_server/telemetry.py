"""Telemetry ingestion utilities for JSONL logs produced by MCP servers."""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable, Iterator

from sqlalchemy import text
from sqlalchemy.engine import Connection

from .database import bootstrap_database

DEFAULT_LOGS_DIR = Path("~/.mcp/logs")
LOGS_ENV_VAR = "CONSOLE_MCP_LOGS_DIR"


@dataclass(frozen=True)
class TelemetryEvent:
    """Normalized telemetry record ready to be persisted."""

    provider_id: str
    tool: str
    route: str | None
    tokens_in: int
    tokens_out: int
    duration_ms: int
    status: str
    cost_estimated_usd: float | None
    metadata_json: str
    ts: str
    source_file: str
    line_number: int
    ingested_at: str


def ingest_logs(provider_id: str | None = None, logs_dir: Path | None = None) -> int:
    """Ingest telemetry JSONL files into the SQLite database.

    Parameters
    ----------
    provider_id:
        Optional identifier limiting ingestion to a specific provider directory.
    logs_dir:
        Optional base directory override containing per-provider telemetry folders.

    Returns
    -------
    int
        Number of records inserted into the database across all processed files.
    """

    engine = bootstrap_database()
    root = _resolve_logs_dir(logs_dir)

    provider_dirs: Iterable[tuple[str, Path]]
    if provider_id is not None:
        provider_dirs = ((provider_id, root / provider_id),)
    else:
        provider_dirs = _discover_providers(root)

    inserted = 0
    with engine.begin() as connection:
        for provider, directory in provider_dirs:
            if not directory.exists():
                continue
            inserted += _ingest_provider(connection, provider, directory, root)
    return inserted


def _resolve_logs_dir(base_dir: Path | None = None) -> Path:
    env_override = os.getenv(LOGS_ENV_VAR)
    resolved = base_dir or Path(env_override) if env_override else DEFAULT_LOGS_DIR
    resolved = resolved.expanduser()
    if not resolved.is_absolute():
        resolved = Path(__file__).resolve().parents[3] / resolved
    return resolved


def _discover_providers(root: Path) -> Iterable[tuple[str, Path]]:
    if not root.exists():
        return ()
    return tuple(
        (child.name, child)
        for child in sorted(root.iterdir())
        if child.is_dir()
    )


def _ingest_provider(
    connection: Connection, provider_id: str, directory: Path, root: Path
) -> int:
    inserted = 0
    for file_path in sorted(directory.glob("*.jsonl")):
        inserted += _ingest_file(connection, provider_id, file_path, root)
    return inserted


def _ingest_file(
    connection: Connection, provider_id: str, file_path: Path, root: Path
) -> int:
    inserted = 0
    source_file = _relative_to_root(file_path, root)
    for line_number, raw_line in enumerate(_iter_lines(file_path), start=1):
        event = _parse_record(raw_line, provider_id, source_file, line_number)
        if event is None:
            continue
        result = connection.execute(
            text(
                """
                INSERT OR IGNORE INTO telemetry_events (
                    provider_id,
                    tool,
                    route,
                    tokens_in,
                    tokens_out,
                    duration_ms,
                    status,
                    cost_estimated_usd,
                    metadata,
                    ts,
                    source_file,
                    line_number,
                    ingested_at
                ) VALUES (
                    :provider_id,
                    :tool,
                    :route,
                    :tokens_in,
                    :tokens_out,
                    :duration_ms,
                    :status,
                    :cost_estimated_usd,
                    :metadata_json,
                    :ts,
                    :source_file,
                    :line_number,
                    :ingested_at
                )
                """
            ),
            event.__dict__,
        )
        inserted += max(result.rowcount or 0, 0)
    return inserted


def _iter_lines(file_path: Path) -> Iterator[str]:
    if not file_path.exists():
        return
    with file_path.open("r", encoding="utf-8") as handle:
        for raw in handle:
            line = raw.strip()
            if line:
                yield line


def _parse_record(
    raw: str, provider_id: str, source_file: str, line_number: int
) -> TelemetryEvent | None:
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError:
        return None

    tool = payload.get("tool")
    ts = payload.get("ts")
    if not isinstance(tool, str) or not tool:
        return None
    if not isinstance(ts, str) or not ts:
        return None

    status = payload.get("status")
    if not isinstance(status, str) or not status:
        status = "unknown"

    route_value = payload.get("route")
    route = route_value if isinstance(route_value, str) and route_value else None

    metadata = payload.get("metadata")
    if not isinstance(metadata, dict):
        metadata = {}

    ingested_at = datetime.now(timezone.utc).isoformat()

    return TelemetryEvent(
        provider_id=provider_id,
        tool=tool,
        route=route,
        tokens_in=_coerce_int(payload.get("tokens_in")),
        tokens_out=_coerce_int(payload.get("tokens_out")),
        duration_ms=_coerce_int(payload.get("duration_ms")),
        status=status,
        cost_estimated_usd=_coerce_float(payload.get("cost_estimated_usd")),
        metadata_json=json.dumps(metadata, ensure_ascii=False, sort_keys=True),
        ts=_normalize_timestamp(ts),
        source_file=source_file,
        line_number=line_number,
        ingested_at=ingested_at,
    )


def _coerce_int(value: object, default: int = 0) -> int:
    try:
        return int(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return default


def _coerce_float(value: object) -> float | None:
    if value is None:
        return None
    try:
        return float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None


def _normalize_timestamp(value: str) -> str:
    candidate = value.strip()
    candidate = candidate.replace("Z", "+00:00") if candidate.endswith("Z") else candidate
    try:
        parsed = datetime.fromisoformat(candidate)
    except ValueError:
        return value
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    else:
        parsed = parsed.astimezone(timezone.utc)
    return parsed.isoformat()


def _relative_to_root(path: Path, root: Path) -> str:
    try:
        return str(path.relative_to(root))
    except ValueError:
        return str(path)


__all__ = [
    "DEFAULT_LOGS_DIR",
    "LOGS_ENV_VAR",
    "TelemetryEvent",
    "ingest_logs",
]

