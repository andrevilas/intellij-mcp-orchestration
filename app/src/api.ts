export interface ProviderSummary {
  id: string;
  name: string;
  command: string;
  description?: string;
  tags: string[];
  capabilities: string[];
  transport: string;
  is_available?: boolean;
}

export interface Session {
  id: string;
  provider_id: string;
  created_at: string;
  status: string;
  reason?: string | null;
  client?: string | null;
}

export interface ProvidersResponse {
  providers: ProviderSummary[];
}

export type PolicyTemplateId = 'economy' | 'balanced' | 'turbo';

export interface PolicyTemplate {
  id: PolicyTemplateId;
  name: string;
  tagline: string;
  description: string;
  priceDelta: string;
  latencyTarget: string;
  guardrailLevel: string;
  features: string[];
}

export interface CostPolicy {
  id: string;
  name: string;
  description: string | null;
  monthlySpendLimit: number;
  currency: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CostPolicyCreateInput {
  id: string;
  name: string;
  description?: string | null;
  monthlySpendLimit: number;
  currency: string;
  tags?: string[];
}

export interface CostPolicyUpdateInput {
  name: string;
  description?: string | null;
  monthlySpendLimit: number;
  currency: string;
  tags?: string[];
}

export interface PolicyOverride {
  id: string;
  route: string;
  project: string;
  templateId: string;
  maxLatencyMs: number | null;
  maxCostUsd: number | null;
  requireManualApproval: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PolicyOverrideCreateInput {
  id: string;
  route: string;
  project: string;
  templateId: string;
  maxLatencyMs?: number | null;
  maxCostUsd?: number | null;
  requireManualApproval?: boolean;
  notes?: string | null;
}

export interface PolicyOverrideUpdateInput {
  route: string;
  project: string;
  templateId: string;
  maxLatencyMs?: number | null;
  maxCostUsd?: number | null;
  requireManualApproval?: boolean;
  notes?: string | null;
}

export interface PolicyDeployment {
  id: string;
  templateId: string;
  deployedAt: string;
  author: string;
  window: string | null;
  note: string | null;
  sloP95Ms: number;
  budgetUsagePct: number;
  incidentsCount: number;
  guardrailScore: number;
  createdAt: string;
  updatedAt: string;
}

export interface PolicyDeploymentCreateInput {
  templateId: string;
  author?: string;
  window?: string | null;
  note?: string | null;
}

export interface PolicyDeploymentsSummary {
  deployments: PolicyDeployment[];
  activeId: string | null;
}

interface PolicyTemplatePayload {
  id: PolicyTemplateId;
  name: string;
  tagline: string;
  description: string;
  price_delta: string;
  latency_target: string;
  guardrail_level: string;
  features: string[];
}

interface PolicyTemplatesResponse {
  templates: PolicyTemplatePayload[];
}

interface CostPolicyPayload {
  id: string;
  name: string;
  description: string | null;
  monthly_spend_limit: number;
  currency: string;
  tags: string[];
  created_at: string;
  updated_at: string;
}

interface CostPoliciesResponsePayload {
  policies: CostPolicyPayload[];
}

interface PolicyOverridePayload {
  id: string;
  route: string;
  project: string;
  template_id: string;
  max_latency_ms: number | null;
  max_cost_usd: number | null;
  require_manual_approval: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface PolicyOverridesResponsePayload {
  overrides: PolicyOverridePayload[];
}

interface PolicyDeploymentPayload {
  id: string;
  template_id: string;
  deployed_at: string;
  author: string;
  window: string | null;
  note: string | null;
  slo_p95_ms: number;
  budget_usage_pct: number;
  incidents_count: number;
  guardrail_score: number;
  created_at: string;
  updated_at: string;
}

interface PolicyDeploymentsResponsePayload {
  deployments: PolicyDeploymentPayload[];
  active_id?: string | null;
}

export interface SessionResponse {
  session: Session;
  provider: ProviderSummary;
}

export interface SessionsResponse {
  sessions: Session[];
}

export interface SessionCreatePayload {
  reason?: string;
  client?: string;
}

export interface SecretMetadata {
  provider_id: string;
  has_secret: boolean;
  updated_at?: string | null;
}

interface SecretsResponsePayload {
  secrets: SecretMetadata[];
}

export interface SecretValue {
  provider_id: string;
  value: string;
  updated_at: string;
}

export type SecretTestStatus = 'healthy' | 'degraded' | 'error';

export interface SecretTestResult {
  provider_id: string;
  status: SecretTestStatus;
  latency_ms: number;
  tested_at: string;
  message: string;
}

export type NotificationSeverity = 'info' | 'success' | 'warning' | 'critical';
export type NotificationCategory = 'operations' | 'finops' | 'policies' | 'platform';

export interface NotificationSummary {
  id: string;
  severity: NotificationSeverity;
  title: string;
  message: string;
  timestamp: string;
  category: NotificationCategory;
  tags: string[];
}

interface NotificationsResponsePayload {
  notifications: NotificationSummary[];
}

export interface TelemetryProviderMetrics {
  provider_id: string;
  run_count: number;
  tokens_in: number;
  tokens_out: number;
  cost_usd: number;
  avg_latency_ms: number;
  success_rate: number;
}

export interface TelemetryMetrics {
  start?: string | null;
  end?: string | null;
  total_runs: number;
  total_tokens_in: number;
  total_tokens_out: number;
  total_cost_usd: number;
  avg_latency_ms: number;
  success_rate: number;
  providers: TelemetryProviderMetrics[];
}

export interface TelemetryHeatmapBucket {
  day: string;
  provider_id: string;
  run_count: number;
}

interface TelemetryHeatmapResponsePayload {
  buckets: TelemetryHeatmapBucket[];
}

interface TelemetryMetricsResponsePayload extends TelemetryMetrics {}

export interface TelemetryTimeseriesPoint {
  day: string;
  provider_id: string;
  run_count: number;
  tokens_in: number;
  tokens_out: number;
  cost_usd: number;
  avg_latency_ms: number;
  success_count: number;
}

interface TelemetryTimeseriesResponsePayload {
  items: TelemetryTimeseriesPoint[];
  next_cursor?: string | null;
}

export type RoutingStrategyId = 'balanced' | 'finops' | 'latency' | 'resilience';
export type RoutingLane = 'economy' | 'balanced' | 'turbo';

export interface RoutingRouteProfile {
  id: string;
  provider: ProviderSummary;
  lane: RoutingLane;
  costPerMillion: number;
  latencyP95: number;
  reliability: number;
  capacityScore: number;
}

export interface RoutingDistributionEntry {
  route: RoutingRouteProfile;
  share: number;
  tokensMillions: number;
  cost: number;
}

export interface RoutingSimulationResult {
  totalCost: number;
  costPerMillion: number;
  avgLatency: number;
  reliabilityScore: number;
  distribution: RoutingDistributionEntry[];
  excludedRoute: RoutingRouteProfile | null;
}

export interface SimulateRoutingPayload {
  strategy: RoutingStrategyId;
  providerIds?: string[];
  failoverProviderId?: string | null;
  volumeMillions: number;
}

interface RoutingRouteProfilePayload {
  id: string;
  provider: ProviderSummary;
  lane: RoutingLane;
  cost_per_million: number;
  latency_p95: number;
  reliability: number;
  capacity_score: number;
}

interface RoutingDistributionEntryPayload {
  route: RoutingRouteProfilePayload;
  share: number;
  tokens_millions: number;
  cost: number;
}

interface RoutingSimulationResponsePayload {
  total_cost: number;
  cost_per_million: number;
  avg_latency: number;
  reliability_score: number;
  distribution: RoutingDistributionEntryPayload[];
  excluded_route?: RoutingRouteProfilePayload | null;
}

function mapRoutingRouteProfile(payload: RoutingRouteProfilePayload): RoutingRouteProfile {
  return {
    id: payload.id,
    provider: payload.provider,
    lane: payload.lane,
    costPerMillion: payload.cost_per_million,
    latencyP95: payload.latency_p95,
    reliability: payload.reliability,
    capacityScore: payload.capacity_score,
  };
}

function mapRoutingDistributionEntry(payload: RoutingDistributionEntryPayload): RoutingDistributionEntry {
  return {
    route: mapRoutingRouteProfile(payload.route),
    share: payload.share,
    tokensMillions: payload.tokens_millions,
    cost: payload.cost,
  };
}

function mapRoutingSimulation(payload: RoutingSimulationResponsePayload): RoutingSimulationResult {
  return {
    totalCost: payload.total_cost,
    costPerMillion: payload.cost_per_million,
    avgLatency: payload.avg_latency,
    reliabilityScore: payload.reliability_score,
    distribution: payload.distribution.map(mapRoutingDistributionEntry),
    excludedRoute: payload.excluded_route ? mapRoutingRouteProfile(payload.excluded_route) : null,
  };
}

export interface TelemetryRouteBreakdownEntry {
  id: string;
  provider_id: string;
  provider_name: string;
  route: string | null;
  lane: 'economy' | 'balanced' | 'turbo';
  run_count: number;
  tokens_in: number;
  tokens_out: number;
  cost_usd: number;
  avg_latency_ms: number;
  success_rate: number;
}

interface TelemetryParetoResponsePayload {
  items: TelemetryRouteBreakdownEntry[];
  next_cursor?: string | null;
}

export interface TelemetryRunEntry {
  id: number;
  provider_id: string;
  provider_name: string;
  route: string | null;
  lane: 'economy' | 'balanced' | 'turbo' | null;
  ts: string;
  tokens_in: number;
  tokens_out: number;
  duration_ms: number;
  status: string;
  cost_usd: number;
  metadata: Record<string, unknown>;
}

interface TelemetryRunsResponsePayload {
  items: TelemetryRunEntry[];
  next_cursor?: string | null;
}

export interface TelemetryMetricsFilters {
  start?: Date | string;
  end?: Date | string;
  providerId?: string;
  route?: string;
}

export interface TelemetryHeatmapFilters extends TelemetryMetricsFilters {}

export interface TelemetryTimeseriesFilters extends TelemetryMetricsFilters {
  lane?: string;
}

export interface TelemetryParetoFilters extends TelemetryMetricsFilters {
  lane?: string;
}

export interface TelemetryRunsFilters extends TelemetryMetricsFilters {
  lane?: string;
  limit?: number;
  cursor?: string;
}

const DEFAULT_API_BASE = '/api/v1';
const API_BASE = (import.meta.env.VITE_CONSOLE_API_BASE ?? DEFAULT_API_BASE).replace(/\/$/, '');

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!response) {
    throw new Error('Empty response from fetch');
  }

  if (!response.ok) {
    const body = await response.text();
    throw new Error(body || `Request failed with status ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  try {
    return (await response.json()) as T;
  } catch {
    return undefined as T;
  }
}

export async function fetchProviders(signal?: AbortSignal): Promise<ProviderSummary[]> {
  const data = await request<ProvidersResponse>('/providers', { signal });
  return data.providers;
}

export async function fetchSessions(signal?: AbortSignal): Promise<Session[]> {
  const data = await request<SessionsResponse>('/sessions', { signal });
  return data.sessions;
}

export async function simulateRouting(
  payload: SimulateRoutingPayload,
  signal?: AbortSignal,
): Promise<RoutingSimulationResult> {
  const response = await request<RoutingSimulationResponsePayload>('/routing/simulate', {
    method: 'POST',
    body: JSON.stringify({
      strategy: payload.strategy,
      provider_ids: payload.providerIds ?? [],
      failover_provider_id: payload.failoverProviderId ?? null,
      volume_millions: payload.volumeMillions,
    }),
    signal,
  });

  return mapRoutingSimulation(response);
}

export async function fetchSecrets(signal?: AbortSignal): Promise<SecretMetadata[]> {
  const data = await request<SecretsResponsePayload>('/secrets', { signal });
  return data.secrets;
}

export async function readSecret(providerId: string, signal?: AbortSignal): Promise<SecretValue> {
  return request<SecretValue>(`/secrets/${providerId}`, { signal });
}

export async function upsertSecret(
  providerId: string,
  value: string,
  signal?: AbortSignal,
): Promise<SecretValue> {
  return request<SecretValue>(`/secrets/${providerId}`, {
    method: 'PUT',
    body: JSON.stringify({ value }),
    signal,
  });
}

export async function deleteSecret(providerId: string, signal?: AbortSignal): Promise<void> {
  await request<void>(`/secrets/${providerId}`, { method: 'DELETE', signal });
}

export async function testSecret(
  providerId: string,
  signal?: AbortSignal,
): Promise<SecretTestResult> {
  return request<SecretTestResult>(`/secrets/${providerId}/test`, {
    method: 'POST',
    signal,
  });
}

export async function fetchPolicyTemplates(signal?: AbortSignal): Promise<PolicyTemplate[]> {
  const data = await request<PolicyTemplatesResponse>('/policies/templates', { signal });
  return data.templates.map((template) => ({
    id: template.id,
    name: template.name,
    tagline: template.tagline,
    description: template.description,
    priceDelta: template.price_delta,
    latencyTarget: template.latency_target,
    guardrailLevel: template.guardrail_level,
    features: template.features,
  }));
}

function mapCostPolicy(payload: CostPolicyPayload): CostPolicy {
  return {
    id: payload.id,
    name: payload.name,
    description: payload.description ?? null,
    monthlySpendLimit: payload.monthly_spend_limit,
    currency: payload.currency,
    tags: payload.tags ?? [],
    createdAt: payload.created_at,
    updatedAt: payload.updated_at,
  };
}

export async function fetchPolicies(signal?: AbortSignal): Promise<CostPolicy[]> {
  const data = await request<CostPoliciesResponsePayload>('/policies', { signal });
  return data.policies.map(mapCostPolicy);
}

export async function createPolicy(
  payload: CostPolicyCreateInput,
  signal?: AbortSignal,
): Promise<CostPolicy> {
  const data = await request<CostPolicyPayload>('/policies', {
    method: 'POST',
    body: JSON.stringify({
      id: payload.id,
      name: payload.name,
      description: payload.description ?? null,
      monthly_spend_limit: payload.monthlySpendLimit,
      currency: payload.currency,
      tags: payload.tags ?? [],
    }),
    signal,
  });
  return mapCostPolicy(data);
}

export async function updatePolicy(
  policyId: string,
  payload: CostPolicyUpdateInput,
  signal?: AbortSignal,
): Promise<CostPolicy> {
  const data = await request<CostPolicyPayload>(`/policies/${policyId}`, {
    method: 'PUT',
    body: JSON.stringify({
      name: payload.name,
      description: payload.description ?? null,
      monthly_spend_limit: payload.monthlySpendLimit,
      currency: payload.currency,
      tags: payload.tags ?? [],
    }),
    signal,
  });
  return mapCostPolicy(data);
}

export async function deletePolicy(policyId: string, signal?: AbortSignal): Promise<void> {
  await request<void>(`/policies/${policyId}`, { method: 'DELETE', signal });
}

function mapPolicyOverride(payload: PolicyOverridePayload): PolicyOverride {
  return {
    id: payload.id,
    route: payload.route,
    project: payload.project,
    templateId: payload.template_id,
    maxLatencyMs: payload.max_latency_ms,
    maxCostUsd: payload.max_cost_usd,
    requireManualApproval: payload.require_manual_approval,
    notes: payload.notes ?? null,
    createdAt: payload.created_at,
    updatedAt: payload.updated_at,
  };
}

export async function fetchPolicyOverrides(signal?: AbortSignal): Promise<PolicyOverride[]> {
  const data = await request<PolicyOverridesResponsePayload>('/policies/overrides', { signal });
  return data.overrides.map(mapPolicyOverride);
}

export async function createPolicyOverride(
  payload: PolicyOverrideCreateInput,
  signal?: AbortSignal,
): Promise<PolicyOverride> {
  const data = await request<PolicyOverridePayload>('/policies/overrides', {
    method: 'POST',
    body: JSON.stringify({
      id: payload.id,
      route: payload.route,
      project: payload.project,
      template_id: payload.templateId,
      max_latency_ms: payload.maxLatencyMs ?? null,
      max_cost_usd: payload.maxCostUsd ?? null,
      require_manual_approval: payload.requireManualApproval ?? false,
      notes: payload.notes ?? null,
    }),
    signal,
  });
  return mapPolicyOverride(data);
}

export async function updatePolicyOverride(
  overrideId: string,
  payload: PolicyOverrideUpdateInput,
  signal?: AbortSignal,
): Promise<PolicyOverride> {
  const data = await request<PolicyOverridePayload>(`/policies/overrides/${overrideId}`, {
    method: 'PUT',
    body: JSON.stringify({
      route: payload.route,
      project: payload.project,
      template_id: payload.templateId,
      max_latency_ms: payload.maxLatencyMs ?? null,
      max_cost_usd: payload.maxCostUsd ?? null,
      require_manual_approval: payload.requireManualApproval ?? false,
      notes: payload.notes ?? null,
    }),
    signal,
  });
  return mapPolicyOverride(data);
}

export async function deletePolicyOverride(
  overrideId: string,
  signal?: AbortSignal,
): Promise<void> {
  await request<void>(`/policies/overrides/${overrideId}`, { method: 'DELETE', signal });
}

function mapPolicyDeployment(payload: PolicyDeploymentPayload): PolicyDeployment {
  return {
    id: payload.id,
    templateId: payload.template_id,
    deployedAt: payload.deployed_at,
    author: payload.author,
    window: payload.window ?? null,
    note: payload.note ?? null,
    sloP95Ms: payload.slo_p95_ms,
    budgetUsagePct: payload.budget_usage_pct,
    incidentsCount: payload.incidents_count,
    guardrailScore: payload.guardrail_score,
    createdAt: payload.created_at,
    updatedAt: payload.updated_at,
  };
}

export async function fetchPolicyDeployments(
  signal?: AbortSignal,
): Promise<PolicyDeploymentsSummary> {
  const data = await request<PolicyDeploymentsResponsePayload>('/policies/deployments', { signal });
  return {
    deployments: data.deployments.map(mapPolicyDeployment),
    activeId: data.active_id ?? null,
  };
}

export async function createPolicyDeployment(
  payload: PolicyDeploymentCreateInput,
  signal?: AbortSignal,
): Promise<PolicyDeployment> {
  const data = await request<PolicyDeploymentPayload>('/policies/deployments', {
    method: 'POST',
    body: JSON.stringify({
      template_id: payload.templateId,
      author: payload.author ?? 'Console MCP',
      window: payload.window ?? null,
      note: payload.note ?? null,
    }),
    signal,
  });
  return mapPolicyDeployment(data);
}

export async function deletePolicyDeployment(
  deploymentId: string,
  signal?: AbortSignal,
): Promise<void> {
  await request<void>(`/policies/deployments/${deploymentId}`, { method: 'DELETE', signal });
}

export async function fetchNotifications(signal?: AbortSignal): Promise<NotificationSummary[]> {
  const data = await request<NotificationsResponsePayload>('/notifications', { signal });
  return data.notifications;
}

export async function createSession(
  providerId: string,
  payload: SessionCreatePayload = {},
  signal?: AbortSignal,
): Promise<SessionResponse> {
  return request<SessionResponse>(`/providers/${providerId}/sessions`, {
    method: 'POST',
    body: JSON.stringify(payload),
    signal,
  });
}

function normalizeIso(value?: Date | string): string | undefined {
  if (!value) {
    return undefined;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return value;
}

function buildQuery(params: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      search.set(key, value);
    }
  }
  const query = search.toString();
  return query ? `?${query}` : '';
}

export async function fetchTelemetryMetrics(
  filters?: TelemetryMetricsFilters,
  signal?: AbortSignal,
): Promise<TelemetryMetrics> {
  const query = buildQuery({
    start: normalizeIso(filters?.start),
    end: normalizeIso(filters?.end),
    provider_id: filters?.providerId,
    route: filters?.route,
  });
  return request<TelemetryMetricsResponsePayload>(`/telemetry/metrics${query}`, { signal });
}

export async function fetchTelemetryHeatmap(
  filters?: TelemetryHeatmapFilters,
  signal?: AbortSignal,
): Promise<TelemetryHeatmapBucket[]> {
  const query = buildQuery({
    start: normalizeIso(filters?.start),
    end: normalizeIso(filters?.end),
    provider_id: filters?.providerId,
    route: filters?.route,
  });
  const data = await request<TelemetryHeatmapResponsePayload>(`/telemetry/heatmap${query}`, { signal });
  return data.buckets;
}

export async function fetchTelemetryTimeseries(
  filters?: TelemetryTimeseriesFilters,
  signal?: AbortSignal,
): Promise<TelemetryTimeseriesResponsePayload> {
  const query = buildQuery({
    start: normalizeIso(filters?.start),
    end: normalizeIso(filters?.end),
    provider_id: filters?.providerId,
    lane: filters?.lane,
  });
  return request<TelemetryTimeseriesResponsePayload>(`/telemetry/timeseries${query}`, { signal });
}

export async function fetchTelemetryPareto(
  filters?: TelemetryParetoFilters,
  signal?: AbortSignal,
): Promise<TelemetryParetoResponsePayload> {
  const query = buildQuery({
    start: normalizeIso(filters?.start),
    end: normalizeIso(filters?.end),
    provider_id: filters?.providerId,
    lane: filters?.lane,
  });
  return request<TelemetryParetoResponsePayload>(`/telemetry/pareto${query}`, { signal });
}

export async function fetchTelemetryRuns(
  filters?: TelemetryRunsFilters,
  signal?: AbortSignal,
): Promise<TelemetryRunsResponsePayload> {
  const query = buildQuery({
    start: normalizeIso(filters?.start),
    end: normalizeIso(filters?.end),
    provider_id: filters?.providerId,
    lane: filters?.lane,
    route: filters?.route,
    limit: filters?.limit ? String(filters.limit) : undefined,
    cursor: filters?.cursor,
  });
  return request<TelemetryRunsResponsePayload>(`/telemetry/runs${query}`, { signal });
}

export const apiBase = API_BASE;
