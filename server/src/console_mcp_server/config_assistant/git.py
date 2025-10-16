"""Lightweight helpers for summarising repository changes in plans."""

from __future__ import annotations

from pathlib import Path

from ..schemas_plan import DiffSummary


def normalize_repo_path(path: str | Path) -> str:
    """Return a normalized repository path string."""

    return str(Path(path).as_posix())


def create_diff(path: str | Path, summary: str, change_type: str = "update") -> DiffSummary:
    """Convenience helper to create :class:`DiffSummary` instances."""

    normalized = normalize_repo_path(path)
    return DiffSummary(path=normalized, summary=summary, change_type=change_type)
