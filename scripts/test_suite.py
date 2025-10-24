#!/usr/bin/env python3
"""Unified test runner combining pnpm and pytest suites."""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PNPM = os.environ.get("PNPM", "pnpm")
PYTHON = os.environ.get("PYTHON", sys.executable)


def _print_heading(title: str) -> None:
    bar = "=" * len(title)
    print(f"\n{title}\n{bar}")


def _run(command: list[str], *, cwd: Path | None = None, env: dict[str, str] | None = None) -> None:
    location = cwd if cwd is not None else ROOT
    merged_env = os.environ.copy()
    if env:
        merged_env.update(env)
    _print_heading(f"Running {' '.join(command)} (cwd={location})")
    subprocess.run(command, check=True, cwd=location, env=merged_env)


def _is_truthy(value: str | None) -> bool:
    if value is None:
        return False
    return value.lower() in {"1", "true", "yes", "on"}


def main() -> None:
    skip_frontend = _is_truthy(os.environ.get("SKIP_FRONTEND_TESTS"))
    if skip_frontend:
        print("\nSkipping pnpm --dir app test (SKIP_FRONTEND_TESTS set)")
    else:
        _run([PNPM, "--dir", "app", "test"])
    _run([PYTHON, "-m", "pytest"], cwd=ROOT / "server")
    _run([PYTHON, "-m", "pytest"], cwd=ROOT / "agents-hub")


if __name__ == "__main__":
    main()
