"""Pydantic schemas exposed by the Console MCP Server prototype."""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import List, Literal, Optional

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


class CostPolicyWriteRequest(BaseModel):
    """Shared attributes required when creating or updating a cost policy."""

    name: str = Field(..., min_length=1, max_length=256)
    description: Optional[str] = Field(
        default=None, max_length=1024, description="Optional human friendly summary"
    )
    monthly_spend_limit: float = Field(..., ge=0.0, description="Monthly spend ceiling in currency units")
    currency: str = Field(default="USD", min_length=1, max_length=8)
    tags: List[str] = Field(default_factory=list)


class CostPolicyCreateRequest(CostPolicyWriteRequest):
    """Payload used when registering a new cost policy."""

    id: str = Field(..., min_length=1, max_length=128)


class CostPolicyUpdateRequest(CostPolicyWriteRequest):
    """Payload used to update an existing cost policy."""


class CostPolicyResponse(CostPolicyWriteRequest):
    """Full representation of a persisted cost policy."""

    id: str
    created_at: datetime
    updated_at: datetime


class CostPoliciesResponse(BaseModel):
    """Envelope returned when listing all cost policies."""

    policies: List[CostPolicyResponse]


class PriceEntryWriteRequest(BaseModel):
    """Shared attributes required when creating or updating a price table entry."""

    provider_id: str = Field(..., min_length=1, max_length=128)
    model: str = Field(..., min_length=1, max_length=256)
    currency: str = Field(default="USD", min_length=1, max_length=8)
    unit: str = Field(default="tokens", min_length=1, max_length=64)
    input_cost_per_1k: Optional[float] = Field(default=None, ge=0.0)
    output_cost_per_1k: Optional[float] = Field(default=None, ge=0.0)
    embedding_cost_per_1k: Optional[float] = Field(default=None, ge=0.0)
    tags: List[str] = Field(default_factory=list)
    notes: Optional[str] = Field(default=None, max_length=1024)
    effective_at: Optional[datetime] = Field(
        default=None, description="Timestamp indicating when the price becomes effective"
    )


class PriceEntryCreateRequest(PriceEntryWriteRequest):
    """Payload used when registering a new price table entry."""

    id: str = Field(..., min_length=1, max_length=128)


class PriceEntryUpdateRequest(PriceEntryWriteRequest):
    """Payload used to update an existing price table entry."""


class PriceEntryResponse(PriceEntryWriteRequest):
    """Full representation of a persisted price table entry."""

    id: str
    created_at: datetime
    updated_at: datetime


class PriceEntriesResponse(BaseModel):
    """Envelope returned when listing all price table entries."""

    entries: List[PriceEntryResponse]


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


class ServerProcessLifecycle(str, Enum):
    """Lifecycle states reported for supervised MCP server processes."""

    RUNNING = "running"
    STOPPED = "stopped"
    ERROR = "error"


class ServerProcessState(BaseModel):
    """Snapshot returned by the process supervisor."""

    server_id: str
    status: ServerProcessLifecycle
    command: str
    pid: Optional[int] = None
    started_at: Optional[datetime] = None
    stopped_at: Optional[datetime] = None
    return_code: Optional[int] = None
    last_error: Optional[str] = None


class ServerProcessResponse(BaseModel):
    process: ServerProcessState


class ServerProcessesResponse(BaseModel):
    processes: List[ServerProcessState]


class RoutingSimulationRequest(BaseModel):
    """Payload describing how a routing plan should be simulated."""

    provider_ids: List[str] = Field(
        default_factory=list,
        description="Optional subset of provider identifiers to include in the simulation",
    )
    strategy: Literal["balanced", "finops", "latency", "resilience"] = Field(
        default="balanced",
        description="Strategy identifier that controls lane weighting",
    )
    failover_provider_id: Optional[str] = Field(
        default=None,
        description="Optional provider identifier to exclude as a simulated failover",
    )
    volume_millions: float = Field(
        default=10.0,
        ge=0.0,
        description="Projected volume in millions of tokens for the planning horizon",
    )


class RoutingRouteProfile(BaseModel):
    """Route characteristics returned as part of a simulation."""

    id: str
    provider: ProviderSummary
    lane: Literal["economy", "balanced", "turbo"]
    cost_per_million: float
    latency_p95: float
    reliability: float
    capacity_score: float


class RoutingDistributionEntry(BaseModel):
    """Allocation of the simulated volume for a specific route."""

    route: RoutingRouteProfile
    share: float
    tokens_millions: float
    cost: float


class RoutingSimulationResponse(BaseModel):
    """Aggregated outcome returned to the frontend."""

    total_cost: float
    cost_per_million: float
    avg_latency: float
    reliability_score: float
    distribution: List[RoutingDistributionEntry]
    excluded_route: Optional[RoutingRouteProfile] = None
