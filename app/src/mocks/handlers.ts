import { http, HttpResponse } from 'msw';
import type {
  AgentConfigLayer,
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
import securityUsersFixture from '#fixtures/security_users.json' with { type: 'json' };
import securityRolesFixture from '#fixtures/security_roles.json' with { type: 'json' };
import securityApiKeysFixture from '#fixtures/security_api_keys.json' with { type: 'json' };
import securityAuditTrailFixture from '#fixtures/security_audit_trail.json' with { type: 'json' };
import securityAuditLogsFixture from '#fixtures/security_audit_logs.json' with { type: 'json' };

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

const serverCatalogSource = (serversFixture as {
  servers: Array<Record<string, unknown>>;
}).servers;

const serverCatalogStore = new Map<string, Record<string, unknown>>();

const resetServerCatalogStore = () => {
  serverCatalogStore.clear();
  for (const server of serverCatalogSource) {
    const id = (server.id as string) ?? `server-${serverCatalogStore.size + 1}`;
    serverCatalogStore.set(id, createResponse(server));
  }
};

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

const nextProcessPid = (() => {
  let seed = 0;
  return () => {
    seed += 1;
    return 3200 + ((seed * 37) % 1200);
  };
})();

const latencySamples = [92, 104, 118, 133, 101, 89];
const nextLatencySample = (() => {
  let index = 0;
  return () => {
    const value = latencySamples[index % latencySamples.length];
    index += 1;
    return value;
  };
})();

const createDeterministicIdFactory = (prefix: string) => {
  let counter = 0;
  return () => {
    counter += 1;
    return `${prefix}-${counter.toString(36).padStart(2, '0')}`;
  };
};

const nextUserId = createDeterministicIdFactory('user');
const nextRoleId = createDeterministicIdFactory('role');
const nextKeyId = createDeterministicIdFactory('key');
const nextSecretSequence = (() => {
  let counter = 0;
  return () => {
    counter += 1;
    return counter;
  };
})();

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

const FIXTURE_CLOCK_START = Date.UTC(2025, 2, 7, 12, 0, 0);

const nextIsoTimestamp = (() => {
  let step = 0;
  return () => {
    step += 1;
    return new Date(FIXTURE_CLOCK_START + step * 30_000).toISOString();
  };
})();

const createResponse = <T>(value: T): T => cloneDeep(value);

interface SecretRecord {
  provider_id: string;
  has_secret: boolean;
  updated_at: string | null;
  value: string | null;
}

const secretFixtures: SecretRecord[] = [
  {
    provider_id: 'gemini',
    has_secret: true,
    updated_at: '2025-03-06T09:00:00Z',
    value: 'gemini-api-key-fixture',
  },
  {
    provider_id: 'glm46',
    has_secret: false,
    updated_at: null,
    value: null,
  },
];

const secretStore = new Map<string, SecretRecord>();

const resetSecretStore = () => {
  secretStore.clear();
  for (const record of secretFixtures) {
    secretStore.set(record.provider_id, createResponse(record));
  }
};

interface CostPolicyRecord {
  id: string;
  name: string;
  description: string | null;
  monthly_spend_limit: number;
  currency: string;
  tags: string[];
  created_at: string;
  updated_at: string;
}

const costPolicyFixtures: CostPolicyRecord[] = [
  {
    id: 'finops-core',
    name: 'FinOps Core',
    description: 'Protege o orçamento principal de LLMs.',
    monthly_spend_limit: 42000,
    currency: 'USD',
    tags: ['llm', 'priority'],
    created_at: '2025-02-10T10:00:00Z',
    updated_at: '2025-03-05T09:30:00Z',
  },
  {
    id: 'experiments',
    name: 'Experimentos controlados',
    description: 'Limita rotas experimentais para conter custo.',
    monthly_spend_limit: 8000,
    currency: 'USD',
    tags: ['canary'],
    created_at: '2025-02-12T11:00:00Z',
    updated_at: '2025-03-01T16:45:00Z',
  },
];

const costPolicyStore = new Map<string, CostPolicyRecord>();

const resetCostPolicyStore = () => {
  costPolicyStore.clear();
  for (const policy of costPolicyFixtures) {
    costPolicyStore.set(policy.id, createResponse(policy));
  }
};

const listCostPolicies = (): CostPolicyRecord[] =>
  Array.from(costPolicyStore.values()).map((policy) => createResponse(policy));

type PolicyOverridesPayloadRecord = NonNullable<PolicyOverridesPayload>;

interface PolicyOverrideRecord extends PolicyOverridePayload {
  overrides?: PolicyOverridesPayloadRecord | null;
}

const policyOverrideFixtures: PolicyOverrideRecord[] = [
  {
    id: 'override-route-ops',
    route: 'route-ops',
    project: 'routing-console',
    template_id: 'policy-routing-latency',
    max_latency_ms: 1200,
    max_cost_usd: 12,
    require_manual_approval: true,
    notes: 'Fixture override para desbloquear testes de HITL.',
    created_at: '2025-03-01T12:00:00Z',
    updated_at: '2025-03-06T08:30:00Z',
    overrides: {
      finops: {
        budgets: { daily: 950, weekly: 6400, monthly: 28000 },
      },
      routing: {
        intents: [
          {
            intent: 'chat.economy',
            description: 'Fallback econômico para chat.',
            default_tier: 'economy',
            tags: ['economy'],
            fallback_provider_id: 'glm46',
          },
        ],
      },
    },
  },
];

const policyOverrideStore = new Map<string, PolicyOverrideRecord>();

const resetPolicyOverrideStore = () => {
  policyOverrideStore.clear();
  for (const override of policyOverrideFixtures) {
    policyOverrideStore.set(override.id, createResponse(override));
  }
};

const listPolicyOverrides = (): PolicyOverrideRecord[] =>
  Array.from(policyOverrideStore.values()).map((override) => createResponse(override));

const policyTemplateCatalog = {
  templates: [
    {
      id: 'policy-routing-latency',
      name: 'Routing focado em latência',
      tagline: 'Diminui P95 usando fallback automático.',
      description: 'Rebalanceia tráfego priorizando rotas turbo.',
      price_delta: 1.08,
      latency_target: 0.82,
      guardrail_level: 'medium',
      features: ['prioriza-turbo', 'failover-automático'],
    },
    {
      id: 'policy-finops-burn',
      name: 'FinOps burn-rate',
      tagline: 'Ativa alertas de burn-rate agressivos.',
      description: 'Ajusta budgets e adiciona degradê suave.',
      price_delta: 0.95,
      latency_target: 1.05,
      guardrail_level: 'high',
      features: ['burn-rate', 'graceful-degradation'],
    },
  ],
  rollout: {
    generatedAt: '2025-03-06T10:00:00Z',
    plans: [
      {
        templateId: 'policy-routing-latency',
        generatedAt: '2025-03-06T09:45:00Z',
        allocations: [
          {
            segment: {
              id: 'canary',
              name: 'Canary',
              description: 'Clientes piloto para validação.',
            },
            coverage: 0.15,
            providers: providerCatalog.slice(0, 2),
          },
          {
            segment: {
              id: 'general',
              name: 'General availability',
              description: 'Segmento padrão das rotas.',
            },
            coverage: 0.85,
            providers: providerCatalog.slice(0, 3),
          },
        ],
      },
    ],
  },
};

const observabilityPreferencesState = {
  tracing: {
    provider: 'langsmith',
    endpoint: 'https://observability.example.com/tracing',
    project: 'console-mcp',
    dataset: 'production',
    headers: { Authorization: 'Bearer tracing-fixture' },
  },
  metrics: {
    provider: 'otlp',
    endpoint: 'https://observability.example.com/metrics',
    project: null,
    dataset: null,
    headers: null,
  },
  evals: null,
  updated_at: '2025-03-05T11:45:00Z',
  audit: {
    actor_id: 'user-ops',
    actor_name: 'Operations Bot',
    actor_roles: ['observability-admin'],
  },
};

interface DiagnosticsComponentFixture {
  ok: boolean;
  status_code: number;
  duration_ms: number;
  data: Record<string, unknown>;
  error: string | null;
}

const diagnosticsFixture = {
  timestamp: '2025-03-07T12:10:00Z',
  summary: {
    total: 3,
    successes: 3,
    failures: 0,
    errors: {},
  },
  health: {
    ok: true,
    status_code: 200,
    duration_ms: 15.2,
    data: { status: 'ok' },
    error: null,
  } satisfies DiagnosticsComponentFixture,
  providers: {
    ok: true,
    status_code: 200,
    duration_ms: 28.4,
    data: {
      providers: providerCatalog.map((provider) => ({ id: provider.id, status: 'ok' })),
    },
    error: null,
  } satisfies DiagnosticsComponentFixture,
  invoke: {
    ok: true,
    status_code: 200,
    duration_ms: 41.9,
    data: { result: { status: 'ok', duration_ms: 120 } },
    error: null,
  } satisfies DiagnosticsComponentFixture,
};

const marketplaceCatalog = {
  entries: [
    {
      id: 'observability-bundle',
      name: 'Observability bundle',
      slug: 'observability-bundle',
      summary: 'Dashboards e alarmes prontos para servidores MCP.',
      description: 'Inclui dashboards prontos para Grafana e alertas Prometheus.',
      origin: 'fixtures',
      rating: 4.8,
      cost: 249,
      tags: ['observability', 'dashboards'],
      capabilities: ['metrics', 'alerts'],
      repository_url: 'https://github.com/example/mcp-observability-bundle',
      package_path: 'packages/observability-bundle',
      manifest_filename: 'manifest.yaml',
      entrypoint_filename: 'main.py',
      target_repository: 'git@github.com:example/console-mcp.git',
      signature: 'fixture-signature-observability',
      created_at: '2025-02-01T12:00:00Z',
      updated_at: '2025-03-05T09:30:00Z',
    },
    {
      id: 'policy-pack',
      name: 'Policy pack',
      slug: 'policy-pack',
      summary: 'Coleção de políticas HITL pré-aprovadas.',
      description: 'Conjunto de políticas de governança com fluxo HITL integrado.',
      origin: 'fixtures',
      rating: 4.6,
      cost: 149,
      tags: ['policies', 'hitl'],
      capabilities: ['governance'],
      repository_url: 'https://github.com/example/mcp-policy-pack',
      package_path: 'packages/policy-pack',
      manifest_filename: 'manifest.yaml',
      entrypoint_filename: null,
      target_repository: 'git@github.com:example/console-mcp.git',
      signature: 'fixture-signature-policy',
      created_at: '2025-01-20T10:00:00Z',
      updated_at: '2025-02-28T15:45:00Z',
    },
  ],
};

interface SecurityUserRecord {
  id: string;
  name: string;
  email: string;
  roles: string[];
  status: string;
  created_at: string;
  last_seen_at: string | null;
  mfa_enabled: boolean;
}

const securityUserFixtures = (securityUsersFixture as { users: SecurityUserRecord[] }).users;

const securityUserStore = new Map<string, SecurityUserRecord>();

const resetSecurityUserStore = () => {
  securityUserStore.clear();
  for (const user of securityUserFixtures) {
    securityUserStore.set(user.id, createResponse(user));
  }
};

const listSecurityUsers = (): SecurityUserRecord[] =>
  Array.from(securityUserStore.values()).map((user) => createResponse(user));

interface SecurityRoleRecord {
  id: string;
  name: string;
  description: string;
  permissions: string[];
  members: number;
  created_at: string;
  updated_at: string;
}

const securityRoleFixtures = (securityRolesFixture as { roles: SecurityRoleRecord[] }).roles;

const securityRoleStore = new Map<string, SecurityRoleRecord>();

const resetSecurityRoleStore = () => {
  securityRoleStore.clear();
  for (const role of securityRoleFixtures) {
    securityRoleStore.set(role.id, createResponse(role));
  }
};

const listSecurityRoles = (): SecurityRoleRecord[] =>
  Array.from(securityRoleStore.values()).map((role) => createResponse(role));

interface SecurityApiKeyRecord {
  id: string;
  name: string;
  owner: string;
  scopes: string[];
  status: string;
  created_at: string;
  last_used_at: string | null;
  expires_at: string | null;
  token_preview: string | null;
}

const securityApiKeyFixtures = (securityApiKeysFixture as { keys: SecurityApiKeyRecord[] }).keys;

const securityApiKeyStore = new Map<string, SecurityApiKeyRecord>();

const resetSecurityApiKeyStore = () => {
  securityApiKeyStore.clear();
  for (const key of securityApiKeyFixtures) {
    securityApiKeyStore.set(key.id, createResponse(key));
  }
};

const listSecurityApiKeys = (): SecurityApiKeyRecord[] =>
  Array.from(securityApiKeyStore.values()).map((key) => createResponse(key));

type AuditTrailStore = Map<string, Array<Record<string, unknown>>>;

type AuditTrailFixtureMap = Record<string, Array<Record<string, unknown>>>;

const securityAuditTrailFixtures = (
  securityAuditTrailFixture as { events: AuditTrailFixtureMap }
).events;

const securityAuditTrailStore: AuditTrailStore = new Map();

const resetSecurityAuditTrailStore = () => {
  securityAuditTrailStore.clear();
  for (const [key, events] of Object.entries(securityAuditTrailFixtures)) {
    securityAuditTrailStore.set(key, createResponse(events));
  }
};

interface SecurityAuditLogRecord {
  id: string;
  created_at: string;
  actor_id: string | null;
  actor_name: string | null;
  actor_roles: string[];
  action: string;
  resource: string;
  status: string;
  plan_id: string | null;
  metadata?: Record<string, unknown> | null;
}

const securityAuditLogFixtures = (
  securityAuditLogsFixture as { events: SecurityAuditLogRecord[] }
).events;

const configChatThreads = new Map<string, Array<Record<string, unknown>>>();

const ensureChatThread = (threadId: string) => {
  if (!configChatThreads.has(threadId)) {
    configChatThreads.set(threadId, [
      {
        id: `${threadId}-assistant-1`,
        role: 'assistant',
        content: 'Olá! Sou o assistente de configuração da Console MCP.',
        created_at: '2025-03-07T10:00:00Z',
      },
    ]);
  }
  return configChatThreads.get(threadId)!;
};

const agentPlanHistoryStore = new Map<string, Array<Record<string, unknown>>>();

const getAgentPlanHistory = (agentId: string) => {
  if (!agentPlanHistoryStore.has(agentId)) {
    agentPlanHistoryStore.set(agentId, []);
  }
  return agentPlanHistoryStore.get(agentId)!;
};

const configMcpUpdatePlan = {
  plan_id: 'mcp-update-plan-fixture',
  summary: 'Atualizar manifesto MCP via fixtures.',
  message: 'Plano preparado pelas fixtures locais.',
  diffs: [
    {
      id: 'diff-manifest',
      title: 'agents/gemini/agent.yaml',
      summary: 'Atualiza owner e descrição.',
      diff: '--- a/agent.yaml\n+++ b/agent.yaml\n+owner: platform-team\n+tags:\n+  - fixtures',
    },
  ],
};

const configMcpUpdateApply = {
  status: 'applied',
  message: 'Atualização enviada com sucesso via fixtures.',
  record_id: 'mcp-update-record-fixture',
  branch: 'feature/fixtures',
  pull_request: {
    provider: 'github',
    id: 'pr-fixture',
    number: '101',
    url: 'https://github.com/example/console-mcp/pull/101',
    title: 'Atualizar manifesto MCP (fixtures)',
    state: 'open',
    head_sha: 'f1x7ur3',
    branch: 'feature/fixtures',
    merged: false,
  },
};

const mcpOnboardingStatus = {
  recordId: 'onboard-fixture',
  status: 'completed',
  branch: 'feature/onboard-fixtures',
  baseBranch: 'main',
  commitSha: '0nb04rd123',
  pullRequest: configMcpUpdateApply.pull_request
    ? createResponse(configMcpUpdateApply.pull_request)
    : null,
  updatedAt: '2025-03-07T11:15:00Z',
};

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
  resetServerCatalogStore();
  resetSessionStore();
  resetSmokeEndpointStore();
  agentSmokeRuns.clear();
  resetSecretStore();
  resetCostPolicyStore();
  resetPolicyOverrideStore();
  resetSecurityUserStore();
  resetSecurityRoleStore();
  resetSecurityApiKeyStore();
  resetSecurityAuditTrailStore();
  configChatThreads.clear();
  agentPlanHistoryStore.clear();
  appendAgentHistory('catalog-search', {
    summary: 'Plano inicial aplicado via fixtures.',
    plan_id: 'catalog-search-plan-inicial',
  });
};

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

const isAgentLayer = (value: unknown): value is AgentConfigLayer =>
  value === 'policies' || value === 'routing' || value === 'finops' || value === 'observability';

type AgentHistoryEntryInput = {
  plan_id?: string;
  summary?: string;
  requested_by?: string;
  created_at?: string;
  status?: string;
  status_label?: string;
  layer?: AgentConfigLayer;
  plan_payload?: Record<string, unknown> | null;
  patch?: string | null;
  pull_request?: Record<string, unknown> | null;
};

const appendAgentHistory = (agentId: string, entry: AgentHistoryEntryInput) => {
  const history = getAgentPlanHistory(agentId);

  const planId = entry.plan_id ?? `${agentId}-plan-fixture`;
  const requestedBy = entry.requested_by ?? 'fixtures@console';
  const createdAt = entry.created_at ?? new Date().toISOString();
  const status = (entry.status ?? 'completed').toLowerCase();
  const statusLabel = entry.status_label ?? 'Concluído';
  const layer = isAgentLayer(entry.layer) ? entry.layer : 'policies';

  let planPayload: Record<string, unknown> | null;
  if (entry.plan_payload === undefined) {
    planPayload = createResponse(finopsPlanResponseFixture.plan);
  } else if (entry.plan_payload === null) {
    planPayload = null;
  } else {
    planPayload = createResponse(entry.plan_payload);
  }

  let pullRequest: Record<string, unknown> | null;
  if (entry.pull_request === undefined) {
    pullRequest = finopsPlanApplyFixture.pull_request
      ? createResponse(finopsPlanApplyFixture.pull_request)
      : null;
  } else if (entry.pull_request === null) {
    pullRequest = null;
  } else {
    pullRequest = createResponse(entry.pull_request);
  }

  const record = {
    id: `${agentId}-history-${history.length + 1}`,
    layer,
    status,
    status_label: statusLabel,
    requested_by: requestedBy,
    created_at: createdAt,
    summary: entry.summary ?? `Plano ${planId} aplicado via fixtures.`,
    plan_id: planId,
    plan_payload: planPayload,
    patch: entry.patch === undefined ? FINOPS_MANIFEST_DIFF : entry.patch,
    pull_request: pullRequest,
  };

  history.unshift(record);
};

resetMockState();

const configReloadPlanFixture = {
  message: 'Plano de reload gerado via fixtures.',
  plan: createResponse(finopsPlanResponseFixture.plan),
  planPayload: createResponse(finopsPlanResponseFixture.plan),
  patch: FINOPS_MANIFEST_DIFF,
  planId: 'reload-plan-fixture',
};

const buildPlanResponse = (summary: string, intent = 'config.update') => {
  const response = cloneDeep(finopsPlanResponseFixture);
  response.plan.summary = summary;
  response.plan.intent = intent;
  if (response.preview) {
    response.preview.branch = `fixtures/${intent.replace(/\./g, '-')}`;
    response.preview.commit_message = `chore: ${summary.toLowerCase()}`;
  }
  return response;
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
  http.get(`${API_PREFIX}/servers`, () =>
    HttpResponse.json({ servers: Array.from(serverCatalogStore.values()) }),
  ),
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
      next.pid = nextProcessPid();
      next.started_at = now;
      next.stopped_at = null;
      next.return_code = null;
      next.last_error = null;
    }

    processStateByServer.set(serverId, next);
    return HttpResponse.json({ process: next });
  }),
  http.post(`${API_PREFIX}/servers/:serverId/health/ping`, ({ params }) => {
    const serverId = params.serverId as string;
    const checks = healthHistoryByServer.get(serverId) ?? [];
    const check = {
      status: 'healthy',
      checked_at: nextIsoTimestamp(),
      latency_ms: nextLatencySample(),
      message: 'Ping realizado com sucesso via fixtures.',
      actor: 'fixtures@console',
      plan_id: null,
    };
    checks.unshift(createResponse(check));
    healthHistoryByServer.set(serverId, checks);
    return HttpResponse.json({ check });
  }),
  http.put(`${API_PREFIX}/servers/:serverId`, async ({ params, request }) => {
    const serverId = params.serverId as string;
    const current = serverCatalogStore.get(serverId);
    if (!current) {
      return HttpResponse.json({ detail: 'Server not found' }, { status: 404 });
    }
    let payload: Record<string, unknown> = {};
    try {
      payload = (await request.json()) as Record<string, unknown>;
    } catch {
      // ignore malformed payloads
    }
    const updated = {
      ...current,
      ...payload,
      id: serverId,
      updated_at: nextIsoTimestamp(),
    };
    serverCatalogStore.set(serverId, updated);
    return HttpResponse.json({ server: updated });
  }),
  http.delete(`${API_PREFIX}/servers/:serverId`, ({ params }) => {
    const serverId = params.serverId as string;
    serverCatalogStore.delete(serverId);
    processStateByServer.delete(serverId);
    healthHistoryByServer.delete(serverId);
    return new HttpResponse(null, { status: 204 });
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
  http.get(`${API_PREFIX}/secrets`, () =>
    HttpResponse.json({
      secrets: Array.from(secretStore.values()).map((secret) => ({
        provider_id: secret.provider_id,
        has_secret: secret.has_secret,
        updated_at: secret.updated_at,
      })),
    }),
  ),
  http.get(`${API_PREFIX}/secrets/:providerId`, ({ params }) => {
    const providerId = params.providerId as string;
    const secret = secretStore.get(providerId);
    if (!secret) {
      return HttpResponse.json({ detail: 'Secret not found' }, { status: 404 });
    }
    const updatedAt = secret.updated_at ?? nextIsoTimestamp();
    if (!secret.has_secret || !secret.value) {
      return HttpResponse.json({
        provider_id: providerId,
        value: '',
        updated_at: updatedAt,
      });
    }
    return HttpResponse.json({
      provider_id: providerId,
      value: secret.value,
      updated_at: updatedAt,
    });
  }),
  http.put(`${API_PREFIX}/secrets/:providerId`, async ({ params, request }) => {
    const providerId = params.providerId as string;
    let payload: { value?: unknown } = {};
    try {
      payload = (await request.json()) as { value?: unknown };
    } catch {
      // ignore malformed payloads and use empty value
    }
    const rawValue = typeof payload.value === 'string' ? payload.value : '';
    const record = secretStore.get(providerId) ?? {
      provider_id: providerId,
      has_secret: false,
      updated_at: null,
      value: null,
    };
    const updatedAt = nextIsoTimestamp();
    record.value = rawValue;
    record.has_secret = rawValue.trim().length > 0;
    record.updated_at = updatedAt;
    secretStore.set(providerId, record);
    return HttpResponse.json({
      provider_id: providerId,
      value: rawValue,
      updated_at: updatedAt,
    });
  }),
  http.delete(`${API_PREFIX}/secrets/:providerId`, ({ params }) => {
    const providerId = params.providerId as string;
    const record = secretStore.get(providerId);
    if (!record) {
      return new HttpResponse(null, { status: 204 });
    }
    record.has_secret = false;
    record.value = null;
    record.updated_at = nextIsoTimestamp();
    secretStore.set(providerId, record);
    return new HttpResponse(null, { status: 204 });
  }),
  http.post(`${API_PREFIX}/secrets/:providerId/test`, ({ params }) => {
    const providerId = params.providerId as string;
    const record = secretStore.get(providerId);
    const status = record?.has_secret ? 'healthy' : 'degraded';
    return HttpResponse.json({
      provider_id: providerId,
      status,
      latency_ms: status === 'healthy' ? 120 : 420,
      tested_at: nextIsoTimestamp(),
      message:
        status === 'healthy'
          ? 'Secret validado pelas fixtures locais.'
          : 'Secret ausente; recomenda-se atualizar via fixtures.',
    });
  }),
  http.post(`${API_PREFIX}/diagnostics/run`, async ({ request }) => {
    try {
      await request.json();
    } catch {
      // ignore malformed payloads to keep fixtures resilient
    }
    return HttpResponse.json(diagnosticsFixture);
  }),
  http.get(`${API_PREFIX}/observability/preferences`, () =>
    HttpResponse.json(createResponse(observabilityPreferencesState)),
  ),
  http.put(`${API_PREFIX}/observability/preferences`, async ({ request }) => {
    let payload: Record<string, unknown> = {};
    try {
      payload = (await request.json()) as Record<string, unknown>;
    } catch {
      // ignore malformed payloads
    }

    const applySettings = (key: 'tracing' | 'metrics' | 'evals') => {
      if (Object.prototype.hasOwnProperty.call(payload, key)) {
        const value = payload[key];
        if (value === null) {
          (observabilityPreferencesState as Record<string, unknown>)[key] = null;
        } else if (typeof value === 'object' && value) {
          const current =
            (observabilityPreferencesState as Record<string, unknown>)[key] ?? {};
          (observabilityPreferencesState as Record<string, unknown>)[key] = {
            ...(current as Record<string, unknown>),
            ...(value as Record<string, unknown>),
          };
        }
      }
    };

    applySettings('tracing');
    applySettings('metrics');
    applySettings('evals');

    observabilityPreferencesState.updated_at = nextIsoTimestamp();
    observabilityPreferencesState.audit = {
      actor_id: 'user-ops',
      actor_name: 'Operations Bot',
      actor_roles: ['observability-admin'],
    };

    return HttpResponse.json(createResponse(observabilityPreferencesState));
  }),
  http.get(`${API_PREFIX}/notifications`, () => HttpResponse.json({ notifications })),
  http.get(`${API_PREFIX}/policies/compliance`, () => HttpResponse.json(compliancePayload)),
  http.get(`${API_PREFIX}/policy/compliance`, () => HttpResponse.json(compliancePayload)),
  http.get(`${API_PREFIX}/policies/hitl/queue`, () =>
    HttpResponse.json({
      requests: [],
      stats: { pending: 0, completed: 0 },
    }),
  ),
  http.get(`${API_PREFIX}/policies`, () =>
    HttpResponse.json({ policies: listCostPolicies() }),
  ),
  http.post(`${API_PREFIX}/policies`, async ({ request }) => {
    let payload: Record<string, unknown> = {};
    try {
      payload = (await request.json()) as Record<string, unknown>;
    } catch {
      // ignore
    }
    const now = nextIsoTimestamp();
    const rawId = typeof payload.id === 'string' && payload.id.trim().length > 0
      ? payload.id.trim()
      : `policy-${costPolicyStore.size + 1}`;
    const record: CostPolicyRecord = {
      id: rawId,
      name: typeof payload.name === 'string' ? payload.name : `Policy ${rawId}`,
      description:
        typeof payload.description === 'string' ? payload.description : null,
      monthly_spend_limit: Number(payload.monthly_spend_limit ?? 0),
      currency: typeof payload.currency === 'string' ? payload.currency : 'USD',
      tags: Array.isArray(payload.tags)
        ? (payload.tags as unknown[]).map((tag) => String(tag))
        : [],
      created_at: now,
      updated_at: now,
    };
    costPolicyStore.set(record.id, record);
    return HttpResponse.json(record, { status: 201 });
  }),
  http.put(`${API_PREFIX}/policies/:policyId`, async ({ params, request }) => {
    const policyId = params.policyId as string;
    const current = costPolicyStore.get(policyId);
    if (!current) {
      return HttpResponse.json({ detail: 'Policy not found' }, { status: 404 });
    }
    let payload: Record<string, unknown> = {};
    try {
      payload = (await request.json()) as Record<string, unknown>;
    } catch {
      // ignore
    }
    const updated: CostPolicyRecord = {
      ...current,
      name: typeof payload.name === 'string' ? payload.name : current.name,
      description:
        typeof payload.description === 'string'
          ? payload.description
          : current.description,
      monthly_spend_limit: Number(
        payload.monthly_spend_limit ?? current.monthly_spend_limit,
      ),
      currency: typeof payload.currency === 'string' ? payload.currency : current.currency,
      tags: Array.isArray(payload.tags)
        ? (payload.tags as unknown[]).map((tag) => String(tag))
        : current.tags,
      updated_at: nextIsoTimestamp(),
    };
    costPolicyStore.set(policyId, updated);
    return HttpResponse.json(updated);
  }),
  http.delete(`${API_PREFIX}/policies/:policyId`, ({ params }) => {
    const policyId = params.policyId as string;
    costPolicyStore.delete(policyId);
    return new HttpResponse(null, { status: 204 });
  }),
  http.get(`${API_PREFIX}/policies/overrides`, () =>
    HttpResponse.json({ overrides: listPolicyOverrides() }),
  ),
  http.post(`${API_PREFIX}/policies/overrides`, async ({ request }) => {
    let payload: Record<string, unknown> = {};
    try {
      payload = (await request.json()) as Record<string, unknown>;
    } catch {
      // ignore
    }
    const now = nextIsoTimestamp();
    const rawId = typeof payload.id === 'string' && payload.id.trim().length > 0
      ? payload.id.trim()
      : `override-${policyOverrideStore.size + 1}`;
    const record: PolicyOverrideRecord = {
      id: rawId,
      route: String(payload.route ?? 'default'),
      project: String(payload.project ?? 'console'),
      template_id: String(payload.template_id ?? 'policy-routing-latency'),
      max_latency_ms: payload.max_latency_ms as number | null | undefined ?? null,
      max_cost_usd: payload.max_cost_usd as number | null | undefined ?? null,
      require_manual_approval: Boolean(payload.require_manual_approval),
      notes: typeof payload.notes === 'string' ? payload.notes : null,
      created_at: now,
      updated_at: now,
      overrides: (payload.overrides as PolicyOverridesPayload | undefined) ?? null,
    };
    policyOverrideStore.set(record.id, record);
    return HttpResponse.json(record, { status: 201 });
  }),
  http.put(`${API_PREFIX}/policies/overrides/:overrideId`, async ({ params, request }) => {
    const overrideId = params.overrideId as string;
    const current = policyOverrideStore.get(overrideId);
    if (!current) {
      return HttpResponse.json({ detail: 'Override not found' }, { status: 404 });
    }
    let payload: Record<string, unknown> = {};
    try {
      payload = (await request.json()) as Record<string, unknown>;
    } catch {
      // ignore
    }
    const updated: PolicyOverrideRecord = {
      ...current,
      route: typeof payload.route === 'string' ? payload.route : current.route,
      project: typeof payload.project === 'string' ? payload.project : current.project,
      template_id:
        typeof payload.template_id === 'string'
          ? payload.template_id
          : current.template_id,
      max_latency_ms:
        (payload.max_latency_ms as number | null | undefined) ?? current.max_latency_ms,
      max_cost_usd:
        (payload.max_cost_usd as number | null | undefined) ?? current.max_cost_usd,
      require_manual_approval:
        typeof payload.require_manual_approval === 'boolean'
          ? payload.require_manual_approval
          : current.require_manual_approval,
      notes: typeof payload.notes === 'string' ? payload.notes : current.notes,
      overrides: (payload.overrides as PolicyOverridesPayload | undefined) ?? current.overrides ?? null,
      updated_at: nextIsoTimestamp(),
    };
    policyOverrideStore.set(overrideId, updated);
    return HttpResponse.json(updated);
  }),
  http.delete(`${API_PREFIX}/policies/overrides/:overrideId`, ({ params }) => {
    const overrideId = params.overrideId as string;
    policyOverrideStore.delete(overrideId);
    return new HttpResponse(null, { status: 204 });
  }),
  http.get(`${API_PREFIX}/policies/templates`, () =>
    HttpResponse.json(createResponse(policyTemplateCatalog)),
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
  http.post(`${API_PREFIX}/config/plan`, async ({ request }) => {
    try {
      await request.json();
    } catch {
      // ignore malformed payloads
    }
    return HttpResponse.json(buildPlanResponse('Plano governado via fixtures.', 'config.plan'));
  }),
  http.post(`${API_PREFIX}/config/chat`, async ({ request }) => {
    let payload: Record<string, unknown> = {};
    try {
      payload = (await request.json()) as Record<string, unknown>;
    } catch {
      // ignore malformed payloads
    }
    const threadId =
      typeof payload.threadId === 'string'
        ? payload.threadId
        : typeof payload.thread_id === 'string'
          ? payload.thread_id
          : 'thread-fixture';
    const thread = ensureChatThread(threadId);
    const intent = typeof payload.intent === 'string' ? payload.intent : 'message';
    if (intent === 'message') {
      const prompt = typeof payload.prompt === 'string' ? payload.prompt : '';
      thread.push({
        id: `${threadId}-user-${thread.length + 1}`,
        role: 'user',
        content: prompt,
        created_at: nextIsoTimestamp(),
      });
      thread.push({
        id: `${threadId}-assistant-${thread.length + 1}`,
        role: 'assistant',
        content: 'Plano analisado com sucesso pelas fixtures. Pronto para aplicar.',
        created_at: nextIsoTimestamp(),
      });
    }
    const limit = typeof payload.limit === 'number' ? payload.limit : undefined;
    const messages = limit ? thread.slice(-limit) : thread;
    return HttpResponse.json({ threadId, messages: createResponse(messages) });
  }),
  http.post(`${API_PREFIX}/config/reload`, async ({ request }) => {
    let payload: Record<string, unknown> = {};
    try {
      payload = (await request.json()) as Record<string, unknown>;
    } catch {
      // ignore
    }
    const target = typeof payload.target === 'string' ? payload.target : 'manifests';
    const planId = typeof payload.plan_id === 'string' ? payload.plan_id : 'reload-plan-fixture';
    const response = createResponse(configReloadPlanFixture);
    const summary = `Reload governado de ${target} via fixtures.`;
    response.message = summary;
    if (response.plan) {
      response.plan.summary = summary;
      response.plan.intent = 'config.reload';
    }
    if (response.planPayload) {
      response.planPayload.summary = summary;
      response.planPayload.intent = 'config.reload';
    }
    response.planId = planId;
    return HttpResponse.json(response);
  }),
  http.post(`${API_PREFIX}/config/agents/plan`, async ({ request }) => {
    let payload: Record<string, unknown> = {};
    try {
      payload = (await request.json()) as Record<string, unknown>;
    } catch {
      // ignore
    }
    const agent = (payload.agent as Record<string, unknown> | undefined) ?? {};
    const slug = typeof agent.slug === 'string' ? agent.slug : 'catalog-search';
    const response = buildPlanResponse(`Atualizar agente ${slug} via fixtures.`, 'agents.plan');
    return HttpResponse.json(response);
  }),
  http.post(`${API_PREFIX}/config/agents`, async ({ request }) => {
    const url = new URL(request.url);
    if ((url.searchParams.get('intent') ?? '').toLowerCase() === 'plan') {
      let payload: Record<string, unknown> = {};
      try {
        payload = (await request.json()) as Record<string, unknown>;
      } catch {
        // ignore
      }
      const agent = (payload.agent as Record<string, unknown> | undefined) ?? {};
      const slug = typeof agent.slug === 'string' ? agent.slug : 'catalog-search';
      const response = buildPlanResponse(
        `Gerar plano governado para ${slug} via fixtures.`,
        'agents.governed.plan',
      );
      return HttpResponse.json(response);
    }
    return HttpResponse.json(buildPlanResponse('Plano padrão para agentes via fixtures.', 'agents.plan'));
  }),
  http.post(`${API_PREFIX}/config/agents/:agentId/plan`, async ({ params, request }) => {
    const agentId = params.agentId as string;
    try {
      await request.json();
    } catch {
      // ignore
    }
    const response = buildPlanResponse(
      `Atualizar camada ${agentId} via fixtures.`,
      `agents.${agentId}.plan`,
    );
    return HttpResponse.json(response);
  }),
  http.post(`${API_PREFIX}/config/agents/apply`, async ({ request }) => {
    let payload: Record<string, unknown> = {};
    try {
      payload = (await request.json()) as Record<string, unknown>;
    } catch {
      // ignore
    }
    const agentId = typeof payload.agent_id === 'string' ? payload.agent_id : 'catalog-search';
    const planId = typeof payload.plan_id === 'string' ? payload.plan_id : `${agentId}-plan-fixture`;
    const actor = typeof payload.actor === 'string' ? payload.actor : 'fixtures@console';
    const response = cloneDeep(finopsPlanApplyFixture);
    response.plan_id = planId;
    response.message = `Plano ${planId} aplicado para ${agentId} via fixtures.`;
    appendAgentHistory(agentId, {
      plan_id: planId,
      summary: response.message,
      requested_by: actor,
      plan_payload:
        (payload.plan as Record<string, unknown> | undefined) ??
        createResponse(finopsPlanResponseFixture.plan),
      patch: (payload.patch as string | undefined) ?? FINOPS_MANIFEST_DIFF,
      status: 'completed',
      status_label: 'Concluído',
    });
    return HttpResponse.json(response);
  }),
  http.post(`${API_PREFIX}/config/agents/:agentId/apply`, async ({ params, request }) => {
    const agentId = params.agentId as string;
    let payload: Record<string, unknown> = {};
    try {
      payload = (await request.json()) as Record<string, unknown>;
    } catch {
      // ignore
    }
    const planId = typeof payload.plan_id === 'string' ? payload.plan_id : `${agentId}-plan-fixture`;
    const response = cloneDeep(finopsPlanApplyFixture);
    response.plan_id = planId;
    response.message = `Plano ${planId} aplicado para ${agentId} via fixtures.`;
    appendAgentHistory(agentId, {
      plan_id: planId,
      summary: response.message,
      requested_by: payload.actor ?? 'fixtures@console',
      plan_payload:
        (payload.plan as Record<string, unknown> | undefined) ??
        createResponse(finopsPlanResponseFixture.plan),
      patch: (payload.patch as string | undefined) ?? FINOPS_MANIFEST_DIFF,
      status: 'completed',
      status_label: 'Concluído',
    });
    return HttpResponse.json(response);
  }),
  http.get(`${API_PREFIX}/config/agents/:agentId/history`, ({ params }) => {
    const agentId = params.agentId as string;
    const history = getAgentPlanHistory(agentId);
    return HttpResponse.json({ items: createResponse(history) });
  }),
  http.post(`${API_PREFIX}/config/mcp/update`, async ({ request }) => {
    let payload: Record<string, unknown> = {};
    try {
      payload = (await request.json()) as Record<string, unknown>;
    } catch {
      // ignore
    }
    const mode = typeof payload.mode === 'string' ? payload.mode : 'plan';
    if (mode === 'plan') {
      return HttpResponse.json(createResponse(configMcpUpdatePlan));
    }
    if (mode === 'apply') {
      return HttpResponse.json(createResponse(configMcpUpdateApply));
    }
    return HttpResponse.json({ detail: `Modo ${mode} não suportado nas fixtures.` }, { status: 400 });
  }),
  http.post(`${API_PREFIX}/config/mcp/onboard`, async ({ request }) => {
    try {
      await request.json();
    } catch {
      // ignore
    }
    const response = createResponse(configReloadPlanFixture);
    response.message = 'Onboarding preparado pelas fixtures.';
    if (response.plan) {
      response.plan.summary = 'Onboarding de servidores MCP via fixtures.';
      response.plan.intent = 'config.onboard';
    }
    if (response.planPayload) {
      response.planPayload.summary = 'Onboarding de servidores MCP via fixtures.';
      response.planPayload.intent = 'config.onboard';
    }
    return HttpResponse.json(response);
  }),
  http.get(`${API_PREFIX}/config/mcp/onboard/status`, () =>
    HttpResponse.json(createResponse(mcpOnboardingStatus)),
  ),
  http.post(`${API_PREFIX}/config/mcp/smoke`, async ({ request }) => {
    try {
      await request.json();
    } catch {
      // ignore
    }
    const startedAt = nextIsoTimestamp();
    return HttpResponse.json({
      runId: `mcp-smoke-${Date.now()}`,
      status: 'passed',
      summary: 'Smoke executado com sucesso nas fixtures.',
      startedAt,
      finishedAt: nextIsoTimestamp(),
    });
  }),
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
  http.get(`${API_PREFIX}/security/users`, () =>
    HttpResponse.json({ users: listSecurityUsers() }),
  ),
  http.post(`${API_PREFIX}/security/users`, async ({ request }) => {
    let payload: Record<string, unknown> = {};
    try {
      payload = (await request.json()) as Record<string, unknown>;
    } catch {
      // ignore
    }
    const id = nextUserId();
    const now = nextIsoTimestamp();
    const record: SecurityUserRecord = {
      id,
      name: typeof payload.name === 'string' ? payload.name : 'New User',
      email: typeof payload.email === 'string' ? payload.email : `${id}@example.com`,
      roles: Array.isArray(payload.roles)
        ? (payload.roles as unknown[]).map((role) => String(role))
        : [],
      status: typeof payload.status === 'string' ? payload.status : 'active',
      created_at: now,
      last_seen_at: null,
      mfa_enabled: Boolean(payload.mfa_enabled),
    };
    securityUserStore.set(record.id, record);
    return HttpResponse.json(record, { status: 201 });
  }),
  http.put(`${API_PREFIX}/security/users/:userId`, async ({ params, request }) => {
    const userId = params.userId as string;
    const current = securityUserStore.get(userId);
    if (!current) {
      return HttpResponse.json({ detail: 'User not found' }, { status: 404 });
    }
    let payload: Record<string, unknown> = {};
    try {
      payload = (await request.json()) as Record<string, unknown>;
    } catch {
      // ignore
    }
    const updated: SecurityUserRecord = {
      ...current,
      name: typeof payload.name === 'string' ? payload.name : current.name,
      email: typeof payload.email === 'string' ? payload.email : current.email,
      roles: Array.isArray(payload.roles)
        ? (payload.roles as unknown[]).map((role) => String(role))
        : current.roles,
      status: typeof payload.status === 'string' ? payload.status : current.status,
      mfa_enabled:
        typeof payload.mfa_enabled === 'boolean' ? payload.mfa_enabled : current.mfa_enabled,
      last_seen_at: current.last_seen_at,
    };
    securityUserStore.set(userId, updated);
    return HttpResponse.json(updated);
  }),
  http.delete(`${API_PREFIX}/security/users/:userId`, ({ params }) => {
    const userId = params.userId as string;
    securityUserStore.delete(userId);
    return new HttpResponse(null, { status: 204 });
  }),
  http.get(`${API_PREFIX}/security/roles`, () =>
    HttpResponse.json({ roles: listSecurityRoles() }),
  ),
  http.post(`${API_PREFIX}/security/roles`, async ({ request }) => {
    let payload: Record<string, unknown> = {};
    try {
      payload = (await request.json()) as Record<string, unknown>;
    } catch {
      // ignore
    }
    const id = nextRoleId();
    const now = nextIsoTimestamp();
    const record: SecurityRoleRecord = {
      id,
      name: typeof payload.name === 'string' ? payload.name : `Role ${id}`,
      description: typeof payload.description === 'string' ? payload.description : '',
      permissions: Array.isArray(payload.permissions)
        ? (payload.permissions as unknown[]).map((permission) => String(permission))
        : [],
      members: 0,
      created_at: now,
      updated_at: now,
    };
    securityRoleStore.set(record.id, record);
    return HttpResponse.json(record, { status: 201 });
  }),
  http.put(`${API_PREFIX}/security/roles/:roleId`, async ({ params, request }) => {
    const roleId = params.roleId as string;
    const current = securityRoleStore.get(roleId);
    if (!current) {
      return HttpResponse.json({ detail: 'Role not found' }, { status: 404 });
    }
    let payload: Record<string, unknown> = {};
    try {
      payload = (await request.json()) as Record<string, unknown>;
    } catch {
      // ignore
    }
    const updated: SecurityRoleRecord = {
      ...current,
      name: typeof payload.name === 'string' ? payload.name : current.name,
      description:
        typeof payload.description === 'string' ? payload.description : current.description,
      permissions: Array.isArray(payload.permissions)
        ? (payload.permissions as unknown[]).map((permission) => String(permission))
        : current.permissions,
      updated_at: nextIsoTimestamp(),
    };
    securityRoleStore.set(roleId, updated);
    return HttpResponse.json(updated);
  }),
  http.delete(`${API_PREFIX}/security/roles/:roleId`, ({ params }) => {
    const roleId = params.roleId as string;
    securityRoleStore.delete(roleId);
    return new HttpResponse(null, { status: 204 });
  }),
  http.get(`${API_PREFIX}/security/api-keys`, () =>
    HttpResponse.json({ keys: listSecurityApiKeys() }),
  ),
  http.post(`${API_PREFIX}/security/api-keys`, async ({ request }) => {
    let payload: Record<string, unknown> = {};
    try {
      payload = (await request.json()) as Record<string, unknown>;
    } catch {
      // ignore
    }
    const id = nextKeyId();
    const now = nextIsoTimestamp();
    const record: SecurityApiKeyRecord = {
      id,
      name: typeof payload.name === 'string' ? payload.name : `API Key ${id}`,
      owner: typeof payload.owner === 'string' ? payload.owner : 'fixtures',
      scopes: Array.isArray(payload.scopes)
        ? (payload.scopes as unknown[]).map((scope) => String(scope))
        : ['mcp:invoke'],
      status: 'active',
      created_at: now,
      last_used_at: null,
      expires_at: (payload.expires_at as string | null | undefined) ?? null,
      token_preview: `${id.slice(0, 3)}***`,
    };
    securityApiKeyStore.set(id, record);
    return HttpResponse.json({ key: record, secret: `secret-${id}` }, { status: 201 });
  }),
  http.put(`${API_PREFIX}/security/api-keys/:apiKeyId`, async ({ params, request }) => {
    const apiKeyId = params.apiKeyId as string;
    const current = securityApiKeyStore.get(apiKeyId);
    if (!current) {
      return HttpResponse.json({ detail: 'API key not found' }, { status: 404 });
    }
    let payload: Record<string, unknown> = {};
    try {
      payload = (await request.json()) as Record<string, unknown>;
    } catch {
      // ignore
    }
    const updated: SecurityApiKeyRecord = {
      ...current,
      name: typeof payload.name === 'string' ? payload.name : current.name,
      owner: typeof payload.owner === 'string' ? payload.owner : current.owner,
      scopes: Array.isArray(payload.scopes)
        ? (payload.scopes as unknown[]).map((scope) => String(scope))
        : current.scopes,
      expires_at: (payload.expires_at as string | null | undefined) ?? current.expires_at,
      status: typeof payload.status === 'string' ? payload.status : current.status,
    };
    securityApiKeyStore.set(apiKeyId, updated);
    return HttpResponse.json(updated);
  }),
  http.post(`${API_PREFIX}/security/api-keys/:apiKeyId/rotate`, ({ params }) => {
    const apiKeyId = params.apiKeyId as string;
    const current = securityApiKeyStore.get(apiKeyId);
    if (!current) {
      return HttpResponse.json({ detail: 'API key not found' }, { status: 404 });
    }
    const rotated = {
      ...current,
      token_preview: `${apiKeyId.slice(0, 3)}***`,
      last_used_at: nextIsoTimestamp(),
    };
    securityApiKeyStore.set(apiKeyId, rotated);
    return HttpResponse.json({ key: rotated, secret: `secret-${apiKeyId}-${nextSecretSequence()}` });
  }),
  http.delete(`${API_PREFIX}/security/api-keys/:apiKeyId`, ({ params }) => {
    const apiKeyId = params.apiKeyId as string;
    securityApiKeyStore.delete(apiKeyId);
    return new HttpResponse(null, { status: 204 });
  }),
  http.get(`${API_PREFIX}/security/audit/:resource/:resourceId`, ({ params }) => {
    const resource = params.resource as string;
    const resourceId = params.resourceId as string;
    const key = `${resource}:${resourceId}`;
    const events = securityAuditTrailStore.get(key) ?? [];
    return HttpResponse.json({ events: createResponse(events) });
  }),
  http.get(`${API_PREFIX}/audit/logs`, ({ request }) => {
    const url = new URL(request.url);
    const page = Math.max(Number.parseInt(url.searchParams.get('page') ?? '1', 10), 1);
    const pageSize = Math.max(Number.parseInt(url.searchParams.get('page_size') ?? '25', 10), 1);
    const actorQuery = (url.searchParams.get('actor') ?? '').trim().toLowerCase();
    const actionQuery = (url.searchParams.get('action') ?? '').trim();
    const startFilter = url.searchParams.get('start');
    const endFilter = url.searchParams.get('end');

    let events = createResponse(securityAuditLogFixtures).sort((a, b) =>
      a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0,
    );

    if (actorQuery) {
      events = events.filter((entry) => {
        const composite = `${entry.actor_name ?? ''} ${entry.actor_id ?? ''}`.toLowerCase();
        return composite.includes(actorQuery);
      });
    }
    if (actionQuery) {
      events = events.filter((entry) => entry.action.includes(actionQuery));
    }
    if (startFilter) {
      events = events.filter((entry) => entry.created_at >= startFilter);
    }
    if (endFilter) {
      events = events.filter((entry) => entry.created_at <= endFilter);
    }

    const total = events.length;
    const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);
    const safePage = totalPages === 0 ? 1 : Math.min(page, totalPages);
    const offset = total === 0 ? 0 : (safePage - 1) * pageSize;
    const pageItems = total === 0 ? [] : events.slice(offset, offset + pageSize);

    return HttpResponse.json({
      events: pageItems,
      page: safePage,
      page_size: pageSize,
      total,
      total_pages: totalPages,
    });
  }),
  http.get(`${API_PREFIX}/marketplace`, () =>
    HttpResponse.json(createResponse(marketplaceCatalog)),
  ),
  http.post(`${API_PREFIX}/marketplace/:entryId/import`, async ({ params }) => {
    const entryId = params.entryId as string;
    const entry = marketplaceCatalog.entries.find((item) => item.id === entryId);
    if (!entry) {
      return HttpResponse.json({ detail: 'Marketplace entry not found' }, { status: 404 });
    }
    const plan = {
      intent: 'marketplace.import',
      summary: `Importar ${entry.name} via fixtures.`,
      steps: [
        {
          id: 'checkout',
          title: 'Clonar pacote',
          description: 'Clona repositório e copia manifesto do pacote selecionado.',
          dependsOn: [],
          actions: [
            {
              type: 'file.write',
              path: `${entry.package_path}/manifest.yaml`,
              contents: '# Manifesto gerado pelas fixtures\n',
              encoding: 'utf-8',
              overwrite: true,
            },
          ],
        },
      ],
      diffs: [
        {
          path: `${entry.package_path}/manifest.yaml`,
          summary: 'Adicionar manifesto do pacote do marketplace.',
          changeType: 'add',
        },
      ],
      risks: [
        {
          title: 'Validação manual necessária',
          impact: 'médio',
          mitigation: 'Executar smoke tests após importação.',
        },
      ],
      status: 'completed',
      context: [
        {
          path: `${entry.package_path}/README.md`,
          snippet: `Pacote ${entry.name} importado via fixtures.`,
          score: 0.92,
          title: entry.name,
          chunk: 1,
        },
      ],
      approvalRules: ['marketplace-review'],
    };
    return HttpResponse.json({
      entry: createResponse(entry),
      plan,
      manifest: `name: ${entry.name}\nsource: fixtures`,
      agent_code: 'print("Hello from marketplace fixture")',
    });
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
  http.post('*/agents/:agentName/invoke', async ({ params, request }) => {
    const agentName = params.agentName as string;
    try {
      await request.json();
    } catch {
      // ignore payload parsing errors for fixtures
    }
    const now = nextIsoTimestamp();
    return HttpResponse.json({
      result: {
        output: `Invocation of ${agentName} concluída com sucesso via fixtures.`,
        metadata: { runId: `${agentName}-invoke-${Date.now()}` },
        finished_at: now,
      },
      trace: {
        steps: [
          {
            id: 'fixtures-step',
            status: 'completed',
            output: 'Resposta simulada pelo ambiente de fixtures.',
            duration_ms: 120,
          },
        ],
      },
    });
  }),
];
