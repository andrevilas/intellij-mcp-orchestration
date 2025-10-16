"""Application entrypoint for the agents-hub FastAPI service."""

from __future__ import annotations

import asyncio
from typing import Any

import uvicorn
from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from logging import Logger, LoggerAdapter

from .config import Settings, get_settings
from .errors import AgentExecutionError, AgentNotFoundError, ValidationError, error_response
from .logging_config import configure_logging
from .middleware import APIKeyMiddleware, LoggingMiddleware, RequestIdMiddleware
from .registry import AgentRegistry
from .schemas.invoke import ConfigMetadata, InvokeRequest
from .schemas.responses import AgentDetailResponse, AgentListResponse, AgentMetadata

settings = get_settings()
logger = configure_logging(settings)
registry = AgentRegistry(root=settings.agents_root, logger=logger)


def provide_settings() -> Settings:
    """Dependency returning the cached settings instance."""

    return settings


def get_registry(request: Request) -> AgentRegistry:
    """Dependency returning the process-wide registry instance."""

    return request.app.state.registry


def get_request_logger(request: Request) -> LoggerAdapter | Logger:
    """Return the logger bound to the current request."""

    return getattr(request.state, "logger", logger)


app = FastAPI(
    title=settings.app_title,
    description=settings.app_description,
    version=settings.app_version,
    dependencies=[Depends(provide_settings)],
)

origins = settings.allowed_origins or ["*"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_middleware(RequestIdMiddleware)
app.add_middleware(LoggingMiddleware, logger=logger)
if settings.api_key:
    app.add_middleware(APIKeyMiddleware, settings=settings)

app.state.settings = settings
app.state.logger = logger
app.state.registry = registry


@app.exception_handler(AgentNotFoundError)
async def handle_not_found(_: Request, exc: AgentNotFoundError) -> JSONResponse:
    return JSONResponse(status_code=404, content=error_response(exc))


@app.exception_handler(ValidationError)
async def handle_validation(_: Request, exc: ValidationError) -> JSONResponse:
    return JSONResponse(status_code=400, content=error_response(exc))


@app.exception_handler(AgentExecutionError)
async def handle_execution(_: Request, exc: AgentExecutionError) -> JSONResponse:
    return JSONResponse(status_code=500, content=error_response(exc))


@app.get("/health", tags=["health"])
async def healthcheck() -> dict[str, bool]:
    """Simple health endpoint for monitoring."""

    return {"ok": True}


@app.get("/agents", response_model=AgentListResponse)
async def list_agents(registry: AgentRegistry = Depends(get_registry)) -> AgentListResponse:
    manifests = registry.list_agents()
    metadata = [AgentMetadata.from_manifest(manifest) for manifest in manifests]
    return AgentListResponse(agents=metadata)


@app.get("/agents/{name}", response_model=AgentDetailResponse)
async def get_agent(name: str, registry: AgentRegistry = Depends(get_registry)) -> AgentDetailResponse:
    manifest = registry.get_metadata(name)
    metadata = AgentMetadata.from_manifest(manifest)
    return AgentDetailResponse(agent=metadata)


@app.post("/agents/{name}/invoke", response_model=None)
async def invoke_agent(
    name: str,
    invoke_request: InvokeRequest,
    http_request: Request,
    registry: AgentRegistry = Depends(get_registry),
    settings: Settings = Depends(provide_settings),
    logger=Depends(get_request_logger),
) -> Any:
    request_id_value = getattr(http_request.state, "request_id", None)
    if invoke_request.config and request_id_value:
        if invoke_request.config.metadata is None:
            invoke_request.config.metadata = ConfigMetadata(request_id=request_id_value)
        else:
            invoke_request.config.metadata.request_id = request_id_value

    payload = invoke_request.input or {}
    config = invoke_request.config.model_dump(mode="json", by_alias=True, exclude_none=True)

    try:
        async with asyncio.timeout(settings.request_timeout):
            result = await registry.invoke(name, payload, config)
    except asyncio.TimeoutError:
        message = f"Agent '{name}' invocation timed out"
        logger.warning(
            "agent.invoke.timeout",
            extra={"agent": name, "timeout": settings.request_timeout},
        )
        return JSONResponse(status_code=504, content=error_response(Exception(message)))

    return {"result": result}


@app.post("/reload")
async def reload_agents(
    registry: AgentRegistry = Depends(get_registry),
) -> dict[str, Any]:
    registry.reload()
    manifests = registry.list_agents()
    return {
        "status": "reloaded",
        "agents": [manifest.name for manifest in manifests],
        "count": len(manifests),
    }


if __name__ == "__main__":
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=False)
