from __future__ import annotations

import importlib
import json
from datetime import datetime
from pathlib import Path

import pytest
from sqlalchemy import text


@pytest.fixture()
def telemetry_module(monkeypatch: pytest.MonkeyPatch, tmp_path: Path):
    logs_root = tmp_path / "logs"
    monkeypatch.setenv("CONSOLE_MCP_LOGS_DIR", str(logs_root))

    import console_mcp_server.telemetry as telemetry

    yield importlib.reload(telemetry)


def _write_sample_log(directory: Path) -> Path:
    directory.mkdir(parents=True, exist_ok=True)
    file_path = directory / "2025-01-15.jsonl"
    records = [
        {
            "ts": "2025-01-15T12:00:00Z",
            "tool": "glm46.chat",
            "route": "default",
            "tokens_in": 321,
            "tokens_out": 654,
            "duration_ms": 987,
            "status": "success",
            "cost_estimated_usd": 0.1234,
            "metadata": {"request_id": "abc-123"},
        },
        {
            "ts": "2025-01-16T09:30:00+01:00",
            "tool": "glm46.embedding",
            "tokens_in": 42,
            "tokens_out": 0,
            "duration_ms": 12,
            "status": "",
            "metadata": {},
        },
    ]
    with file_path.open("w", encoding="utf-8") as handle:
        for record in records:
            handle.write(json.dumps(record) + "\n")
        handle.write("not-json\n")
        handle.write("\n")
    return file_path


def test_ingest_logs_populates_database(database, telemetry_module, tmp_path: Path) -> None:
    engine = database.bootstrap_database()

    logs_root = Path(telemetry_module._resolve_logs_dir())  # type: ignore[attr-defined]
    provider_dir = logs_root / "glm46"
    file_path = _write_sample_log(provider_dir)

    inserted = telemetry_module.ingest_logs()
    assert inserted == 2

    with engine.begin() as connection:
        rows = connection.execute(
            text(
                """
                SELECT provider_id, tool, route, tokens_in, tokens_out, duration_ms,
                       status, cost_estimated_usd, metadata, ts, source_file,
                       line_number, ingested_at
                FROM telemetry_events
                ORDER BY line_number
                """
            )
        ).fetchall()

    assert len(rows) == 2

    first = rows[0]._mapping
    assert first["provider_id"] == "glm46"
    assert first["tool"] == "glm46.chat"
    assert first["route"] == "default"
    assert first["tokens_in"] == 321
    assert first["tokens_out"] == 654
    assert first["duration_ms"] == 987
    assert first["status"] == "success"
    assert pytest.approx(first["cost_estimated_usd"], rel=1e-6) == 0.1234
    assert first["metadata"] == json.dumps({"request_id": "abc-123"}, ensure_ascii=False, sort_keys=True)
    assert first["ts"] == "2025-01-15T12:00:00+00:00"
    assert first["source_file"] == str(file_path.relative_to(logs_root))
    assert first["line_number"] == 1
    assert datetime.fromisoformat(first["ingested_at"]).tzinfo is not None

    second = rows[1]._mapping
    assert second["status"] == "unknown"
    assert second["route"] is None
    assert second["metadata"] == "{}"
    assert second["ts"] == "2025-01-16T08:30:00+00:00"

    reinsertion = telemetry_module.ingest_logs()
    assert reinsertion == 0

    with engine.begin() as connection:
        count = connection.execute(text("SELECT COUNT(*) FROM telemetry_events")).scalar_one()
    assert count == 2


def test_ingest_specific_provider_only(database, telemetry_module, tmp_path: Path) -> None:
    database.bootstrap_database()

    logs_root = Path(telemetry_module._resolve_logs_dir())  # type: ignore[attr-defined]
    _write_sample_log(logs_root / "glm46")
    _write_sample_log(logs_root / "gemini")

    inserted_glm = telemetry_module.ingest_logs(provider_id="glm46")
    assert inserted_glm == 2

    inserted_gemini = telemetry_module.ingest_logs(provider_id="gemini")
    assert inserted_gemini == 2

    # A non-existent provider should not raise and should not insert data.
    inserted_unknown = telemetry_module.ingest_logs(provider_id="claude")
    assert inserted_unknown == 0
