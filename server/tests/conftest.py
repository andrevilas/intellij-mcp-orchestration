from __future__ import annotations

import importlib
import sys
import types
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

try:  # pragma: no cover - best effort to use real GitPython
    import git  # type: ignore
    import git.exc  # type: ignore
except ImportError:  # pragma: no cover - fallback stub for hermetic environments
    git_stub = types.ModuleType("git")
    git_exc_stub = types.ModuleType("git.exc")

    class _GitCommandError(Exception):
        ...

    class _InvalidGitRepositoryError(Exception):
        ...

    class _Actor:
        def __init__(self, name: str, email: str) -> None:
            self.name = name
            self.email = email

    class _Repo:
        def __init__(self, *_: object, **__: object) -> None:
            pass

        def is_dirty(self, **_: object) -> bool:
            return False

        @classmethod
        def init(cls, *_: object, **__: object) -> "_Repo":
            return cls()

        @property
        def index(self):  # pragma: no cover - minimal stub
            return self

        def commit(self, *_: object, **__: object):
            class _Commit:
                hexsha = "deadbeef"

            return _Commit()

        @property
        def git(self):
            class _Git:
                def checkout(self, *args: object, **kwargs: object) -> None:  # pragma: no cover
                    return None

                def apply(self, *args: object, **kwargs: object) -> str:  # pragma: no cover
                    return ""

                def add(self, *args: object, **kwargs: object) -> None:  # pragma: no cover
                    return None

                def diff(self, *args: object, **kwargs: object) -> str:  # pragma: no cover
                    return ""

                def branch(self, *args: object, **kwargs: object) -> None:  # pragma: no cover
                    return None

                def push(self, *args: object, **kwargs: object) -> None:  # pragma: no cover
                    return None

            return _Git()

        @property
        def heads(self):  # pragma: no cover - minimal stub
            return []

        @property
        def active_branch(self):  # pragma: no cover
            class _Branch:
                name = "main"

            return _Branch()

    git_stub.Actor = _Actor
    git_stub.GitCommandError = _GitCommandError
    git_stub.Repo = _Repo
    git_stub.exc = git_exc_stub
    git_exc_stub.InvalidGitRepositoryError = _InvalidGitRepositoryError
    git_exc_stub.GitCommandError = _GitCommandError

    sys.modules.setdefault("git", git_stub)
    sys.modules.setdefault("git.exc", git_exc_stub)

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
            experiment_cohort="canary",
            experiment_tag="prompt-v2",
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
            experiment_cohort="canary",
            experiment_tag="prompt-v2",
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
            experiment_cohort="baseline",
            experiment_tag="route-a",
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
            experiment_cohort="baseline",
            experiment_tag="route-a",
        ),
    ]

    seed_telemetry_events(engine, events)
    return events
