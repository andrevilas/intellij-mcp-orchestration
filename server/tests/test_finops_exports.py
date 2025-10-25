"""Tests covering the FinOps export validation helpers."""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[2]
if str(ROOT_DIR) not in sys.path:
    sys.path.append(str(ROOT_DIR))

from datetime import datetime, timezone

import pytest

from console_mcp_server import database as database_module

from server.routes.finops import ExportValidationError, export_finops_telemetry
from server.scripts.seed_telemetry_events import seed_finops_dataset


def test_export_finops_telemetry_valid_formats(tmp_path, monkeypatch: pytest.MonkeyPatch) -> None:
    db_path = tmp_path / "console.db"
    inserted = seed_finops_dataset(db_path=db_path)
    assert inserted > 0

    monkeypatch.setenv("CONSOLE_MCP_DB_PATH", str(db_path))
    database_module.reset_state()

    csv_export = export_finops_telemetry("csv")
    assert csv_export.media_type.startswith("text/csv")
    assert "provider_id" in csv_export.document

    html_export = export_finops_telemetry("html", provider_id="glm46")
    assert html_export.media_type.startswith("text/html")
    assert "<table" in html_export.document.lower()

    time_bounds_start = datetime(2025, 10, 8, tzinfo=timezone.utc)
    time_bounds_end = datetime(2025, 10, 21, 23, 59, 59, tzinfo=timezone.utc)
    json_export = export_finops_telemetry(
        "json",
        start=time_bounds_start,
        end=time_bounds_end,
        route="balanced",
    )
    assert json_export.media_type.startswith("application/json")
    payload = json.loads(json_export.document)
    assert payload and payload[0]["provider_id"] in {"gemini", "glm46", "codex"}


def test_export_finops_telemetry_requires_events(
    tmp_path, monkeypatch: pytest.MonkeyPatch
) -> None:
    db_path = tmp_path / "empty.db"
    monkeypatch.setenv("CONSOLE_MCP_DB_PATH", str(db_path))
    database_module.reset_state()
    database_module.bootstrap_database()
    database_module.reset_state()

    with pytest.raises(ExportValidationError):
        export_finops_telemetry("csv")
