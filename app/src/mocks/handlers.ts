import { http, HttpResponse } from 'msw';
import type {
  MarketplacePerformanceEntry,
  AgentSmokeRun,
  ProviderSummary,
  RoutingLane,
  RoutingRouteProfile,
  RoutingSimulationResult,
  RoutingStrategyId,
  Session,
  SmokeRunLogEntry,
  SmokeRunStatus,
  SmokeRunSummary,
  TelemetryExperimentSummaryEntry,
  TelemetryLaneCostEntry,
  TelemetryRunEntry,
} from '../api';
import telemetryMetricsFixture from '#fixtures/telemetry_metrics.json' with { type: 'json' };
import telemetryHeatmapFixture from '#fixtures/telemetry_heatmap.json' with { type: 'json' };
import telemetryTimeseriesFixture from '#fixtures/telemetry_timeseries.json' with { type: 'json' };
import telemetryParetoFixture from '#fixtures/telemetry_pareto.json' with { type: 'json' };
import telemetryRunsFixture from '#fixtures/telemetry_runs.json' with { type: 'json' };
import routingSimulationFixture from '#fixtures/routing_simulation.json' with { type: 'json' };
import finopsSprintsFixture from '#fixtures/finops_sprints.json' with { type: 'json' };
import finopsPullRequestsFixture from '#fixtures/finops_pull_requests.json' with { type: 'json' };
import serversFixture from '#fixtures/servers.json' with { type: 'json' };
import serverProcessesFixture from '#fixtures/server_processes.json' with { type: 'json' };
import serverHealthFixture from '#fixtures/server_health.json' with { type: 'json' };
import sessionsFixture from '#fixtures/sessions.json' with { type: 'json' };
import notificationsFixture from '#fixtures/notifications.json' with { type: 'json' };
import policiesComplianceFixture from '#fixtures/policies_compliance.json' with { type: 'json' };
import policyManifestFixture from '#fixtures/policy_manifest.json' with { type: 'json' };
import telemetryExperimentsFixture from '#fixtures/telemetry_experiments.json' with { type: 'json' };
import telemetryLaneCostsFixture from '#fixtures/telemetry_lane_costs.json' with { type: 'json' };
import telemetryMarketplaceFixture from '#fixtures/telemetry_marketplace.json' with { type: 'json' };
import providersFixture from '#fixtures/providers.json' with { type: 'json' };
import smokeEndpointsFixture from '#fixtures/smoke_endpoints.json' with { type: 'json' };
import agentsFixture from '#fixtures/agents.json' with { type: 'json' };

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
  context: {
    strategy: string;
    provider_ids: string[];
    provider_count: number;
    volume_millions: number;
    failover_provider_id: string | null;
  };
  cost: {
    total_usd: number;
    cost_per_million_usd: number;
  };
  latency: {
    avg_latency_ms: number;
    reliability_score: number;
  };
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
  context: {
    strategy: routingFixture.context.strategy as RoutingStrategyId,
    providerIds: [...routingFixture.context.provider_ids],
    providerCount: routingFixture.context.provider_count,
    volumeMillions: routingFixture.context.volume_millions,
    failoverProviderId: routingFixture.context.failover_provider_id,
  },
  cost: {
    totalUsd: routingFixture.cost.total_usd,
    costPerMillionUsd: routingFixture.cost.cost_per_million_usd,
  },
  latency: {
    avgLatencyMs: routingFixture.latency.avg_latency_ms,
    reliabilityScore: routingFixture.latency.reliability_score,
  },
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

const STRATEGY_VARIANTS: Record<string, { cost: number; latency: number; reliabilityDelta: number }> = {
  balanced: { cost: 1, latency: 1, reliabilityDelta: 0 },
  finops: { cost: 0.85, latency: 1.05, reliabilityDelta: -2 },
  latency: { cost: 1.12, latency: 0.82, reliabilityDelta: -0.5 },
  resilience: { cost: 1.06, latency: 0.95, reliabilityDelta: 1.5 },
};

interface RoutingSimulateRequestPayload {
  strategy?: string;
  provider_ids?: string[];
  failover_provider_id?: string | null;
  volume_millions?: number;
}

const roundTo = (value: number, precision = 2): number => Number(value.toFixed(precision));

const clonePlan = (source: RoutingSimulationResult = routingSimulation): RoutingSimulationResult =>
  JSON.parse(JSON.stringify(source)) as RoutingSimulationResult;

const normalizeDistribution = (
  distribution: RoutingSimulationResult['distribution'],
): RoutingSimulationResult['distribution'] => {
  const totalShare = distribution.reduce((sum, entry) => sum + entry.share, 0);
  const totalTokens = distribution.reduce((sum, entry) => sum + entry.tokensMillions, 0);
  if (distribution.length === 0 || totalTokens === 0 || totalShare === 0) {
    return distribution.map((entry) => ({
      ...entry,
      share: distribution.length > 0 ? roundTo(1 / distribution.length, 4) : 0,
      tokensMillions: distribution.length > 0 ? roundTo(1 / distribution.length, 4) : 0,
      cost: roundTo(entry.route.costPerMillion * entry.tokensMillions),
    }));
  }
  return distribution.map((entry) => {
    const normalizedShare = entry.share / totalShare;
    const tokens = totalTokens * normalizedShare;
    return {
      ...entry,
      share: roundTo(normalizedShare, 4),
      tokensMillions: roundTo(tokens, 4),
      cost: roundTo(entry.route.costPerMillion * tokens),
    };
  });
};

const applyStrategyVariant = (
  base: RoutingSimulationResult,
  variantKey: string,
): RoutingSimulationResult => {
  const plan = clonePlan(base);
  const variant = STRATEGY_VARIANTS[variantKey] ?? STRATEGY_VARIANTS.balanced;
  const totalTokens = plan.distribution.reduce((sum, entry) => sum + entry.tokensMillions, 0);

  plan.distribution = plan.distribution.map((entry) => {
    const adjustedCostPerMillion = roundTo(entry.route.costPerMillion * variant.cost);
    const cost = roundTo(adjustedCostPerMillion * entry.tokensMillions);
    return {
      ...entry,
      route: {
        ...entry.route,
        costPerMillion: adjustedCostPerMillion,
      },
      cost,
    };
  });

  plan.distribution = normalizeDistribution(plan.distribution);
  const totalCost = plan.distribution.reduce((sum, entry) => sum + entry.cost, 0);
  plan.cost.totalUsd = roundTo(totalCost);
  plan.cost.costPerMillionUsd = totalTokens > 0 ? roundTo(totalCost / totalTokens) : 0;
  plan.latency.avgLatencyMs = roundTo(base.latency.avgLatencyMs * variant.latency);
  plan.latency.reliabilityScore = roundTo(
    Math.min(100, Math.max(0, base.latency.reliabilityScore + variant.reliabilityDelta)),
  );
  plan.context.strategy = variantKey as RoutingStrategyId;
  plan.excludedRoute = null;
  return plan;
};

const applyProviderFilter = (
  plan: RoutingSimulationResult,
  providerIds: string[] | undefined,
): RoutingSimulationResult => {
  if (!providerIds || providerIds.length === 0) {
    return plan;
  }
  const workingPlan = clonePlan(plan);
  const allowed = new Set(providerIds);
  const filtered = workingPlan.distribution.filter((entry) => allowed.has(entry.route.id));
  if (filtered.length === 0) {
    workingPlan.distribution = [];
    workingPlan.cost.totalUsd = 0;
    workingPlan.cost.costPerMillionUsd = 0;
    workingPlan.excludedRoute = null;
    return workingPlan;
  }
  const totalTokens = filtered.reduce((sum, entry) => sum + entry.tokensMillions, 0);
  const normalized = normalizeDistribution(filtered).map((entry) => ({
    ...entry,
    cost: roundTo(entry.route.costPerMillion * entry.tokensMillions),
  }));
  const totalCost = roundTo(normalized.reduce((sum, entry) => sum + entry.cost, 0));
  workingPlan.distribution = normalized;
  workingPlan.cost.totalUsd = totalCost;
  workingPlan.cost.costPerMillionUsd = totalTokens > 0 ? roundTo(totalCost / totalTokens) : 0;
  workingPlan.excludedRoute =
    workingPlan.excludedRoute && allowed.has(workingPlan.excludedRoute.id)
      ? workingPlan.excludedRoute
      : null;
  return workingPlan;
};

const applyFailover = (
  plan: RoutingSimulationResult,
  failoverId: string | null | undefined,
): RoutingSimulationResult => {
  if (!failoverId || failoverId === 'none') {
    const resetPlan = clonePlan(plan);
    resetPlan.context.failoverProviderId = null;
    resetPlan.excludedRoute = null;
    return resetPlan;
  }
  const workingPlan = clonePlan(plan);
  const excludedIndex = workingPlan.distribution.findIndex((entry) => entry.route.id === failoverId);
  if (excludedIndex === -1) {
    workingPlan.context.failoverProviderId = null;
    workingPlan.excludedRoute = null;
    return workingPlan;
  }
  const [excluded] = workingPlan.distribution.splice(excludedIndex, 1);
  workingPlan.distribution = [];
  workingPlan.cost.totalUsd = 0;
  workingPlan.cost.costPerMillionUsd = 0;
  workingPlan.latency.avgLatencyMs = roundTo(plan.latency.avgLatencyMs * 1.08);
  workingPlan.latency.reliabilityScore = roundTo(
    Math.max(0, plan.latency.reliabilityScore - 2),
  );
  workingPlan.excludedRoute = excluded.route;
  workingPlan.context.failoverProviderId = failoverId;
  return workingPlan;
};

const buildMockRoutingPlan = (payload: RoutingSimulateRequestPayload): RoutingSimulationResult => {
  const strategyKey = payload.strategy ?? 'balanced';
  const basePlan = applyStrategyVariant(routingSimulation, strategyKey);
  const filteredPlan = applyProviderFilter(basePlan, payload.provider_ids);
  const finalPlan = applyFailover(filteredPlan, payload.failover_provider_id ?? null);
  const providerIds = payload.provider_ids && payload.provider_ids.length > 0
    ? [...payload.provider_ids]
    : [...routingSimulation.context.providerIds];
  finalPlan.context = {
    strategy: (strategyKey as RoutingStrategyId) ?? routingSimulation.context.strategy,
    providerIds,
    providerCount: providerIds.length,
    volumeMillions: payload.volume_millions ?? routingSimulation.context.volumeMillions,
    failoverProviderId: finalPlan.context.failoverProviderId,
  };
  return finalPlan;
};

const serializeRoutingPlan = (plan: RoutingSimulationResult) => ({
  context: {
    strategy: plan.context.strategy,
    provider_ids: plan.context.providerIds,
    provider_count: plan.context.providerCount,
    volume_millions: plan.context.volumeMillions,
    failover_provider_id: plan.context.failoverProviderId,
  },
  cost: {
    total_usd: plan.cost.totalUsd,
    cost_per_million_usd: plan.cost.costPerMillionUsd,
  },
  latency: {
    avg_latency_ms: plan.latency.avgLatencyMs,
    reliability_score: plan.latency.reliabilityScore,
  },
  distribution: plan.distribution.map((entry) => ({
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
  excluded_route: plan.excludedRoute
    ? {
        id: plan.excludedRoute.id,
        provider: plan.excludedRoute.provider,
        lane: plan.excludedRoute.lane,
        cost_per_million: plan.excludedRoute.costPerMillion,
        latency_p95: plan.excludedRoute.latencyP95,
        reliability: plan.excludedRoute.reliability,
        capacity_score: plan.excludedRoute.capacityScore,
      }
    : null,
});

const providerCatalog = (providersFixture as { providers: ProviderSummary[] }).providers;

const serverCatalogPayload = (serversFixture as {
  servers: Array<Record<string, unknown>>;
}).servers;

const cloneProcessState = (entry: Record<string, any>): Record<string, any> => ({
  ...entry,
  logs: (entry.logs ?? []).map((log: Record<string, unknown>) => ({ ...log })),
});

const processStateSource = (serverProcessesFixture as { processes: Array<Record<string, any>> }).processes;
const processStateByServer = new Map<string, Record<string, any>>();

const resetProcessState = () => {
  processStateByServer.clear();
  for (const entry of processStateSource) {
    processStateByServer.set(entry.server_id, cloneProcessState(entry));
  }
};

const healthHistoryByServer = new Map(
  Object.entries(
    (serverHealthFixture as { checks: Record<string, Array<Record<string, unknown>>> }).checks,
  ),
);

const sessionFixtureSource = (sessionsFixture as { sessions: Session[] }).sessions;
const sessionStore: Session[] = [];
let sessionSequence = 0;

const resetSessionStore = () => {
  sessionStore.splice(0, sessionStore.length, ...sessionFixtureSource.map((entry) => ({ ...entry })));
  sessionSequence = sessionStore.length;
};
const SESSION_TIMESTAMP_START = Date.UTC(2025, 2, 7, 10, 0, 0);

const coerceOptionalString = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
};

const createFixtureSessionRecord = (
  providerId: string,
  reason: string | null,
  client: string | null,
): Session => {
  sessionSequence += 1;
  const createdAt = new Date(SESSION_TIMESTAMP_START + sessionSequence * 60_000).toISOString();
  return {
    id: `session-${providerId}-${7000 + sessionSequence}`,
    provider_id: providerId,
    created_at: createdAt,
    status: 'success',
    reason,
    client,
  };
};

const cloneDeep = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const notifications = (notificationsFixture as {
  notifications: Array<Record<string, unknown>>;
}).notifications;

const agentCatalog = (agentsFixture as { agents: Array<Record<string, unknown>> }).agents.map(
  (entry) => ({
    ...(entry as Record<string, unknown>),
  }),
);

const defaultAgentSmokeRun: AgentSmokeRun = {
  runId: 'fixture-smoke-run',
  status: 'passed',
  summary: 'Smoke executado com sucesso usando fixtures locais.',
  reportUrl: 'https://observability.example.com/smoke/report-fixture',
  startedAt: '2025-03-06T12:00:00Z',
  finishedAt: '2025-03-06T12:00:05Z',
};

const agentSmokeRuns = new Map<string, AgentSmokeRun>();

const SMOKE_LOG_LEVELS: SmokeRunLogEntry['level'][] = ['debug', 'info', 'warning', 'error'];

type SmokeRunFixtureLog = {
  id: string;
  timestamp: string;
  level: SmokeRunLogEntry['level'];
  message: string;
};

type SmokeRunFixture = {
  run_id: string;
  status: SmokeRunStatus;
  summary?: string | null;
  triggered_by?: string | null;
  triggered_at?: string | null;
  finished_at?: string | null;
  logs?: SmokeRunFixtureLog[] | null;
};

type SmokeEndpointFixture = {
  id: string;
  name: string;
  description?: string | null;
  url: string;
  last_run?: SmokeRunFixture | null;
};

const smokeEndpointsSource = (smokeEndpointsFixture as { endpoints: SmokeEndpointFixture[] }).endpoints;

const smokeEndpointStore = new Map<string, SmokeEndpointFixture>();

const resetSmokeEndpointStore = () => {
  smokeEndpointStore.clear();
  for (const endpoint of smokeEndpointsSource) {
    smokeEndpointStore.set(endpoint.id, cloneDeep(endpoint));
  }
};

export const resetMockState = () => {
  resetProcessState();
  resetSessionStore();
  resetSmokeEndpointStore();
  agentSmokeRuns.clear();
};

resetMockState();

const cloneSmokeRun = (run: SmokeRunSummary): SmokeRunFixture => ({
  run_id: run.runId,
  status: run.status,
  summary: run.summary,
  triggered_by: run.triggeredBy,
  triggered_at: run.triggeredAt,
  finished_at: run.finishedAt,
  logs: run.logs.map((log) => ({
    id: log.id,
    timestamp: log.timestamp,
    level: log.level,
    message: log.message,
  })),
});

const toSmokeRunPayload = (run: SmokeRunFixture | null | undefined): SmokeRunFixture | null => {
  if (!run) {
    return null;
  }
  return {
    run_id: run.run_id,
    status: run.status,
    summary: run.summary ?? null,
    triggered_by: run.triggered_by ?? null,
    triggered_at: run.triggered_at ?? null,
    finished_at: run.finished_at ?? null,
    logs: (run.logs ?? []).map((log) => ({
      id: log.id,
      timestamp: log.timestamp,
      level: SMOKE_LOG_LEVELS.includes(log.level) ? log.level : 'info',
      message: log.message,
    })),
  };
};

const buildSmokeEndpointPayload = (endpoint: SmokeEndpointFixture) => ({
  id: endpoint.id,
  name: endpoint.name,
  description: endpoint.description ?? null,
  url: endpoint.url,
  last_run: toSmokeRunPayload(endpoint.last_run ?? null),
});

const SMOKE_RUN_SUMMARY: SmokeRunSummary = {
  runId: 'fixture-smoke',
  status: 'passed',
  summary: 'Verificação concluída com sucesso via fixtures.',
  triggeredBy: 'svc-smoke',
  triggeredAt: '2025-03-07T08:00:00Z',
  finishedAt: '2025-03-07T08:00:05Z',
  logs: [
    {
      id: 'log-fixture-1',
      timestamp: '2025-03-07T08:00:01Z',
      level: 'info',
      message: 'GET /health -> 200',
    },
    {
      id: 'log-fixture-2',
      timestamp: '2025-03-07T08:00:04Z',
      level: 'warning',
      message: 'Latência acima do esperado: 210ms',
    },
  ],
};

const policyManifestPayload = policyManifestFixture as Record<string, unknown>;
const compliancePayload = policiesComplianceFixture as Record<string, unknown>;

const FINOPS_POLICY_SNIPPET = JSON.stringify(
  {
    finops: {
      budgets: {
        daily: 950,
        weekly: 6400,
        monthly: 28000,
      },
      alerts: ['burn-rate', 'cache-hit'],
      cache: {
        ttl_seconds: 360,
      },
    },
  },
  null,
  2,
);

const FINOPS_POLICY_CONTEXT_SNIPPET =
  '"finops": {\n  "budgets": {\n    "daily": 950,\n    "weekly": 6400,\n    "monthly": 28000\n  },\n  "cache": {\n    "ttl_seconds": 360\n  },\n  "alerts": ["burn-rate", "cache-hit"]\n}';

const FINOPS_MANIFEST_DIFF = [
  'diff --git a/policies/manifest.json b/policies/manifest.json',
  '--- a/policies/manifest.json',
  '+++ b/policies/manifest.json',
  '@@ -12,7 +12,7 @@ "finops": {',
  '-    "daily": 1200,',
  '+    "daily": 950,',
  '@@ -24,6 +24,8 @@ "finops": {',
  '-  "cache": {',
  '-    "ttl_seconds": 600',
  '-  }',
  '+  "cache": {',
  '+    "ttl_seconds": 360',
  '+  },',
  '+  "alerts": ["burn-rate", "cache-hit"]',
  '}',
].join('\n');

const finopsPlanResponseFixture = {
  plan: {
    intent: 'policies.update',
    summary: 'Atualizar limites e alertas FinOps usando fixtures locais.',
    status: 'pending',
    steps: [
      {
        id: 'finops-budget-update',
        title: 'Sincronizar budgets FinOps',
        description:
          'Recalibra budgets e alertas de burn rate com base na sprint atual para manter custos sob controle.',
        depends_on: [],
        actions: [
          {
            type: 'file.update',
            path: 'policies/manifest.json',
            contents: FINOPS_POLICY_SNIPPET,
            encoding: 'utf-8',
            overwrite: true,
          },
        ],
      },
    ],
    diffs: [
      {
        path: 'policies/manifest.json',
        summary: 'Ajustar budgets e alertas FinOps (fixtures)',
        change_type: 'modify',
        diff: FINOPS_MANIFEST_DIFF,
      },
    ],
    risks: [
      {
        title: 'Aumento de alertas',
        impact: 'médio',
        mitigation: 'Monitorar o dashboard de FinOps nas próximas 24 horas.',
      },
    ],
    context: [
      {
        path: 'policies/manifest.json',
        snippet: FINOPS_POLICY_CONTEXT_SNIPPET,
        score: 0.82,
        title: 'Manifesto FinOps (trecho)',
        chunk: 1,
      },
    ],
    approval_rules: ['finops-core'],
  },
  preview: {
    branch: 'chore/finops-plan-fixtures',
    base_branch: 'main',
    commit_message: 'chore: atualizar políticas FinOps (fixtures)',
    pull_request: {
      provider: 'github',
      title: 'Atualizar políticas FinOps (fixtures)',
      body:
        'Plano gerado a partir das fixtures para revisar budgets, alertas e TTL de cache.',
    },
  },
};

const finopsPlanApplyFixture = {
  status: 'applied',
  mode: 'branch_pr',
  plan_id: 'finops-plan-fixture',
  record_id: 'finops-plan-record',
  branch: 'chore/finops-plan-fixtures',
  base_branch: 'main',
  commit_sha: 'f1x7ur3d0c',
  diff: {
    stat: '1 file changed, 6 insertions(+), 2 deletions(-)',
    patch: FINOPS_MANIFEST_DIFF,
  },
  hitl_required: false,
  message: 'Plano FinOps aplicado com sucesso nas fixtures.',
  approval_id: null,
  pull_request: {
    provider: 'github',
    id: 'finops-plan-42',
    number: '42',
    url: 'https://github.com/example/console-mcp/pull/42',
    title: 'Atualizar políticas FinOps (fixtures)',
    state: 'open',
    head_sha: 'f1x7ur3d0c',
    branch: 'chore/finops-plan-fixtures',
    ci_status: 'success',
    review_status: 'approved',
    merged: false,
    last_synced_at: '2025-03-07T09:45:00Z',
    reviewers: [
      { id: 'mcp-bot', name: 'MCP Bot', status: 'approved' },
    ],
    ci_results: [
      {
        name: 'lint',
        status: 'passed',
        details_url: 'https://ci.example.com/runs/finops-plan-fixtures',
      },
    ],
  },
};

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
  http.get(`${API_PREFIX}/sessions`, () => HttpResponse.json({ sessions: sessionStore })),
  http.post(`${API_PREFIX}/providers/:providerId/sessions`, async ({ params, request }) => {
    const providerId = params.providerId as string;
    const provider = providerCatalog.find((entry) => entry.id === providerId);
    if (!provider) {
      return HttpResponse.json({ detail: 'Provider not found' }, { status: 404 });
    }

    let payload: { reason?: unknown; client?: unknown } = {};
    try {
      payload = (await request.json()) as { reason?: unknown; client?: unknown };
    } catch {
      // ignore malformed bodies and fall back to defaults
    }

    const reason = coerceOptionalString(payload.reason);
    const client = coerceOptionalString(payload.client);
    const session = createFixtureSessionRecord(providerId, reason, client);

    sessionStore.unshift({ ...session });

    return HttpResponse.json(
      {
        session,
        provider,
      },
      { status: 201 },
    );
  }),
  http.get(`${API_PREFIX}/secrets`, () => HttpResponse.json({ secrets: [] })),
  http.get(`${API_PREFIX}/notifications`, () => HttpResponse.json({ notifications })),
  http.get(`${API_PREFIX}/policies/compliance`, () => HttpResponse.json(compliancePayload)),
  http.get(`${API_PREFIX}/policy/compliance`, () => HttpResponse.json(compliancePayload)),
  http.get(`${API_PREFIX}/policies/hitl/queue`, () =>
    HttpResponse.json({
      requests: [],
      stats: { pending: 0, completed: 0 },
    }),
  ),
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
  http.get(`${API_PREFIX}/telemetry/export`, ({ request }) => {
    let format = 'csv';
    let providerId = 'all';
    let start = '2025-03-01';
    let end = '2025-03-07';

    try {
      const url = new URL(request.url);
      format = url.searchParams.get('format') ?? format;
      providerId = url.searchParams.get('provider_id') ?? providerId;
      start = url.searchParams.get('start') ?? start;
      end = url.searchParams.get('end') ?? end;
    } catch (error) {
      console.warn('Falha ao interpretar parâmetros de export de telemetria', error);
    }

    const windowLabel = `${start} → ${end}`;

    if (format === 'html') {
      const html = `<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <title>FinOps Export Fixture</title>
    <style>
      body { font-family: system-ui, sans-serif; padding: 1.5rem; }
      table { border-collapse: collapse; width: 100%; margin-top: 1rem; }
      th, td { border: 1px solid #e5e7eb; padding: 0.5rem; text-align: left; }
      thead { background: #f1f5f9; }
    </style>
  </head>
  <body>
    <h1>Relatório FinOps — janela ${windowLabel}</h1>
    <p>Dados gerados pelas fixtures locais para desbloquear export sem backend.</p>
    <table>
      <thead>
        <tr>
          <th>Horário</th>
          <th>Provider</th>
          <th>Custo (USD)</th>
          <th>Tokens (M)</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>2025-03-06T12:00:00Z</td>
          <td>${providerId}</td>
          <td>128.4</td>
          <td>3.2</td>
          <td>success</td>
        </tr>
        <tr>
          <td>2025-03-06T13:00:00Z</td>
          <td>${providerId}</td>
          <td>142.1</td>
          <td>3.9</td>
          <td>success</td>
        </tr>
      </tbody>
    </table>
  </body>
</html>`;

      return new HttpResponse(html, {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }

    const csvRows = [
      'timestamp,provider_id,cost_usd,tokens_millions,latency_ms,status',
      `2025-03-06T12:00:00Z,${providerId},128.4,3.2,820,success`,
      `2025-03-06T13:00:00Z,${providerId},142.1,3.9,790,success`,
    ].join('\n');

    return new HttpResponse(csvRows, {
      status: 200,
      headers: { 'Content-Type': 'text/csv; charset=utf-8' },
    });
  }),
  http.get(`${API_PREFIX}/telemetry/finops/sprints`, () => HttpResponse.json(finopsSprintsFixture)),
  http.get(`${API_PREFIX}/telemetry/finops/pull-requests`, () =>
    HttpResponse.json(finopsPullRequestsFixture),
  ),
  http.get(`${API_PREFIX}/smoke/endpoints`, () => {
    const endpoints = Array.from(smokeEndpointStore.values()).map(buildSmokeEndpointPayload);
    return HttpResponse.json({ endpoints });
  }),
  http.post(`${API_PREFIX}/smoke/endpoints/:endpointId/run`, ({ params }) => {
    const endpointId = params.endpointId as string;
    const current = smokeEndpointStore.get(endpointId);
    if (!current) {
      return HttpResponse.json({ detail: 'Smoke endpoint not found' }, { status: 404 });
    }

    const now = new Date();
    const startedAt = now.toISOString();
    const finishedAt = new Date(now.getTime() + 5_000).toISOString();

    const run: SmokeRunSummary = {
      ...SMOKE_RUN_SUMMARY,
      runId: `${endpointId}-run-${now.getTime()}`,
      triggeredAt: startedAt,
      finishedAt,
      summary: `Execução ${endpointId} concluída com sucesso via fixtures.`,
    };

    const payload = cloneSmokeRun(run);

    smokeEndpointStore.set(endpointId, {
      ...current,
      last_run: payload,
    });

    return HttpResponse.json(toSmokeRunPayload(payload));
  }),
  http.post(`${API_PREFIX}/routing/simulate`, async ({ request }) => {
    const payload = (await request.json()) as RoutingSimulateRequestPayload;
    const plan = buildMockRoutingPlan(payload);
    return HttpResponse.json(serializeRoutingPlan(plan));
  }),
  http.get(`${API_PREFIX}/policies/manifest`, () => HttpResponse.json(policyManifestPayload)),
  http.patch(`${API_PREFIX}/config/policies`, async () =>
    HttpResponse.json(cloneDeep(finopsPlanResponseFixture)),
  ),
  http.post(`${API_PREFIX}/config/apply`, async ({ request }) => {
    let payload: { plan_id?: unknown } = {};
    try {
      payload = (await request.json()) as { plan_id?: unknown };
    } catch {
      // ignore malformed payloads
    }

    const rawPlanId =
      typeof payload.plan_id === 'string' && payload.plan_id.trim().length > 0
        ? payload.plan_id.trim()
        : null;
    const planId = rawPlanId ?? 'finops-plan-fixture';

    const response = cloneDeep(finopsPlanApplyFixture);
    response.plan_id = planId;
    response.record_id = `record-${planId}`;
    response.message = `Plano ${planId} aplicado com sucesso via fixtures.`;

    if (response.pull_request) {
      response.pull_request.id = `${planId}-pr`;
      response.pull_request.branch = response.branch;
      response.pull_request.head_sha = response.commit_sha;
      const pullNumber = response.pull_request.number ?? '42';
      response.pull_request.number = pullNumber;
      response.pull_request.url = `https://github.com/example/console-mcp/pull/${pullNumber}`;
    }

    return HttpResponse.json(response);
  }),
  http.get(`${API_PREFIX}/providers`, () => HttpResponse.json({ providers: providerCatalog })),
  http.get('*/agents/agents', () => HttpResponse.json({ agents: agentCatalog })),
  http.post('*/agents/:agentName/smoke', ({ params }) => {
    const agentName = params.agentName as string;
    const existing = agentSmokeRuns.get(agentName) ?? defaultAgentSmokeRun;
    const now = new Date();
    const startedAt = now.toISOString();
    const finishedAt = new Date(now.getTime() + 4_000).toISOString();

    const run: AgentSmokeRun = {
      ...existing,
      runId: `${agentName}-smoke-${now.getTime()}`,
      startedAt,
      finishedAt,
      summary: existing.summary ?? 'Smoke executado com sucesso usando fixtures locais.',
    };

    agentSmokeRuns.set(agentName, run);

    return HttpResponse.json({
      run_id: run.runId,
      status: run.status,
      summary: run.summary,
      report_url: run.reportUrl,
      started_at: run.startedAt,
      finished_at: run.finishedAt,
    });
  }),
];
