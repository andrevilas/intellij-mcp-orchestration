"""Pydantic schemas exposed by the Console MCP Server prototype."""

from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field

from .config import ProviderConfig


class HealthStatus(BaseModel):
    status: str = Field(default="ok")
    timestamp: datetime = Field(default_factory=lambda: datetime.now().astimezone())
    version: str = Field(default="0.1.0")


class ProviderSummary(ProviderConfig):
    """Summary view returned for list endpoints."""

    is_available: bool = Field(default=True, description="Indicates if the provider is ready to use")


class SessionCreateRequest(BaseModel):
    """Payload for provisioning a logical MCP session."""

    reason: Optional[str] = Field(
        default=None, description="Optional reason that triggered the session creation"
    )
    client: Optional[str] = Field(
        default=None, description="Client identifier (ex.: vscode, intellij)"
    )


class Session(BaseModel):
    """In-memory session metadata returned to the Console UI."""

    id: str
    provider_id: str
    created_at: datetime
    status: str = Field(default="pending")
    reason: Optional[str] = None
    client: Optional[str] = None


class SessionResponse(BaseModel):
    session: Session
    provider: ProviderSummary


class ProvidersResponse(BaseModel):
    providers: List[ProviderSummary]


class SessionsResponse(BaseModel):
    sessions: List[Session]


class SecretWriteRequest(BaseModel):
    """Payload used to store or update a provider secret."""

    value: str = Field(..., min_length=1, max_length=8192, description="Opaque secret material")


class SecretMetadataResponse(BaseModel):
    """Response envelope exposing secret metadata."""

    provider_id: str
    has_secret: bool
    updated_at: Optional[datetime] = None


class SecretsResponse(BaseModel):
    secrets: List[SecretMetadataResponse]


class SecretValueResponse(BaseModel):
    provider_id: str
    value: str
    updated_at: datetime


class MCPServerWriteRequest(BaseModel):
    """Shared attributes required when creating or updating an MCP server."""

    name: str = Field(..., min_length=1, max_length=256)
    command: str = Field(..., min_length=1, max_length=1024)
    description: Optional[str] = Field(
        default=None, max_length=1024, description="Optional human friendly summary"
    )
    tags: List[str] = Field(default_factory=list)
    capabilities: List[str] = Field(default_factory=list)
    transport: str = Field(default="stdio", min_length=1, max_length=64)


class MCPServerCreateRequest(MCPServerWriteRequest):
    """Payload used when registering a new MCP server in the console."""

    id: str = Field(..., min_length=1, max_length=128)


class MCPServerUpdateRequest(MCPServerWriteRequest):
    """Payload used to update an existing MCP server."""


class MCPServerResponse(MCPServerWriteRequest):
    """Full representation of a persisted MCP server."""

    id: str
    created_at: datetime
    updated_at: datetime


class MCPServersResponse(BaseModel):
    """Envelope returned when listing all MCP servers."""

    servers: List[MCPServerResponse]
