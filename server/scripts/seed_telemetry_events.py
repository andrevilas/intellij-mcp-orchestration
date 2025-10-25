"""Seed FinOps telemetry fixtures into the SQLite database used by the API."""

from __future__ import annotations

import argparse
import json
import os
import sys
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Iterable

import structlog
from sqlalchemy import text

LOGGER = structlog.get_logger(__name__)

REPO_ROOT = Path(__file__).resolve().parents[2]
os.environ.setdefault("CONSOLE_MCP_SERVERS_PATH", str(REPO_ROOT / "config/console-mcp/servers.example.json"))
if str(REPO_ROOT / "server" / "src") not in sys.path:
    sys.path.append(str(REPO_ROOT / "server" / "src"))

DEFAULT_DATASET = REPO_ROOT / "server" / "routes" / "fixtures" / "finops_events.json"


@dataclass(frozen=True)
class TelemetryFixture:
    """Represents a telemetry event loaded from the JSON dataset."""

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
    def from_dict(cls, payload: dict[str, object]) -> "TelemetryFixture":
        ts_raw = payload.get("ts")
        if not isinstance(ts_raw, str):
            raise ValueError("telemetry event missing ISO timestamp")
        metadata = payload.get("metadata")
        if not isinstance(metadata, dict):
            metadata = {}
        return cls(
            provider_id=str(payload["provider_id"]),
            tool=str(payload["tool"]),
            route=(
                str(payload["route"]) if payload.get("route") is not None else None
            ),
            tokens_in=int(payload.get("tokens_in", 0)),
            tokens_out=int(payload.get("tokens_out", 0)),
            duration_ms=int(payload.get("duration_ms", 0)),
            status=str(payload.get("status", "success")),
            cost_estimated_usd=(
                float(payload["cost_estimated_usd"])
                if payload.get("cost_estimated_usd") is not None
                else None
            ),
            ts=datetime.fromisoformat(ts_raw),
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


def _load_dataset(path: Path) -> list[TelemetryFixture]:
    if not path.exists():
        raise FileNotFoundError(f"dataset not found: {path}")
    payload = json.loads(path.read_text(encoding="utf-8"))
    events = payload.get("events")
    if not isinstance(events, list):
        raise ValueError("dataset must contain an 'events' array")
    return [TelemetryFixture.from_dict(item) for item in events]


def _seed_events(dataset: Iterable[TelemetryFixture]) -> int:
    from console_mcp_server import database as database_module

    engine = database_module.bootstrap_database()
    inserted = 0
    base_ts = datetime.now(timezone.utc)
    with engine.begin() as connection:
        connection.execute(text("DELETE FROM telemetry_events"))
        for index, event in enumerate(dataset, start=1):
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
                    "metadata": json.dumps(
                        event.metadata, ensure_ascii=False, sort_keys=True
                    ),
                    "ts": event.ts.isoformat(),
                    "source_file": f"finops-fixture/{event.provider_id}.jsonl",
                    "line_number": index,
                    "ingested_at": (base_ts + timedelta(seconds=index)).replace(microsecond=0).isoformat(),
                    "experiment_cohort": event.experiment_cohort,
                    "experiment_tag": event.experiment_tag,
                },
            )
            inserted += 1
    return inserted


def seed_finops_dataset(
    *,
    db_path: Path | None = None,
    dataset_path: Path | None = None,
) -> int:
    """Seed the FinOps telemetry dataset into the configured SQLite database."""

    from console_mcp_server import database as database_module

    dataset_file = dataset_path or DEFAULT_DATASET
    fixtures = _load_dataset(dataset_file)

    original_db_path = os.environ.get("CONSOLE_MCP_DB_PATH")
    try:
        if db_path is not None:
            os.environ["CONSOLE_MCP_DB_PATH"] = str(db_path)
        database_module.reset_state()
        count = _seed_events(fixtures)
    finally:
        database_module.reset_state()
        if db_path is not None:
            if original_db_path is not None:
                os.environ["CONSOLE_MCP_DB_PATH"] = original_db_path
            else:
                os.environ.pop("CONSOLE_MCP_DB_PATH", None)
    LOGGER.info(
        "seeded_finops_dataset",
        db_path=os.environ.get("CONSOLE_MCP_DB_PATH", original_db_path),
        events=count,
        dataset=str(dataset_file),
    )
    return count


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Seed FinOps telemetry events into the SQLite database used by the API.",
    )
    parser.add_argument(
        "--db-path",
        type=Path,
        default=None,
        help="Optional path to the SQLite database file (defaults to CONSOLE_MCP_DB_PATH)",
    )
    parser.add_argument(
        "--dataset",
        type=Path,
        default=DEFAULT_DATASET,
        help="Path to the telemetry dataset in JSON format.",
    )
    args = parser.parse_args()

    count = seed_finops_dataset(db_path=args.db_path, dataset_path=args.dataset)
    LOGGER.info("completed_seeding", events=count)


if __name__ == "__main__":
    main()
