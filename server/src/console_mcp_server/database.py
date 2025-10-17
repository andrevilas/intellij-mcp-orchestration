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
    Migration(
        version=4,
        description="add telemetry events table",
        statements=(
            """
            CREATE TABLE IF NOT EXISTS telemetry_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                provider_id TEXT NOT NULL,
                tool TEXT NOT NULL,
                route TEXT,
                tokens_in INTEGER NOT NULL,
                tokens_out INTEGER NOT NULL,
                duration_ms INTEGER NOT NULL,
                status TEXT NOT NULL,
                cost_estimated_usd REAL,
                metadata TEXT NOT NULL,
                ts TEXT NOT NULL,
                source_file TEXT NOT NULL,
                line_number INTEGER NOT NULL,
                ingested_at TEXT NOT NULL
            )
            """,
            """
            CREATE UNIQUE INDEX IF NOT EXISTS idx_telemetry_source
                ON telemetry_events (source_file, line_number)
            """,
            """
            CREATE INDEX IF NOT EXISTS idx_telemetry_ts
                ON telemetry_events (ts)
            """,
        ),
    ),
    Migration(
        version=5,
        description="add policy overrides table",
        statements=(
            """
            CREATE TABLE IF NOT EXISTS policy_overrides (
                id TEXT PRIMARY KEY,
                route TEXT NOT NULL,
                project TEXT NOT NULL,
                template_id TEXT NOT NULL,
                max_latency_ms INTEGER,
                max_cost_usd REAL,
                require_manual_approval INTEGER NOT NULL DEFAULT 0,
                notes TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """,
            """
            CREATE INDEX IF NOT EXISTS idx_policy_overrides_route_project
                ON policy_overrides (route, project)
            """,
        ),
    ),
    Migration(
        version=6,
        description="track policy deployment history",
        statements=(
            """
            CREATE TABLE IF NOT EXISTS policy_deployments (
                id TEXT PRIMARY KEY,
                template_id TEXT NOT NULL,
                deployed_at TEXT NOT NULL,
                author TEXT NOT NULL,
                window TEXT,
                note TEXT,
                slo_p95_ms INTEGER NOT NULL,
                budget_usage_pct INTEGER NOT NULL,
                incidents_count INTEGER NOT NULL,
                guardrail_score INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """,
            """
            CREATE INDEX IF NOT EXISTS idx_policy_deployments_deployed_at
                ON policy_deployments (deployed_at)
            """,
            """
            INSERT OR IGNORE INTO policy_deployments (
                id,
                template_id,
                deployed_at,
                author,
                window,
                note,
                slo_p95_ms,
                budget_usage_pct,
                incidents_count,
                guardrail_score,
                created_at,
                updated_at
            ) VALUES
                (
                    'deploy-economy-20250201',
                    'economy',
                    '2025-02-01T12:00:00+00:00',
                    'FinOps Squad',
                    'Canário 5% → 20%',
                    'Piloto para squads orientados a custo.',
                    857,
                    66,
                    2,
                    78,
                    '2025-02-01T12:00:00+00:00',
                    '2025-02-01T12:00:00+00:00'
                ),
                (
                    'deploy-balanced-20250415',
                    'balanced',
                    '2025-04-15T09:30:00+00:00',
                    'Console MCP',
                    'GA progressivo',
                    'Promoção Q2 liberada para toda a frota.',
                    985,
                    80,
                    0,
                    70,
                    '2025-04-15T09:30:00+00:00',
                    '2025-04-15T09:30:00+00:00'
                )
            """,
        ),
    ),
    Migration(
        version=7,
        description="store configuration change plans",
        statements=(
            """
            CREATE TABLE IF NOT EXISTS change_plans (
                id TEXT PRIMARY KEY,
                plan_id TEXT NOT NULL,
                actor TEXT NOT NULL,
                mode TEXT NOT NULL,
                status TEXT NOT NULL,
                branch TEXT,
                commit_sha TEXT,
                diff_stat TEXT NOT NULL,
                diff_patch TEXT NOT NULL,
                risks TEXT NOT NULL DEFAULT '[]',
                metadata TEXT NOT NULL DEFAULT '{}',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """,
            """
            CREATE INDEX IF NOT EXISTS idx_change_plans_plan
                ON change_plans (plan_id)
            """,
            """
            CREATE INDEX IF NOT EXISTS idx_change_plans_created_at
                ON change_plans (created_at)
            """,
        ),
    ),
    Migration(
        version=8,
        description="add rbac and audit tables",
        statements=(
            """
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                email TEXT,
                api_token_hash TEXT NOT NULL UNIQUE,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """,
            """
            CREATE TABLE IF NOT EXISTS roles (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL UNIQUE,
                description TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """,
            """
            CREATE TABLE IF NOT EXISTS user_roles (
                user_id TEXT NOT NULL,
                role_id TEXT NOT NULL,
                assigned_at TEXT NOT NULL,
                assigned_by TEXT,
                PRIMARY KEY (user_id, role_id),
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
            )
            """,
            """
            CREATE TABLE IF NOT EXISTS audit_events (
                id TEXT PRIMARY KEY,
                actor_id TEXT,
                actor_name TEXT,
                actor_roles TEXT NOT NULL,
                action TEXT NOT NULL,
                resource TEXT NOT NULL,
                status TEXT NOT NULL,
                plan_id TEXT,
                metadata TEXT NOT NULL DEFAULT '{}',
                created_at TEXT NOT NULL
            )
            """,
            """
            CREATE INDEX IF NOT EXISTS idx_audit_events_plan_id
                ON audit_events (plan_id)
            """,
            """
            CREATE INDEX IF NOT EXISTS idx_audit_events_created_at
                ON audit_events (created_at)
            """,
            """
            CREATE TABLE IF NOT EXISTS approvals (
                id TEXT PRIMARY KEY,
                plan_id TEXT NOT NULL,
                change_record_id TEXT NOT NULL,
                requester_id TEXT NOT NULL,
                status TEXT NOT NULL,
                approver_id TEXT,
                decided_at TEXT,
                reason TEXT,
                payload TEXT NOT NULL DEFAULT '{}',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """,
            """
            CREATE INDEX IF NOT EXISTS idx_approvals_plan_id
                ON approvals (plan_id)
            """,
            """
            CREATE INDEX IF NOT EXISTS idx_approvals_created_at
                ON approvals (created_at)
            """,
            """
            INSERT OR IGNORE INTO roles (id, name, description, created_at, updated_at)
            VALUES
                (
                    'role-viewer',
                    'viewer',
                    'Acesso somente leitura aos planos de configuração',
                    strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
                    strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
                ),
                (
                    'role-planner',
                    'planner',
                    'Pode gerar planos e solicitar execuções',
                    strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
                    strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
                ),
                (
                    'role-approver',
                    'approver',
                    'Aprova execuções HITL de planos',
                    strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
                    strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
            )
            """,
        ),
    ),
    Migration(
        version=9,
        description="track langgraph flow versions",
        statements=(
            """
            CREATE TABLE IF NOT EXISTS flow_versions (
                id TEXT PRIMARY KEY,
                flow_id TEXT NOT NULL,
                version INTEGER NOT NULL,
                graph TEXT NOT NULL,
                agent_code TEXT NOT NULL,
                hitl_checkpoints TEXT NOT NULL DEFAULT '[]',
                comment TEXT,
                created_at TEXT NOT NULL,
                created_by TEXT,
                diff TEXT,
                UNIQUE(flow_id, version)
            )
            """,
            """
            CREATE INDEX IF NOT EXISTS idx_flow_versions_flow
                ON flow_versions (flow_id, version)
            """,
            """
            CREATE INDEX IF NOT EXISTS idx_flow_versions_created
                ON flow_versions (created_at)
            """,
        ),
    ),
    Migration(
        version=10,
        description="add marketplace entries catalog",
        statements=(
            """
            CREATE TABLE IF NOT EXISTS marketplace_entries (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                slug TEXT NOT NULL,
                summary TEXT NOT NULL,
                description TEXT,
                origin TEXT NOT NULL,
                rating REAL NOT NULL DEFAULT 0,
                cost REAL NOT NULL DEFAULT 0,
                tags TEXT NOT NULL DEFAULT '[]',
                capabilities TEXT NOT NULL DEFAULT '[]',
                repository_url TEXT,
                package_path TEXT NOT NULL,
                manifest_filename TEXT NOT NULL DEFAULT 'agent.yaml',
                entrypoint_filename TEXT,
                target_repository TEXT NOT NULL DEFAULT 'agents-hub',
                signature TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """,
            """
            CREATE UNIQUE INDEX IF NOT EXISTS idx_marketplace_entries_slug
                ON marketplace_entries (slug)
            """,
            """
            CREATE INDEX IF NOT EXISTS idx_marketplace_entries_origin
                ON marketplace_entries (origin)
            """,
        ),
    ),
    Migration(
        version=11,
        description="add experiment metadata to telemetry events",
        statements=(
            """
            ALTER TABLE telemetry_events ADD COLUMN experiment_cohort TEXT
            """,
            """
            ALTER TABLE telemetry_events ADD COLUMN experiment_tag TEXT
            """,
            """
            CREATE INDEX IF NOT EXISTS idx_telemetry_experiment
                ON telemetry_events (experiment_cohort, experiment_tag)
            """,
        ),
    ),
    Migration(
        version=12,
        description="store observability provider preferences",
        statements=(
            """
            CREATE TABLE IF NOT EXISTS observability_preferences (
                key TEXT PRIMARY KEY,
                provider TEXT NOT NULL,
                config TEXT NOT NULL DEFAULT '{}',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """,
            """
            CREATE INDEX IF NOT EXISTS idx_observability_preferences_updated_at
                ON observability_preferences (updated_at)
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
