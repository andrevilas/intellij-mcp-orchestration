"""Tests covering the SQLite bootstrap and migration helpers."""

from __future__ import annotations

from pathlib import Path

import importlib

import pytest
from sqlalchemy import text


@pytest.fixture()
def database(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    db_path = tmp_path / "console.db"
    monkeypatch.setenv("CONSOLE_MCP_DB_PATH", str(db_path))

    import console_mcp_server.database as database_module

    database = importlib.reload(database_module)
    database.reset_state()
    yield database
    database.reset_state()


def test_bootstrap_creates_expected_tables(database) -> None:
    engine = database.bootstrap_database()

    path = database.database_path()
    assert path.exists()

    with engine.begin() as connection:
        tables = {
            row[0]
            for row in connection.execute(
                text("SELECT name FROM sqlite_master WHERE type='table'")
            )
        }

    assert {"schema_migrations", "mcp_servers"} <= tables


def test_repeated_bootstrap_is_idempotent(database) -> None:
    first_engine = database.bootstrap_database()
    second_engine = database.bootstrap_database()

    assert first_engine is second_engine

    with first_engine.begin() as connection:
        rows = connection.execute(
            text("SELECT version FROM schema_migrations ORDER BY version")
        ).fetchall()

    versions = [row[0] for row in rows]
    expected_versions = [migration.version for migration in database.MIGRATIONS]
    assert versions == expected_versions
