import type {
  NotificationSummary,
  PolicyComplianceSummary,
  PolicyComplianceItem,
  ProviderSummary,
  SecretMetadata,
  Session,
  TelemetryHeatmapBucket,
  TelemetryMetrics,
} from '../api';

import providersFixture from '#fixtures/providers.json';
import sessionsFixture from '#fixtures/sessions.json';
import notificationsFixture from '#fixtures/notifications.json';
import telemetryMetricsFixture from '#fixtures/telemetry_metrics.json';
import telemetryHeatmapFixture from '#fixtures/telemetry_heatmap.json';
import complianceFixture from '#fixtures/policies_compliance.json';

interface ProviderFixtureEntry {
  id: string;
  name: string;
  command: string;
  description?: string;
  tags?: string[];
  capabilities?: string[];
  transport: string;
  is_available?: boolean;
}

interface ProvidersFixturePayload {
  providers?: ProviderFixtureEntry[];
}

interface SessionFixtureEntry {
  id: string;
  provider_id: string;
  created_at: string;
  status: string;
  reason?: string | null;
  client?: string | null;
}

interface SessionsFixturePayload {
  sessions?: SessionFixtureEntry[];
}

interface NotificationsFixturePayload {
  notifications?: NotificationSummary[];
}

interface TelemetryHeatmapFixturePayload {
  buckets?: TelemetryHeatmapBucket[];
}

interface ComplianceFixturePayload {
  status?: string;
  updated_at?: string | null;
  items?: Array<
    Omit<PolicyComplianceItem, 'description'> & {
      description?: string | null;
    }
  >;
}

export interface AppFixtureSnapshot {
  providers: ProviderSummary[];
  sessions: Session[];
  secrets: SecretMetadata[];
  notifications: NotificationSummary[];
  telemetryMetrics: TelemetryMetrics | null;
  telemetryHeatmap: TelemetryHeatmapBucket[];
  compliance: PolicyComplianceSummary | null;
}

function mapProvider(entry: ProviderFixtureEntry): ProviderSummary {
  return {
    id: entry.id,
    name: entry.name,
    command: entry.command,
    description: entry.description,
    tags: entry.tags ?? [],
    capabilities: entry.capabilities ?? [],
    transport: entry.transport,
    is_available: entry.is_available,
  };
}

function mapSession(entry: SessionFixtureEntry): Session {
  return {
    id: entry.id,
    provider_id: entry.provider_id,
    created_at: entry.created_at,
    status: entry.status,
    reason: entry.reason ?? null,
    client: entry.client ?? null,
  };
}

function mapCompliance(payload: ComplianceFixturePayload): PolicyComplianceSummary | null {
  if (!payload.status) {
    return null;
  }

  const status = payload.status as PolicyComplianceSummary['status'];
  const items = (payload.items ?? []).map((item) => ({
    id: item.id,
    label: item.label,
    description: item.description ?? null,
    required: item.required,
    configured: item.configured,
    active: item.active,
  }));

  return {
    status,
    updatedAt: payload.updated_at ?? null,
    items,
  };
}

function normalizeTelemetryMetrics(value: unknown): TelemetryMetrics | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  return value as TelemetryMetrics;
}

export function createAppFixtureSnapshot(): AppFixtureSnapshot {
  const providerEntries = (providersFixture as ProvidersFixturePayload).providers ?? [];
  const sessionEntries = (sessionsFixture as SessionsFixturePayload).sessions ?? [];
  const notifications = (notificationsFixture as NotificationsFixturePayload).notifications ?? [];
  const telemetryHeatmap =
    (telemetryHeatmapFixture as TelemetryHeatmapFixturePayload).buckets ?? [];
  const telemetryMetrics = normalizeTelemetryMetrics(telemetryMetricsFixture);
  const compliance = mapCompliance(complianceFixture as ComplianceFixturePayload);

  return {
    providers: providerEntries.map(mapProvider),
    sessions: sessionEntries.map(mapSession),
    secrets: [],
    notifications,
    telemetryMetrics,
    telemetryHeatmap,
    compliance,
  };
}
