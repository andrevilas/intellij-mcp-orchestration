"""API route declarations for the Console MCP Server prototype."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Response, status

from .policies import (
    CostPolicyAlreadyExistsError,
    CostPolicyNotFoundError,
    create_policy,
    delete_policy,
    get_policy,
    list_policies,
    update_policy,
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
from .schemas import (
    CostPoliciesResponse,
    CostPolicyCreateRequest,
    CostPolicyResponse,
    CostPolicyUpdateRequest,
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
    SecretMetadataResponse,
    SecretValueResponse,
    SecretWriteRequest,
    SecretsResponse,
    ServerProcessLifecycle,
    ServerProcessResponse,
    ServerProcessState,
    ServerProcessesResponse,
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
from .supervisor import (
    ProcessAlreadyRunningError,
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


@router.get("/policies", response_model=CostPoliciesResponse)
def list_cost_policies() -> CostPoliciesResponse:
    """Return the cost policies configured for the console."""

    records = [CostPolicyResponse(**record.to_dict()) for record in list_policies()]
    return CostPoliciesResponse(policies=records)


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
