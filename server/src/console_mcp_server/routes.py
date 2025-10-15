"""API route declarations for the Console MCP Server prototype."""

from __future__ import annotations

from datetime import datetime
from typing import Iterable

from fastapi import APIRouter, HTTPException, Query, Response, status

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
from .policy_templates import list_policy_templates
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
from .schemas import (
    CostPoliciesResponse,
    CostPolicyCreateRequest,
    CostPolicyResponse,
    CostPolicyUpdateRequest,
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
    PolicyTemplateResponse,
    PolicyTemplatesResponse,
    NotificationResponse,
    NotificationsResponse,
    HealthStatus,
    PriceEntriesResponse,
    PriceEntryCreateRequest,
    PriceEntryResponse,
    PriceEntryUpdateRequest,
    MCPServerCreateRequest,
    MCPServerResponse,
    MCPServerUpdateRequest,
    MCPServersResponse,
    ProvidersResponse,
    RoutingDistributionEntry,
    RoutingRouteProfile,
    RoutingSimulationRequest,
    RoutingSimulationResponse,
    TelemetryHeatmapBucket,
    TelemetryHeatmapResponse,
    TelemetryMetricsResponse,
    TelemetryProviderMetrics,
    TelemetryParetoResponse,
    TelemetryRouteBreakdownEntry as TelemetryRouteBreakdownModel,
    TelemetryRunEntry as TelemetryRunEntryModel,
    TelemetryRunsResponse,
    TelemetryTimeseriesPoint as TelemetryTimeseriesPointModel,
    TelemetryTimeseriesResponse,
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
    query_route_breakdown,
    query_runs,
    query_timeseries,
    render_telemetry_export,
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


@router.get("/healthz", response_model=HealthStatus)
def read_health() -> HealthStatus:
    """Return an instantaneous health snapshot."""

    return HealthStatus()


@router.get("/providers", response_model=ProvidersResponse)
def list_providers() -> ProvidersResponse:
    """List the configured MCP providers available to the console."""

    return ProvidersResponse(providers=provider_registry.providers)


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
        )
        for record in records
    ]

    return TelemetryRunsResponse(items=items, next_cursor=next_cursor)


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
    return PolicyTemplatesResponse(templates=templates)


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

