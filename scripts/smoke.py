#!/usr/bin/env python3
"""Lightweight smoke test for the agents hub FastAPI service."""

from __future__ import annotations

import os
import signal
import subprocess
import sys
import time
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1]
APP_DIR = ROOT / "agents-hub"
HOST = os.environ.get("SMOKE_HOST", "127.0.0.1")
PORT = int(os.environ.get("SMOKE_PORT", "8765"))
BASE_URL = f"http://{HOST}:{PORT}"


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
    process = subprocess.Popen(
        command,
        cwd=str(APP_DIR),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )

    try:
        with httpx.Client(base_url=BASE_URL) as client:
            wait_for_service(client)
            health = client.get("/health", timeout=5.0)
            health.raise_for_status()
            agents = client.get("/agents", timeout=5.0)
            agents.raise_for_status()
            print("/health:", health.json())
            print("/agents:", agents.json())
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
