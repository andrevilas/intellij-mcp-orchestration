"""Application entrypoints for running the Console MCP Server prototype."""

from __future__ import annotations

import logging
from typing import Any

import uvicorn
from fastapi import FastAPI

from .routes import router as api_router

logger = logging.getLogger("console_mcp_server")

app = FastAPI(
    title="Console MCP Server",
    description="Prototype API surface for orchestrating MCP providers",
    version="0.1.0",
)
app.include_router(api_router)


@app.on_event("startup")
async def startup_event() -> None:
    logger.info("Console MCP Server prototype starting up")


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
