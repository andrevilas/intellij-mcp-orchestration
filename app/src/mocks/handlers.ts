import { http, HttpResponse } from 'msw';
import type {
  MarketplacePerformanceEntry,
  ProviderSummary,
  RoutingLane,
  RoutingRouteProfile,
  RoutingSimulationResult,
  TelemetryExperimentSummaryEntry,
  TelemetryLaneCostEntry,
  TelemetryRunEntry,
} from '../api';
import telemetryMetricsFixture from '#fixtures/telemetry_metrics.json';
import telemetryHeatmapFixture from '#fixtures/telemetry_heatmap.json';
import telemetryTimeseriesFixture from '#fixtures/telemetry_timeseries.json';
import telemetryParetoFixture from '#fixtures/telemetry_pareto.json';
import telemetryRunsFixture from '#fixtures/telemetry_runs.json';
import routingSimulationFixture from '#fixtures/routing_simulation.json';
import finopsSprintsFixture from '#fixtures/finops_sprints.json';
import finopsPullRequestsFixture from '#fixtures/finops_pull_requests.json';
import serversFixture from '#fixtures/servers.json';
import serverProcessesFixture from '#fixtures/server_processes.json';
import serverHealthFixture from '#fixtures/server_health.json';
import sessionsFixture from '#fixtures/sessions.json';
import notificationsFixture from '#fixtures/notifications.json';
import policiesComplianceFixture from '#fixtures/policies_compliance.json';
import policyManifestFixture from '#fixtures/policy_manifest.json';
import telemetryExperimentsFixture from '#fixtures/telemetry_experiments.json';
import telemetryLaneCostsFixture from '#fixtures/telemetry_lane_costs.json';
import telemetryMarketplaceFixture from '#fixtures/telemetry_marketplace.json';
import providersFixture from '#fixtures/providers.json';

const API_PREFIX = '*/api/v1';

interface RoutingRouteProfileFixture {
  id: string;
  provider: ProviderSummary;
  lane: string;
  cost_per_million: number;
  latency_p95: number;
  reliability: number;
  capacity_score: number;
}

interface RoutingDistributionEntryFixture {
  route: RoutingRouteProfileFixture;
  share: number;
  tokens_millions: number;
  cost: number;
}

interface RoutingSimulationFixture {
  total_cost: number;
  cost_per_million: number;
  avg_latency: number;
  reliability_score: number;
  distribution: RoutingDistributionEntryFixture[];
  excluded_route: RoutingRouteProfileFixture | null | undefined;
}

const routingFixture = routingSimulationFixture as RoutingSimulationFixture;

const toRoutingLane = (value: string): RoutingLane => {
  if (value === 'economy' || value === 'balanced' || value === 'turbo') {
    return value;
  }
  return 'balanced';
};

const mapRoutingRouteProfileFixture = (route: RoutingRouteProfileFixture): RoutingRouteProfile => ({
  id: route.id,
  provider: route.provider,
  lane: toRoutingLane(route.lane),
  costPerMillion: route.cost_per_million,
  latencyP95: route.latency_p95,
  reliability: route.reliability,
  capacityScore: route.capacity_score,
});

const routingSimulation: RoutingSimulationResult = {
  totalCost: routingFixture.total_cost,
  costPerMillion: routingFixture.cost_per_million,
  avgLatency: routingFixture.avg_latency,
  reliabilityScore: routingFixture.reliability_score,
  distribution: routingFixture.distribution.map((entry) => ({
    route: mapRoutingRouteProfileFixture(entry.route),
    share: entry.share,
    tokensMillions: entry.tokens_millions,
    cost: entry.cost,
  })),
  excludedRoute: routingFixture.excluded_route
    ? mapRoutingRouteProfileFixture(routingFixture.excluded_route)
    : null,
};

const providerCatalog = (providersFixture as { providers: ProviderSummary[] }).providers;

const serverCatalogPayload = (serversFixture as {
  servers: Array<Record<string, unknown>>;
}).servers;

const cloneProcessState = (entry: Record<string, any>): Record<string, any> => ({
  ...entry,
  logs: (entry.logs ?? []).map((log: Record<string, unknown>) => ({ ...log })),
});

const processStateByServer = new Map(
  (serverProcessesFixture as { processes: Array<Record<string, any>> }).processes.map((entry) => [
    entry.server_id,
    cloneProcessState(entry),
  ]),
);

const healthHistoryByServer = new Map(
  Object.entries(
    (serverHealthFixture as { checks: Record<string, Array<Record<string, unknown>>> }).checks,
  ),
);

const sessions = (sessionsFixture as { sessions: Array<Record<string, unknown>> }).sessions;
const notifications = (notificationsFixture as {
  notifications: Array<Record<string, unknown>>;
}).notifications;

const policyManifestPayload = policyManifestFixture as Record<string, unknown>;
const compliancePayload = policiesComplianceFixture as Record<string, unknown>;

const experimentItems = (telemetryExperimentsFixture as {
  items: TelemetryExperimentSummaryEntry[];
}).items;

const laneCostItems = (telemetryLaneCostsFixture as { items: TelemetryLaneCostEntry[] }).items;

const marketplaceEntries = (telemetryMarketplaceFixture as {
  items: MarketplacePerformanceEntry[];
}).items;

type TelemetryRunFixtureEntry = Omit<TelemetryRunEntry, 'lane' | 'metadata'> & {
  lane: string | null;
  metadata?: Record<string, unknown> | null;
};

type TelemetryRunsFixture = {
  items: TelemetryRunFixtureEntry[];
};

const telemetryRunsRaw = telemetryRunsFixture as TelemetryRunsFixture;

const toNullableRoutingLane = (value: string | null): RoutingLane | null => {
  if (value === null) {
    return null;
  }
  return toRoutingLane(value);
};

const telemetryRuns: TelemetryRunEntry[] = telemetryRunsRaw.items.map((run) => ({
  ...run,
  lane: toNullableRoutingLane(run.lane),
  metadata: run.metadata ?? {},
}));

export const handlers = [
  http.get(`${API_PREFIX}/servers`, () => HttpResponse.json({ servers: serverCatalogPayload })),
  http.get(`${API_PREFIX}/servers/processes`, () =>
    HttpResponse.json({ processes: Array.from(processStateByServer.values()) }),
  ),
  http.get(`${API_PREFIX}/servers/:serverId/process/logs`, ({ params }) => {
    const serverId = params.serverId as string;
    const snapshot = processStateByServer.get(serverId);
    const logs = snapshot?.logs ?? [];
    const cursor = snapshot?.cursor ?? `${serverId}-cursor`;
    return HttpResponse.json({ logs, cursor });
  }),
  http.get(`${API_PREFIX}/servers/:serverId/health`, ({ params }) => {
    const serverId = params.serverId as string;
    const checks = healthHistoryByServer.get(serverId) ?? [];
    return HttpResponse.json({ checks });
  }),
  http.post(`${API_PREFIX}/servers/:serverId/process/:action`, ({ params }) => {
    const serverId = params.serverId as string;
    const action = params.action as string;
    const current = processStateByServer.get(serverId);
    if (!current) {
      return HttpResponse.json({ process: null }, { status: 404 });
    }

    const now = new Date().toISOString();
    const next = cloneProcessState(current);

    if (action === 'stop') {
      next.status = 'stopped';
      next.pid = null;
      next.started_at = current.started_at;
      next.stopped_at = now;
      next.return_code = 0;
      next.last_error = null;
    } else {
      next.status = 'running';
      next.pid = Math.floor(Math.random() * 2000) + 3000;
      next.started_at = now;
      next.stopped_at = null;
      next.return_code = null;
      next.last_error = null;
    }

    processStateByServer.set(serverId, next);
    return HttpResponse.json({ process: next });
  }),
  http.get(`${API_PREFIX}/sessions`, () => HttpResponse.json({ sessions })),
  http.get(`${API_PREFIX}/secrets`, () => HttpResponse.json({ secrets: [] })),
  http.get(`${API_PREFIX}/notifications`, () => HttpResponse.json({ notifications })),
  http.get(`${API_PREFIX}/policies/compliance`, () => HttpResponse.json(compliancePayload)),
  http.get(`${API_PREFIX}/telemetry/metrics`, () => HttpResponse.json(telemetryMetricsFixture)),
  http.get(`${API_PREFIX}/telemetry/heatmap`, () => HttpResponse.json(telemetryHeatmapFixture)),
  http.get(`${API_PREFIX}/telemetry/timeseries`, () => HttpResponse.json(telemetryTimeseriesFixture)),
  http.get(`${API_PREFIX}/telemetry/pareto`, () => HttpResponse.json(telemetryParetoFixture)),
  http.get(`${API_PREFIX}/telemetry/runs`, () => HttpResponse.json({ items: telemetryRuns })),
  http.get(`${API_PREFIX}/telemetry/experiments`, () => HttpResponse.json({ items: experimentItems })),
  http.get(`${API_PREFIX}/telemetry/lane-costs`, () => HttpResponse.json({ items: laneCostItems })),
  http.get(`${API_PREFIX}/telemetry/marketplace/performance`, () =>
    HttpResponse.json({ items: marketplaceEntries }),
  ),
  http.get(`${API_PREFIX}/telemetry/finops/sprints`, () => HttpResponse.json(finopsSprintsFixture)),
  http.get(`${API_PREFIX}/telemetry/finops/pull-requests`, () =>
    HttpResponse.json(finopsPullRequestsFixture),
  ),
  http.post(`${API_PREFIX}/routing/simulate`, () =>
    HttpResponse.json({
      total_cost: routingSimulation.totalCost,
      cost_per_million: routingSimulation.costPerMillion,
      avg_latency: routingSimulation.avgLatency,
      reliability_score: routingSimulation.reliabilityScore,
      distribution: routingSimulation.distribution.map((entry) => ({
        route: {
          id: entry.route.id,
          provider: entry.route.provider,
          lane: entry.route.lane,
          cost_per_million: entry.route.costPerMillion,
          latency_p95: entry.route.latencyP95,
          reliability: entry.route.reliability,
          capacity_score: entry.route.capacityScore,
        },
        share: entry.share,
        tokens_millions: entry.tokensMillions,
        cost: entry.cost,
      })),
      excluded_route: routingSimulation.excludedRoute
        ? {
            id: routingSimulation.excludedRoute.id,
            provider: routingSimulation.excludedRoute.provider,
            lane: routingSimulation.excludedRoute.lane,
            cost_per_million: routingSimulation.excludedRoute.costPerMillion,
            latency_p95: routingSimulation.excludedRoute.latencyP95,
            reliability: routingSimulation.excludedRoute.reliability,
            capacity_score: routingSimulation.excludedRoute.capacityScore,
          }
        : null,
    }),
  ),
  http.get(`${API_PREFIX}/policies/manifest`, () => HttpResponse.json(policyManifestPayload)),
  http.get(`${API_PREFIX}/providers`, () => HttpResponse.json({ providers: providerCatalog })),
];
