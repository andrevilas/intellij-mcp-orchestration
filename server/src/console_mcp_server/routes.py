"""API route declarations for the Console MCP Server prototype."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Response, status

from .registry import provider_registry, session_registry
from .schemas import (
    HealthStatus,
    MCPServerCreateRequest,
    MCPServerResponse,
    MCPServerUpdateRequest,
    MCPServersResponse,
    ProvidersResponse,
    SecretMetadataResponse,
    SecretValueResponse,
    SecretWriteRequest,
    SecretsResponse,
    SessionCreateRequest,
    SessionResponse,
    SessionsResponse,
)
from .secrets import secret_store
from .servers import (
    MCPServerAlreadyExistsError,
    MCPServerNotFoundError,
    create_server,
    delete_server,
    get_server,
    list_servers,
    update_server,
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


@router.get("/secrets", response_model=SecretsResponse)
def list_secrets() -> SecretsResponse:
    """Expose metadata about the stored secrets without revealing values."""

    metadata = [
        SecretMetadataResponse(
            provider_id=item.provider_id,
            has_secret=item.has_secret,
            updated_at=item.updated_at,
        )
        for item in secret_store.list()
    ]
    return SecretsResponse(secrets=metadata)


@router.get("/secrets/{provider_id}", response_model=SecretValueResponse)
def read_secret(provider_id: str) -> SecretValueResponse:
    """Return the stored secret for a provider, if present."""

    try:
        record = secret_store.get(provider_id)
    except KeyError as exc:  # pragma: no cover - FastAPI handles the response
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Secret for provider '{provider_id}' not found",
        ) from exc
    return SecretValueResponse(**record.model_dump())


@router.put("/secrets/{provider_id}", response_model=SecretValueResponse)
def upsert_secret(provider_id: str, payload: SecretWriteRequest) -> SecretValueResponse:
    """Store or update the secret associated with a provider."""

    record = secret_store.upsert(provider_id, payload.value)
    return SecretValueResponse(**record.model_dump())


@router.delete("/secrets/{provider_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_secret(provider_id: str) -> Response:
    """Remove the stored secret for a provider."""

    try:
        secret_store.delete(provider_id)
    except KeyError as exc:  # pragma: no cover - FastAPI handles the response
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Secret for provider '{provider_id}' not found",
        ) from exc
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/servers", response_model=MCPServersResponse)
def list_mcp_servers() -> MCPServersResponse:
    """Return the MCP servers registered with the console."""

    records = [MCPServerResponse(**record.to_dict()) for record in list_servers()]
    return MCPServersResponse(servers=records)


@router.post("/servers", response_model=MCPServerResponse, status_code=status.HTTP_201_CREATED)
def create_mcp_server(payload: MCPServerCreateRequest) -> MCPServerResponse:
    """Persist a new MCP server definition."""

    try:
        record = create_server(
            server_id=payload.id,
            name=payload.name,
            command=payload.command,
            description=payload.description,
            tags=payload.tags,
            capabilities=payload.capabilities,
            transport=payload.transport,
        )
    except MCPServerAlreadyExistsError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Server '{payload.id}' already exists",
        ) from exc
    return MCPServerResponse(**record.to_dict())


@router.get("/servers/{server_id}", response_model=MCPServerResponse)
def read_mcp_server(server_id: str) -> MCPServerResponse:
    """Return a single MCP server."""

    try:
        record = get_server(server_id)
    except MCPServerNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Server '{server_id}' not found",
        ) from exc
    return MCPServerResponse(**record.to_dict())


@router.put("/servers/{server_id}", response_model=MCPServerResponse)
def update_mcp_server(server_id: str, payload: MCPServerUpdateRequest) -> MCPServerResponse:
    """Update an existing MCP server definition."""

    try:
        record = update_server(
            server_id,
            name=payload.name,
            command=payload.command,
            description=payload.description,
            tags=payload.tags,
            capabilities=payload.capabilities,
            transport=payload.transport,
        )
    except MCPServerNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Server '{server_id}' not found",
        ) from exc
    return MCPServerResponse(**record.to_dict())


@router.delete("/servers/{server_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_mcp_server(server_id: str) -> Response:
    """Remove an MCP server from the catalog."""

    try:
        delete_server(server_id)
    except MCPServerNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Server '{server_id}' not found",
        ) from exc
    return Response(status_code=status.HTTP_204_NO_CONTENT)
