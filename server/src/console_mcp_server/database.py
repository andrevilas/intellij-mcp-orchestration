"""SQLite database helpers and migration runner for the console prototype."""

from __future__ import annotations

import os
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Generator, Iterable, Sequence

from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

DEFAULT_DB_PATH = Path("~/.mcp/console.db")
DB_ENV_VAR = "CONSOLE_MCP_DB_PATH"


@dataclass(frozen=True)
class Migration:
    """Discrete schema update executed sequentially."""

    version: int
    statements: Sequence[str]
    description: str = ""


# NOTE: Keep migrations sorted by version to guarantee deterministic order.
MIGRATIONS: tuple[Migration, ...] = (
    Migration(
        version=1,
        description="bootstrap MCP servers table",
        statements=(
            """
            CREATE TABLE IF NOT EXISTS mcp_servers (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                command TEXT NOT NULL,
                description TEXT,
                tags TEXT NOT NULL DEFAULT '[]',
                capabilities TEXT NOT NULL DEFAULT '[]',
                transport TEXT NOT NULL DEFAULT 'stdio',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """,
        ),
    ),
    Migration(
        version=2,
        description="add cost policies table",
        statements=(
            """
            CREATE TABLE IF NOT EXISTS cost_policies (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT,
                currency TEXT NOT NULL DEFAULT 'USD',
                monthly_spend_limit REAL NOT NULL,
                tags TEXT NOT NULL DEFAULT '[]',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """,
        ),
    ),
    Migration(
        version=3,
        description="add price entries table",
        statements=(
            """
            CREATE TABLE IF NOT EXISTS price_entries (
                id TEXT PRIMARY KEY,
                provider_id TEXT NOT NULL,
                model TEXT NOT NULL,
                currency TEXT NOT NULL DEFAULT 'USD',
                unit TEXT NOT NULL DEFAULT 'tokens',
                input_cost_per_1k REAL,
                output_cost_per_1k REAL,
                embedding_cost_per_1k REAL,
                tags TEXT NOT NULL DEFAULT '[]',
                notes TEXT,
                effective_at TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """,
        ),
    ),
)

_engine: Engine | None = None
_engine_path: Path | None = None
_SessionLocal: sessionmaker[Session] | None = None


def _resolve_database_path(path: Path | None = None) -> Path:
    env_override = os.getenv(DB_ENV_VAR)
    resolved = path or Path(env_override) if env_override else DEFAULT_DB_PATH
    resolved = resolved.expanduser()
    if not resolved.is_absolute():
        resolved = Path(__file__).resolve().parents[3] / resolved
    resolved.parent.mkdir(parents=True, exist_ok=True)
    return resolved


def get_engine(path: Path | None = None) -> Engine:
    """Return a cached SQLAlchemy engine bound to the configured SQLite database."""

    global _engine, _engine_path, _SessionLocal
    db_path = _resolve_database_path(path)
    if _engine is None or _engine_path != db_path:
        _engine = create_engine(
            f"sqlite:///{db_path}",
            echo=False,
            future=True,
            connect_args={"check_same_thread": False},
        )
        _engine_path = db_path
        _SessionLocal = None
    return _engine


def get_sessionmaker(engine: Engine | None = None) -> sessionmaker[Session]:
    """Return a cached session factory bound to the engine."""

    global _SessionLocal
    if engine is None:
        engine = get_engine()
    if _SessionLocal is None:
        _SessionLocal = sessionmaker(
            bind=engine,
            autoflush=False,
            expire_on_commit=False,
            future=True,
        )
    return _SessionLocal


@contextmanager
def session_scope() -> Generator[Session, None, None]:
    """Provide a transactional scope for interacting with the database."""

    session_factory = get_sessionmaker()
    session = session_factory()
    try:
        yield session
        session.commit()
    except Exception:  # pragma: no cover - defensive rollback
        session.rollback()
        raise
    finally:
        session.close()


def _ensure_migrations_table(engine: Engine) -> None:
    with engine.begin() as connection:
        connection.exec_driver_sql(
            """
            CREATE TABLE IF NOT EXISTS schema_migrations (
                version INTEGER PRIMARY KEY,
                description TEXT,
                applied_at TEXT NOT NULL
            )
            """
        )


def _applied_versions(engine: Engine) -> set[int]:
    with engine.begin() as connection:
        rows = connection.execute(text("SELECT version FROM schema_migrations"))
        return {int(row[0]) for row in rows}


def run_migrations(engine: Engine | None = None, migrations: Iterable[Migration] | None = None) -> None:
    """Apply any pending migrations against the configured database."""

    if engine is None:
        engine = get_engine()
    if migrations is None:
        migrations = MIGRATIONS

    migrations_seq = tuple(migrations)
    _ensure_migrations_table(engine)

    pending_versions = {migration.version for migration in migrations_seq}
    if len(pending_versions) != len(migrations_seq):
        raise ValueError("Duplicate migration versions detected")

    applied = _applied_versions(engine)
    ordered = sorted(migrations_seq, key=lambda item: item.version)

    with engine.begin() as connection:
        for migration in ordered:
            if migration.version in applied:
                continue
            for statement in migration.statements:
                connection.exec_driver_sql(statement)
            connection.execute(
                text(
                    """
                    INSERT INTO schema_migrations (version, description, applied_at)
                    VALUES (:version, :description, :applied_at)
                    """
                ),
                {
                    "version": migration.version,
                    "description": migration.description,
                    "applied_at": datetime.now(tz=timezone.utc).isoformat(),
                },
            )


def bootstrap_database(path: Path | None = None) -> Engine:
    """Ensure the SQLite database exists and is migrated to the latest schema."""

    engine = get_engine(path)
    run_migrations(engine)
    return engine


def database_path() -> Path:
    """Expose the resolved database path for logging and diagnostics."""

    return _resolve_database_path()


def reset_state() -> None:
    """Clear cached engine/session factories (useful for tests)."""

    global _engine, _engine_path, _SessionLocal
    _engine = None
    _engine_path = None
    _SessionLocal = None


__all__ = [
    "MIGRATIONS",
    "Migration",
    "DB_ENV_VAR",
    "DEFAULT_DB_PATH",
    "bootstrap_database",
    "database_path",
    "get_engine",
    "get_sessionmaker",
    "run_migrations",
    "session_scope",
    "reset_state",
]
