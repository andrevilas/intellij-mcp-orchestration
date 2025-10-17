"""Pydantic schemas exposed by the Console MCP Server prototype."""

from __future__ import annotations

from datetime import date, datetime
from enum import Enum
from typing import Any, Dict, List, Literal, Optional

from pydantic import AnyHttpUrl, BaseModel, Field, ConfigDict, model_validator

from .config import ProviderConfig
from .schemas_plan import Plan


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


class DiagnosticsInvokeRequest(BaseModel):
    """Payload describing the invoke step executed during diagnostics."""

    agent: str = Field(..., min_length=1, max_length=256)
    input: Optional[Dict[str, Any]] = None
    config: Optional[Dict[str, Any]] = None


class DiagnosticsComponent(BaseModel):
    """Normalized result for each diagnostics step."""

    ok: bool
    status_code: Optional[int] = None
    duration_ms: Optional[float] = None
    data: Any = None
    error: Optional[str] = None


class DiagnosticsSummary(BaseModel):
    """Aggregated counters derived from the diagnostics run."""

    total: int = Field(..., ge=0)
    successes: int = Field(..., ge=0)
    failures: int = Field(..., ge=0)
    errors: Dict[str, str] = Field(default_factory=dict)


class DiagnosticsRequest(BaseModel):
    """Input payload accepted by the diagnostics endpoint."""

    invoke: DiagnosticsInvokeRequest
    agents_base_url: Optional[AnyHttpUrl] = Field(default=None, alias="agents_base_url")


class DiagnosticsResponse(BaseModel):
    """Response envelope returned after running diagnostics."""

    timestamp: datetime
    summary: DiagnosticsSummary
    health: DiagnosticsComponent
    providers: DiagnosticsComponent
    invoke: DiagnosticsComponent


class PlanPullRequestReviewer(BaseModel):
    """Representation of a reviewer associated with a pull request."""

    id: Optional[str] = None
    name: str
    status: Optional[str] = None


class PlanPullRequestCheck(BaseModel):
    """Individual CI check result attached to a pull request."""

    name: str
    status: str
    details_url: Optional[str] = Field(default=None, alias="details_url")


class PlanPullRequestDetails(BaseModel):
    """Detailed view of a pull request opened during plan execution."""

    provider: str
    id: str
    number: str
    url: str
    title: str
    state: str
    head_sha: str
    branch: Optional[str] = None
    ci_status: Optional[str] = None
    review_status: Optional[str] = None
    merged: bool = False
    last_synced_at: Optional[str] = None
    reviewers: List[PlanPullRequestReviewer] = Field(default_factory=list)
    ci_results: List[PlanPullRequestCheck] = Field(default_factory=list)

    model_config = ConfigDict(populate_by_name=True)


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


class PolicyRolloutSegment(BaseModel):
    """Static description of a rollout stage."""

    id: Literal["canary", "general", "fallback"]
    name: str
    description: str


class PolicyRolloutAllocation(BaseModel):
    """Provider allocation within a rollout segment."""

    segment: PolicyRolloutSegment
    coverage_pct: int = Field(alias="coverage")
    providers: List[ProviderSummary]

    model_config = ConfigDict(populate_by_name=True)


class PolicyRolloutPlan(BaseModel):
    """Rollout proposal for a specific policy template."""

    template_id: str = Field(alias="templateId")
    generated_at: datetime = Field(alias="generatedAt")
    allocations: List[PolicyRolloutAllocation]

    model_config = ConfigDict(populate_by_name=True)


class PolicyRolloutOverview(BaseModel):
    """Aggregate rollout plans returned alongside the template catalog."""

    generated_at: datetime = Field(alias="generatedAt")
    plans: List[PolicyRolloutPlan]

    model_config = ConfigDict(populate_by_name=True)


class PolicyTemplatesResponse(BaseModel):
    """Envelope returned when listing policy templates."""

    templates: List[PolicyTemplateResponse]
    rollout: Optional[PolicyRolloutOverview] = None


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


class MarketplaceEntryWriteRequest(BaseModel):
    """Shared attributes for marketplace catalog mutations."""

    name: str = Field(..., min_length=1, max_length=256)
    slug: str = Field(..., min_length=1, max_length=256)
    summary: str = Field(..., min_length=1, max_length=512)
    description: Optional[str] = Field(default=None, max_length=2048)
    origin: str = Field(..., min_length=1, max_length=64)
    rating: float = Field(..., ge=0.0, le=5.0)
    cost: float = Field(..., ge=0.0)
    tags: List[str] = Field(default_factory=list)
    capabilities: List[str] = Field(default_factory=list)
    repository_url: Optional[str] = Field(default=None, max_length=1024)
    package_path: str = Field(..., min_length=1, max_length=512)
    manifest_filename: str = Field(default="agent.yaml", min_length=1, max_length=256)
    entrypoint_filename: Optional[str] = Field(default=None, max_length=256)
    target_repository: str = Field(default="agents-hub", min_length=1, max_length=256)
    signature: str = Field(..., min_length=32, max_length=128)


class MarketplaceEntryCreateRequest(MarketplaceEntryWriteRequest):
    """Payload used when registering a new marketplace entry."""

    id: str = Field(..., min_length=1, max_length=128)


class MarketplaceEntryUpdateRequest(MarketplaceEntryWriteRequest):
    """Payload used to update an existing marketplace entry."""


class MarketplaceEntryResponse(MarketplaceEntryWriteRequest):
    """Full representation of a persisted marketplace entry."""

    id: str
    created_at: datetime
    updated_at: datetime


class MarketplaceEntriesResponse(BaseModel):
    """Envelope returned when listing marketplace catalog entries."""

    entries: List[MarketplaceEntryResponse]


class MarketplaceImportResponse(BaseModel):
    """Payload returned when preparing marketplace artifacts for installation."""

    entry: MarketplaceEntryResponse
    plan: Plan
    manifest: str
    agent_code: Optional[str] = None


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


class TelemetryMetricsCostBreakdownEntry(BaseModel):
    """Cost distribution entry grouped by route or provider."""

    id: Optional[str] = None
    label: Optional[str] = None
    lane: Optional[str] = None
    provider_id: Optional[str] = None
    cost_usd: float
    run_count: Optional[int] = None


class TelemetryMetricsErrorBreakdownEntry(BaseModel):
    """Error categorization entry used for dashboard insights."""

    category: str
    count: int


class TelemetryMetricsExtended(BaseModel):
    """Extended telemetry metrics exposed for executive dashboards."""

    cache_hit_rate: Optional[float] = None
    cached_tokens: Optional[int] = None
    latency_p95_ms: Optional[float] = None
    latency_p99_ms: Optional[float] = None
    error_rate: Optional[float] = None
    cost_breakdown: Optional[List[TelemetryMetricsCostBreakdownEntry]] = None
    error_breakdown: Optional[List[TelemetryMetricsErrorBreakdownEntry]] = None


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
    extended: Optional[TelemetryMetricsExtended] = None


class ObservabilityProviderType(str, Enum):
    """Enumerates supported observability provider integrations."""

    LANGSMITH = "langsmith"
    OTLP = "otlp"


class ObservabilityProviderSettings(BaseModel):
    """Configuration payload persisted for observability providers."""

    model_config = ConfigDict(extra="forbid")

    provider: ObservabilityProviderType
    endpoint: Optional[AnyHttpUrl] = None
    project: Optional[str] = None
    dataset: Optional[str] = None
    headers: Optional[Dict[str, str]] = None

    @model_validator(mode="after")
    def _validate_provider(self) -> "ObservabilityProviderSettings":
        if self.provider is ObservabilityProviderType.OTLP and self.endpoint is None:
            raise ValueError("endpoint é obrigatório para providers OTLP.")
        if self.headers is not None:
            self.headers = {str(key): str(value) for key, value in self.headers.items()}
        return self


class ObservabilityPreferencesResponse(BaseModel):
    """Envelope returned when fetching stored observability preferences."""

    model_config = ConfigDict(extra="forbid")

    tracing: Optional[ObservabilityProviderSettings] = None
    metrics: Optional[ObservabilityProviderSettings] = None
    evals: Optional[ObservabilityProviderSettings] = None
    updated_at: Optional[datetime] = None


class ObservabilityPreferencesUpdateRequest(BaseModel):
    """Payload accepted when updating observability preferences."""

    model_config = ConfigDict(extra="forbid")

    tracing: Optional[ObservabilityProviderSettings] = None
    metrics: Optional[ObservabilityProviderSettings] = None
    evals: Optional[ObservabilityProviderSettings] = None


class ObservabilityMetricsTotals(BaseModel):
    """Top-level metrics summarizing the current observability window."""

    runs: int
    tokens_in: int
    tokens_out: int
    avg_latency_ms: float
    success_rate: float
    cost_usd: float


class ObservabilityMetricsKpis(BaseModel):
    """Precomputed KPI snapshot derived from telemetry aggregates."""

    latency_p95_ms: Optional[float] = None
    error_rate: Optional[float] = None
    cache_hit_rate: Optional[float] = None
    total_cost_usd: Optional[float] = None


class ObservabilityMetricsResponse(BaseModel):
    """Aggregated metrics exposed by the observability endpoints."""

    window_start: Optional[datetime] = None
    window_end: Optional[datetime] = None
    totals: ObservabilityMetricsTotals
    providers: List[TelemetryProviderMetrics]
    kpis: ObservabilityMetricsKpis
    error_breakdown: List[TelemetryMetricsErrorBreakdownEntry] = Field(default_factory=list)


class ObservabilityTraceResponse(BaseModel):
    """Aggregated tracing payload grouped by provider."""

    window_start: Optional[datetime] = None
    window_end: Optional[datetime] = None
    providers: List[TelemetryProviderMetrics]


class ObservabilityEvalRunRequest(BaseModel):
    """Payload used to trigger synthetic evaluation suites."""

    model_config = ConfigDict(extra="forbid")

    preset_id: str = Field(..., min_length=1)
    provider_id: Optional[str] = Field(
        default=None,
        description="Identificador do provider alvo. Use 'auto' para seleção automática.",
    )
    window_start: Optional[datetime] = None
    window_end: Optional[datetime] = None


class ObservabilityEvalRunResponse(BaseModel):
    """Result payload returned after running an evaluation suite."""

    run_id: str
    status: Literal["completed"]
    preset_id: str
    provider_id: Optional[str] = None
    evaluated_runs: int
    success_rate: float
    avg_latency_ms: float
    summary: str
    started_at: datetime
    completed_at: datetime
    window_start: Optional[datetime] = None
    window_end: Optional[datetime] = None


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
    experiment_cohort: Optional[str] = None
    experiment_tag: Optional[str] = None


class TelemetryRunsResponse(BaseModel):
    """Envelope returned when listing individual telemetry runs."""

    items: List[TelemetryRunEntry]
    next_cursor: Optional[str] = None


class TelemetryExperimentSummaryEntry(BaseModel):
    """Aggregated metrics grouped by experiment cohort/tag."""

    cohort: Optional[str] = None
    tag: Optional[str] = None
    run_count: int
    success_rate: float
    error_rate: float
    avg_latency_ms: float
    total_cost_usd: float
    total_tokens_in: int
    total_tokens_out: int
    mttr_ms: Optional[float] = None
    recovery_events: int


class TelemetryExperimentsResponse(BaseModel):
    """Envelope returned when listing experiment summaries."""

    items: List[TelemetryExperimentSummaryEntry]


class TelemetryLaneCostEntry(BaseModel):
    """Cost breakdown grouped by routing lane."""

    lane: Literal["economy", "balanced", "turbo"]
    run_count: int
    total_cost_usd: float
    total_tokens_in: int
    total_tokens_out: int
    avg_latency_ms: float


class TelemetryLaneCostResponse(BaseModel):
    """Envelope returned when aggregating cost per routing lane."""

    items: List[TelemetryLaneCostEntry]


class MarketplacePerformanceEntry(BaseModel):
    """Marketplace catalog entry enriched with telemetry metrics."""

    entry_id: str
    name: str
    origin: str
    rating: float
    cost: float
    run_count: int
    success_rate: float
    avg_latency_ms: float
    total_cost_usd: float
    total_tokens_in: int
    total_tokens_out: int
    cohorts: List[str]
    adoption_score: float


class MarketplacePerformanceResponse(BaseModel):
    """Envelope returned when listing marketplace telemetry performance."""

    items: List[MarketplacePerformanceEntry]


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


class FlowNodePayload(BaseModel):
    id: str = Field(..., min_length=1)
    type: str = Field(..., min_length=1)
    label: str = Field(..., min_length=1)
    config: Dict[str, Any] = Field(default_factory=dict)


class FlowEdgePayload(BaseModel):
    id: str = Field(..., min_length=1)
    source: str = Field(..., min_length=1)
    target: str = Field(..., min_length=1)
    condition: Optional[str] = None


class FlowGraphPayload(BaseModel):
    id: str = Field(..., min_length=1)
    label: str = Field(..., min_length=1)
    entry: str = Field(..., min_length=1)
    exit: str = Field(..., min_length=1)
    nodes: List[FlowNodePayload] = Field(default_factory=list)
    edges: List[FlowEdgePayload] = Field(default_factory=list)
    metadata: Dict[str, Any] = Field(default_factory=dict)


class FlowVersionResponse(BaseModel):
    flow_id: str
    version: int
    created_at: datetime
    created_by: Optional[str] = None
    comment: Optional[str] = None
    graph: FlowGraphPayload
    agent_code: str
    hitl_checkpoints: List[str] = Field(default_factory=list)
    diff: Optional[str] = None


class FlowVersionsResponse(BaseModel):
    flow_id: str
    versions: List[FlowVersionResponse]


class FlowVersionCreateRequest(BaseModel):
    graph: FlowGraphPayload
    target_path: str = Field(..., min_length=1)
    agent_class: Optional[str] = None
    comment: Optional[str] = None
    author: Optional[str] = None
    baseline_agent_code: Optional[str] = None


class FlowVersionRollbackRequest(BaseModel):
    author: Optional[str] = None
    comment: Optional[str] = None


class FlowVersionDiffResponse(BaseModel):
    flow_id: str
    from_version: int
    to_version: int
    diff: str


class AuditLogEntry(BaseModel):
    id: str
    created_at: datetime
    actor_id: Optional[str] = None
    actor_name: Optional[str] = None
    actor_roles: List[str] = Field(default_factory=list)
    action: str
    resource: str
    status: str
    plan_id: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)


class AuditLogsResponse(BaseModel):
    events: List[AuditLogEntry]
    page: int
    page_size: int
    total: int
    total_pages: int


class SecurityUser(BaseModel):
    id: str
    name: str
    email: Optional[str] = None
    roles: List[str] = Field(default_factory=list)
    status: Literal["active", "disabled"] = "active"
    created_at: datetime
    updated_at: datetime
    last_seen_at: Optional[datetime] = None
    mfa_enabled: bool = False


class SecurityUsersResponse(BaseModel):
    users: List[SecurityUser]


class SecurityUserResponse(BaseModel):
    user: SecurityUser


class SecurityUserCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=256)
    email: Optional[str] = Field(default=None, max_length=320)
    roles: List[str] = Field(default_factory=list)
    generate_token: bool = Field(
        default=True,
        description="When true, provisions an initial API token for the user",
    )
    token_name: Optional[str] = Field(default=None, max_length=128)


class SecurityUserCreateResponse(BaseModel):
    user: SecurityUser
    secret: Optional[str] = None


class SecurityUserUpdateRequest(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=256)
    email: Optional[str] = Field(default=None, max_length=320)
    roles: Optional[List[str]] = Field(default=None)


class SecurityRole(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    members: int = 0


class SecurityRolesResponse(BaseModel):
    roles: List[SecurityRole]


class SecurityRoleCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=128)
    description: Optional[str] = Field(default=None, max_length=1024)


class SecurityRoleUpdateRequest(BaseModel):
    description: Optional[str] = Field(default=None, max_length=1024)


class ApiKey(BaseModel):
    id: str
    user_id: str
    user_name: str
    name: str
    scopes: List[str] = Field(default_factory=list)
    status: Literal["active", "expired", "revoked"]
    token_preview: str
    created_at: datetime
    updated_at: datetime
    last_used_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None


class ApiKeysResponse(BaseModel):
    keys: List[ApiKey]


class ApiKeyCreateRequest(BaseModel):
    user_id: str = Field(..., min_length=1)
    name: str = Field(..., min_length=1, max_length=256)
    scopes: List[str] = Field(default_factory=list)
    expires_at: Optional[datetime] = None


class ApiKeyCreateResponse(BaseModel):
    key: ApiKey
    secret: str


class ApiKeyRotateRequest(BaseModel):
    expires_at: Optional[datetime] = None


class ApiKeyRotateResponse(BaseModel):
    key: ApiKey
    secret: str
