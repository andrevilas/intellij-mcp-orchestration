"""Tests covering the SQLite bootstrap and migration helpers."""

from __future__ import annotations

from sqlalchemy import text


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

    assert {
        "schema_migrations",
        "mcp_servers",
        "cost_policies",
        "price_entries",
        "telemetry_events",
    } <= tables


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
