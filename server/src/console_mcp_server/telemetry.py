"""Telemetry ingestion utilities for JSONL logs produced by MCP servers."""

from __future__ import annotations

import csv
import html
import io
import json
import os
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path
from typing import Iterable, Iterator, Mapping, MutableMapping, cast

from sqlalchemy import text
from sqlalchemy.engine import Connection

from .database import bootstrap_database
from .log_model import TelemetryLogRecord
from .marketplace import list_marketplace_entries
from .prices import list_price_entries
from .registry import provider_registry
from .routing import build_routes

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
    experiment_cohort: str | None
    experiment_tag: str | None


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
                    ingested_at,
                    experiment_cohort,
                    experiment_tag
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
                    :ingested_at,
                    :experiment_cohort,
                    :experiment_tag
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

    try:
        record = TelemetryLogRecord.from_payload(payload)
    except (TypeError, ValueError):
        return None

    ingested_at = datetime.now(timezone.utc).isoformat()

    return TelemetryEvent(
        provider_id=provider_id,
        tool=record.tool,
        route=record.route,
        tokens_in=record.tokens_in,
        tokens_out=record.tokens_out,
        duration_ms=record.duration_ms,
        status=record.status,
        cost_estimated_usd=record.cost_estimated_usd,
        metadata_json=json.dumps(record.metadata, ensure_ascii=False, sort_keys=True),
        ts=_normalize_timestamp(record.ts),
        source_file=source_file,
        line_number=line_number,
        ingested_at=ingested_at,
        experiment_cohort=record.experiment_cohort,
        experiment_tag=record.experiment_tag,
    )


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
    "TelemetryTimeseriesPoint",
    "TelemetryRouteBreakdown",
    "TelemetryRunRecord",
    "TelemetryExperimentSummary",
    "TelemetryLaneCost",
    "MarketplacePerformance",
    "query_timeseries",
    "query_route_breakdown",
    "query_runs",
    "query_experiment_summaries",
    "compute_lane_cost_breakdown",
    "compute_marketplace_performance",
    "render_telemetry_export",
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


@dataclass(frozen=True)
class TelemetryHeatmapBucket:
    """Aggregated telemetry executions grouped by day and provider."""

    day: date
    provider_id: str
    run_count: int


@dataclass(frozen=True)
class TelemetryTimeseriesPoint:
    """Aggregated metrics grouped by day for a provider."""

    day: date
    provider_id: str
    run_count: int
    tokens_in: int
    tokens_out: int
    cost_usd: float
    avg_latency_ms: float
    success_count: int

    def to_dict(self) -> dict[str, object]:
        return {
            "day": self.day,
            "provider_id": self.provider_id,
            "run_count": self.run_count,
            "tokens_in": self.tokens_in,
            "tokens_out": self.tokens_out,
            "cost_usd": self.cost_usd,
            "avg_latency_ms": self.avg_latency_ms,
            "success_count": self.success_count,
        }


@dataclass(frozen=True)
class TelemetryRouteBreakdown:
    """Aggregated route level metrics used for Pareto analysis."""

    route_id: str
    provider_id: str
    provider_name: str
    route: str | None
    lane: str
    run_count: int
    tokens_in: int
    tokens_out: int
    cost_usd: float
    avg_latency_ms: float
    success_rate: float

    def to_dict(self) -> dict[str, object]:
        return {
            "id": self.route_id,
            "provider_id": self.provider_id,
            "provider_name": self.provider_name,
            "route": self.route,
            "lane": self.lane,
            "run_count": self.run_count,
            "tokens_in": self.tokens_in,
            "tokens_out": self.tokens_out,
            "cost_usd": self.cost_usd,
            "avg_latency_ms": self.avg_latency_ms,
            "success_rate": self.success_rate,
        }


@dataclass(frozen=True)
class TelemetryRunRecord:
    """Individual telemetry execution enriched for drill-down views."""

    record_id: int
    provider_id: str
    provider_name: str
    route: str | None
    lane: str | None
    ts: str
    tokens_in: int
    tokens_out: int
    duration_ms: int
    status: str
    cost_usd: float
    metadata: dict[str, object]
    experiment_cohort: str | None
    experiment_tag: str | None

    def to_dict(self) -> dict[str, object]:
        return {
            "id": self.record_id,
            "provider_id": self.provider_id,
            "provider_name": self.provider_name,
            "route": self.route,
            "lane": self.lane,
            "ts": self.ts,
            "tokens_in": self.tokens_in,
            "tokens_out": self.tokens_out,
            "duration_ms": self.duration_ms,
            "status": self.status,
            "cost_usd": self.cost_usd,
            "metadata": self.metadata,
            "experiment_cohort": self.experiment_cohort,
            "experiment_tag": self.experiment_tag,
        }


@dataclass(frozen=True)
class TelemetryExperimentSummary:
    """Aggregated telemetry metrics grouped by experiment metadata."""

    cohort: str | None
    tag: str | None
    run_count: int
    success_rate: float
    error_rate: float
    avg_latency_ms: float
    total_cost_usd: float
    total_tokens_in: int
    total_tokens_out: int
    mttr_ms: float | None
    recovery_events: int

    def to_dict(self) -> dict[str, object]:
        return {
            "cohort": self.cohort,
            "tag": self.tag,
            "run_count": self.run_count,
            "success_rate": self.success_rate,
            "error_rate": self.error_rate,
            "avg_latency_ms": self.avg_latency_ms,
            "total_cost_usd": self.total_cost_usd,
            "total_tokens_in": self.total_tokens_in,
            "total_tokens_out": self.total_tokens_out,
            "mttr_ms": self.mttr_ms,
            "recovery_events": self.recovery_events,
        }


@dataclass(frozen=True)
class TelemetryLaneCost:
    """Cost distribution grouped by routing lane."""

    lane: str
    run_count: int
    total_cost_usd: float
    total_tokens_in: int
    total_tokens_out: int
    avg_latency_ms: float

    def to_dict(self) -> dict[str, object]:
        return {
            "lane": self.lane,
            "run_count": self.run_count,
            "total_cost_usd": self.total_cost_usd,
            "total_tokens_in": self.total_tokens_in,
            "total_tokens_out": self.total_tokens_out,
            "avg_latency_ms": self.avg_latency_ms,
        }


@dataclass(frozen=True)
class MarketplacePerformance:
    """Synthetic performance metrics combining marketplace catalog and telemetry."""

    entry_id: str
    name: str
    origin: str
    rating: float
    cost: float
    run_count: int
    success_rate: float
    avg_latency_ms: float
    total_cost_usd: float
    total_tokens_in: int
    total_tokens_out: int
    cohorts: tuple[str, ...]
    adoption_score: float

    def to_dict(self) -> dict[str, object]:
        return {
            "entry_id": self.entry_id,
            "name": self.name,
            "origin": self.origin,
            "rating": self.rating,
            "cost": self.cost,
            "run_count": self.run_count,
            "success_rate": self.success_rate,
            "avg_latency_ms": self.avg_latency_ms,
            "total_cost_usd": self.total_cost_usd,
            "total_tokens_in": self.total_tokens_in,
            "total_tokens_out": self.total_tokens_out,
            "cohorts": list(self.cohorts),
            "adoption_score": self.adoption_score,
        }

@dataclass(frozen=True)
class FinOpsSprintReport:
    """Aggregated metrics for a sprint-sized window used in FinOps dashboards."""

    report_id: str
    name: str
    period_start: date
    period_end: date
    total_cost_usd: float
    total_tokens_in: int
    total_tokens_out: int
    avg_latency_ms: float
    success_rate: float
    cost_delta: float
    status: str
    summary: str

    def to_dict(self) -> dict[str, object]:
        return {
            "id": self.report_id,
            "name": self.name,
            "period_start": self.period_start,
            "period_end": self.period_end,
            "total_cost_usd": self.total_cost_usd,
            "total_tokens_in": self.total_tokens_in,
            "total_tokens_out": self.total_tokens_out,
            "avg_latency_ms": self.avg_latency_ms,
            "success_rate": self.success_rate,
            "cost_delta": self.cost_delta,
            "status": self.status,
            "summary": self.summary,
        }


@dataclass(frozen=True)
class FinOpsPullRequestReport:
    """Summarized cost impact for a monitored route in a FinOps context."""

    report_id: str
    provider_id: str
    provider_name: str
    route: str | None
    lane: str | None
    title: str
    owner: str
    merged_at: datetime | None
    cost_impact_usd: float
    cost_delta: float
    tokens_impact: int
    status: str
    summary: str

    def to_dict(self) -> dict[str, object]:
        return {
            "id": self.report_id,
            "provider_id": self.provider_id,
            "provider_name": self.provider_name,
            "route": self.route,
            "lane": self.lane,
            "title": self.title,
            "owner": self.owner,
            "merged_at": self.merged_at,
            "cost_impact_usd": self.cost_impact_usd,
            "cost_delta": self.cost_delta,
            "tokens_impact": self.tokens_impact,
            "status": self.status,
            "summary": self.summary,
        }


def _provider_lane_index() -> dict[str, str]:
    return {route.id: route.lane for route in build_routes(provider_registry.providers)}


def _provider_name_index() -> dict[str, str]:
    return {provider.id: provider.name for provider in provider_registry.providers}


def _providers_for_lane(lane: str | None) -> tuple[str, ...]:
    if lane is None:
        return tuple()
    normalized = lane.lower()
    return tuple(
        provider_id
        for provider_id, provider_lane in _provider_lane_index().items()
        if provider_lane == normalized
    )


def _price_index() -> dict[str, dict[str, float | None]]:
    index: dict[str, dict[str, float | None]] = {}
    for entry in list_price_entries():
        provider_prices = index.setdefault(entry.provider_id, {"input": None, "output": None})
        if entry.input_cost_per_1k is not None:
            cost = float(entry.input_cost_per_1k)
            current = provider_prices["input"]
            provider_prices["input"] = cost if current is None else min(current, cost)
        if entry.output_cost_per_1k is not None:
            cost = float(entry.output_cost_per_1k)
            current = provider_prices["output"]
            provider_prices["output"] = cost if current is None else min(current, cost)
    return index


def _augment_cost(
    provider_id: str,
    base_cost: float,
    missing_tokens_in: int,
    missing_tokens_out: int,
) -> float:
    prices = _price_index().get(provider_id)
    cost = float(base_cost)
    if not prices:
        return cost
    if missing_tokens_in and prices.get("input") is not None:
        cost += (missing_tokens_in / 1000.0) * float(prices["input"])
    if missing_tokens_out and prices.get("output") is not None:
        cost += (missing_tokens_out / 1000.0) * float(prices["output"])
    return cost


def _extract_marketplace_entry_id(metadata: Mapping[str, object]) -> str | None:
    for key in (
        "marketplace_entry_id",
        "marketplace_id",
        "entry_id",
        "marketplace",
    ):
        value = metadata.get(key)
        if isinstance(value, str):
            candidate = value.strip()
            if candidate:
                return candidate
        if isinstance(value, Mapping):
            nested = value.get("entry_id") or value.get("id")
            if isinstance(nested, str):
                candidate = nested.strip()
                if candidate:
                    return candidate
    return None


def _coerce_date(value: object) -> date | None:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    if isinstance(value, str):
        try:
            return date.fromisoformat(value)
        except ValueError:
            return None
    return None


def aggregate_metrics(
    *,
    start: datetime | None = None,
    end: datetime | None = None,
    provider_id: str | None = None,
    route: str | None = None,
) -> TelemetryAggregates:
    """Compute aggregated telemetry metrics for the requested window."""

    normalized_start, normalized_end, where_clause, params = _prepare_filters(
        start=start, end=end, provider_id=provider_id, route=route
    )

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


def aggregate_heatmap(
    *,
    start: datetime | None = None,
    end: datetime | None = None,
    provider_id: str | None = None,
    route: str | None = None,
) -> tuple[TelemetryHeatmapBucket, ...]:
    """Aggregate execution counts by day and provider for the requested window."""

    _, _, where_clause, params = _prepare_filters(
        start=start, end=end, provider_id=provider_id, route=route
    )

    engine = bootstrap_database()
    with engine.begin() as connection:
        rows = _fetch_heatmap(connection, where_clause, params)

    buckets: list[TelemetryHeatmapBucket] = []
    for row in rows:
        raw_day = row["day"]
        if isinstance(raw_day, datetime):
            resolved_day = raw_day.date()
        elif isinstance(raw_day, str):
            try:
                resolved_day = date.fromisoformat(raw_day)
            except ValueError:
                continue
        else:
            continue

        provider = row["provider_id"]
        if provider is None:
            continue

        run_count = int(row["run_count"] or 0)
        buckets.append(
            TelemetryHeatmapBucket(
                day=resolved_day, provider_id=str(provider), run_count=run_count
            )
        )

    return tuple(buckets)


def query_timeseries(
    *,
    start: datetime | None = None,
    end: datetime | None = None,
    provider_id: str | None = None,
    lane: str | None = None,
) -> tuple[TelemetryTimeseriesPoint, ...]:
    lane_providers = _providers_for_lane(lane) if lane else None
    if lane and lane_providers is not None and not lane_providers:
        return tuple()

    _, _, where_clause, params = _prepare_filters(
        start=start,
        end=end,
        provider_id=provider_id,
        route=None,
        allowed_provider_ids=lane_providers,
    )

    engine = bootstrap_database()
    with engine.begin() as connection:
        rows = _fetch_timeseries(connection, where_clause, params)

    items: list[TelemetryTimeseriesPoint] = []
    for row in rows:
        provider = str(row["provider_id"])
        day = _coerce_date(row["day"]) or date.today()
        run_count = int(row["run_count"] or 0)
        tokens_in = int(row["tokens_in"] or 0)
        tokens_out = int(row["tokens_out"] or 0)
        avg_latency = float(row["avg_latency_ms"] or 0.0)
        success_count = int(row["success_count"] or 0)
        base_cost = float(row["cost_usd"] or 0.0)
        missing_tokens_in = int(row["missing_tokens_in"] or 0)
        missing_tokens_out = int(row["missing_tokens_out"] or 0)
        cost = _augment_cost(provider, base_cost, missing_tokens_in, missing_tokens_out)

        items.append(
            TelemetryTimeseriesPoint(
                day=day,
                provider_id=provider,
                run_count=run_count,
                tokens_in=tokens_in,
                tokens_out=tokens_out,
                cost_usd=round(cost, 6),
                avg_latency_ms=avg_latency,
                success_count=success_count,
            )
        )

    return tuple(sorted(items, key=lambda item: (item.day, item.provider_id)))


def query_route_breakdown(
    *,
    start: datetime | None = None,
    end: datetime | None = None,
    provider_id: str | None = None,
    lane: str | None = None,
) -> tuple[TelemetryRouteBreakdown, ...]:
    lane_providers = _providers_for_lane(lane) if lane else None
    if lane and lane_providers is not None and not lane_providers:
        return tuple()

    _, _, where_clause, params = _prepare_filters(
        start=start,
        end=end,
        provider_id=provider_id,
        route=None,
        allowed_provider_ids=lane_providers,
    )

    engine = bootstrap_database()
    with engine.begin() as connection:
        rows = _fetch_route_breakdown(connection, where_clause, params)

    provider_names = _provider_name_index()
    provider_lanes = _provider_lane_index()

    breakdown: list[TelemetryRouteBreakdown] = []
    for row in rows:
        provider = str(row["provider_id"])
        route_name = row["route"] if row["route"] is not None else None
        run_count = int(row["run_count"] or 0)
        tokens_in = int(row["tokens_in"] or 0)
        tokens_out = int(row["tokens_out"] or 0)
        avg_latency = float(row["avg_latency_ms"] or 0.0)
        success_count = int(row["success_count"] or 0)
        base_cost = float(row["cost_usd"] or 0.0)
        missing_tokens_in = int(row["missing_tokens_in"] or 0)
        missing_tokens_out = int(row["missing_tokens_out"] or 0)
        cost = _augment_cost(provider, base_cost, missing_tokens_in, missing_tokens_out)
        success_rate = (success_count / run_count) if run_count else 0.0
        lane_value = provider_lanes.get(provider)
        if lane and lane_value and lane_value != lane.lower():
            continue

        breakdown.append(
            TelemetryRouteBreakdown(
                route_id=f"{provider}:{route_name or 'default'}",
                provider_id=provider,
                provider_name=provider_names.get(provider, provider),
                route=route_name,
                lane=lane_value or "balanced",
                run_count=run_count,
                tokens_in=tokens_in,
                tokens_out=tokens_out,
                cost_usd=round(cost, 6),
                avg_latency_ms=avg_latency,
                success_rate=success_rate,
            )
        )

    return tuple(sorted(breakdown, key=lambda item: item.cost_usd, reverse=True))


def query_runs(
    *,
    start: datetime | None = None,
    end: datetime | None = None,
    provider_id: str | None = None,
    lane: str | None = None,
    route: str | None = None,
    limit: int = 20,
    cursor: str | None = None,
) -> tuple[tuple[TelemetryRunRecord, ...], str | None]:
    lane_providers = _providers_for_lane(lane) if lane else None
    if lane and lane_providers is not None and not lane_providers:
        return tuple(), None

    _, _, where_clause, params = _prepare_filters(
        start=start,
        end=end,
        provider_id=provider_id,
        route=route,
        allowed_provider_ids=lane_providers,
    )

    resolved_limit = max(1, min(limit, 100))
    try:
        offset = max(0, int(cursor) if cursor is not None else 0)
    except ValueError:
        offset = 0

    engine = bootstrap_database()
    with engine.begin() as connection:
        rows = _fetch_runs(
            connection,
            where_clause,
            params,
            limit=resolved_limit + 1,
            offset=offset,
        )

    provider_names = _provider_name_index()
    provider_lanes = _provider_lane_index()

    has_more = len(rows) > resolved_limit
    selected_rows = rows[:resolved_limit]

    items: list[TelemetryRunRecord] = []
    for row in selected_rows:
        provider = str(row["provider_id"])
        metadata_raw = row.get("metadata")
        metadata: dict[str, object]
        if isinstance(metadata_raw, str):
            try:
                metadata = json.loads(metadata_raw)
            except json.JSONDecodeError:
                metadata = {}
        elif isinstance(metadata_raw, dict):
            metadata = metadata_raw
        else:
            metadata = {}

        cohort_raw = row.get("experiment_cohort")
        cohort_value = None
        if cohort_raw is not None:
            candidate = str(cohort_raw).strip()
            cohort_value = candidate or None
        tag_raw = row.get("experiment_tag")
        tag_value = None
        if tag_raw is not None:
            candidate_tag = str(tag_raw).strip()
            tag_value = candidate_tag or None

        base_cost = float(row["cost_estimated_usd"] or 0.0)
        if row.get("cost_estimated_usd") is None:
            missing_tokens_in = int(row["tokens_in"] or 0)
            missing_tokens_out = int(row["tokens_out"] or 0)
        else:
            missing_tokens_in = 0
            missing_tokens_out = 0
        cost = _augment_cost(provider, base_cost, missing_tokens_in, missing_tokens_out)

        items.append(
            TelemetryRunRecord(
                record_id=int(row["id"]),
                provider_id=provider,
                provider_name=provider_names.get(provider, provider),
                route=row.get("route"),
                lane=provider_lanes.get(provider),
                ts=str(row["ts"]),
                tokens_in=int(row["tokens_in"] or 0),
                tokens_out=int(row["tokens_out"] or 0),
                duration_ms=int(row["duration_ms"] or 0),
                status=str(row["status"] or "unknown").lower(),
                cost_usd=round(cost, 6),
                metadata=metadata,
                experiment_cohort=cohort_value,
                experiment_tag=tag_value,
            )
        )

    next_cursor = str(offset + len(items)) if has_more else None
    return tuple(items), next_cursor


def query_experiment_summaries(
    *,
    start: datetime | None = None,
    end: datetime | None = None,
    provider_id: str | None = None,
    route: str | None = None,
    lane: str | None = None,
) -> tuple[TelemetryExperimentSummary, ...]:
    lane_providers = _providers_for_lane(lane) if lane else None
    normalized_start, normalized_end, where_clause, params = _prepare_filters(
        start=start,
        end=end,
        provider_id=provider_id,
        route=route,
        allowed_provider_ids=lane_providers,
    )

    experiment_clause = "(experiment_cohort IS NOT NULL OR experiment_tag IS NOT NULL)"
    if where_clause:
        where_clause = f"{where_clause} AND {experiment_clause}"
    else:
        where_clause = f" WHERE {experiment_clause}"

    engine = bootstrap_database()
    with engine.begin() as connection:
        rows = connection.execute(
            text(
                f"""
                SELECT
                    provider_id,
                    ts,
                    status,
                    duration_ms,
                    tokens_in,
                    tokens_out,
                    cost_estimated_usd,
                    experiment_cohort,
                    experiment_tag
                FROM telemetry_events
                {where_clause}
                ORDER BY experiment_cohort, experiment_tag, ts
                """
            ),
            params,
        ).mappings().all()

    if not rows:
        return tuple()

    experiments: MutableMapping[
        tuple[str | None, str | None],
        dict[str, object],
    ] = {}
    for row in rows:
        cohort_raw = row.get("experiment_cohort")
        tag_raw = row.get("experiment_tag")
        cohort = str(cohort_raw).strip() if isinstance(cohort_raw, str) else None
        tag = str(tag_raw).strip() if isinstance(tag_raw, str) else None
        if cohort_raw is not None and not cohort:
            cohort = None
        if tag_raw is not None and not tag:
            tag = None
        if cohort is None and tag is None:
            continue
        key = (cohort, tag)
        stats = experiments.setdefault(
            key,
            {
                "run_count": 0,
                "success_count": 0,
                "tokens_in": 0,
                "tokens_out": 0,
                "duration_sum": 0.0,
                "providers": {},
                "timeline": [],
            },
        )
        status_value = str(row.get("status") or "unknown").lower()
        stats["run_count"] = int(stats["run_count"]) + 1
        if status_value == "success":
            stats["success_count"] = int(stats["success_count"]) + 1
        tokens_in = int(row.get("tokens_in") or 0)
        tokens_out = int(row.get("tokens_out") or 0)
        stats["tokens_in"] = int(stats["tokens_in"]) + tokens_in
        stats["tokens_out"] = int(stats["tokens_out"]) + tokens_out
        stats["duration_sum"] = float(stats["duration_sum"]) + float(
            row.get("duration_ms") or 0.0
        )

        provider = str(row.get("provider_id"))
        provider_costs = cast(
            MutableMapping[str, dict[str, float | int]],
            stats.setdefault("providers", {}),
        )
        cost_bucket = provider_costs.setdefault(
            provider,
            {"base_cost": 0.0, "missing_in": 0, "missing_out": 0},
        )
        if row.get("cost_estimated_usd") is None:
            cost_bucket["missing_in"] = int(cost_bucket["missing_in"]) + tokens_in
            cost_bucket["missing_out"] = int(cost_bucket["missing_out"]) + tokens_out
        else:
            cost_bucket["base_cost"] = float(cost_bucket["base_cost"]) + float(
                row.get("cost_estimated_usd") or 0.0
            )

        ts_raw = row.get("ts")
        timestamp = None
        if isinstance(ts_raw, datetime):
            timestamp = ts_raw if ts_raw.tzinfo else ts_raw.replace(tzinfo=timezone.utc)
        elif isinstance(ts_raw, str):
            timestamp = _parse_iso(ts_raw)
        timeline = cast(list[tuple[datetime, str]], stats.setdefault("timeline", []))
        if timestamp is not None:
            timeline.append((timestamp, status_value))

    summaries: list[TelemetryExperimentSummary] = []
    for (cohort, tag), stats in experiments.items():
        run_count = int(stats["run_count"])
        if run_count <= 0:
            continue
        success_count = int(stats["success_count"])
        success_rate = success_count / run_count if run_count else 0.0
        error_rate = max(0.0, 1.0 - success_rate)
        duration_sum = float(stats["duration_sum"])
        avg_latency = duration_sum / run_count if run_count else 0.0

        cost_total = 0.0
        provider_costs = cast(
            Mapping[str, dict[str, float | int]],
            stats.get("providers", {}),
        )
        for provider, bucket in provider_costs.items():
            base_cost = float(bucket.get("base_cost") or 0.0)
            missing_in = int(bucket.get("missing_in") or 0)
            missing_out = int(bucket.get("missing_out") or 0)
            cost_total += _augment_cost(provider, base_cost, missing_in, missing_out)

        timeline = sorted(
            cast(list[tuple[datetime, str]], stats.get("timeline", [])),
            key=lambda item: item[0],
        )
        recovery_total = 0.0
        recovery_events = 0
        last_failure: datetime | None = None
        for timestamp, status_value in timeline:
            if status_value in {"error", "denied", "retry"}:
                last_failure = timestamp
            elif status_value == "success" and last_failure is not None:
                delta = (timestamp - last_failure).total_seconds() * 1000.0
                if delta >= 0:
                    recovery_total += delta
                    recovery_events += 1
                last_failure = None

        mttr_ms = (recovery_total / recovery_events) if recovery_events else None

        summaries.append(
            TelemetryExperimentSummary(
                cohort=cohort,
                tag=tag,
                run_count=run_count,
                success_rate=round(success_rate, 6),
                error_rate=round(error_rate, 6),
                avg_latency_ms=avg_latency,
                total_cost_usd=round(cost_total, 6),
                total_tokens_in=int(stats.get("tokens_in", 0)),
                total_tokens_out=int(stats.get("tokens_out", 0)),
                mttr_ms=mttr_ms,
                recovery_events=recovery_events,
            )
        )

    return tuple(
        sorted(
            summaries,
            key=lambda item: (item.total_cost_usd, item.run_count),
            reverse=True,
        )
    )


def compute_lane_cost_breakdown(
    *,
    start: datetime | None = None,
    end: datetime | None = None,
    provider_id: str | None = None,
    route: str | None = None,
    lane: str | None = None,
) -> tuple[TelemetryLaneCost, ...]:
    lane_providers = _providers_for_lane(lane) if lane else None
    _, _, where_clause, params = _prepare_filters(
        start=start,
        end=end,
        provider_id=provider_id,
        route=route,
        allowed_provider_ids=lane_providers,
    )

    engine = bootstrap_database()
    with engine.begin() as connection:
        rows = connection.execute(
            text(
                f"""
                SELECT
                    provider_id,
                    COUNT(*) AS run_count,
                    SUM(tokens_in) AS tokens_in,
                    SUM(tokens_out) AS tokens_out,
                    SUM(duration_ms) AS duration_sum,
                    SUM(cost_estimated_usd) AS base_cost,
                    SUM(CASE WHEN cost_estimated_usd IS NULL THEN tokens_in ELSE 0 END) AS missing_tokens_in,
                    SUM(CASE WHEN cost_estimated_usd IS NULL THEN tokens_out ELSE 0 END) AS missing_tokens_out
                FROM telemetry_events
                {where_clause}
                GROUP BY provider_id
                """
            ),
            params,
        ).mappings().all()

    provider_lanes = _provider_lane_index()
    lane_totals: MutableMapping[str, dict[str, float]] = {}
    for row in rows:
        provider = str(row.get("provider_id"))
        lane_id = provider_lanes.get(provider, "balanced")
        bucket = lane_totals.setdefault(
            lane_id,
            {
                "run_count": 0.0,
                "tokens_in": 0.0,
                "tokens_out": 0.0,
                "duration_sum": 0.0,
                "cost": 0.0,
            },
        )
        run_count = float(row.get("run_count") or 0.0)
        bucket["run_count"] += run_count
        bucket["tokens_in"] += float(row.get("tokens_in") or 0.0)
        bucket["tokens_out"] += float(row.get("tokens_out") or 0.0)
        bucket["duration_sum"] += float(row.get("duration_sum") or 0.0)
        base_cost = float(row.get("base_cost") or 0.0)
        missing_in = int(row.get("missing_tokens_in") or 0)
        missing_out = int(row.get("missing_tokens_out") or 0)
        bucket["cost"] += _augment_cost(provider, base_cost, missing_in, missing_out)

    summaries: list[TelemetryLaneCost] = []
    for lane_id in ("economy", "balanced", "turbo"):
        bucket = lane_totals.get(lane_id)
        if not bucket:
            continue
        run_count = int(bucket["run_count"])
        if run_count <= 0:
            continue
        duration_sum = bucket["duration_sum"]
        avg_latency = duration_sum / run_count if run_count else 0.0
        summaries.append(
            TelemetryLaneCost(
                lane=lane_id,
                run_count=run_count,
                total_cost_usd=round(bucket["cost"], 6),
                total_tokens_in=int(bucket["tokens_in"]),
                total_tokens_out=int(bucket["tokens_out"]),
                avg_latency_ms=avg_latency,
            )
        )

    return tuple(sorted(summaries, key=lambda item: item.total_cost_usd, reverse=True))


def compute_marketplace_performance(
    *,
    start: datetime | None = None,
    end: datetime | None = None,
    provider_id: str | None = None,
    route: str | None = None,
) -> tuple[MarketplacePerformance, ...]:
    catalog = {entry.entry_id: entry for entry in list_marketplace_entries()}
    if not catalog:
        return tuple()

    _, _, where_clause, params = _prepare_filters(
        start=start,
        end=end,
        provider_id=provider_id,
        route=route,
    )

    engine = bootstrap_database()
    with engine.begin() as connection:
        rows = connection.execute(
            text(
                f"""
                SELECT
                    provider_id,
                    ts,
                    status,
                    duration_ms,
                    tokens_in,
                    tokens_out,
                    cost_estimated_usd,
                    metadata,
                    experiment_cohort
                FROM telemetry_events
                {where_clause}
                ORDER BY ts
                """
            ),
            params,
        ).mappings().all()

    performances: MutableMapping[
        str,
        dict[str, object],
    ] = {}

    for row in rows:
        metadata_raw = row.get("metadata")
        metadata: Mapping[str, object] | None
        if isinstance(metadata_raw, str):
            try:
                metadata = json.loads(metadata_raw)
            except json.JSONDecodeError:
                metadata = None
        elif isinstance(metadata_raw, Mapping):
            metadata = metadata_raw
        else:
            metadata = None
        if not metadata:
            continue

        entry_id = _extract_marketplace_entry_id(metadata)
        if not entry_id:
            continue
        entry = catalog.get(entry_id)
        if entry is None:
            continue

        provider = str(row.get("provider_id"))
        status_value = str(row.get("status") or "unknown").lower()
        tokens_in = int(row.get("tokens_in") or 0)
        tokens_out = int(row.get("tokens_out") or 0)
        duration = int(row.get("duration_ms") or 0)
        cohort_raw = row.get("experiment_cohort")
        cohort = None
        if isinstance(cohort_raw, str):
            cohort = cohort_raw.strip() or None

        stats = performances.setdefault(
            entry.entry_id,
            {
                "entry": entry,
                "run_count": 0,
                "success_count": 0,
                "duration_sum": 0.0,
                "tokens_in": 0,
                "tokens_out": 0,
                "providers": {},
                "cohorts": set(),
            },
        )
        stats["run_count"] = int(stats["run_count"]) + 1
        if status_value == "success":
            stats["success_count"] = int(stats["success_count"]) + 1
        stats["tokens_in"] = int(stats["tokens_in"]) + tokens_in
        stats["tokens_out"] = int(stats["tokens_out"]) + tokens_out
        stats["duration_sum"] = float(stats["duration_sum"]) + float(duration)

        provider_bucket = cast(
            MutableMapping[str, dict[str, float | int]],
            stats.setdefault("providers", {}),
        )
        cost_data = provider_bucket.setdefault(
            provider,
            {"base_cost": 0.0, "missing_in": 0, "missing_out": 0},
        )
        if row.get("cost_estimated_usd") is None:
            cost_data["missing_in"] = int(cost_data["missing_in"]) + tokens_in
            cost_data["missing_out"] = int(cost_data["missing_out"]) + tokens_out
        else:
            cost_data["base_cost"] = float(cost_data["base_cost"]) + float(
                row.get("cost_estimated_usd") or 0.0
            )

        if cohort:
            cohorts = cast(set[str], stats.setdefault("cohorts", set()))
            cohorts.add(cohort)

    results: list[MarketplacePerformance] = []
    for entry_id, stats in performances.items():
        run_count = int(stats["run_count"])
        if run_count <= 0:
            continue
        success_count = int(stats["success_count"])
        success_rate = success_count / run_count if run_count else 0.0
        duration_sum = float(stats["duration_sum"])
        avg_latency = duration_sum / run_count if run_count else 0.0

        provider_buckets = cast(
            Mapping[str, dict[str, float | int]],
            stats.get("providers", {}),
        )
        total_cost = 0.0
        for provider, data in provider_buckets.items():
            base_cost = float(data.get("base_cost") or 0.0)
            missing_in = int(data.get("missing_in") or 0)
            missing_out = int(data.get("missing_out") or 0)
            total_cost += _augment_cost(provider, base_cost, missing_in, missing_out)

        entry = stats["entry"]
        cohorts = tuple(sorted(cast(set[str], stats.get("cohorts", set()))))
        adoption_score = run_count * success_rate

        results.append(
            MarketplacePerformance(
                entry_id=entry.entry_id,
                name=entry.name,
                origin=entry.origin,
                rating=float(entry.rating),
                cost=float(entry.cost),
                run_count=run_count,
                success_rate=round(success_rate, 6),
                avg_latency_ms=avg_latency,
                total_cost_usd=round(total_cost, 6),
                total_tokens_in=int(stats.get("tokens_in", 0)),
                total_tokens_out=int(stats.get("tokens_out", 0)),
                cohorts=cohorts,
                adoption_score=round(adoption_score, 6),
            )
        )

    return tuple(
        sorted(
            results,
            key=lambda item: (item.adoption_score, item.run_count),
            reverse=True,
        )
    )


def compute_finops_sprint_reports(
    *,
    start: datetime | None = None,
    end: datetime | None = None,
    provider_id: str | None = None,
    lane: str | None = None,
    window_days: int = 7,
    limit: int = 4,
) -> tuple[FinOpsSprintReport, ...]:
    """Produce sprint-style aggregates based on real telemetry timeseries."""

    if window_days <= 0:
        raise ValueError("window_days must be positive")

    normalized_start = _normalize_bound(start) if start else None
    normalized_end = _normalize_bound(end) if end else None
    if normalized_start and normalized_end and normalized_start > normalized_end:
        raise ValueError("start must be before end")

    points = query_timeseries(
        start=normalized_start,
        end=normalized_end,
        provider_id=provider_id,
        lane=lane,
    )

    daily_totals = _aggregate_daily_points(points)
    if not daily_totals:
        return tuple()

    observed_days = sorted(daily_totals.keys())
    first_day = observed_days[0]
    last_day = observed_days[-1]

    current_start = normalized_start.date() if normalized_start else first_day
    current_start = max(current_start, first_day)
    current_end = normalized_end.date() if normalized_end else last_day
    current_end = max(current_start, min(current_end, last_day))

    reports: list[FinOpsSprintReport] = []
    cursor_end = current_end
    window_span = max(1, window_days)
    while len(reports) < limit and cursor_end >= current_start:
        window_start = max(current_start, cursor_end - timedelta(days=window_span - 1))
        totals = _accumulate_window(daily_totals, window_start, cursor_end)
        if totals["run_count"] == 0 and totals["total_cost_usd"] == 0:
            cursor_end = window_start - timedelta(days=1)
            if cursor_end < current_start:
                break
            continue

        run_count = int(round(totals["run_count"]))
        cost_total = round(totals["total_cost_usd"], 6)
        tokens_in = int(round(totals["tokens_in"]))
        tokens_out = int(round(totals["tokens_out"]))
        avg_latency = (
            totals["duration_total"] / run_count if run_count else 0.0
        )
        success_rate = (
            int(round(totals["success_count"])) / run_count if run_count else 0.0
        )

        previous_end = window_start - timedelta(days=1)
        previous_start = previous_end - timedelta(days=window_span - 1)
        if normalized_start:
            previous_start = max(previous_start, normalized_start.date())
        previous_totals = (
            _accumulate_window(daily_totals, previous_start, previous_end)
            if previous_end >= first_day
            else _empty_window_totals()
        )
        previous_cost = previous_totals["total_cost_usd"]
        cost_delta = (
            (cost_total - previous_cost) / previous_cost
            if previous_cost > 0
            else 0.0
        )
        status = _classify_report_status(cost_delta)
        summary = _build_sprint_summary(
            cost_total,
            tokens_in + tokens_out,
            cost_delta,
            window_start,
            cursor_end,
        )

        iso_year, iso_week, _ = cursor_end.isocalendar()
        report_id = f"sprint-{iso_year}-{iso_week:02d}-{len(reports) + 1}"
        name = f"Sprint {iso_year}-{iso_week:02d}"

        reports.append(
            FinOpsSprintReport(
                report_id=report_id,
                name=name,
                period_start=window_start,
                period_end=cursor_end,
                total_cost_usd=cost_total,
                total_tokens_in=tokens_in,
                total_tokens_out=tokens_out,
                avg_latency_ms=avg_latency,
                success_rate=success_rate,
                cost_delta=cost_delta,
                status=status,
                summary=summary,
            )
        )

        cursor_end = window_start - timedelta(days=1)

    return tuple(reports)


def compute_finops_pull_request_reports(
    *,
    start: datetime | None = None,
    end: datetime | None = None,
    provider_id: str | None = None,
    lane: str | None = None,
    window_days: int = 7,
    limit: int = 4,
) -> tuple[FinOpsPullRequestReport, ...]:
    """Summarize per-route cost deltas suitable for PR-style reporting."""

    if window_days <= 0:
        raise ValueError("window_days must be positive")

    normalized_start = _normalize_bound(start) if start else None
    normalized_end = _normalize_bound(end) if end else None
    if normalized_start and normalized_end and normalized_start > normalized_end:
        raise ValueError("start must be before end")

    current_breakdown = query_route_breakdown(
        start=normalized_start,
        end=normalized_end,
        provider_id=provider_id,
        lane=lane,
    )
    if not current_breakdown:
        return tuple()

    current_start_date = (
        normalized_start.date() if normalized_start else _infer_window_start(current_breakdown, window_days)
    )
    current_end_date = (
        normalized_end.date() if normalized_end else current_start_date + timedelta(days=window_days - 1)
    )

    window_span = max(1, window_days)
    previous_end = current_start_date - timedelta(days=1)
    previous_start = previous_end - timedelta(days=window_span - 1)
    previous_breakdown = query_route_breakdown(
        start=_combine_date(previous_start, at_end=False),
        end=_combine_date(previous_end, at_end=True),
        provider_id=provider_id,
        lane=lane,
    )
    previous_index = {entry.route_id: entry for entry in previous_breakdown}

    reports: list[FinOpsPullRequestReport] = []
    for entry in current_breakdown[:limit]:
        previous = previous_index.get(entry.route_id)
        previous_cost = previous.cost_usd if previous else 0.0
        delta = (entry.cost_usd - previous_cost) / previous_cost if previous_cost > 0 else 0.0
        status = _classify_report_status(delta)
        tokens_total = entry.tokens_in + entry.tokens_out
        previous_tokens = (
            (previous.tokens_in + previous.tokens_out) if previous else 0
        )
        tokens_delta = tokens_total - previous_tokens
        owner, merged_at = _resolve_route_owner(
            provider_id=entry.provider_id,
            route=entry.route,
            lane=entry.lane,
            start=_combine_date(current_start_date, at_end=False),
            end=_combine_date(current_end_date, at_end=True),
        )
        title = f"{entry.provider_name} · {entry.route or 'default'}"
        summary = _build_pr_summary(delta, entry.provider_name, entry.route)

        reports.append(
            FinOpsPullRequestReport(
                report_id=entry.route_id,
                provider_id=entry.provider_id,
                provider_name=entry.provider_name,
                route=entry.route,
                lane=entry.lane,
                title=title,
                owner=owner,
                merged_at=merged_at,
                cost_impact_usd=round(max(entry.cost_usd - previous_cost, 0.0), 6),
                cost_delta=delta,
                tokens_impact=tokens_delta,
                status=status,
                summary=summary,
            )
        )

    return tuple(reports)


def _aggregate_daily_points(
    points: Iterable[TelemetryTimeseriesPoint],
) -> dict[date, dict[str, float]]:
    daily: dict[date, dict[str, float]] = {}
    for point in points:
        entry = daily.setdefault(point.day, _empty_window_totals())
        entry["tokens_in"] += float(point.tokens_in)
        entry["tokens_out"] += float(point.tokens_out)
        entry["total_cost_usd"] += float(point.cost_usd)
        entry["run_count"] += float(point.run_count)
        entry["success_count"] += float(point.success_count)
        entry["duration_total"] += float(point.avg_latency_ms) * float(point.run_count)
    return daily


def _empty_window_totals() -> dict[str, float]:
    return {
        "tokens_in": 0.0,
        "tokens_out": 0.0,
        "total_cost_usd": 0.0,
        "run_count": 0.0,
        "success_count": 0.0,
        "duration_total": 0.0,
    }


def _accumulate_window(
    daily_totals: dict[date, dict[str, float]], start: date, end: date
) -> dict[str, float]:
    if end < start:
        return _empty_window_totals()
    totals = _empty_window_totals()
    for day, values in daily_totals.items():
        if start <= day <= end:
            totals["tokens_in"] += values["tokens_in"]
            totals["tokens_out"] += values["tokens_out"]
            totals["total_cost_usd"] += values["total_cost_usd"]
            totals["run_count"] += values["run_count"]
            totals["success_count"] += values["success_count"]
            totals["duration_total"] += values["duration_total"]
    return totals


def _classify_report_status(delta: float) -> str:
    if delta <= 0.03:
        return "on_track"
    if delta <= 0.08:
        return "attention"
    return "regression"


def _format_percent(value: float) -> str:
    return f"{abs(value) * 100:.1f}%"


def _build_sprint_summary(
    cost_usd: float, tokens_total: float, delta: float, start: date, end: date
) -> str:
    direction = "Alta" if delta > 0 else "Queda" if delta < 0 else "Estabilidade"
    tokens_millions = tokens_total / 1_000_000 if tokens_total else 0.0
    delta_text = _format_percent(delta)
    period = f"{start.isoformat()} – {end.isoformat()}"
    if direction == "Estabilidade":
        return (
            f"Custo estável no período {period} com {tokens_millions:.2f} mi tokens processados."
        )
    qualifier = "versus sprint anterior"
    return (
        f"{direction} de {delta_text} no custo {qualifier} e {tokens_millions:.2f} mi tokens no período {period}."
    )


def _infer_window_start(
    breakdown: Iterable[TelemetryRouteBreakdown], window_days: int
) -> date:
    reference = date.today()
    span = max(1, window_days)
    return reference - timedelta(days=span - 1)


def _combine_date(day: date, *, at_end: bool) -> datetime:
    base_time = time.max if at_end else time.min
    combined = datetime.combine(day, base_time)
    if combined.tzinfo is None:
        combined = combined.replace(tzinfo=timezone.utc)
    else:
        combined = combined.astimezone(timezone.utc)
    return combined


def _resolve_route_owner(
    *,
    provider_id: str,
    route: str | None,
    lane: str | None,
    start: datetime,
    end: datetime,
) -> tuple[str, datetime | None]:
    records, _ = query_runs(
        start=start,
        end=end,
        provider_id=provider_id,
        lane=lane,
        route=route,
        limit=1,
    )
    if not records:
        return "—", None
    record = records[0]
    metadata = record.metadata or {}
    owner_raw = metadata.get("consumer") or metadata.get("project") or "—"
    owner = str(owner_raw)
    merged_at = _parse_iso(record.ts)
    return owner, merged_at


def _build_pr_summary(delta: float, provider_name: str, route: str | None) -> str:
    route_label = route or "default"
    delta_percent = _format_percent(delta)
    if delta > 0:
        return (
            f"Alta de {delta_percent} no custo da rota {route_label} ({provider_name}) em relação ao período anterior."
        )
    if delta < 0:
        return (
            f"Queda de {delta_percent} no custo da rota {route_label} ({provider_name}) frente ao período anterior."
        )
    return (
        f"Custo estável para a rota {route_label} ({provider_name}) quando comparado ao período anterior."
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


def _fetch_timeseries(
    connection: Connection, where_clause: str, params: dict[str, object]
):
    statement = text(
        f"""
        SELECT
            DATE(ts) AS day,
            provider_id,
            COUNT(*) AS run_count,
            SUM(tokens_in) AS tokens_in,
            SUM(tokens_out) AS tokens_out,
            AVG(duration_ms) AS avg_latency_ms,
            SUM(CASE WHEN LOWER(status) = 'success' THEN 1 ELSE 0 END) AS success_count,
            SUM(COALESCE(cost_estimated_usd, 0)) AS cost_usd,
            SUM(CASE WHEN cost_estimated_usd IS NULL THEN tokens_in ELSE 0 END) AS missing_tokens_in,
            SUM(CASE WHEN cost_estimated_usd IS NULL THEN tokens_out ELSE 0 END) AS missing_tokens_out
        FROM telemetry_events
        {where_clause}
        GROUP BY DATE(ts), provider_id
        ORDER BY DATE(ts) ASC, provider_id ASC
        """
    )
    return connection.execute(statement, dict(params)).mappings().all()


def _fetch_route_breakdown(
    connection: Connection, where_clause: str, params: dict[str, object]
):
    statement = text(
        f"""
        SELECT
            provider_id,
            route,
            COUNT(*) AS run_count,
            SUM(tokens_in) AS tokens_in,
            SUM(tokens_out) AS tokens_out,
            AVG(duration_ms) AS avg_latency_ms,
            SUM(CASE WHEN LOWER(status) = 'success' THEN 1 ELSE 0 END) AS success_count,
            SUM(COALESCE(cost_estimated_usd, 0)) AS cost_usd,
            SUM(CASE WHEN cost_estimated_usd IS NULL THEN tokens_in ELSE 0 END) AS missing_tokens_in,
            SUM(CASE WHEN cost_estimated_usd IS NULL THEN tokens_out ELSE 0 END) AS missing_tokens_out
        FROM telemetry_events
        {where_clause}
        GROUP BY provider_id, route
        ORDER BY cost_usd DESC, provider_id ASC
        """
    )
    return connection.execute(statement, dict(params)).mappings().all()


def _fetch_runs(
    connection: Connection,
    where_clause: str,
    params: dict[str, object],
    *,
    limit: int,
    offset: int,
):
    statement = text(
        f"""
        SELECT
            id,
            provider_id,
            route,
            tokens_in,
            tokens_out,
            duration_ms,
            status,
            cost_estimated_usd,
            metadata,
            ts,
            experiment_cohort,
            experiment_tag
        FROM telemetry_events
        {where_clause}
        ORDER BY ts DESC, id DESC
        LIMIT :limit OFFSET :offset
        """
    )
    run_params = dict(params)
    run_params.update({"limit": limit, "offset": offset})
    return connection.execute(statement, run_params).mappings().all()


def _fetch_heatmap(
    connection: Connection, where_clause: str, params: dict[str, object]
):
    statement = text(
        f"""
        SELECT
            DATE(ts) AS day,
            provider_id,
            COUNT(*) AS run_count
        FROM telemetry_events
        {where_clause}
        GROUP BY DATE(ts), provider_id
        ORDER BY DATE(ts) ASC, provider_id ASC
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


def render_telemetry_export(
    fmt: str,
    *,
    start: datetime | None = None,
    end: datetime | None = None,
    provider_id: str | None = None,
    route: str | None = None,
) -> tuple[str, str]:
    """Render a telemetry export document in the requested format."""

    normalized_start, normalized_end, where_clause, params = _prepare_filters(
        start=start, end=end, provider_id=provider_id, route=route
    )

    engine = bootstrap_database()
    with engine.begin() as connection:
        rows = _fetch_events(connection, where_clause, params)

    format_key = fmt.lower()
    if format_key == "csv":
        return _render_csv(rows), "text/csv"
    if format_key == "html":
        return (
            _render_html(
                rows,
                normalized_start=normalized_start,
                normalized_end=normalized_end,
                provider_id=provider_id,
                route=route,
            ),
            "text/html",
        )
    if format_key == "json":
        return _render_json(rows), "application/json"
    raise ValueError(f"Unsupported export format: {fmt}")


def _prepare_filters(
    *,
    start: datetime | None,
    end: datetime | None,
    provider_id: str | None,
    route: str | None,
    allowed_provider_ids: Iterable[str] | None = None,
) -> tuple[datetime | None, datetime | None, str, dict[str, object]]:
    normalized_start = _normalize_bound(start) if start else None
    normalized_end = _normalize_bound(end) if end else None
    if normalized_start and normalized_end and normalized_start > normalized_end:
        raise ValueError("start must be before end")

    params: dict[str, object] = {}
    clauses: list[str] = []
    allowed_set = (
        None
        if allowed_provider_ids is None
        else tuple(dict.fromkeys(allowed_provider_ids))
    )
    if normalized_start:
        params["start"] = normalized_start.isoformat()
        clauses.append("ts >= :start")
    if normalized_end:
        params["end"] = normalized_end.isoformat()
        clauses.append("ts <= :end")
    if provider_id:
        if allowed_set is not None and provider_id not in allowed_set:
            return normalized_start, normalized_end, " WHERE 0 = 1", {}
        params["provider_id"] = provider_id
        clauses.append("provider_id = :provider_id")
    elif allowed_set is not None:
        if not allowed_set:
            return normalized_start, normalized_end, " WHERE 0 = 1", {}
        placeholders: list[str] = []
        for index, provider in enumerate(allowed_set):
            key = f"lane_provider_{index}"
            params[key] = provider
            placeholders.append(f":{key}")
        clauses.append(f"provider_id IN ({', '.join(placeholders)})")
    if route:
        params["route"] = route
        clauses.append("route = :route")

    where_clause = " WHERE " + " AND ".join(clauses) if clauses else ""
    return normalized_start, normalized_end, where_clause, params


def _fetch_events(
    connection: Connection, where_clause: str, params: dict[str, object]
) -> list[dict[str, object]]:
    statement = text(
        f"""
        SELECT
            ts,
            provider_id,
            tool,
            route,
            status,
            tokens_in,
            tokens_out,
            duration_ms,
            cost_estimated_usd,
            source_file,
            line_number,
            ingested_at,
            metadata,
            experiment_cohort,
            experiment_tag
        FROM telemetry_events
        {where_clause}
        ORDER BY ts ASC, provider_id ASC, line_number ASC
        """
    )
    result = connection.execute(statement, dict(params))
    return [dict(row) for row in result.mappings()]


def _render_csv(rows: list[dict[str, object]]) -> str:
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(
        [
            "timestamp",
            "provider_id",
            "tool",
            "route",
            "status",
            "tokens_in",
            "tokens_out",
            "duration_ms",
            "cost_estimated_usd",
            "experiment_cohort",
            "experiment_tag",
            "metadata",
            "source_file",
        ]
    )
    for row in rows:
        raw_metadata = row.get("metadata")
        if isinstance(raw_metadata, str):
            metadata_value = raw_metadata
        else:
            metadata_value = json.dumps(raw_metadata or {}, ensure_ascii=False, sort_keys=True)
        writer.writerow(
            [
                row.get("ts", ""),
                row.get("provider_id", ""),
                row.get("tool", ""),
                row.get("route") or "",
                row.get("status", ""),
                row.get("tokens_in", 0),
                row.get("tokens_out", 0),
                row.get("duration_ms", 0),
                "" if row.get("cost_estimated_usd") is None else row["cost_estimated_usd"],
                row.get("experiment_cohort") or "",
                row.get("experiment_tag") or "",
                metadata_value,
                row.get("source_file", ""),
            ]
        )
    return output.getvalue()


def _render_json(rows: list[dict[str, object]]) -> str:
    normalized: list[dict[str, object]] = []
    for row in rows:
        metadata_raw = row.get("metadata")
        if isinstance(metadata_raw, str):
            try:
                metadata_value: object = json.loads(metadata_raw)
            except json.JSONDecodeError:
                metadata_value = metadata_raw
        else:
            metadata_value = metadata_raw
        normalized.append(
            {
                "timestamp": row.get("ts"),
                "provider_id": row.get("provider_id"),
                "tool": row.get("tool"),
                "route": row.get("route"),
                "status": row.get("status"),
                "tokens_in": row.get("tokens_in"),
                "tokens_out": row.get("tokens_out"),
                "duration_ms": row.get("duration_ms"),
                "cost_estimated_usd": row.get("cost_estimated_usd"),
                "experiment_cohort": row.get("experiment_cohort"),
                "experiment_tag": row.get("experiment_tag"),
                "metadata": metadata_value,
                "source_file": row.get("source_file"),
                "line_number": row.get("line_number"),
                "ingested_at": row.get("ingested_at"),
            }
        )
    return json.dumps(normalized, ensure_ascii=False, indent=2)


def _render_html(
    rows: list[dict[str, object]],
    *,
    normalized_start: datetime | None,
    normalized_end: datetime | None,
    provider_id: str | None,
    route: str | None,
) -> str:
    def _format_dt(value: datetime | None) -> str:
        return value.isoformat() if value else ""

    filters: list[str] = []
    if normalized_start:
        filters.append(f"Início: {html.escape(_format_dt(normalized_start))}")
    if normalized_end:
        filters.append(f"Fim: {html.escape(_format_dt(normalized_end))}")
    if provider_id:
        filters.append(f"Provider: {html.escape(provider_id)}")
    if route:
        filters.append(f"Route: {html.escape(route)}")

    filters_section = "" if not filters else "<p><strong>Filtros:</strong> " + ", ".join(filters) + "</p>"

    header_cells = "".join(
        f"<th scope=\"col\">{label}</th>"
        for label in (
            "Timestamp",
            "Provider",
            "Tool",
            "Route",
            "Status",
            "Tokens In",
            "Tokens Out",
            "Duration (ms)",
            "Cost (USD)",
            "Experiment Cohort",
            "Experiment Tag",
            "Metadata",
            "Source",
        )
    )

    body_rows = []
    for row in rows:
        body_rows.append(
            "<tr>"
            + "".join(
                [
                    f"<td>{html.escape(str(row.get('ts', '')))}</td>",
                    f"<td>{html.escape(str(row.get('provider_id', '')))}</td>",
                    f"<td>{html.escape(str(row.get('tool', '')))}</td>",
                    f"<td>{html.escape(row.get('route') or '')}</td>",
                    f"<td>{html.escape(str(row.get('status', '')))}</td>",
                    f"<td>{row.get('tokens_in', 0)}</td>",
                    f"<td>{row.get('tokens_out', 0)}</td>",
                    f"<td>{row.get('duration_ms', 0)}</td>",
                    f"<td>{'' if row.get('cost_estimated_usd') is None else row['cost_estimated_usd']}</td>",
                    f"<td>{html.escape(str(row.get('experiment_cohort') or ''))}</td>",
                    f"<td>{html.escape(str(row.get('experiment_tag') or ''))}</td>",
                    f"<td>{html.escape(str(row.get('metadata') or ''))}</td>",
                    f"<td>{html.escape(str(row.get('source_file', '')))}</td>",
                ]
            )
            + "</tr>"
        )

    table_body = "\n".join(body_rows) if body_rows else "<tr><td colspan=\"13\">No telemetry events found.</td></tr>"

    return (
        "<!DOCTYPE html>\n"
        "<html lang=\"en\">\n"
        "<head>\n"
        "  <meta charset=\"utf-8\" />\n"
        "  <title>Telemetry Export</title>\n"
        "  <style>table {border-collapse: collapse; width: 100%;}"
        " th, td {border: 1px solid #d0d0d0; padding: 6px 8px; text-align: left;}"
        " th {background: #f5f5f5;}</style>\n"
        "</head>\n"
        "<body>\n"
        "  <h1>Telemetry Export</h1>\n"
        f"  {filters_section}\n"
        "  <table>\n"
        f"    <thead><tr>{header_cells}</tr></thead>\n"
        f"    <tbody>\n{table_body}\n    </tbody>\n"
        "  </table>\n"
        "</body>\n"
        "</html>\n"
    )

