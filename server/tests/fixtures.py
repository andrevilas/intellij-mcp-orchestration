from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Iterable

from sqlalchemy import text
from sqlalchemy.engine import Engine

from console_mcp_server import prices as prices_module


@dataclass(frozen=True)
class SamplePriceEntry:
    entry_id: str
    provider_id: str
    model: str
    input_cost_per_1k: float | None
    output_cost_per_1k: float | None


@dataclass(frozen=True)
class SampleTelemetryEvent:
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


def seed_price_entries(entries: Iterable[SamplePriceEntry]) -> None:
    for entry in entries:
        prices_module.create_price_entry(
            entry_id=entry.entry_id,
            provider_id=entry.provider_id,
            model=entry.model,
            input_cost_per_1k=entry.input_cost_per_1k,
            output_cost_per_1k=entry.output_cost_per_1k,
        )


def seed_telemetry_events(engine: Engine, events: Iterable[SampleTelemetryEvent]) -> None:
    base_ts = datetime.now(tz=timezone.utc)
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
                        :metadata,
                        :ts,
                        :source_file,
                        :line_number,
                        :ingested_at
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
                    "source_file": f"{event.provider_id}/sample.jsonl",
                    "line_number": index,
                    "ingested_at": (base_ts + timedelta(seconds=index)).isoformat(),
                },
            )


__all__ = [
    "SamplePriceEntry",
    "SampleTelemetryEvent",
    "seed_price_entries",
    "seed_telemetry_events",
]
