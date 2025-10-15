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
    "aggregate_metrics",
    "TelemetryAggregates",
    "TelemetryProviderAggregate",
]


@dataclass(frozen=True)
class TelemetryProviderAggregate:
    """Aggregated metrics computed for a single provider."""

    provider_id: str
    run_count: int
    tokens_in: int
    tokens_out: int
    cost_usd: float
    avg_latency_ms: float
    success_rate: float

    def to_dict(self) -> dict[str, object]:
        return {
            "provider_id": self.provider_id,
            "run_count": self.run_count,
            "tokens_in": self.tokens_in,
            "tokens_out": self.tokens_out,
            "cost_usd": self.cost_usd,
            "avg_latency_ms": self.avg_latency_ms,
            "success_rate": self.success_rate,
        }


@dataclass(frozen=True)
class TelemetryAggregates:
    """Aggregated metrics computed for telemetry events in a window."""

    start: datetime | None
    end: datetime | None
    total_runs: int
    total_tokens_in: int
    total_tokens_out: int
    total_cost_usd: float
    avg_latency_ms: float
    success_rate: float
    providers: tuple[TelemetryProviderAggregate, ...]

    def to_dict(self) -> dict[str, object]:
        return {
            "start": self.start,
            "end": self.end,
            "total_runs": self.total_runs,
            "total_tokens_in": self.total_tokens_in,
            "total_tokens_out": self.total_tokens_out,
            "total_cost_usd": self.total_cost_usd,
            "avg_latency_ms": self.avg_latency_ms,
            "success_rate": self.success_rate,
            "providers": [provider.to_dict() for provider in self.providers],
        }


def aggregate_metrics(
    *,
    start: datetime | None = None,
    end: datetime | None = None,
    provider_id: str | None = None,
    route: str | None = None,
) -> TelemetryAggregates:
    """Compute aggregated telemetry metrics for the requested window."""

    normalized_start = _normalize_bound(start) if start else None
    normalized_end = _normalize_bound(end) if end else None
    if normalized_start and normalized_end and normalized_start > normalized_end:
        raise ValueError("start must be before end")

    params: dict[str, object] = {}
    clauses: list[str] = []
    if normalized_start:
        params["start"] = normalized_start.isoformat()
        clauses.append("ts >= :start")
    if normalized_end:
        params["end"] = normalized_end.isoformat()
        clauses.append("ts <= :end")
    if provider_id:
        params["provider_id"] = provider_id
        clauses.append("provider_id = :provider_id")
    if route:
        params["route"] = route
        clauses.append("route = :route")

    where_clause = " WHERE " + " AND ".join(clauses) if clauses else ""

    engine = bootstrap_database()
    with engine.begin() as connection:
        summary = _fetch_summary(connection, where_clause, params)
        providers = _fetch_provider_breakdown(connection, where_clause, params)

    if summary is None or summary["run_count"] is None or summary["run_count"] == 0:
        return TelemetryAggregates(
            start=normalized_start,
            end=normalized_end,
            total_runs=0,
            total_tokens_in=0,
            total_tokens_out=0,
            total_cost_usd=0.0,
            avg_latency_ms=0.0,
            success_rate=0.0,
            providers=tuple(),
        )

    total_runs = int(summary["run_count"])
    total_tokens_in = int(summary["tokens_in"] or 0)
    total_tokens_out = int(summary["tokens_out"] or 0)
    total_cost = float(summary["cost_usd"] or 0.0)
    avg_latency = float(summary["avg_latency_ms"] or 0.0)
    success_count = int(summary["success_count"] or 0)
    success_rate = success_count / total_runs if total_runs else 0.0

    observed_start = (
        _parse_iso(summary["min_ts"])
        if summary.get("min_ts") and isinstance(summary["min_ts"], str)
        else normalized_start
    )
    observed_end = (
        _parse_iso(summary["max_ts"])
        if summary.get("max_ts") and isinstance(summary["max_ts"], str)
        else normalized_end
    )

    provider_breakdown = []
    for row in providers:
        run_count = int(row["run_count"] or 0)
        success_count = int(row["success_count"] or 0)
        provider_breakdown.append(
            TelemetryProviderAggregate(
                provider_id=row["provider_id"],
                run_count=run_count,
                tokens_in=int(row["tokens_in"] or 0),
                tokens_out=int(row["tokens_out"] or 0),
                cost_usd=float(row["cost_usd"] or 0.0),
                avg_latency_ms=float(row["avg_latency_ms"] or 0.0),
                success_rate=(success_count / run_count) if run_count else 0.0,
            )
        )

    provider_breakdown_tuple = tuple(provider_breakdown)

    return TelemetryAggregates(
        start=observed_start or normalized_start,
        end=observed_end or normalized_end,
        total_runs=total_runs,
        total_tokens_in=total_tokens_in,
        total_tokens_out=total_tokens_out,
        total_cost_usd=total_cost,
        avg_latency_ms=avg_latency,
        success_rate=success_rate,
        providers=provider_breakdown_tuple,
    )


def _fetch_summary(
    connection: Connection, where_clause: str, params: dict[str, object]
):
    statement = text(
        f"""
        SELECT
            COUNT(*) AS run_count,
            SUM(tokens_in) AS tokens_in,
            SUM(tokens_out) AS tokens_out,
            SUM(COALESCE(cost_estimated_usd, 0)) AS cost_usd,
            AVG(duration_ms) AS avg_latency_ms,
            SUM(CASE WHEN LOWER(status) = 'success' THEN 1 ELSE 0 END) AS success_count,
            MIN(ts) AS min_ts,
            MAX(ts) AS max_ts
        FROM telemetry_events
        {where_clause}
        """
    )
    result = connection.execute(statement, dict(params)).mappings().first()
    return result if result is not None else None


def _fetch_provider_breakdown(
    connection: Connection, where_clause: str, params: dict[str, object]
):
    statement = text(
        f"""
        SELECT
            provider_id,
            COUNT(*) AS run_count,
            SUM(tokens_in) AS tokens_in,
            SUM(tokens_out) AS tokens_out,
            SUM(COALESCE(cost_estimated_usd, 0)) AS cost_usd,
            AVG(duration_ms) AS avg_latency_ms,
            SUM(CASE WHEN LOWER(status) = 'success' THEN 1 ELSE 0 END) AS success_count
        FROM telemetry_events
        {where_clause}
        GROUP BY provider_id
        ORDER BY run_count DESC, provider_id ASC
        """
    )
    return connection.execute(statement, dict(params)).mappings().all()


def _normalize_bound(value: datetime) -> datetime:
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    else:
        value = value.astimezone(timezone.utc)
    return value


def _parse_iso(raw: str) -> datetime | None:
    candidate = raw.strip()
    if candidate.endswith("Z"):
        candidate = candidate[:-1] + "+00:00"
    try:
        parsed = datetime.fromisoformat(candidate)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    else:
        parsed = parsed.astimezone(timezone.utc)
    return parsed

