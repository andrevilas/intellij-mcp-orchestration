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

export interface TelemetryMetricsFilters {
  start?: Date | string;
  end?: Date | string;
  providerId?: string;
  route?: string;
}

export interface TelemetryHeatmapFilters extends TelemetryMetricsFilters {}

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

export const apiBase = API_BASE;
