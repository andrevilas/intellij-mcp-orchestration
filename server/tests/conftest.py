from __future__ import annotations

import importlib
from pathlib import Path

import pytest


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
