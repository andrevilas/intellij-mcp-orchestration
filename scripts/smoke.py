#!/usr/bin/env python3
"""Lightweight smoke test for the agents hub FastAPI service."""

from __future__ import annotations

import os
import signal
import subprocess
import sys
import time
import tempfile
import shutil
import re
from uuid import uuid4
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1]
APP_DIR = ROOT / "agents-hub"
HOST = os.environ.get("SMOKE_HOST", "127.0.0.1")
PORT = int(os.environ.get("SMOKE_PORT", "8765"))
BASE_URL = f"http://{HOST}:{PORT}"

sys.path.insert(0, str(ROOT / "server" / "src"))
from console_mcp_server.config_assistant.renderers import (  # type: ignore  # noqa: E402
    render_agent_manifest,
    render_agent_module,
    render_mcp_registry_entry,
)


def _slugify(value: str) -> str:
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", value).strip("-")
    return slug.casefold() or "agent"


def _copy_workspace(destination: Path) -> Path:
    target = destination / "agents-hub"
    if target.exists():
        shutil.rmtree(target)
    shutil.copytree(
        APP_DIR,
        target,
        dirs_exist_ok=False,
        ignore=shutil.ignore_patterns("__pycache__", "*.pyc", "*.pyo", "*.log"),
    )
    return target


def _scaffold_agent(app_root: Path) -> str:
    agent_name = f"smoke-onboard-{uuid4().hex[:8]}"
    slug = _slugify(agent_name)
    agents_root = app_root / "app" / "agents"
    agent_dir = agents_root / slug
    agent_dir.mkdir(parents=True, exist_ok=True)
    (agent_dir / "__init__.py").write_text("", encoding="utf-8")

    manifest = render_agent_manifest(agent_name)
    module = render_agent_module(agent_name)
    registry_entry = render_mcp_registry_entry(
        agent_name,
        server_id="console-mcp-server",
        repository="agents-hub",
    )

    (agent_dir / "agent.yaml").write_text(manifest, encoding="utf-8")
    (agent_dir / "agent.py").write_text(module, encoding="utf-8")
    (app_root / "mcp-registry.yaml").write_text(registry_entry, encoding="utf-8")

    return slug


def wait_for_service(client: httpx.Client, timeout: float = 30.0) -> None:
    """Poll the health endpoint until the application becomes responsive."""

    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            response = client.get("/health", timeout=2.0)
            if response.status_code == 200:
                return
        except httpx.HTTPError:
            time.sleep(0.5)
        else:
            time.sleep(0.5)
    raise RuntimeError("Service did not become ready before timeout")


def run_smoke() -> None:
    with tempfile.TemporaryDirectory(prefix="agents-hub-smoke-") as workspace:
        app_root = _copy_workspace(Path(workspace))
        new_agent = _scaffold_agent(app_root)

        command = [
            sys.executable,
            "-m",
            "uvicorn",
            "app.main:app",
            "--host",
            HOST,
            "--port",
            str(PORT),
        ]
        env = os.environ.copy()
        env["AGENTS_ROOT"] = str((app_root / "app" / "agents").resolve())

        process = subprocess.Popen(
            command,
            cwd=str(app_root),
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            env=env,
        )

        try:
            with httpx.Client(base_url=BASE_URL) as client:
                wait_for_service(client)
                health = client.get("/health", timeout=5.0)
                health.raise_for_status()
                agents = client.get("/agents", timeout=5.0)
                agents.raise_for_status()
                agent_names = [item["name"] for item in agents.json().get("agents", [])]
                if new_agent not in agent_names:
                    raise RuntimeError(f"Onboarded agent '{new_agent}' not present in registry")

                detail = client.get(f"/agents/{new_agent}", timeout=5.0)
                detail.raise_for_status()

                invocation = client.post(
                    f"/agents/{new_agent}/invoke",
                    json={"input": {"topic": "Smoke test", "context": "onboarding"}},
                    timeout=10.0,
                )
                invocation.raise_for_status()
                payload = invocation.json()
                result = payload.get("result", {})
                if result.get("status") != "ok":
                    raise RuntimeError(f"Unexpected invocation payload: {payload!r}")

                print("/health:", health.json())
                print("/agents count:", len(agent_names))
                print(f"Validated onboarded agent '{new_agent}' via invoke endpoint")
        finally:
            process.send_signal(signal.SIGTERM)
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=5)

            if process.stdout is not None:
                output = process.stdout.read()
                if output.strip():
                    print(output)

        if process.returncode not in (0, -signal.SIGTERM):
            raise SystemExit(process.returncode or 1)


if __name__ == "__main__":
    run_smoke()
