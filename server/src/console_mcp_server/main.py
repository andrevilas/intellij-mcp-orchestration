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

logger = logging.getLogger("console_mcp_server")

DEFAULT_CORS_ORIGINS = ["http://127.0.0.1:5173", "http://localhost:5173"]
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


@app.on_event("startup")
async def startup_event() -> None:
    bootstrap_database()
    logger.info("Console MCP Server prototype starting up (db=%s)", database_path())


@app.on_event("shutdown")
async def shutdown_event() -> None:
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

    uvicorn.run("console_mcp_server.main:app", host="0.0.0.0", port=8000, factory=False)


def run_dev() -> None:
    """Developer friendly entrypoint with auto-reload enabled."""

    uvicorn.run(
        "console_mcp_server.main:app",
        host="127.0.0.1",
        port=8000,
        reload=True,
        factory=False,
    )


__all__ = ["app", "run", "run_dev"]
