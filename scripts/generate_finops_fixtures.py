"""Regenerate FinOps fixtures and optionally seed the local SQLite database."""

from __future__ import annotations

import argparse
import json
import os
import sys
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Iterable, Sequence

import structlog
from sqlalchemy import text

LOGGER = structlog.get_logger(__name__)

REPO_ROOT = Path(__file__).resolve().parents[1]
FIXTURE_DIR = REPO_ROOT / "server" / "routes" / "fixtures"
TEST_FIXTURE_DIR = REPO_ROOT / "tests" / "fixtures" / "backend"
DATASET_FILE = FIXTURE_DIR / "finops_events.json"

PRICE_ENTRIES: Sequence[dict[str, object]] = (
    {
        "entry_id": "finops-sample-gemini",
        "provider_id": "gemini",
        "model": "gemini-pro",
        "input_cost_per_1k": 0.0025,
        "output_cost_per_1k": 0.0035,
    },
    {
        "entry_id": "finops-sample-glm46",
        "provider_id": "glm46",
        "model": "glm-chat",
        "input_cost_per_1k": 0.0018,
        "output_cost_per_1k": 0.0022,
    },
    {
        "entry_id": "finops-sample-codex",
        "provider_id": "codex",
        "model": "codex-cli",
        "input_cost_per_1k": 0.0020,
        "output_cost_per_1k": 0.0025,
    },
)


def _configure_environment(repo_root: Path) -> None:
    os.environ.setdefault(
        "CONSOLE_MCP_SERVERS_PATH",
        str(repo_root / "config/console-mcp/servers.example.json"),
    )
    sys.path.append(str(repo_root / "server/src"))


@dataclass(frozen=True)
class TelemetryEventPayload:
    provider_id: str
    tool: str
    route: str | None
    tokens_in: int
    tokens_out: int
    duration_ms: int
    status: str
    cost_estimated_usd: float | None
    ts: datetime
    metadata: dict[str, object]
    experiment_cohort: str | None
    experiment_tag: str | None

    @classmethod
    def from_dict(cls, payload: dict[str, object]) -> "TelemetryEventPayload":
        ts_raw = payload.get("ts")
        if not isinstance(ts_raw, str):  # pragma: no cover - defensive guard
            raise ValueError("event missing timestamp")
        ts = datetime.fromisoformat(ts_raw)
        metadata = payload.get("metadata")
        if not isinstance(metadata, dict):
            metadata = {}
        return cls(
            provider_id=str(payload["provider_id"]),
            tool=str(payload["tool"]),
            route=str(payload.get("route")) if payload.get("route") is not None else None,
            tokens_in=int(payload.get("tokens_in", 0)),
            tokens_out=int(payload.get("tokens_out", 0)),
            duration_ms=int(payload.get("duration_ms", 0)),
            status=str(payload.get("status", "success")),
            cost_estimated_usd=(
                float(payload["cost_estimated_usd"])
                if payload.get("cost_estimated_usd") is not None
                else None
            ),
            ts=ts,
            metadata={str(key): value for key, value in metadata.items()},
            experiment_cohort=(
                str(payload["experiment_cohort"])
                if payload.get("experiment_cohort") is not None
                else None
            ),
            experiment_tag=(
                str(payload["experiment_tag"])
                if payload.get("experiment_tag") is not None
                else None
            ),
        )


def _load_dataset() -> list[TelemetryEventPayload]:
    if not DATASET_FILE.exists():
        raise FileNotFoundError(f"Dataset not found: {DATASET_FILE}")
    payload = json.loads(DATASET_FILE.read_text(encoding="utf-8"))
    events_raw = payload.get("events")
    if not isinstance(events_raw, list):
        raise ValueError("Dataset payload must contain an 'events' list")
    return [TelemetryEventPayload.from_dict(item) for item in events_raw]


@contextmanager
def _database_context(db_path: Path | None):
    from console_mcp_server import database as database_module

    original_path = os.environ.get("CONSOLE_MCP_DB_PATH")
    if db_path is not None:
        os.environ["CONSOLE_MCP_DB_PATH"] = str(db_path)
    database_module.reset_state()
    engine = database_module.bootstrap_database()
    try:
        yield engine
    finally:
        database_module.reset_state()
        if original_path is not None:
            os.environ["CONSOLE_MCP_DB_PATH"] = original_path
        elif "CONSOLE_MCP_DB_PATH" in os.environ:
            del os.environ["CONSOLE_MCP_DB_PATH"]


def _seed_price_entries(entries: Sequence[dict[str, object]]) -> None:
    from console_mcp_server.prices import create_price_entry
    from console_mcp_server.database import session_scope

    with session_scope() as session:
        session.execute(
            text(
                "DELETE FROM price_entries "
                "WHERE id IN ('finops-sample-gemini', 'finops-sample-glm46', 'finops-sample-codex')"
            )
        )

    for entry in entries:
        create_price_entry(**entry)


def _truncate_events(engine) -> None:
    with engine.begin() as connection:
        connection.execute(text("DELETE FROM telemetry_events"))


def _ingest_events(engine, events: Iterable[TelemetryEventPayload]) -> int:
    inserted = 0
    with engine.begin() as connection:
        for index, event in enumerate(events, start=1):
            connection.execute(
                text(
                    """
                    INSERT INTO telemetry_events (
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
                        :metadata,
                        :ts,
                        :source_file,
                        :line_number,
                        :ingested_at,
                        :experiment_cohort,
                        :experiment_tag
                    )
                    """
                ),
                {
                    "provider_id": event.provider_id,
                    "tool": event.tool,
                    "route": event.route,
                    "tokens_in": event.tokens_in,
                    "tokens_out": event.tokens_out,
                    "duration_ms": event.duration_ms,
                    "status": event.status,
                    "cost_estimated_usd": event.cost_estimated_usd,
                    "metadata": json.dumps(event.metadata, ensure_ascii=False, sort_keys=True),
                    "ts": event.ts.isoformat(),
                    "source_file": f"finops-fixture/{event.provider_id}.jsonl",
                    "line_number": index,
                    "ingested_at": event.ts.isoformat(),
                    "experiment_cohort": event.experiment_cohort,
                    "experiment_tag": event.experiment_tag,
                },
            )
            inserted += 1
    return inserted


def _configure_registry(repo_root: Path) -> None:
    from console_mcp_server import config as config_module
    from console_mcp_server import registry as registry_module

    settings = config_module.reload_settings()
    registry_module.provider_registry = registry_module.ProviderRegistry(settings=settings)


def _determine_ranges(events: Sequence[TelemetryEventPayload]) -> tuple[date, date, date]:
    if not events:
        raise ValueError("Dataset must contain at least one event")
    last_day = max(event.ts.date() for event in events)
    current_start = last_day - timedelta(days=6)
    previous_start = current_start - timedelta(days=7)
    return previous_start, current_start, last_day


def _combine(day: date, at_end: bool) -> datetime:
    base_time = time.max if at_end else time.min
    combined = datetime.combine(day, base_time, tzinfo=timezone.utc)
    return combined


def _serialize_sprint_reports(reports) -> dict:
    def _round(value: float, digits: int = 6) -> float:
        return round(float(value), digits)

    items = []
    for report in reports:
        items.append(
            {
                "id": report.report_id,
                "name": report.name,
                "period_start": report.period_start.isoformat(),
                "period_end": report.period_end.isoformat(),
                "total_cost_usd": _round(report.total_cost_usd, 4),
                "total_tokens_in": int(report.total_tokens_in),
                "total_tokens_out": int(report.total_tokens_out),
                "avg_latency_ms": _round(report.avg_latency_ms, 3),
                "success_rate": _round(report.success_rate, 6),
                "cost_delta": _round(report.cost_delta, 6),
                "status": report.status,
                "summary": report.summary,
            }
        )
    return {"items": items}


def _serialize_pull_request_reports(reports) -> dict:
    def _round(value: float, digits: int = 6) -> float:
        return round(float(value), digits)

    items = []
    for report in reports:
        merged_at = report.merged_at.isoformat() if report.merged_at else None
        items.append(
            {
                "id": report.report_id,
                "provider_id": report.provider_id,
                "provider_name": report.provider_name,
                "route": report.route,
                "lane": report.lane,
                "title": report.title,
                "owner": report.owner,
                "merged_at": merged_at,
                "cost_impact_usd": _round(report.cost_impact_usd, 4),
                "cost_delta": _round(report.cost_delta, 6),
                "tokens_impact": int(report.tokens_impact),
                "status": report.status,
                "summary": report.summary,
            }
        )
    return {"items": items}


def _write_fixture(path: Path, payload: dict) -> None:
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    LOGGER.info("fixture.written", path=str(path))


def generate_fixtures(events: Sequence[TelemetryEventPayload], *, window_days: int) -> tuple[dict, dict]:
    from console_mcp_server.telemetry import (
        compute_finops_pull_request_reports,
        compute_finops_sprint_reports,
    )

    previous_start, current_start, last_day = _determine_ranges(events)
    start_total = _combine(previous_start, at_end=False)
    end_total = _combine(last_day, at_end=True)
    start_current = _combine(current_start, at_end=False)

    with TemporaryDirectory(prefix="finops-fixtures-") as tmp_dir:
        db_path = Path(tmp_dir) / "console.db"
        with _database_context(db_path) as engine:
            _seed_price_entries(PRICE_ENTRIES)
            _truncate_events(engine)
            _ingest_events(engine, events)
            _configure_registry(REPO_ROOT)

            sprint_reports = compute_finops_sprint_reports(
                start=start_total,
                end=end_total,
                window_days=window_days,
                limit=4,
            )
            pr_reports = compute_finops_pull_request_reports(
                start=start_current,
                end=end_total,
                window_days=window_days,
                limit=4,
            )

    return _serialize_sprint_reports(sprint_reports), _serialize_pull_request_reports(pr_reports)


def seed_database(events: Sequence[TelemetryEventPayload], db_path: Path) -> None:
    LOGGER.info("seed.start", db_path=str(db_path))
    db_path.parent.mkdir(parents=True, exist_ok=True)
    with _database_context(db_path) as engine:
        _seed_price_entries(PRICE_ENTRIES)
        _truncate_events(engine)
        inserted = _ingest_events(engine, events)
    LOGGER.info("seed.done", db_path=str(db_path), inserted=inserted)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--seed-db",
        action="store_true",
        help="also load the dataset into the configured database",
    )
    parser.add_argument(
        "--db-path",
        type=Path,
        default=None,
        help="override the database path when using --seed-db",
    )
    parser.add_argument(
        "--window-days",
        type=int,
        default=7,
        help="size of each comparison window in days (default: 7)",
    )
    args = parser.parse_args(argv)

    _configure_environment(REPO_ROOT)
    events = _load_dataset()
    sprints_payload, prs_payload = generate_fixtures(events, window_days=args.window_days)

    for directory in (FIXTURE_DIR, TEST_FIXTURE_DIR):
        _write_fixture(directory / "finops_sprints.json", sprints_payload)
        _write_fixture(directory / "finops_pull_requests.json", prs_payload)

    if args.seed_db:
        db_path = args.db_path
        if db_path is None:
            env_path = os.getenv("CONSOLE_MCP_DB_PATH")
            db_path = Path(env_path) if env_path else Path.home() / ".mcp" / "console.db"
        seed_database(events, db_path)
        LOGGER.info("seed.instructions", message="Database seeded with FinOps sample telemetry")

    return 0


if __name__ == "__main__":  # pragma: no cover - CLI entrypoint
    raise SystemExit(main())
