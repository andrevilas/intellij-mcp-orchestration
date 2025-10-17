"""API route declarations for the Console MCP Server prototype."""

from __future__ import annotations

import difflib
import time
from datetime import datetime
from enum import Enum
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Any, Dict, Iterable, Mapping

import structlog
from fastapi import APIRouter, HTTPException, Query, Request, Response, status
from pydantic import AnyHttpUrl, BaseModel, Field

from .policies import (
    CostPolicyAlreadyExistsError,
    CostPolicyNotFoundError,
    create_policy,
    delete_policy,
    get_policy,
    list_policies,
    update_policy,
)
from .notifications import list_notifications
from .policy_overrides import (
    PolicyOverrideAlreadyExistsError,
    PolicyOverrideNotFoundError,
    create_policy_override,
    delete_policy_override,
    find_policy_override,
    get_policy_override,
    list_policy_overrides,
    update_policy_override,
)
from .policy_deployments import (
    InvalidPolicyTemplateError,
    PolicyDeploymentNotFoundError,
    create_policy_deployment,
    delete_policy_deployment,
    list_policy_deployments,
)
from .policy_rollout import build_rollout_plans
from .policy_templates import list_policy_templates
from .diagnostics import diagnostics_service
from .marketplace import (
    MarketplaceArtifactError,
    MarketplaceEntryAlreadyExistsError,
    MarketplaceEntryNotFoundError,
    MarketplaceSignatureError,
    create_marketplace_entry,
    delete_marketplace_entry as delete_marketplace_entry_record,
    get_marketplace_entry,
    list_marketplace_entries,
    prepare_marketplace_install,
    update_marketplace_entry as update_marketplace_entry_record,
)
from .prices import (
    PriceEntryAlreadyExistsError,
    PriceEntryNotFoundError,
    create_price_entry,
    delete_price_entry,
    get_price_entry,
    list_price_entries,
    update_price_entry,
)
from .registry import provider_registry, session_registry
from .routing import DistributionEntry, RouteProfile, build_routes, compute_plan
from .config_assistant.intents import AssistantIntent
from .config_assistant.artifacts import generate_artifact
from .config_assistant.planner import plan_intent
from .config_assistant.rag import rag_service
from .config_assistant.langgraph import (
    FlowGraph,
    FlowVersionRecord,
    create_flow_version,
    diff_flow_versions,
    list_flow_versions,
    rollback_flow_version,
)
from .config_assistant.renderers import render_chat_reply
from .config_assistant.plan_executor import (
    PlanExecutionResult,
    PlanExecutor,
    PlanExecutorError,
    PlanPreview,
)
from .config_assistant.validation import MCPClientError, MCPValidationOutcome, validate_server
from .git_providers import (
    GitProviderClient,
    GitProviderSettings,
    PullRequestSnapshot,
    create_git_provider,
)
from .schemas import (
    CostPoliciesResponse,
    CostPolicyCreateRequest,
    CostPolicyResponse,
    CostPolicyUpdateRequest,
    FinOpsPullRequestReport as FinOpsPullRequestReportModel,
    FinOpsPullRequestReportsResponse,
    FinOpsSprintReport as FinOpsSprintReportModel,
    FinOpsSprintReportsResponse,
    CostDryRunGuardrail,
    CostDryRunPricingReference,
    CostDryRunRequest,
    CostDryRunResponse,
    PolicyOverrideCreateRequest,
    PolicyOverrideResponse,
    PolicyOverrideUpdateRequest,
    PolicyOverridesResponse,
    PolicyDeploymentCreateRequest,
    PolicyDeploymentResponse,
    PolicyDeploymentsResponse,
    PolicyRolloutAllocation,
    PolicyRolloutOverview,
    PolicyRolloutPlan,
    PolicyRolloutSegment,
    PolicyTemplateResponse,
    PolicyTemplatesResponse,
    NotificationResponse,
    NotificationsResponse,
    HealthStatus,
    PriceEntriesResponse,
    MarketplaceEntriesResponse,
    MarketplaceEntryCreateRequest,
    MarketplaceEntryResponse,
    MarketplaceEntryUpdateRequest,
    MarketplaceImportResponse,
    PriceEntryCreateRequest,
    PriceEntryResponse,
    PriceEntryUpdateRequest,
    MCPServerCreateRequest,
    MCPServerResponse,
    MCPServerUpdateRequest,
    MCPServersResponse,
    ProvidersResponse,
    DiagnosticsRequest,
    DiagnosticsResponse,
    PlanPullRequestDetails,
    RoutingDistributionEntry,
    RoutingRouteProfile,
    RoutingSimulationRequest,
    RoutingSimulationResponse,
    TelemetryHeatmapBucket,
    TelemetryHeatmapResponse,
    TelemetryMetricsCostBreakdownEntry,
    TelemetryMetricsErrorBreakdownEntry,
    TelemetryMetricsExtended,
    TelemetryMetricsResponse,
    TelemetryProviderMetrics,
    TelemetryParetoResponse,
    TelemetryRouteBreakdownEntry as TelemetryRouteBreakdownModel,
    TelemetryRunEntry as TelemetryRunEntryModel,
    TelemetryRunsResponse,
    TelemetryTimeseriesPoint as TelemetryTimeseriesPointModel,
    TelemetryTimeseriesResponse,
    TelemetryExperimentsResponse,
    TelemetryExperimentSummaryEntry,
    TelemetryLaneCostEntry,
    TelemetryLaneCostResponse,
    MarketplacePerformanceEntry,
    MarketplacePerformanceResponse,
    SecretMetadataResponse,
    SecretValueResponse,
    SecretWriteRequest,
    SecretTestResponse,
    SecretsResponse,
    ServerProcessLifecycle,
    ServerProcessLogEntry,
    ServerProcessLogsResponse,
    ServerProcessResponse,
    ServerProcessState,
    ServerProcessesResponse,
    SessionCreateRequest,
    SessionResponse,
    SessionsResponse,
    FlowVersionCreateRequest,
    FlowVersionDiffResponse,
    FlowVersionResponse,
    FlowVersionsResponse,
    FlowVersionRollbackRequest,
    FlowGraphPayload,
)
from .secrets import secret_store
from .secret_validation import (
    ProviderNotRegisteredError,
    SecretNotConfiguredError,
    SecretValidationError,
    test_secret as validate_secret,
)
from .servers import (
    MCPServerAlreadyExistsError,
    MCPServerNotFoundError,
    create_server,
    delete_server,
    get_server,
    list_servers,
    update_server,
)
from .telemetry import (
    aggregate_heatmap,
    aggregate_metrics,
    compute_finops_pull_request_reports,
    compute_finops_sprint_reports,
    compute_lane_cost_breakdown,
    compute_marketplace_performance,
    query_experiment_summaries,
    query_route_breakdown,
    query_runs,
    query_timeseries,
    render_telemetry_export,
)
from .schemas_plan import DiffSummary, Plan, PlanExecutionMode, PlanExecutionStatus
from .security import (
    DEFAULT_AUDIT_LOGGER,
    audit_logger as get_audit_logger,
    ensure_security_context,
    require_roles,
    Role,
)
from .supervisor import (
    ProcessAlreadyRunningError,
    ProcessLogEntry,
    ProcessNotRunningError,
    ProcessStartError,
    ProcessSnapshot,
    process_supervisor,
)

router = APIRouter(prefix="/api/v1", tags=["console"])
assistant_logger = structlog.get_logger("console.config.routes")

_PLAN_EXECUTOR: PlanExecutor | None = None
_GIT_PROVIDER_CLIENT: GitProviderClient | None = None


def _serialize_flow_version(record: FlowVersionRecord) -> FlowVersionResponse:
    graph_payload = FlowGraphPayload.model_validate(record.graph.model_dump(mode="python"))
    return FlowVersionResponse(
        flow_id=record.flow_id,
        version=record.version,
        created_at=record.created_at,
        created_by=record.created_by,
        comment=record.comment,
        graph=graph_payload,
        agent_code=record.agent_code,
        hitl_checkpoints=list(record.hitl_checkpoints),
        diff=record.diff,
    )


def _count_provider_entries(data: Any) -> int | None:
    if isinstance(data, Mapping):
        providers = data.get("providers")
        if isinstance(providers, list):
            return len(providers)
    return None


def _build_flow_graph(request: FlowVersionCreateRequest) -> FlowGraph:
    payload = request.graph.model_dump(mode="python")
    metadata = dict(payload.get("metadata") or {})
    metadata.setdefault("target_path", request.target_path)
    if request.agent_class:
        metadata["agent_class"] = request.agent_class
    payload["metadata"] = metadata
    return FlowGraph.model_validate(payload)


def get_plan_executor() -> PlanExecutor:
    global _PLAN_EXECUTOR, _GIT_PROVIDER_CLIENT
    if _PLAN_EXECUTOR is None:
        repo_root = Path(__file__).resolve().parents[3]
        settings = GitProviderSettings.from_env()
        provider = create_git_provider(settings)
        _GIT_PROVIDER_CLIENT = provider
        _PLAN_EXECUTOR = PlanExecutor(repo_root, git_provider=provider)
    return _PLAN_EXECUTOR


def _notify_hitl(url: AnyHttpUrl, result: PlanExecutionResult) -> None:
    assistant_logger.info(
        "config.apply.hitl_callback",
        url=str(url),
        plan_id=result.plan_id,
        record_id=result.record_id,
    )


def _serialize_pull_request(snapshot: PullRequestSnapshot | None) -> PullRequestDetails | None:
    if snapshot is None:
        return None
    return PullRequestDetails.from_snapshot(snapshot)


def _serialize_plan_preview(preview: PlanPreview | None) -> PlanPreviewModel | None:
    if preview is None:
        return None

    pull_request: PullRequestPreviewModel | None = None
    if preview.pull_request_title:
        pull_request = PullRequestPreviewModel(
            provider=preview.pull_request_provider,
            title=preview.pull_request_title,
            body=preview.pull_request_body,
        )

    return PlanPreviewModel(
        branch=preview.branch,
        base_branch=preview.base_branch,
        commit_message=preview.commit_message,
        pull_request=pull_request,
    )


def _serialize_validation_details(
    outcome: MCPValidationOutcome | None,
) -> MCPValidationModel | None:
    if outcome is None:
        return None

    tools = [
        MCPToolModel(
            name=tool.name,
            description=tool.description,
            definition=dict(tool.schema) if tool.schema else None,
        )
        for tool in outcome.tools
    ]

    return MCPValidationModel(
        endpoint=outcome.endpoint,
        transport=outcome.transport,
        tools=tools,
        missing_tools=list(outcome.missing_tools),
        server_info=dict(outcome.discovery.server_info),
        capabilities=dict(outcome.discovery.capabilities),
    )


@router.get("/flows/{flow_id}/versions", response_model=FlowVersionsResponse)
def list_flow_versions_route(flow_id: str) -> FlowVersionsResponse:
    records = list_flow_versions(flow_id)
    return FlowVersionsResponse(
        flow_id=flow_id,
        versions=[_serialize_flow_version(record) for record in records],
    )


@router.post(
    "/flows/{flow_id}/versions",
    response_model=FlowVersionResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_flow_version_route(flow_id: str, request: FlowVersionCreateRequest) -> FlowVersionResponse:
    existing = list_flow_versions(flow_id)
    if request.baseline_agent_code and existing:
        latest = existing[0]
        if latest.agent_code.strip() != request.baseline_agent_code.strip():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Versão base divergente; recarregue o fluxo antes de salvar.",
            )

    graph = _build_flow_graph(request)
    record = create_flow_version(
        flow_id=flow_id,
        graph=graph,
        comment=request.comment,
        author=request.author,
    )
    return _serialize_flow_version(record)


@router.post(
    "/flows/{flow_id}/versions/{version}/rollback",
    response_model=FlowVersionResponse,
    status_code=status.HTTP_201_CREATED,
)
def rollback_flow_version_route(
    flow_id: str,
    version: int,
    request: FlowVersionRollbackRequest,
) -> FlowVersionResponse:
    record = rollback_flow_version(
        flow_id=flow_id,
        version=version,
        author=request.author,
        comment=request.comment,
    )
    return _serialize_flow_version(record)


@router.get(
    "/flows/{flow_id}/versions/compare",
    response_model=FlowVersionDiffResponse,
)
def compare_flow_versions_route(
    flow_id: str,
    from_version: int = Query(..., ge=1),
    to_version: int = Query(..., ge=1),
) -> FlowVersionDiffResponse:
    diff = diff_flow_versions(flow_id, from_version, to_version)
    return FlowVersionDiffResponse.model_validate(diff.model_dump())


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1)
    intent: AssistantIntent | None = Field(default=None)
    payload: Dict[str, Any] = Field(default_factory=dict)


class ChatResponse(BaseModel):
    reply: str
    intent: AssistantIntent | None = None
    plan: Plan | None = None


class PlanRequest(BaseModel):
    intent: AssistantIntent
    payload: Dict[str, Any] = Field(default_factory=dict)


class PullRequestPreviewModel(BaseModel):
    provider: str | None = None
    title: str
    body: str | None = None


class PlanPreviewModel(BaseModel):
    branch: str
    base_branch: str
    commit_message: str
    pull_request: PullRequestPreviewModel | None = None


class MCPToolModel(BaseModel):
    name: str
    description: str | None = None
    definition: Dict[str, Any] | None = None


class MCPValidationModel(BaseModel):
    endpoint: str
    transport: str
    tools: list[MCPToolModel] = Field(default_factory=list)
    missing_tools: list[str] = Field(default_factory=list)
    server_info: Dict[str, Any] = Field(default_factory=dict)
    capabilities: Dict[str, Any] = Field(default_factory=dict)


class PlanResponse(BaseModel):
    plan: Plan
    preview: PlanPreviewModel | None = None
    validation: MCPValidationModel | None = None


class OnboardResponse(PlanResponse):
    plan: Plan | None = None


class PlanExecutionDiff(BaseModel):
    stat: str
    patch: str


class PullRequestDetails(PlanPullRequestDetails):
    @classmethod
    def from_snapshot(cls, snapshot: PullRequestSnapshot) -> "PullRequestDetails":
        payload = snapshot.to_metadata()
        payload.setdefault("id", snapshot.identifier)
        payload.setdefault("number", snapshot.number)
        payload.setdefault("provider", snapshot.provider)
        payload.setdefault("url", snapshot.url)
        payload.setdefault("title", snapshot.title)
        payload.setdefault("state", snapshot.state)
        payload.setdefault("head_sha", snapshot.head_sha)
        payload.setdefault("branch", snapshot.branch)
        if "reviewers" not in payload:
            payload["reviewers"] = [
                {
                    "id": reviewer.id,
                    "name": reviewer.name,
                    "status": reviewer.status,
                }
                for reviewer in snapshot.reviewers
            ]
        if "ci_results" not in payload:
            payload["ci_results"] = [
                {
                    "name": result.name,
                    "status": result.status,
                    "details_url": result.details_url,
                }
                for result in snapshot.ci_results
            ]
        return cls(**payload)  # type: ignore[arg-type]


class ApprovalDecision(str, Enum):
    APPROVE = "approve"
    REJECT = "reject"


class ApplyPlanRequest(BaseModel):
    plan_id: str = Field(..., min_length=1)
    plan: Plan | None = None
    patch: str | None = Field(default=None)
    mode: PlanExecutionMode = Field(default=PlanExecutionMode.DRY_RUN)
    actor: str | None = Field(default=None, min_length=1)
    actor_email: str | None = Field(default=None)
    commit_message: str = Field(default="chore: aplicar plano de configuração")
    hitl_callback_url: AnyHttpUrl | None = Field(default=None)
    approval_id: str | None = Field(default=None)
    approval_decision: ApprovalDecision | None = Field(default=None)
    approval_reason: str | None = Field(default=None)


class ApplyPlanResponse(BaseModel):
    status: PlanExecutionStatus
    mode: PlanExecutionMode
    plan_id: str
    record_id: str
    branch: str | None = None
    base_branch: str | None = None
    commit_sha: str | None = None
    diff: PlanExecutionDiff
    hitl_required: bool = False
    message: str
    approval_id: str | None = None
    pull_request: PullRequestDetails | None = None


class PlanStatusSyncRequest(BaseModel):
    record_id: str = Field(..., min_length=1)
    plan_id: str | None = Field(default=None)
    provider_payload: Dict[str, Any] | None = Field(default=None)


class OnboardIntent(str, Enum):
    PLAN = "plan"
    VALIDATE = "validate"


class OnboardRequest(BaseModel):
    repository: str = Field(..., min_length=1)
    agent_name: str | None = Field(default=None)
    capabilities: list[str] = Field(default_factory=list)
    endpoint: str | None = Field(default=None)
    auth: Dict[str, str] = Field(default_factory=dict)
    tools: list[str] = Field(default_factory=list)
    intent: OnboardIntent = Field(default=OnboardIntent.PLAN)


class RagDocument(BaseModel):
    path: str
    snippet: str
    score: float
    title: str | None = None
    chunk: int = Field(default=0, ge=0)


class RagQueryRequest(BaseModel):
    query: str = Field(..., min_length=1)
    top_k: int = Field(default=5, ge=1, le=20)
    intent: AssistantIntent | None = None


class RagQueryResponse(BaseModel):
    query: str
    intent: AssistantIntent | None = None
    documents: list[RagDocument] = Field(default_factory=list)
    latency_ms: float = Field(..., ge=0.0)


class PolicyPatchRequest(BaseModel):
    policy_id: str = Field(..., min_length=1)
    changes: Dict[str, Any] = Field(default_factory=dict)


class ReloadRequest(BaseModel):
    artifact_type: str = Field(..., min_length=1)
    target_path: str = Field(..., min_length=1)
    parameters: Dict[str, Any] = Field(default_factory=dict)


class ReloadResponse(BaseModel):
    message: str
    plan: Plan
    patch: str


def _handle_planner_error(intent: AssistantIntent | None, error: Exception) -> None:
    assistant_logger.warning(
        "config.planner_error",
        intent=intent.value if isinstance(intent, AssistantIntent) else intent,
        error=str(error),
    )


def _build_plan(intent: AssistantIntent, payload: Mapping[str, Any]) -> Plan:
    try:
        return plan_intent(intent, payload)
    except ValueError as exc:
        _handle_planner_error(intent, exc)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


@router.post("/config/chat", response_model=ChatResponse)
def chat_with_config_assistant(payload: ChatRequest, http_request: Request) -> ChatResponse:
    """Entry point for conversational interactions with the configuration assistant."""

    user = require_roles(http_request, Role.VIEWER)
    plan: Plan | None = None
    if payload.intent is not None:
        try:
            plan = plan_intent(payload.intent, payload.payload)
        except ValueError as exc:
            _handle_planner_error(payload.intent, exc)
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

    reply = render_chat_reply(payload.message, plan)
    assistant_logger.info(
        "config.chat",
        intent=payload.intent.value if isinstance(payload.intent, AssistantIntent) else payload.intent,
        has_plan=plan is not None,
    )

    get_audit_logger(http_request).log(
        actor=user,
        action="config.chat",
        resource="/config/chat",
        metadata={"has_plan": plan is not None},
    )
    return ChatResponse(reply=reply, intent=payload.intent, plan=plan)


@router.post("/config/plan", response_model=PlanResponse)
def create_plan(request: PlanRequest, http_request: Request) -> PlanResponse:
    """Generate a configuration plan for the requested intent."""

    user = require_roles(http_request, Role.PLANNER)
    plan = _build_plan(request.intent, request.payload)
    get_audit_logger(http_request).log(
        actor=user,
        action="config.plan",
        resource="/config/plan",
        metadata={"intent": request.intent.value},
    )
    return PlanResponse(plan=plan)


@router.post("/config/rag/query", response_model=RagQueryResponse)
def query_rag_endpoint(payload: RagQueryRequest) -> RagQueryResponse:
    """Execute a lightweight RAG search over the local documentation corpus."""

    start = time.perf_counter()
    results = rag_service.query(
        payload.query,
        top_k=payload.top_k,
        intent=payload.intent.value if isinstance(payload.intent, AssistantIntent) else None,
    )
    latency_ms = (time.perf_counter() - start) * 1000.0
    documents = [
        RagDocument(
            path=result.path,
            snippet=result.snippet,
            score=result.score,
            title=result.title,
            chunk=result.chunk,
        )
        for result in results
    ]
    return RagQueryResponse(
        query=payload.query,
        intent=payload.intent,
        documents=documents,
        latency_ms=round(latency_ms, 3),
    )


@router.post("/config/apply", response_model=ApplyPlanResponse)
def apply_plan_endpoint(payload: ApplyPlanRequest, http_request: Request) -> ApplyPlanResponse:
    """Apply a configuration plan leveraging Git workflows."""

    executor = get_plan_executor()

    try:
        if payload.mode is PlanExecutionMode.DRY_RUN and payload.approval_decision is None:
            user = require_roles(http_request, Role.PLANNER)
            if payload.plan is None or payload.patch is None or payload.actor is None:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="plan, patch e actor são obrigatórios para dry-run.",
                )
            result = executor.dry_run(
                plan=payload.plan,
                plan_id=payload.plan_id,
                patch=payload.patch,
                actor=payload.actor,
            )
            get_audit_logger(http_request).log(
                actor=user,
                action="config.apply.dry_run",
                resource="/config/apply",
                plan_id=payload.plan_id,
                metadata={"mode": payload.mode.value},
            )
        else:
            if payload.approval_decision is None:
                user = require_roles(http_request, Role.PLANNER)
                if payload.plan is None or payload.patch is None or payload.actor is None:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="plan, patch e actor são obrigatórios para submissão.",
                    )
                if payload.actor_email is None:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="actor_email é obrigatório para aplicar o plano.",
                    )
                if "@" not in payload.actor_email:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="actor_email precisa ser um endereço válido.",
                    )
                submission = executor.submit_for_approval(
                    plan=payload.plan,
                    plan_id=payload.plan_id,
                    patch=payload.patch,
                    actor=payload.actor,
                    actor_email=payload.actor_email,
                    commit_message=payload.commit_message,
                    mode=payload.mode,
                )
                get_audit_logger(http_request).log(
                    actor=user,
                    action="config.apply.submit",
                    resource="/config/apply",
                    plan_id=payload.plan_id,
                    metadata={"mode": payload.mode.value, "approval_id": submission.approval_id},
                )
                result = submission
            elif payload.approval_decision is ApprovalDecision.APPROVE:
                user = require_roles(http_request, Role.APPROVER)
                if not payload.approval_id:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="approval_id é obrigatório para aprovar.",
                    )
                executor.approve_request(
                    payload.approval_id,
                    approver_id=user.id,
                    reason=payload.approval_reason,
                )
                hitl_callback = (
                    (lambda outcome: _notify_hitl(payload.hitl_callback_url, outcome))
                    if payload.hitl_callback_url
                    else None
                )
                result = executor.finalize_approval(
                    payload.approval_id,
                    hitl_callback=hitl_callback,
                )
                get_audit_logger(http_request).log(
                    actor=user,
                    action="config.apply.approve",
                    resource="/config/apply",
                    plan_id=payload.plan_id,
                    metadata={"approval_id": payload.approval_id},
                )
            elif payload.approval_decision is ApprovalDecision.REJECT:
                user = require_roles(http_request, Role.APPROVER)
                if not payload.approval_id:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="approval_id é obrigatório para rejeitar.",
                    )
                result = executor.reject_request(
                    payload.approval_id,
                    approver_id=user.id,
                    reason=payload.approval_reason,
                )
                get_audit_logger(http_request).log(
                    actor=user,
                    action="config.apply.reject",
                    resource="/config/apply",
                    plan_id=payload.plan_id,
                    metadata={"approval_id": payload.approval_id},
                    status="rejected",
                )
            else:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Decisão de aprovação desconhecida.",
                )
    except PlanExecutorError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    diff = PlanExecutionDiff(stat=result.diff_stat, patch=result.diff_patch)
    assistant_logger.info(
        "config.apply.result",
        plan_id=payload.plan_id,
        status=result.status.value,
        mode=result.mode.value,
        branch=result.branch,
        record_id=result.record_id,
    )
    return ApplyPlanResponse(
        status=result.status,
        mode=result.mode,
        plan_id=result.plan_id,
        record_id=result.record_id,
        branch=result.branch,
        base_branch=result.base_branch,
        commit_sha=result.commit_sha,
        diff=diff,
        hitl_required=result.hitl_required,
        message=result.message,
        approval_id=result.approval_id,
        pull_request=_serialize_pull_request(result.pull_request),
    )


@router.post("/config/apply/status", response_model=ApplyPlanResponse)
def sync_plan_status(payload: PlanStatusSyncRequest, http_request: Request) -> ApplyPlanResponse:
    """Update plan execution metadata with the latest status from Git providers."""

    user = require_roles(http_request, Role.APPROVER)
    executor = get_plan_executor()
    try:
        result = executor.sync_external_status(
            payload.record_id,
            plan_id=payload.plan_id,
            provider_payload=payload.provider_payload or None,
        )
    except PlanExecutorError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    diff = PlanExecutionDiff(stat=result.diff_stat, patch=result.diff_patch)
    assistant_logger.info(
        "config.apply.sync",
        plan_id=result.plan_id,
        record_id=result.record_id,
        status=result.status.value,
    )

    get_audit_logger(http_request).log(
        actor=user,
        action="config.apply.sync",
        resource="/config/apply/status",
        plan_id=result.plan_id,
        metadata={"record_id": result.record_id},
    )

    return ApplyPlanResponse(
        status=result.status,
        mode=result.mode,
        plan_id=result.plan_id,
        record_id=result.record_id,
        branch=result.branch,
        base_branch=result.base_branch,
        commit_sha=result.commit_sha,
        diff=diff,
        hitl_required=result.hitl_required,
        message=result.message,
        approval_id=result.approval_id,
        pull_request=_serialize_pull_request(result.pull_request),
    )


@router.post("/config/mcp/onboard", response_model=OnboardResponse)
def onboard_mcp_agent(request: OnboardRequest, http_request: Request) -> OnboardResponse:
    """Produce a plan focused on onboarding a new MCP agent."""

    user = require_roles(http_request, Role.PLANNER)
    agent_name = request.agent_name or request.repository.rstrip("/").split("/")[-1]
    payload: Dict[str, Any] = {
        "agent_name": agent_name,
        "repository": request.repository,
    }
    if request.capabilities:
        payload["capabilities"] = request.capabilities
    if request.endpoint:
        payload["endpoint"] = request.endpoint
    if request.auth:
        payload["auth"] = request.auth
    if request.tools:
        payload["tools"] = request.tools

    def _run_validation() -> MCPValidationOutcome | None:
        if not request.endpoint:
            return None
        try:
            return validate_server(payload)
        except MCPClientError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Falha ao validar servidor MCP: {exc}",
            ) from exc
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    if request.intent == OnboardIntent.VALIDATE:
        if not request.endpoint:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Endpoint é obrigatório para validar o servidor MCP.",
            )
        validation_outcome = _run_validation()
        get_audit_logger(http_request).log(
            actor=user,
            action="config.onboard.validate",
            resource="/config/mcp/onboard",
            metadata={"agent": agent_name},
        )
        return OnboardResponse(
            plan=None,
            preview=None,
            validation=_serialize_validation_details(validation_outcome),
        )

    plan = _build_plan(AssistantIntent.ADD_AGENT, payload)

    preview: PlanPreview | None = None
    try:
        executor = get_plan_executor()
        preview = executor.preview_execution(
            f"add-agent-{agent_name}",
            plan=plan,
            commit_message=f"chore: onboard {agent_name}",
        )
    except Exception as exc:  # pragma: no cover - defensive logging
        assistant_logger.warning(
            "config.onboard.preview_failed",
            agent=agent_name,
            error=str(exc),
        )
        preview = None

    validation_outcome = _run_validation()

    get_audit_logger(http_request).log(
        actor=user,
        action="config.onboard",
        resource="/config/mcp/onboard",
        metadata={"agent": agent_name},
    )
    return OnboardResponse(
        plan=plan,
        preview=_serialize_plan_preview(preview),
        validation=_serialize_validation_details(validation_outcome),
    )


@router.patch("/config/policies", response_model=PlanResponse)
def plan_policy_patch(request: PolicyPatchRequest, http_request: Request) -> PlanResponse:
    """Return a plan for applying policy updates before executing them."""

    user = require_roles(http_request, Role.PLANNER)
    payload = {"policy_id": request.policy_id, "changes": request.changes}
    plan = _build_plan(AssistantIntent.EDIT_POLICIES, payload)
    get_audit_logger(http_request).log(
        actor=user,
        action="config.policies.plan",
        resource="/config/policies",
        metadata={"policy_id": request.policy_id},
    )
    return PlanResponse(plan=plan)


@router.post("/config/reload", response_model=ReloadResponse)
def reload_artifacts(request: ReloadRequest, http_request: Request) -> ReloadResponse:
    """Create a plan for regenerating configuration artifacts."""

    user = require_roles(http_request, Role.APPROVER)
    payload: Dict[str, Any] = {
        "artifact_type": request.artifact_type,
        "target_path": request.target_path,
    }
    if request.parameters:
        payload["parameters"] = request.parameters

    try:
        artifact = generate_artifact(
            request.artifact_type,
            request.target_path,
            parameters=request.parameters or {},
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    repo_root = Path(__file__).resolve().parents[3]
    target_file = repo_root / artifact.target_path
    try:
        previous_content = target_file.read_text(encoding="utf-8")
        change_type = "update"
    except FileNotFoundError:
        previous_content = ""
        change_type = "create"

    previous_lines = previous_content.splitlines(keepends=True)
    next_lines = artifact.content.splitlines(keepends=True)
    diff_lines = list(
        difflib.unified_diff(
            previous_lines,
            next_lines,
            fromfile=f"a/{artifact.target_path}",
            tofile=f"b/{artifact.target_path}",
        )
    )
    patch = "".join(diff_lines)
    if patch and not patch.endswith("\n"):
        patch += "\n"

    plan = _build_plan(AssistantIntent.GENERATE_ARTIFACT, payload)
    if patch:
        plan.diffs = [
            DiffSummary(
                path=diff.path,
                summary=diff.summary,
                change_type=change_type,
                diff=patch,
            )
            for diff in plan.diffs
        ]
    else:
        plan.diffs = [
            DiffSummary(
                path=diff.path,
                summary=diff.summary,
                change_type=change_type,
                diff=None,
            )
            for diff in plan.diffs
        ]

    message = f"Plano gerado para regerar '{request.artifact_type}'."
    get_audit_logger(http_request).log(
        actor=user,
        action="config.reload",
        resource="/config/reload",
        metadata={"artifact_type": request.artifact_type, "target_path": request.target_path},
    )
    return ReloadResponse(message=message, plan=plan, patch=patch)
@router.get("/healthz", response_model=HealthStatus)
def read_health() -> HealthStatus:
    """Return an instantaneous health snapshot."""

    return HealthStatus()


@router.get("/providers", response_model=ProvidersResponse)
def list_providers() -> ProvidersResponse:
    """List the configured MCP providers available to the console."""

    return ProvidersResponse(providers=provider_registry.providers)


@router.post("/diagnostics/run", response_model=DiagnosticsResponse)
async def run_diagnostics(
    payload: DiagnosticsRequest,
    http_request: Request,
) -> DiagnosticsResponse:
    """Aggregate health, inventory and invoke checks for diagnostics."""

    audit_logger = getattr(http_request.app.state, "audit_logger", None)
    actor = None

    try:
        context = ensure_security_context(http_request)
    except HTTPException as exc:
        if exc.status_code not in (
            status.HTTP_401_UNAUTHORIZED,
            status.HTTP_403_FORBIDDEN,
        ):
            raise
    else:
        actor = context.user
        audit_logger = context.audit_logger

    resolved_logger = audit_logger or DEFAULT_AUDIT_LOGGER
    result = await diagnostics_service.run(http_request, payload)

    provider_count = _count_provider_entries(result.providers.data)
    metadata = {
        "agent": payload.invoke.agent,
        "summary": result.summary.model_dump(),
        "health": {
            "ok": result.health.ok,
            "status_code": result.health.status_code,
        },
        "providers": {
            "ok": result.providers.ok,
            "status_code": result.providers.status_code,
            "count": provider_count,
        },
        "invoke": {
            "ok": result.invoke.ok,
            "status_code": result.invoke.status_code,
        },
    }

    status_label = "success" if result.summary.failures == 0 else "error"
    resolved_logger.log(
        actor=actor,
        action="diagnostics.run",
        resource="/diagnostics/run",
        status=status_label,
        metadata=metadata,
    )
    return result


@router.get("/telemetry/metrics", response_model=TelemetryMetricsResponse)
def read_telemetry_metrics(
    start: datetime | None = Query(
        default=None,
        description="Inclusive lower bound (ISO 8601) for filtering telemetry events",
    ),
    end: datetime | None = Query(
        default=None,
        description="Inclusive upper bound (ISO 8601) for filtering telemetry events",
    ),
    provider_id: str | None = Query(
        default=None,
        description="Optional provider identifier to filter telemetry events",
    ),
    route: str | None = Query(
        default=None,
        description="Optional route identifier to filter telemetry events",
    ),
) -> TelemetryMetricsResponse:
    """Return aggregated telemetry metrics for the requested window."""

    try:
        aggregates = aggregate_metrics(
            start=start,
            end=end,
            provider_id=provider_id,
            route=route,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc
    return TelemetryMetricsResponse(
        start=aggregates.start,
        end=aggregates.end,
        total_runs=aggregates.total_runs,
        total_tokens_in=aggregates.total_tokens_in,
        total_tokens_out=aggregates.total_tokens_out,
        total_cost_usd=aggregates.total_cost_usd,
        avg_latency_ms=aggregates.avg_latency_ms,
        success_rate=aggregates.success_rate,
        providers=[
            TelemetryProviderMetrics(**provider.to_dict())
            for provider in aggregates.providers
        ],
        extended=(
            TelemetryMetricsExtended(**aggregates.extended.to_dict())
            if aggregates.extended
            else None
        ),
    )


@router.get("/telemetry/heatmap", response_model=TelemetryHeatmapResponse)
def read_telemetry_heatmap(
    start: datetime | None = Query(
        default=None,
        description="Inclusive lower bound (ISO 8601) for filtering telemetry events",
    ),
    end: datetime | None = Query(
        default=None,
        description="Inclusive upper bound (ISO 8601) for filtering telemetry events",
    ),
    provider_id: str | None = Query(
        default=None,
        description="Optional provider identifier to filter telemetry events",
    ),
    route: str | None = Query(
        default=None,
        description="Optional route identifier to filter telemetry events",
    ),
) -> TelemetryHeatmapResponse:
    """Return execution counts grouped by provider and day."""

    try:
        buckets = aggregate_heatmap(
            start=start,
            end=end,
            provider_id=provider_id,
            route=route,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc

    return TelemetryHeatmapResponse(
        buckets=[
            TelemetryHeatmapBucket(
                day=bucket.day,
                provider_id=bucket.provider_id,
                run_count=bucket.run_count,
            )
            for bucket in buckets
        ]
    )


@router.get("/telemetry/timeseries", response_model=TelemetryTimeseriesResponse)
def read_telemetry_timeseries(
    start: datetime | None = Query(
        default=None,
        description="Inclusive lower bound (ISO 8601) for filtering telemetry events",
    ),
    end: datetime | None = Query(
        default=None,
        description="Inclusive upper bound (ISO 8601) for filtering telemetry events",
    ),
    provider_id: str | None = Query(
        default=None,
        description="Optional provider identifier to filter telemetry events",
    ),
    lane: str | None = Query(
        default=None,
        description="Optional lane (economy/balanced/turbo) to limit providers",
    ),
) -> TelemetryTimeseriesResponse:
    try:
        points = query_timeseries(
            start=start,
            end=end,
            provider_id=provider_id,
            lane=lane,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc

    return TelemetryTimeseriesResponse(
        items=[TelemetryTimeseriesPointModel(**point.to_dict()) for point in points],
        next_cursor=None,
    )


@router.get("/telemetry/pareto", response_model=TelemetryParetoResponse)
def read_telemetry_pareto(
    start: datetime | None = Query(
        default=None,
        description="Inclusive lower bound (ISO 8601) for filtering telemetry events",
    ),
    end: datetime | None = Query(
        default=None,
        description="Inclusive upper bound (ISO 8601) for filtering telemetry events",
    ),
    provider_id: str | None = Query(
        default=None,
        description="Optional provider identifier to filter telemetry events",
    ),
    lane: str | None = Query(
        default=None,
        description="Optional lane (economy/balanced/turbo) to limit providers",
    ),
) -> TelemetryParetoResponse:
    try:
        breakdown = query_route_breakdown(
            start=start,
            end=end,
            provider_id=provider_id,
            lane=lane,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc

    return TelemetryParetoResponse(
        items=[TelemetryRouteBreakdownModel(**entry.to_dict()) for entry in breakdown],
        next_cursor=None,
    )


@router.get("/telemetry/runs", response_model=TelemetryRunsResponse)
def read_telemetry_runs(
    start: datetime | None = Query(
        default=None,
        description="Inclusive lower bound (ISO 8601) for filtering telemetry events",
    ),
    end: datetime | None = Query(
        default=None,
        description="Inclusive upper bound (ISO 8601) for filtering telemetry events",
    ),
    provider_id: str | None = Query(
        default=None,
        description="Optional provider identifier to filter telemetry events",
    ),
    lane: str | None = Query(
        default=None,
        description="Optional lane (economy/balanced/turbo) to limit providers",
    ),
    route: str | None = Query(
        default=None,
        description="Optional route identifier to filter telemetry events",
    ),
    limit: int = Query(
        default=20,
        ge=1,
        le=100,
        description="Maximum number of run records to return",
    ),
    cursor: str | None = Query(
        default=None,
        description="Opaque cursor for paginating telemetry runs",
    ),
) -> TelemetryRunsResponse:
    try:
        records, next_cursor = query_runs(
            start=start,
            end=end,
            provider_id=provider_id,
            lane=lane,
            route=route,
            limit=limit,
            cursor=cursor,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc

    items = [
        TelemetryRunEntryModel(
            id=record.record_id,
            provider_id=record.provider_id,
            provider_name=record.provider_name,
            route=record.route,
            lane=record.lane,
            ts=record.ts,
            tokens_in=record.tokens_in,
            tokens_out=record.tokens_out,
            duration_ms=record.duration_ms,
            status=record.status,
            cost_usd=record.cost_usd,
            metadata=record.metadata,
            experiment_cohort=record.experiment_cohort,
            experiment_tag=record.experiment_tag,
        )
        for record in records
    ]

    return TelemetryRunsResponse(items=items, next_cursor=next_cursor)


@router.get("/telemetry/experiments", response_model=TelemetryExperimentsResponse)
def read_telemetry_experiments(
    start: datetime | None = Query(
        default=None,
        description="Inclusive lower bound (ISO 8601) for filtering telemetry events",
    ),
    end: datetime | None = Query(
        default=None,
        description="Inclusive upper bound (ISO 8601) for filtering telemetry events",
    ),
    provider_id: str | None = Query(
        default=None,
        description="Optional provider identifier to filter telemetry events",
    ),
    route: str | None = Query(
        default=None,
        description="Optional route identifier to filter telemetry events",
    ),
    lane: str | None = Query(
        default=None,
        description="Optional lane (economy/balanced/turbo) to limit providers",
    ),
) -> TelemetryExperimentsResponse:
    try:
        summaries = query_experiment_summaries(
            start=start,
            end=end,
            provider_id=provider_id,
            route=route,
            lane=lane,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc

    return TelemetryExperimentsResponse(
        items=[TelemetryExperimentSummaryEntry(**summary.to_dict()) for summary in summaries]
    )


@router.get("/telemetry/lane-costs", response_model=TelemetryLaneCostResponse)
def read_telemetry_lane_costs(
    start: datetime | None = Query(
        default=None,
        description="Inclusive lower bound (ISO 8601) for filtering telemetry events",
    ),
    end: datetime | None = Query(
        default=None,
        description="Inclusive upper bound (ISO 8601) for filtering telemetry events",
    ),
    provider_id: str | None = Query(
        default=None,
        description="Optional provider identifier to filter telemetry events",
    ),
    route: str | None = Query(
        default=None,
        description="Optional route identifier to filter telemetry events",
    ),
    lane: str | None = Query(
        default=None,
        description="Optional lane (economy/balanced/turbo) to limit providers",
    ),
) -> TelemetryLaneCostResponse:
    try:
        lane_costs = compute_lane_cost_breakdown(
            start=start,
            end=end,
            provider_id=provider_id,
            route=route,
            lane=lane,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc

    return TelemetryLaneCostResponse(
        items=[TelemetryLaneCostEntry(**entry.to_dict()) for entry in lane_costs]
    )


@router.get(
    "/telemetry/marketplace/performance",
    response_model=MarketplacePerformanceResponse,
)
def read_marketplace_performance(
    start: datetime | None = Query(
        default=None,
        description="Inclusive lower bound (ISO 8601) for filtering telemetry events",
    ),
    end: datetime | None = Query(
        default=None,
        description="Inclusive upper bound (ISO 8601) for filtering telemetry events",
    ),
    provider_id: str | None = Query(
        default=None,
        description="Optional provider identifier to filter telemetry events",
    ),
    route: str | None = Query(
        default=None,
        description="Optional route identifier to filter telemetry events",
    ),
) -> MarketplacePerformanceResponse:
    try:
        performance = compute_marketplace_performance(
            start=start,
            end=end,
            provider_id=provider_id,
            route=route,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc

    return MarketplacePerformanceResponse(
        items=[MarketplacePerformanceEntry(**entry.to_dict()) for entry in performance]
    )


@router.get("/telemetry/finops/sprints", response_model=FinOpsSprintReportsResponse)
def read_finops_sprint_reports(
    start: datetime | None = Query(
        default=None,
        description="Inclusive lower bound (ISO 8601) para o período avaliado",
    ),
    end: datetime | None = Query(
        default=None,
        description="Inclusive upper bound (ISO 8601) para o período avaliado",
    ),
    provider_id: str | None = Query(
        default=None,
        description="Identificador opcional de provedor",
    ),
    lane: str | None = Query(
        default=None,
        description="Lane opcional para filtrar provedores",
    ),
    window_days: int = Query(
        default=7,
        ge=1,
        le=90,
        description="Número de dias por sprint para comparar períodos",
    ),
    limit: int = Query(
        default=4,
        ge=1,
        le=12,
        description="Quantidade máxima de sprints retornados",
    ),
) -> FinOpsSprintReportsResponse:
    try:
        reports = compute_finops_sprint_reports(
            start=start,
            end=end,
            provider_id=provider_id,
            lane=lane,
            window_days=window_days,
            limit=limit,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    items = [FinOpsSprintReportModel(**report.to_dict()) for report in reports]
    return FinOpsSprintReportsResponse(items=items)


@router.get(
    "/telemetry/finops/pull-requests",
    response_model=FinOpsPullRequestReportsResponse,
)
def read_finops_pull_request_reports(
    start: datetime | None = Query(
        default=None,
        description="Inclusive lower bound (ISO 8601) para o período avaliado",
    ),
    end: datetime | None = Query(
        default=None,
        description="Inclusive upper bound (ISO 8601) para o período avaliado",
    ),
    provider_id: str | None = Query(
        default=None,
        description="Identificador opcional de provedor",
    ),
    lane: str | None = Query(
        default=None,
        description="Lane opcional para filtrar provedores",
    ),
    window_days: int = Query(
        default=7,
        ge=1,
        le=90,
        description="Janela usada para comparar com o período anterior",
    ),
    limit: int = Query(
        default=4,
        ge=1,
        le=12,
        description="Quantidade máxima de relatórios retornados",
    ),
) -> FinOpsPullRequestReportsResponse:
    try:
        reports = compute_finops_pull_request_reports(
            start=start,
            end=end,
            provider_id=provider_id,
            lane=lane,
            window_days=window_days,
            limit=limit,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    items = [FinOpsPullRequestReportModel(**report.to_dict()) for report in reports]
    return FinOpsPullRequestReportsResponse(items=items)


@router.get("/telemetry/export")
def export_telemetry(
    format: str = Query(
        default="csv",
        description="Formato de exportação desejado (csv ou html)",
    ),
    start: datetime | None = Query(
        default=None,
        description="Inclusivo: limite inferior ISO 8601 para filtrar eventos",
    ),
    end: datetime | None = Query(
        default=None,
        description="Inclusivo: limite superior ISO 8601 para filtrar eventos",
    ),
    provider_id: str | None = Query(
        default=None,
        description="Opcional: filtra por identificador do provedor",
    ),
    route: str | None = Query(
        default=None,
        description="Opcional: filtra por rota",
    ),
) -> Response:
    """Render telemetry exports in CSV or HTML."""

    try:
        document, media_type = render_telemetry_export(
            format,
            start=start,
            end=end,
            provider_id=provider_id,
            route=route,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc
    return Response(content=document, media_type=media_type)


@router.get("/policies", response_model=CostPoliciesResponse)
def list_cost_policies() -> CostPoliciesResponse:
    """Return the cost policies configured for the console."""

    records = [CostPolicyResponse(**record.to_dict()) for record in list_policies()]
    return CostPoliciesResponse(policies=records)


@router.get("/policies/overrides", response_model=PolicyOverridesResponse)
def list_cost_policy_overrides() -> PolicyOverridesResponse:
    """Return the policy overrides configured for routes and projects."""

    records = [PolicyOverrideResponse(**record.to_dict()) for record in list_policy_overrides()]
    return PolicyOverridesResponse(overrides=records)


@router.get("/policies/templates", response_model=PolicyTemplatesResponse)
def list_templates() -> PolicyTemplatesResponse:
    """Expose the available guardrail policy templates."""

    templates = [
        PolicyTemplateResponse.model_validate(template.to_dict())
        for template in list_policy_templates()
    ]
    rollout_plans = build_rollout_plans()
    if rollout_plans:
        generated_at = max(plan.generated_at for plan in rollout_plans)
        rollout = PolicyRolloutOverview(
            generated_at=generated_at,
            plans=[
                PolicyRolloutPlan(
                    template_id=plan.template_id,
                    generated_at=plan.generated_at,
                    allocations=[
                        PolicyRolloutAllocation(
                            segment=PolicyRolloutSegment(
                                id=allocation.segment.id,
                                name=allocation.segment.name,
                                description=allocation.segment.description,
                            ),
                            coverage=allocation.coverage_pct,
                            providers=[
                                provider
                                for provider in allocation.providers
                            ],
                        )
                        for allocation in plan.allocations
                    ],
                )
                for plan in rollout_plans
            ],
        )
    else:
        rollout = None
    return PolicyTemplatesResponse(templates=templates, rollout=rollout)


@router.get("/policies/deployments", response_model=PolicyDeploymentsResponse)
def list_policy_deployment_history() -> PolicyDeploymentsResponse:
    """Return the recorded deployment history for policy templates."""

    records = [
        PolicyDeploymentResponse(**record.to_dict())
        for record in list_policy_deployments()
    ]
    active_id = records[-1].id if records else None
    return PolicyDeploymentsResponse(deployments=records, active_id=active_id)


@router.post("/policies", response_model=CostPolicyResponse, status_code=status.HTTP_201_CREATED)
def create_cost_policy(payload: CostPolicyCreateRequest) -> CostPolicyResponse:
    """Persist a new cost policy definition."""

    try:
        record = create_policy(
            policy_id=payload.id,
            name=payload.name,
            description=payload.description,
            monthly_spend_limit=payload.monthly_spend_limit,
            currency=payload.currency,
            tags=payload.tags,
        )
    except CostPolicyAlreadyExistsError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Policy '{payload.id}' already exists",
        ) from exc
    return CostPolicyResponse(**record.to_dict())


@router.post(
    "/policies/overrides",
    response_model=PolicyOverrideResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_cost_policy_override(payload: PolicyOverrideCreateRequest) -> PolicyOverrideResponse:
    """Persist a new policy override definition."""

    try:
        record = create_policy_override(
            override_id=payload.id,
            route=payload.route,
            project=payload.project,
            template_id=payload.template_id,
            max_latency_ms=payload.max_latency_ms,
            max_cost_usd=payload.max_cost_usd,
            require_manual_approval=payload.require_manual_approval,
            notes=payload.notes,
        )
    except PolicyOverrideAlreadyExistsError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Policy override '{payload.id}' already exists",
        ) from exc
    return PolicyOverrideResponse(**record.to_dict())


@router.post(
    "/policies/deployments",
    response_model=PolicyDeploymentResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_policy_deployment_entry(
    payload: PolicyDeploymentCreateRequest,
) -> PolicyDeploymentResponse:
    """Record a new deployment for a guardrail template."""

    try:
        record = create_policy_deployment(
            template_id=payload.template_id,
            author=payload.author,
            window=payload.window,
            note=payload.note,
        )
    except InvalidPolicyTemplateError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown policy template '{payload.template_id}'",
        ) from exc
    return PolicyDeploymentResponse(**record.to_dict())


@router.get("/policies/{policy_id}", response_model=CostPolicyResponse)
def read_cost_policy(policy_id: str) -> CostPolicyResponse:
    """Return a single cost policy."""

    try:
        record = get_policy(policy_id)
    except CostPolicyNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Policy '{policy_id}' not found",
        ) from exc
    return CostPolicyResponse(**record.to_dict())


@router.get("/policies/overrides/{override_id}", response_model=PolicyOverrideResponse)
def read_cost_policy_override(override_id: str) -> PolicyOverrideResponse:
    """Return a single policy override."""

    try:
        record = get_policy_override(override_id)
    except PolicyOverrideNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Policy override '{override_id}' not found",
        ) from exc
    return PolicyOverrideResponse(**record.to_dict())


@router.delete("/policies/deployments/{deployment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_policy_deployment_entry(deployment_id: str) -> Response:
    """Remove a recorded policy deployment (used for rollback)."""

    try:
        delete_policy_deployment(deployment_id)
    except PolicyDeploymentNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Deployment '{deployment_id}' not found",
        ) from exc
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.put("/policies/{policy_id}", response_model=CostPolicyResponse)
def update_cost_policy(policy_id: str, payload: CostPolicyUpdateRequest) -> CostPolicyResponse:
    """Update an existing cost policy."""

    try:
        record = update_policy(
            policy_id,
            name=payload.name,
            description=payload.description,
            monthly_spend_limit=payload.monthly_spend_limit,
            currency=payload.currency,
            tags=payload.tags,
        )
    except CostPolicyNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Policy '{policy_id}' not found",
        ) from exc
    return CostPolicyResponse(**record.to_dict())


@router.put("/policies/overrides/{override_id}", response_model=PolicyOverrideResponse)
def update_cost_policy_override(
    override_id: str, payload: PolicyOverrideUpdateRequest
) -> PolicyOverrideResponse:
    """Update an existing policy override."""

    try:
        record = update_policy_override(
            override_id,
            route=payload.route,
            project=payload.project,
            template_id=payload.template_id,
            max_latency_ms=payload.max_latency_ms,
            max_cost_usd=payload.max_cost_usd,
            require_manual_approval=payload.require_manual_approval,
            notes=payload.notes,
        )
    except PolicyOverrideNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Policy override '{override_id}' not found",
        ) from exc
    return PolicyOverrideResponse(**record.to_dict())


@router.delete("/policies/{policy_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_cost_policy(policy_id: str) -> Response:
    """Remove a cost policy definition."""

    try:
        delete_policy(policy_id)
    except CostPolicyNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Policy '{policy_id}' not found",
        ) from exc
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/policies/overrides/{override_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_cost_policy_override(override_id: str) -> Response:
    """Remove a policy override definition."""

    try:
        delete_policy_override(override_id)
    except PolicyOverrideNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Policy override '{override_id}' not found",
        ) from exc
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/prices", response_model=PriceEntriesResponse)
def list_price_table() -> PriceEntriesResponse:
    """Return the stored price table entries."""

    records = [PriceEntryResponse(**record.to_dict()) for record in list_price_entries()]
    return PriceEntriesResponse(entries=records)


@router.get("/marketplace", response_model=MarketplaceEntriesResponse)
def list_marketplace_catalog() -> MarketplaceEntriesResponse:
    """Return the curated marketplace catalog."""

    records = [MarketplaceEntryResponse(**record.to_dict()) for record in list_marketplace_entries()]
    return MarketplaceEntriesResponse(entries=records)


@router.post("/marketplace", response_model=MarketplaceEntryResponse, status_code=status.HTTP_201_CREATED)
def create_marketplace_catalog_entry(payload: MarketplaceEntryCreateRequest) -> MarketplaceEntryResponse:
    """Register a new marketplace entry."""

    try:
        record = create_marketplace_entry(
            entry_id=payload.id,
            name=payload.name,
            slug=payload.slug,
            summary=payload.summary,
            description=payload.description,
            origin=payload.origin,
            rating=payload.rating,
            cost=payload.cost,
            tags=payload.tags,
            capabilities=payload.capabilities,
            repository_url=payload.repository_url,
            package_path=payload.package_path,
            manifest_filename=payload.manifest_filename,
            entrypoint_filename=payload.entrypoint_filename,
            target_repository=payload.target_repository,
            signature=payload.signature,
        )
    except MarketplaceEntryAlreadyExistsError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Marketplace entry '{payload.id}' already exists",
        ) from exc
    return MarketplaceEntryResponse(**record.to_dict())


@router.get("/marketplace/{entry_id}", response_model=MarketplaceEntryResponse)
def read_marketplace_catalog_entry(entry_id: str) -> MarketplaceEntryResponse:
    """Return a single marketplace entry."""

    try:
        record = get_marketplace_entry(entry_id)
    except MarketplaceEntryNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Marketplace entry '{entry_id}' not found",
        ) from exc
    return MarketplaceEntryResponse(**record.to_dict())


@router.put("/marketplace/{entry_id}", response_model=MarketplaceEntryResponse)
def update_marketplace_catalog_entry(entry_id: str, payload: MarketplaceEntryUpdateRequest) -> MarketplaceEntryResponse:
    """Update a marketplace entry."""

    try:
        record = update_marketplace_entry_record(
            entry_id,
            name=payload.name,
            slug=payload.slug,
            summary=payload.summary,
            description=payload.description,
            origin=payload.origin,
            rating=payload.rating,
            cost=payload.cost,
            tags=payload.tags,
            capabilities=payload.capabilities,
            repository_url=payload.repository_url,
            package_path=payload.package_path,
            manifest_filename=payload.manifest_filename,
            entrypoint_filename=payload.entrypoint_filename,
            target_repository=payload.target_repository,
            signature=payload.signature,
        )
    except MarketplaceEntryNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Marketplace entry '{entry_id}' not found",
        ) from exc
    return MarketplaceEntryResponse(**record.to_dict())


@router.delete("/marketplace/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_marketplace_catalog_entry(entry_id: str) -> Response:
    """Remove a marketplace entry from the catalog."""

    try:
        delete_marketplace_entry_record(entry_id)
    except MarketplaceEntryNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Marketplace entry '{entry_id}' not found",
        ) from exc
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/marketplace/{entry_id}/import", response_model=MarketplaceImportResponse)
def import_marketplace_entry(entry_id: str, http_request: Request) -> MarketplaceImportResponse:
    """Prepare marketplace artifacts and build an onboarding plan."""

    ensure_security_context(http_request)
    user = require_roles(http_request, Role.PLANNER)
    try:
        with TemporaryDirectory(prefix="mcp-marketplace-") as sandbox:
            bundle = prepare_marketplace_install(entry_id, Path(sandbox))
            manifest_text = bundle.manifest_path.read_text(encoding="utf-8")
            agent_text = (
                bundle.agent_path.read_text(encoding="utf-8")
                if bundle.agent_path is not None
                else None
            )
            plan = _build_plan(
                AssistantIntent.ADD_AGENT,
                {
                    "agent_name": bundle.entry.name,
                    "repository": bundle.entry.target_repository,
                    "capabilities": bundle.entry.capabilities,
                },
            )
    except MarketplaceEntryNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Marketplace entry '{entry_id}' not found",
        ) from exc
    except (MarketplaceArtifactError, MarketplaceSignatureError) as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

    entry_response = MarketplaceEntryResponse(**bundle.entry.to_dict())
    get_audit_logger(http_request).log(
        actor=user,
        action="marketplace.import",
        resource=f"/marketplace/{entry_id}/import",
        metadata={"entry_id": entry_id, "slug": bundle.entry.slug},
    )
    return MarketplaceImportResponse(
        entry=entry_response,
        plan=plan,
        manifest=manifest_text,
        agent_code=agent_text,
    )


@router.post("/prices", response_model=PriceEntryResponse, status_code=status.HTTP_201_CREATED)
def create_price_table_entry(payload: PriceEntryCreateRequest) -> PriceEntryResponse:
    """Persist a new price table entry."""

    try:
        record = create_price_entry(
            entry_id=payload.id,
            provider_id=payload.provider_id,
            model=payload.model,
            currency=payload.currency,
            unit=payload.unit,
            input_cost_per_1k=payload.input_cost_per_1k,
            output_cost_per_1k=payload.output_cost_per_1k,
            embedding_cost_per_1k=payload.embedding_cost_per_1k,
            tags=payload.tags,
            notes=payload.notes,
            effective_at=payload.effective_at,
        )
    except PriceEntryAlreadyExistsError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Price entry '{payload.id}' already exists",
        ) from exc
    return PriceEntryResponse(**record.to_dict())


@router.get("/prices/{price_id}", response_model=PriceEntryResponse)
def read_price_table_entry(price_id: str) -> PriceEntryResponse:
    """Return a single price table entry."""

    try:
        record = get_price_entry(price_id)
    except PriceEntryNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Price entry '{price_id}' not found",
        ) from exc
    return PriceEntryResponse(**record.to_dict())


@router.put("/prices/{price_id}", response_model=PriceEntryResponse)
def update_price_table_entry(price_id: str, payload: PriceEntryUpdateRequest) -> PriceEntryResponse:
    """Update an existing price table entry."""

    try:
        record = update_price_entry(
            price_id,
            provider_id=payload.provider_id,
            model=payload.model,
            currency=payload.currency,
            unit=payload.unit,
            input_cost_per_1k=payload.input_cost_per_1k,
            output_cost_per_1k=payload.output_cost_per_1k,
            embedding_cost_per_1k=payload.embedding_cost_per_1k,
            tags=payload.tags,
            notes=payload.notes,
            effective_at=payload.effective_at,
        )
    except PriceEntryNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Price entry '{price_id}' not found",
        ) from exc
    return PriceEntryResponse(**record.to_dict())


@router.delete("/prices/{price_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_price_table_entry(price_id: str) -> Response:
    """Remove a price table entry."""

    try:
        delete_price_entry(price_id)
    except PriceEntryNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Price entry '{price_id}' not found",
        ) from exc
    return Response(status_code=status.HTTP_204_NO_CONTENT)


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


@router.post("/secrets/{provider_id}/test", response_model=SecretTestResponse)
def test_secret(provider_id: str) -> SecretTestResponse:
    """Execute a connectivity test for the stored provider secret."""

    try:
        result = validate_secret(provider_id)
    except ProviderNotRegisteredError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except SecretNotConfiguredError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except SecretValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc

    return SecretTestResponse(
        provider_id=result.provider_id,
        status=result.status,
        latency_ms=result.latency_ms,
        tested_at=result.tested_at,
        message=result.message,
    )


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


@router.get("/servers/processes", response_model=ServerProcessesResponse)
def list_server_processes() -> ServerProcessesResponse:
    """Return snapshots for all supervised MCP server processes."""

    snapshots = process_supervisor.list()
    return ServerProcessesResponse(
        processes=[_process_state_from_snapshot(snapshot) for snapshot in snapshots]
    )


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


def _serialize_log(entry: ProcessLogEntry) -> ServerProcessLogEntry:
    return ServerProcessLogEntry(
        id=str(entry.id),
        timestamp=entry.timestamp,
        level="error" if entry.level == "error" else "info",
        message=entry.message,
    )


def _process_state_from_snapshot(snapshot: ProcessSnapshot) -> ServerProcessState:
    return ServerProcessState(
        server_id=snapshot.server_id,
        command=snapshot.command,
        status=ServerProcessLifecycle(snapshot.status.value),
        pid=snapshot.pid,
        started_at=snapshot.started_at,
        stopped_at=snapshot.stopped_at,
        return_code=snapshot.return_code,
        last_error=snapshot.last_error,
        logs=[_serialize_log(entry) for entry in snapshot.logs],
        cursor=str(snapshot.log_cursor) if snapshot.log_cursor else None,
    )


@router.get("/servers/{server_id}/process", response_model=ServerProcessResponse)
def read_server_process(server_id: str) -> ServerProcessResponse:
    """Return the supervisor snapshot for a single MCP server."""

    try:
        record = get_server(server_id)
    except MCPServerNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Server '{server_id}' not found",
        ) from exc

    snapshot = process_supervisor.status(server_id, command=record.command)
    return ServerProcessResponse(process=_process_state_from_snapshot(snapshot))


@router.post("/servers/{server_id}/process/start", response_model=ServerProcessResponse)
def start_server_process(server_id: str) -> ServerProcessResponse:
    """Start the command configured for an MCP server."""

    try:
        record = get_server(server_id)
    except MCPServerNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Server '{server_id}' not found",
        ) from exc

    try:
        snapshot = process_supervisor.start(server_id, record.command)
    except ProcessAlreadyRunningError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Server '{server_id}' is already running",
        ) from exc
    except ProcessStartError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        ) from exc

    return ServerProcessResponse(process=_process_state_from_snapshot(snapshot))


@router.post("/servers/{server_id}/process/stop", response_model=ServerProcessResponse)
def stop_server_process(server_id: str) -> ServerProcessResponse:
    """Terminate the supervised process associated with an MCP server."""

    try:
        snapshot = process_supervisor.stop(server_id)
    except ProcessNotRunningError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Server '{server_id}' is not running",
        ) from exc
    return ServerProcessResponse(process=_process_state_from_snapshot(snapshot))


@router.post("/servers/{server_id}/process/restart", response_model=ServerProcessResponse)
def restart_server_process(server_id: str) -> ServerProcessResponse:
    """Restart the supervised process associated with an MCP server."""

    try:
        record = get_server(server_id)
    except MCPServerNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Server '{server_id}' not found",
        ) from exc

    try:
        snapshot = process_supervisor.restart(server_id, record.command)
    except ProcessStartError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        ) from exc

    return ServerProcessResponse(process=_process_state_from_snapshot(snapshot))


@router.get("/servers/{server_id}/process/logs", response_model=ServerProcessLogsResponse)
def read_server_process_logs(
    server_id: str, cursor: str | None = None
) -> ServerProcessLogsResponse:
    """Return new log entries emitted by the process supervisor for a server."""

    numeric_cursor: int | None = None
    if cursor:
        try:
            numeric_cursor = int(cursor)
        except ValueError as exc:  # pragma: no cover - FastAPI validation safeguards the path
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cursor must be an integer",
            ) from exc

    entries = process_supervisor.logs(server_id, cursor=numeric_cursor)
    if not entries:
        return ServerProcessLogsResponse(logs=[], cursor=cursor)

    serialized = [_serialize_log(entry) for entry in entries]
    latest_cursor = str(entries[-1].id)
    return ServerProcessLogsResponse(logs=serialized, cursor=latest_cursor)


def _serialize_route(route: RouteProfile) -> RoutingRouteProfile:
    return RoutingRouteProfile(
        id=route.id,
        provider=route.provider,
        lane=route.lane,
        cost_per_million=route.cost_per_million,
        latency_p95=route.latency_p95,
        reliability=route.reliability,
        capacity_score=route.capacity_score,
    )


def _serialize_distribution(entry: DistributionEntry) -> RoutingDistributionEntry:
    return RoutingDistributionEntry(
        route=_serialize_route(entry.route),
        share=entry.share,
        tokens_millions=entry.tokens_millions,
        cost=entry.cost,
    )


def _estimate_entry_cost(entry: "PriceEntryRecord", tokens_in: int, tokens_out: int) -> float:
    input_cost = (entry.input_cost_per_1k or 0.0) * (tokens_in / 1000.0)
    output_cost = (entry.output_cost_per_1k or 0.0) * (tokens_out / 1000.0)
    return round(input_cost + output_cost, 4)


def _select_pricing_entry(
    entries: Iterable["PriceEntryRecord"],
    provider_id: str,
    model: str | None,
    tokens_in: int,
    tokens_out: int,
) -> "PriceEntryRecord":
    filtered = [entry for entry in entries if entry.provider_id == provider_id]
    if model:
        preferred = [entry for entry in filtered if entry.model == model]
        if preferred:
            filtered = preferred
    if not filtered:
        raise LookupError(f"No pricing data found for provider '{provider_id}'")

    def _entry_cost(entry: "PriceEntryRecord") -> float:
        raw_cost = (entry.input_cost_per_1k or 0.0) * (tokens_in / 1000.0)
        raw_cost += (entry.output_cost_per_1k or 0.0) * (tokens_out / 1000.0)
        return raw_cost

    return min(filtered, key=_entry_cost)


@router.post("/routing/simulate", response_model=RoutingSimulationResponse)
def simulate_routing(payload: RoutingSimulationRequest) -> RoutingSimulationResponse:
    """Calculate a routing plan using the deterministic simulator."""

    providers = provider_registry.providers
    provider_map = {provider.id: provider for provider in providers}

    if payload.provider_ids:
        requested_ids = set(payload.provider_ids)
        missing = requested_ids - provider_map.keys()
        if missing:
            missing_list = ", ".join(sorted(missing))
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Providers not found: {missing_list}",
            )
        selected_providers = [provider_map[provider_id] for provider_id in payload.provider_ids]
    else:
        selected_providers = providers

    routes = build_routes(selected_providers)
    plan = compute_plan(
        routes,
        payload.strategy,
        payload.failover_provider_id,
        payload.volume_millions,
    )

    return RoutingSimulationResponse(
        total_cost=plan.total_cost,
        cost_per_million=plan.cost_per_million,
        avg_latency=plan.avg_latency,
        reliability_score=plan.reliability_score,
        distribution=[_serialize_distribution(entry) for entry in plan.distribution],
        excluded_route=_serialize_route(plan.excluded_route) if plan.excluded_route else None,
    )


@router.post("/policies/dry-run", response_model=CostDryRunResponse)
def evaluate_cost_guardrail(payload: CostDryRunRequest) -> CostDryRunResponse:
    """Estimate execution cost and validate it against guardrail policies."""

    price_entries = list_price_entries()
    try:
        selected_entry = _select_pricing_entry(
            price_entries,
            payload.provider_id,
            payload.model,
            payload.tokens_in,
            payload.tokens_out,
        )
    except LookupError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc

    estimated_cost = _estimate_entry_cost(
        selected_entry, payload.tokens_in, payload.tokens_out
    )

    pricing_reference = CostDryRunPricingReference(
        entry_id=selected_entry.id,
        provider_id=selected_entry.provider_id,
        model=selected_entry.model,
        currency=selected_entry.currency,
        unit=selected_entry.unit,
        input_cost_per_1k=selected_entry.input_cost_per_1k,
        output_cost_per_1k=selected_entry.output_cost_per_1k,
    )

    override = find_policy_override(payload.route, payload.project)
    guardrail: CostDryRunGuardrail | None = None
    limit_usd: float | None = None
    reasons: list[str] = []
    allowed = True

    if override:
        guardrail = CostDryRunGuardrail(
            id=override.id,
            route=override.route,
            project=override.project,
            template_id=override.template_id,
            max_cost_usd=override.max_cost_usd,
            require_manual_approval=override.require_manual_approval,
        )
        if override.max_cost_usd is not None:
            limit_usd = round(float(override.max_cost_usd), 4)
            if estimated_cost > limit_usd:
                allowed = False
                reasons.append(
                    f"Estimated cost ${estimated_cost:.4f} exceeds guardrail limit ${limit_usd:.4f}"
                )
        if override.require_manual_approval:
            allowed = False
            reasons.append("Manual approval required by guardrail override")

    message = "Run is within guardrails" if not reasons else "; ".join(reasons)

    return CostDryRunResponse(
        provider_id=payload.provider_id,
        project=payload.project,
        route=payload.route,
        tokens_in=payload.tokens_in,
        tokens_out=payload.tokens_out,
        estimated_cost_usd=estimated_cost,
        allowed=allowed,
        limit_usd=limit_usd,
        guardrail=guardrail,
        pricing=pricing_reference,
        message=message,
    )
@router.get("/notifications", response_model=NotificationsResponse)
def read_notifications() -> NotificationsResponse:
    """Expose curated notifications for the Console UI."""

    try:
        notifications = list_notifications()
    except Exception as exc:  # pragma: no cover - defensive guard
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        ) from exc

    return NotificationsResponse(
        notifications=[
            NotificationResponse(
                id=item.id,
                severity=item.severity,
                title=item.title,
                message=item.message,
                timestamp=item.timestamp,
                category=item.category,
                tags=list(item.tags),
            )
            for item in notifications
        ]
    )

