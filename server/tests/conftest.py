from __future__ import annotations

import importlib
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

from .fixtures import (
    SamplePriceEntry,
    SampleTelemetryEvent,
    seed_price_entries,
    seed_telemetry_events,
)


@pytest.fixture()
def database(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    db_path = tmp_path / "console.db"
    monkeypatch.setenv("CONSOLE_MCP_DB_PATH", str(db_path))

    import console_mcp_server.database as database_module

    database = importlib.reload(database_module)
    database.reset_state()
    try:
        yield database
    finally:
        database.reset_state()


@pytest.fixture()
def telemetry_dataset(database):
    engine = database.bootstrap_database()

    seed_price_entries(
        [
            SamplePriceEntry(
                entry_id="price-gemini",
                provider_id="gemini",
                model="gemini-pro",
                input_cost_per_1k=0.0025,
                output_cost_per_1k=0.0035,
            ),
            SamplePriceEntry(
                entry_id="price-glm46",
                provider_id="glm46",
                model="glm-chat",
                input_cost_per_1k=0.0018,
                output_cost_per_1k=0.0021,
            ),
        ]
    )

    base_ts = datetime(2025, 4, 10, 12, 0, tzinfo=timezone.utc)
    events = [
        SampleTelemetryEvent(
            provider_id="gemini",
            tool="gemini.chat",
            route="balanced",
            tokens_in=1800,
            tokens_out=900,
            duration_ms=880,
            status="success",
            cost_estimated_usd=1.75,
            ts=base_ts,
            metadata={"consumer": "squad-a", "trace_id": "gem-001"},
        ),
        SampleTelemetryEvent(
            provider_id="gemini",
            tool="gemini.chat",
            route="balanced",
            tokens_in=1200,
            tokens_out=700,
            duration_ms=940,
            status="error",
            cost_estimated_usd=None,
            ts=base_ts + timedelta(days=1),
            metadata={"project": "alpha"},
        ),
        SampleTelemetryEvent(
            provider_id="glm46",
            tool="glm46.chat",
            route="default",
            tokens_in=1500,
            tokens_out=600,
            duration_ms=1020,
            status="success",
            cost_estimated_usd=1.1,
            ts=base_ts - timedelta(days=1),
            metadata={"consumer": "squad-b"},
        ),
        SampleTelemetryEvent(
            provider_id="glm46",
            tool="glm46.chat",
            route="default",
            tokens_in=900,
            tokens_out=300,
            duration_ms=760,
            status="retry",
            cost_estimated_usd=None,
            ts=base_ts,
            metadata={"project": "beta"},
        ),
    ]

    seed_telemetry_events(engine, events)
    return events
