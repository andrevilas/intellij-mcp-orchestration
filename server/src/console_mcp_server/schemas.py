"""Pydantic schemas exposed by the Console MCP Server prototype."""

from __future__ import annotations

from datetime import date, datetime
from enum import Enum
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field, ConfigDict

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


class SecretTestResponse(BaseModel):
    provider_id: str
    status: Literal["healthy", "degraded", "error"]
    latency_ms: int = Field(..., ge=0)
    tested_at: datetime
    message: str


NotificationSeverity = Literal["info", "success", "warning", "critical"]
NotificationCategory = Literal["operations", "finops", "policies", "platform"]


class NotificationResponse(BaseModel):
    id: str
    severity: NotificationSeverity
    title: str
    message: str
    timestamp: datetime
    category: NotificationCategory
    tags: List[str]


class NotificationsResponse(BaseModel):
    notifications: List[NotificationResponse]


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


class PolicyOverrideWriteRequest(BaseModel):
    """Shared attributes required when creating or updating a policy override."""

    route: str = Field(..., min_length=1, max_length=128, description="Route identifier")
    project: str = Field(..., min_length=1, max_length=128, description="Project slug or owner")
    template_id: str = Field(
        ..., min_length=1, max_length=128, description="Policy template applied to the override"
    )
    max_latency_ms: Optional[int] = Field(
        default=None,
        ge=0,
        description="Optional latency ceiling (P95) enforced for the route in milliseconds",
    )
    max_cost_usd: Optional[float] = Field(
        default=None,
        ge=0.0,
        description="Optional cost ceiling per run expressed in USD",
    )
    require_manual_approval: bool = Field(
        default=False,
        description="Indicates if manual approval is required before promoting changes",
    )
    notes: Optional[str] = Field(
        default=None,
        max_length=1024,
        description="Optional operational notes describing the override",
    )


class PolicyOverrideCreateRequest(PolicyOverrideWriteRequest):
    """Payload used when registering a new policy override."""

    id: str = Field(..., min_length=1, max_length=128)


class PolicyOverrideUpdateRequest(PolicyOverrideWriteRequest):
    """Payload used to update an existing policy override."""


class PolicyOverrideResponse(PolicyOverrideWriteRequest):
    """Full representation of a persisted policy override."""

    id: str
    created_at: datetime
    updated_at: datetime


class PolicyOverridesResponse(BaseModel):
    """Envelope returned when listing all policy overrides."""

    overrides: List[PolicyOverrideResponse]


class PolicyDeploymentCreateRequest(BaseModel):
    """Payload describing a new deployment of a policy template."""

    template_id: str = Field(..., min_length=1, max_length=128)
    author: str = Field(default="Console MCP", min_length=1, max_length=128)
    window: Optional[str] = Field(default=None, max_length=256)
    note: Optional[str] = Field(default=None, max_length=1024)


class PolicyDeploymentResponse(BaseModel):
    """Representation of a recorded policy deployment."""

    id: str
    template_id: str
    deployed_at: datetime
    author: str
    window: Optional[str] = None
    note: Optional[str] = None
    slo_p95_ms: int
    budget_usage_pct: int
    incidents_count: int
    guardrail_score: int
    created_at: datetime
    updated_at: datetime


class PolicyDeploymentsResponse(BaseModel):
    """Envelope returned when listing policy deployments."""

    deployments: List[PolicyDeploymentResponse]
    active_id: Optional[str] = None


class CostDryRunRequest(BaseModel):
    """Payload describing a dry-run request for guardrail evaluation."""

    provider_id: str = Field(..., min_length=1, max_length=128)
    project: str = Field(..., min_length=1, max_length=128)
    route: str = Field(..., min_length=1, max_length=128)
    tokens_in: int = Field(..., ge=0)
    tokens_out: int = Field(..., ge=0)
    model: Optional[str] = Field(default=None, min_length=1, max_length=256)


class CostDryRunGuardrail(BaseModel):
    """Summary of the guardrail applied when evaluating a dry-run."""

    id: str
    route: str
    project: str
    template_id: str
    max_cost_usd: Optional[float] = None
    require_manual_approval: bool


class CostDryRunPricingReference(BaseModel):
    """Pricing metadata used to estimate the cost of a dry-run."""

    entry_id: str
    provider_id: str
    model: str
    currency: str
    unit: str
    input_cost_per_1k: Optional[float] = None
    output_cost_per_1k: Optional[float] = None


class CostDryRunResponse(BaseModel):
    """Outcome of running the dry-run guardrail evaluation."""

    provider_id: str
    project: str
    route: str
    tokens_in: int
    tokens_out: int
    estimated_cost_usd: float
    allowed: bool
    limit_usd: Optional[float] = None
    guardrail: Optional[CostDryRunGuardrail] = None
    pricing: Optional[CostDryRunPricingReference] = None
    message: Optional[str] = None


class PolicyTemplateResponse(BaseModel):
    """Representation of an available guardrail policy template."""

    id: str
    name: str
    tagline: str
    description: str
    price_delta: str = Field(alias="priceDelta")
    latency_target: str = Field(alias="latencyTarget")
    guardrail_level: str = Field(alias="guardrailLevel")
    features: List[str]

    model_config = ConfigDict(populate_by_name=True)


class PolicyTemplatesResponse(BaseModel):
    """Envelope returned when listing policy templates."""

    templates: List[PolicyTemplateResponse]


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


class ServerProcessLogEntry(BaseModel):
    """Structured representation of a supervisor log entry."""

    id: str
    timestamp: datetime
    level: Literal["info", "error"]
    message: str


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
    logs: List[ServerProcessLogEntry] = Field(default_factory=list)
    cursor: Optional[str] = None


class ServerProcessResponse(BaseModel):
    process: ServerProcessState


class ServerProcessesResponse(BaseModel):
    processes: List[ServerProcessState]


class ServerProcessLogsResponse(BaseModel):
    """Envelope returned when requesting incremental supervisor logs."""

    logs: List[ServerProcessLogEntry]
    cursor: Optional[str]


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


class TelemetryProviderMetrics(BaseModel):
    """Aggregated telemetry metrics grouped by provider."""

    provider_id: str
    run_count: int
    tokens_in: int
    tokens_out: int
    cost_usd: float
    avg_latency_ms: float
    success_rate: float


class TelemetryMetricsResponse(BaseModel):
    """Envelope returned when requesting aggregated telemetry metrics."""

    start: Optional[datetime] = None
    end: Optional[datetime] = None
    total_runs: int
    total_tokens_in: int
    total_tokens_out: int
    total_cost_usd: float
    avg_latency_ms: float
    success_rate: float
    providers: List[TelemetryProviderMetrics]


class TelemetryHeatmapBucket(BaseModel):
    """Execution counts grouped by provider and day."""

    day: date
    provider_id: str
    run_count: int


class TelemetryHeatmapResponse(BaseModel):
    """Envelope returned when requesting telemetry heatmap aggregates."""

    buckets: List[TelemetryHeatmapBucket]


class TelemetryTimeseriesPoint(BaseModel):
    """Aggregated metrics for a provider on a specific day."""

    day: date
    provider_id: str
    run_count: int
    tokens_in: int
    tokens_out: int
    cost_usd: float
    avg_latency_ms: float
    success_count: int


class TelemetryTimeseriesResponse(BaseModel):
    """Envelope returned when querying telemetry time series."""

    items: List[TelemetryTimeseriesPoint]
    next_cursor: Optional[str] = None


class TelemetryRouteBreakdownEntry(BaseModel):
    """Aggregated metrics grouped by provider and route."""

    id: str
    provider_id: str
    provider_name: str
    route: Optional[str] = None
    lane: Literal["economy", "balanced", "turbo"]
    run_count: int
    tokens_in: int
    tokens_out: int
    cost_usd: float
    avg_latency_ms: float
    success_rate: float


class TelemetryParetoResponse(BaseModel):
    """Envelope returned for Pareto style route breakdowns."""

    items: List[TelemetryRouteBreakdownEntry]
    next_cursor: Optional[str] = None


class TelemetryRunEntry(BaseModel):
    """Individual telemetry executions suitable for drill-down tables."""

    id: int
    provider_id: str
    provider_name: str
    route: Optional[str] = None
    lane: Optional[Literal["economy", "balanced", "turbo"]] = None
    ts: datetime
    tokens_in: int
    tokens_out: int
    duration_ms: int
    status: str
    cost_usd: float
    metadata: Dict[str, Any]


class TelemetryRunsResponse(BaseModel):
    """Envelope returned when listing individual telemetry runs."""

    items: List[TelemetryRunEntry]
    next_cursor: Optional[str] = None


ReportStatus = Literal["on_track", "attention", "regression"]


class FinOpsSprintReport(BaseModel):
    """Aggregated metrics for uma sprint FinOps."""

    id: str
    name: str
    period_start: date
    period_end: date
    total_cost_usd: float
    total_tokens_in: int
    total_tokens_out: int
    avg_latency_ms: float
    success_rate: float
    cost_delta: float
    status: ReportStatus
    summary: str


class FinOpsSprintReportsResponse(BaseModel):
    """Envelope para relatórios de sprint."""

    items: List[FinOpsSprintReport]


class FinOpsPullRequestReport(BaseModel):
    """Resumo de impacto financeiro por rota monitorada."""

    id: str
    provider_id: str
    provider_name: str
    route: Optional[str] = None
    lane: Optional[Literal["economy", "balanced", "turbo"]] = None
    title: str
    owner: str
    merged_at: Optional[datetime] = None
    cost_impact_usd: float
    cost_delta: float
    tokens_impact: int
    status: ReportStatus
    summary: str


class FinOpsPullRequestReportsResponse(BaseModel):
    """Envelope para relatórios estilo pull request."""

    items: List[FinOpsPullRequestReport]
