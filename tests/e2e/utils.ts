import type { Page, Route } from '@playwright/test';

import { loadBackendFixture } from './fixtures';

type BaseRoutePayloads = {
  servers: unknown;
  processes: unknown;
  sessions: unknown;
  telemetryMetrics: unknown;
  telemetryHeatmap: unknown;
  notifications: unknown;
  compliance: unknown;
  agents: unknown;
};

type TelemetryMetricsFixture = {
  total_cost_usd: number;
  total_runs: number;
  total_tokens_in: number;
  total_tokens_out: number;
  avg_latency_ms: number;
  success_rate: number;
  end: string;
};

type ServerEntryFixture = {
  id: string;
  name: string;
  description: string;
  [key: string]: unknown;
};

type ServersFixture = {
  servers: ServerEntryFixture[];
};

type NotificationsFixture = {
  notifications: Array<Record<string, unknown>>;
};

type AgentsFixture = {
  agents: Array<Record<string, unknown>>;
};

type ComplianceFixture = Record<string, unknown>;

type SessionsFixture = Record<string, unknown>;

type ProcessesFixture = Record<string, unknown>;

type HeatmapFixture = Record<string, unknown>;

const fulfillJson = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, body: JSON.stringify(body), contentType: 'application/json' });

export async function registerShowcaseRoutes(page: Page): Promise<void> {
  const [
    telemetryMetrics,
    serversFixture,
    serverProcessesFixture,
    sessionsFixture,
    telemetryHeatmapFixture,
    notificationsFixture,
    complianceFixture,
    agentsFixture,
  ] = await Promise.all([
    loadBackendFixture<TelemetryMetricsFixture>('telemetry_metrics.json'),
    loadBackendFixture<ServersFixture>('servers.json'),
    loadBackendFixture<ProcessesFixture>('server_processes.json'),
    loadBackendFixture<SessionsFixture>('sessions.json'),
    loadBackendFixture<HeatmapFixture>('telemetry_heatmap.json'),
    loadBackendFixture<NotificationsFixture>('notifications.json'),
    loadBackendFixture<ComplianceFixture>('policies_compliance.json'),
    loadBackendFixture<AgentsFixture>('agents.json'),
  ]);

  const fixtures: BaseRoutePayloads = {
    servers: serversFixture,
    processes: serverProcessesFixture,
    sessions: sessionsFixture,
    telemetryMetrics,
    telemetryHeatmap: telemetryHeatmapFixture,
    notifications: notificationsFixture,
    compliance: complianceFixture,
    agents: agentsFixture,
  };

  await page.route('**/api/v1/servers', (route) => fulfillJson(route, fixtures.servers));
  await page.route('**/api/v1/servers/processes', (route) => fulfillJson(route, fixtures.processes));
  await page.route('**/api/v1/sessions', (route) => fulfillJson(route, fixtures.sessions));
  await page.route('**/api/v1/secrets', (route) => fulfillJson(route, { secrets: [] }));
  await page.route('**/api/v1/telemetry/metrics**', (route) => fulfillJson(route, fixtures.telemetryMetrics));
  await page.route('**/api/v1/telemetry/heatmap**', (route) => fulfillJson(route, fixtures.telemetryHeatmap));
  await page.route('**/api/v1/notifications', (route) => fulfillJson(route, fixtures.notifications));
  await page.route('**/api/v1/policies/compliance', (route) => fulfillJson(route, fixtures.compliance));
  await page.route('**/agents/agents', (route) => fulfillJson(route, fixtures.agents));
  await page.route('**/api/v1/server-health', (route) => fulfillJson(route, { checks: {} }));
}
