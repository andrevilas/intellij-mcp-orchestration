"""Application entrypoints for running the Console MCP Server prototype."""

from __future__ import annotations

import logging
import os
from typing import Any

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .database import bootstrap_database, database_path
from .routes import router as api_router
from .supervisor import process_supervisor
from .security import AuditLogger, RBACMiddleware

logger = logging.getLogger("console_mcp_server")

SERVER_HOST_ENV_VAR = "CONSOLE_MCP_SERVER_HOST"
SERVER_PORT_ENV_VAR = "CONSOLE_MCP_SERVER_PORT"
FRONTEND_HOST_ENV_VAR = "CONSOLE_MCP_FRONTEND_HOST"
FRONTEND_PORT_ENV_VAR = "CONSOLE_MCP_FRONTEND_PORT"


def _read_port(env_var: str, default: int, *, strict: bool) -> int:
    raw_value = os.getenv(env_var)
    if not raw_value:
        return default

    try:
        value = int(raw_value)
    except ValueError as exc:  # pragma: no cover - defensive, exercised via integration
        if strict:
            raise ValueError(
                f"Invalid value for {env_var!s}: {raw_value!r} (expected integer port)"
            ) from exc
        logger.warning(
            "Ignoring invalid value for %s: %r (expected integer port)",
            env_var,
            raw_value,
        )
        return default

    if not (0 <= value <= 65535):
        if strict:
            raise ValueError(
                f"Invalid value for {env_var!s}: {value!r} (expected 0-65535)"
            )
        logger.warning(
            "Ignoring out-of-range value for %s: %r (expected 0-65535)",
            env_var,
            raw_value,
        )
        return default

    return value


def _default_frontend_host() -> str:
    return os.getenv(FRONTEND_HOST_ENV_VAR, "127.0.0.1")


def _default_frontend_port() -> int:
    return _read_port(FRONTEND_PORT_ENV_VAR, 5173, strict=False)


def _normalize_browser_host(host: str) -> str:
    return "127.0.0.1" if host in {"0.0.0.0", "::"} else host


def _default_cors_origins() -> list[str]:
    frontend_host = _normalize_browser_host(_default_frontend_host())
    frontend_port = _default_frontend_port()

    origins = {
        f"http://{frontend_host}:{frontend_port}",
    }

    if frontend_host == "127.0.0.1":
        origins.add(f"http://localhost:{frontend_port}")
    if frontend_host == "localhost":
        origins.add(f"http://127.0.0.1:{frontend_port}")

    return sorted(origins)


DEFAULT_CORS_ORIGINS = _default_cors_origins()
CORS_ENV_VAR = "CONSOLE_MCP_CORS_ORIGINS"

app = FastAPI(
    title="Console MCP Server",
    description="Prototype API surface for orchestrating MCP providers",
    version="0.1.0",
)
app.include_router(api_router)

cors_origins_raw = os.getenv(CORS_ENV_VAR)
cors_origins = (
    [origin.strip() for origin in cors_origins_raw.split(",") if origin.strip()]
    if cors_origins_raw
    else DEFAULT_CORS_ORIGINS
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_AUDIT_LOGGER = AuditLogger()
app.add_middleware(RBACMiddleware, audit_logger=_AUDIT_LOGGER)


@app.on_event("startup")
async def startup_event() -> None:
    bootstrap_database()
    logger.info("Console MCP Server prototype starting up (db=%s)", database_path())


@app.on_event("shutdown")
async def shutdown_event() -> None:
    process_supervisor.stop_all()
    process_supervisor.prune(only_finished=False)
    logger.info("Console MCP Server prototype shutting down")


@app.get("/", tags=["console"])
async def root() -> dict[str, Any]:
    return {
        "message": "Console MCP Server prototype is running",
        "docs_url": "/docs",
        "health": "/api/v1/healthz",
    }


def run() -> None:
    """Production oriented entrypoint (host/port configurable via env)."""
    host = os.getenv(SERVER_HOST_ENV_VAR, "0.0.0.0")
    port = _read_port(SERVER_PORT_ENV_VAR, 8000, strict=True)

    uvicorn.run("console_mcp_server.main:app", host=host, port=port, factory=False)


def run_dev() -> None:
    """Developer friendly entrypoint with auto-reload enabled."""
    host = os.getenv(SERVER_HOST_ENV_VAR, "127.0.0.1")
    port = _read_port(SERVER_PORT_ENV_VAR, 8000, strict=True)
    uvicorn.run(
        "console_mcp_server.main:app",
        host=host,
        port=port,
        reload=True,
        factory=False,
    )


__all__ = ["app", "run", "run_dev"]
