"""API route declarations for the Console MCP Server prototype."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from .registry import provider_registry, session_registry
from .schemas import (
    HealthStatus,
    ProvidersResponse,
    SessionCreateRequest,
    SessionResponse,
    SessionsResponse,
)

router = APIRouter(prefix="/api/v1", tags=["console"])


@router.get("/healthz", response_model=HealthStatus)
def read_health() -> HealthStatus:
    """Return an instantaneous health snapshot."""

    return HealthStatus()


@router.get("/providers", response_model=ProvidersResponse)
def list_providers() -> ProvidersResponse:
    """List the configured MCP providers available to the console."""

    return ProvidersResponse(providers=provider_registry.providers)


@router.post("/providers/{provider_id}/sessions", response_model=SessionResponse)
def create_session(provider_id: str, payload: SessionCreateRequest | None = None) -> SessionResponse:
    """Provision an in-memory session for a given provider."""

    try:
        provider = provider_registry.get(provider_id)
    except KeyError as exc:  # pragma: no cover - FastAPI handles the response
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=f"Provider '{provider_id}' not found"
        ) from exc

    session = session_registry.create(
        provider_id=provider_id,
        reason=payload.reason if payload else None,
        client=payload.client if payload else None,
    )
    return SessionResponse(session=session, provider=provider)


@router.get("/sessions", response_model=SessionsResponse)
def list_sessions() -> SessionsResponse:
    """Return all in-memory sessions provisioned during the process lifetime."""

    return SessionsResponse(sessions=session_registry.list())
