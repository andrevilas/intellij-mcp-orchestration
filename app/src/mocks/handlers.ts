import { http, HttpResponse } from 'msw';
import type {
  MarketplacePerformanceEntry,
  ProviderSummary,
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

const API_PREFIX = '*/api/v1';

const routingSimulation: RoutingSimulationResult = {
  totalCost: routingSimulationFixture.total_cost,
  costPerMillion: routingSimulationFixture.cost_per_million,
  avgLatency: routingSimulationFixture.avg_latency,
  reliabilityScore: routingSimulationFixture.reliability_score,
  distribution: routingSimulationFixture.distribution.map((entry) => ({
    route: {
      id: entry.route.id,
      provider: entry.route.provider,
      lane: entry.route.lane,
      costPerMillion: entry.route.cost_per_million,
      latencyP95: entry.route.latency_p95,
      reliability: entry.route.reliability,
      capacityScore: entry.route.capacity_score,
    },
    share: entry.share,
    tokensMillions: entry.tokens_millions,
    cost: entry.cost,
  })),
  excludedRoute: routingSimulationFixture.excluded_route
    ? {
        id: routingSimulationFixture.excluded_route.id,
        provider: routingSimulationFixture.excluded_route.provider,
        lane: routingSimulationFixture.excluded_route.lane,
        costPerMillion: routingSimulationFixture.excluded_route.cost_per_million,
        latencyP95: routingSimulationFixture.excluded_route.latency_p95,
        reliability: routingSimulationFixture.excluded_route.reliability,
        capacityScore: routingSimulationFixture.excluded_route.capacity_score,
      }
    : null,
};

const providersById = new Map<string, ProviderSummary>();
for (const entry of routingSimulation.distribution) {
  providersById.set(entry.route.provider.id, entry.route.provider);
}
if (routingSimulation.excludedRoute) {
  providersById.set(routingSimulation.excludedRoute.provider.id, routingSimulation.excludedRoute.provider);
}

const serverCatalogPayload = Array.from(providersById.values()).map((provider, index) => {
  const created = new Date(Date.UTC(2025, 1, 17 + index, 12, 0, 0));
  const updated = new Date(Date.UTC(2025, 2, 1 + index, 9, 30, 0));
  return {
    id: provider.id,
    name: provider.name,
    command: provider.command,
    description: provider.description ?? null,
    tags: provider.tags ?? [],
    capabilities: provider.capabilities ?? [],
    transport: provider.transport,
    created_at: created.toISOString(),
    updated_at: updated.toISOString(),
  };
});

const telemetryRuns: TelemetryRunEntry[] = telemetryRunsFixture.items.map((run) => ({
  ...run,
  metadata: run.metadata ?? {},
}));

const sessions = (() => {
  const sessionMap = new Map<
    string,
    {
      id: string;
      provider_id: string;
      created_at: string;
      status: string;
      reason: string | null;
      client: string | null;
    }
  >();

  for (const run of telemetryRuns) {
    const metadata = run.metadata ?? {};
    const sessionId = typeof metadata.session_id === 'string' && metadata.session_id.trim().length > 0
      ? (metadata.session_id as string)
      : `session-${run.id}`;

    const current = sessionMap.get(sessionId);
    const reason = run.status === 'success' ? null : (typeof metadata.error === 'string' ? metadata.error : run.status);

    if (!current || new Date(run.ts).getTime() >= new Date(current.created_at).getTime()) {
      sessionMap.set(sessionId, {
        id: sessionId,
        provider_id: run.provider_id,
        created_at: run.ts,
        status: run.status,
        reason,
        client: 'console-web',
      });
    }
  }

  return Array.from(sessionMap.values()).sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
})();

const processLogsByServer = new Map<string, Array<{ id: string; timestamp: string; level: 'info' | 'error'; message: string }>>();
const processSnapshots = serverCatalogPayload.map((server, index) => {
  const isPrimary = index === 0;
  const isDegraded = index === 1;
  const status = isPrimary ? 'running' : isDegraded ? 'error' : 'stopped';
  const startedAt = isPrimary ? new Date(Date.UTC(2025, 2, 7, 8, 30, 0)).toISOString() : null;
  const stoppedAt = status === 'stopped' ? new Date(Date.UTC(2025, 2, 6, 21, 45, 0)).toISOString() : null;
  const logs = [
    {
      id: `${server.id}-log-1`,
      timestamp: new Date(Date.UTC(2025, 2, 7, 8, 0, 0)).toISOString(),
      level: 'info' as const,
      message: 'Boot sequence completed.',
    },
    {
      id: `${server.id}-log-2`,
      timestamp: new Date(Date.UTC(2025, 2, 7, 8, 5, 0)).toISOString(),
      level: isDegraded ? ('error' as const) : ('info' as const),
      message: isDegraded ? 'Heartbeat latency above threshold.' : 'Health check succeeded.',
    },
  ];
  processLogsByServer.set(server.id, logs);

  return {
    server_id: server.id,
    status,
    command: server.command,
    pid: status === 'running' ? 4200 + index : null,
    started_at: startedAt,
    stopped_at: stoppedAt,
    return_code: status === 'error' ? 137 : status === 'stopped' ? 0 : null,
    last_error: status === 'error' ? 'Process exited after repeated health check failures.' : null,
    logs,
    cursor: `${server.id}-cursor`,
  };
});

const healthHistoryByServer = new Map<string, Array<{ status: 'healthy' | 'degraded' | 'error'; checked_at: string; latency_ms: number | null; message: string }>>();
for (const server of serverCatalogPayload) {
  const baseline = new Date(Date.UTC(2025, 2, 7, 7, 0, 0));
  const checkpoints = Array.from({ length: 4 }, (_, idx) => {
    const timestamp = new Date(baseline.getTime() + idx * 15 * 60 * 1000);
    const isLast = idx === 3;
    const status: 'healthy' | 'degraded' | 'error' =
      server.id === 'claude' && isLast ? 'degraded' : server.id === 'codex' && isLast ? 'error' : 'healthy';
    const latency = status === 'healthy' ? 420 : status === 'degraded' ? 980 : null;
    const message =
      status === 'healthy'
        ? 'Health check passed.'
        : status === 'degraded'
          ? 'Latency above 900ms threshold.'
          : 'No response from server process.';
    return {
      status,
      checked_at: timestamp.toISOString(),
      latency_ms: latency,
      message,
    };
  });
  healthHistoryByServer.set(server.id, checkpoints);
}

const policyManifestPayload = {
  policies: {
    confidence: {
      approval: 0.82,
      rejection: 0.18,
    },
  },
  routing: {
    max_iters: 4,
    max_attempts: 2,
    request_timeout_seconds: 30,
    total_timeout_seconds: 120,
    default_tier: 'balanced',
    allowed_tiers: ['economy', 'balanced', 'turbo'],
    fallback_tier: 'economy',
    intents: [
      {
        intent: 'churn-playbook',
        description: 'Playbook de retenção com prompts compostos.',
        tags: ['sales', 'retention'],
        default_tier: 'balanced',
        fallback_provider_id: 'claude',
      },
      {
        intent: 'code-generation',
        description: 'Assistente de refatoração com geração de patches.',
        tags: ['devex'],
        default_tier: 'turbo',
        fallback_provider_id: 'codex',
      },
    ],
    rules: [
      {
        id: 'rule-high-priority',
        description: 'Desvia intent churn quando turbo estiver degradado.',
        intent: 'churn-playbook',
        matcher: 'latency_ms > 900',
        target_tier: 'economy',
        provider_id: 'codex',
        weight: 1,
      },
    ],
  },
  finops: {
    cost_center: 'finops-core',
    budgets: [
      {
        tier: 'economy',
        amount: 1200,
        currency: 'USD',
        period: 'monthly',
        adaptive: {
          enabled: true,
          target_utilization: 0.78,
          lookback_days: 30,
          max_increase_pct: 0.25,
          max_decrease_pct: 0.2,
          cost_weight: 0.6,
          latency_weight: 0.4,
          latency_threshold_ms: 900,
          min_amount: 800,
          max_amount: 1500,
        },
      },
      {
        tier: 'balanced',
        amount: 3400,
        currency: 'USD',
        period: 'monthly',
      },
      {
        tier: 'turbo',
        amount: 4200,
        currency: 'USD',
        period: 'monthly',
      },
    ],
    alerts: [
      { threshold: 0.75, channel: 'slack' },
      { threshold: 0.9, channel: 'email' },
    ],
    ab_history: [
      {
        id: 'ab-finops-2025w09',
        lane: 'balanced',
        started_at: '2025-02-24T12:00:00Z',
        completed_at: '2025-03-01T16:30:00Z',
        summary: 'Testou cache agressivo vs baseline.',
        variants: [
          { name: 'baseline', traffic_percentage: 50, cost_per_request: 0.012, latency_p95_ms: 820, is_winner: false },
          { name: 'cache-boost', traffic_percentage: 50, cost_per_request: 0.009, latency_p95_ms: 840, is_winner: true },
        ],
      },
    ],
    cache: { ttl_seconds: 900 },
    rate_limit: { requests_per_minute: 240 },
    graceful_degradation: { strategy: 'fallback', message: 'Habilitar rotas economy quando turbo degradar.' },
  },
  hitl: {
    enabled: true,
    checkpoints: [
      {
        name: 'critical-incidents',
        description: 'Aprovação humana para alterações críticas.',
        required: true,
        escalation_channel: 'pagerduty',
      },
    ],
    pending_approvals: 1,
    updated_at: '2025-03-06T15:20:00Z',
  },
  runtime: {
    max_iters: 4,
    timeouts: { per_iteration: 45, total: 180 },
    retry: { max_attempts: 3, initial_delay: 1, backoff_factor: 2, max_delay: 6 },
    tracing: { enabled: true, sample_rate: 0.25, exporter: 'otlp' },
  },
  overrides: null,
  updated_at: '2025-03-07T09:30:00Z',
};

const compliancePayload = {
  status: 'pass',
  updated_at: '2025-03-07T09:00:00Z',
  items: [
    {
      id: 'logging',
      label: 'Logging centralizado',
      description: 'Exportação OTLP configurada via observabilidade.',
      required: true,
      configured: true,
      active: true,
    },
    {
      id: 'hitl',
      label: 'Revisão humana',
      description: 'Fluxo HITL ativo para intents críticas.',
      required: true,
      configured: true,
      active: true,
    },
    {
      id: 'pii',
      label: 'Anonimização PII',
      description: 'Filtros de PII aplicados antes da ingestão.',
      required: false,
      configured: false,
      active: false,
    },
  ],
};

const laneCostMap = new Map<string, TelemetryLaneCostEntry & { total_tokens_out: number }>();
const experimentMap = new Map<string, TelemetryExperimentSummaryEntry & { errorCount: number; latencySum: number }>();

for (const run of telemetryRuns) {
  if (run.lane) {
    const current = laneCostMap.get(run.lane) ?? {
      lane: run.lane,
      run_count: 0,
      total_cost_usd: 0,
      total_tokens_in: 0,
      total_tokens_out: 0,
      avg_latency_ms: 0,
    };
    current.run_count += 1;
    current.total_cost_usd += run.cost_usd;
    current.total_tokens_in += run.tokens_in;
    current.total_tokens_out += run.tokens_out;
    current.avg_latency_ms += run.duration_ms;
    laneCostMap.set(run.lane, current);
  }

  const key = `${run.experiment_cohort ?? 'default'}|${run.experiment_tag ?? 'default'}`;
  const currentExperiment = experimentMap.get(key) ?? {
    cohort: run.experiment_cohort,
    tag: run.experiment_tag,
    run_count: 0,
    success_rate: 0,
    error_rate: 0,
    avg_latency_ms: 0,
    total_cost_usd: 0,
    total_tokens_in: 0,
    total_tokens_out: 0,
    mttr_ms: null,
    recovery_events: 0,
    errorCount: 0,
    latencySum: 0,
  };
  currentExperiment.run_count += 1;
  currentExperiment.total_cost_usd += run.cost_usd;
  currentExperiment.total_tokens_in += run.tokens_in;
  currentExperiment.total_tokens_out += run.tokens_out;
  currentExperiment.latencySum += run.duration_ms;
  if (run.status === 'success') {
    currentExperiment.success_rate += 1;
  } else {
    currentExperiment.errorCount += 1;
  }
  experimentMap.set(key, currentExperiment);
}

const laneCostItems: TelemetryLaneCostEntry[] = Array.from(laneCostMap.values()).map((entry) => ({
  lane: entry.lane,
  run_count: entry.run_count,
  total_cost_usd: Number(entry.total_cost_usd.toFixed(2)),
  total_tokens_in: entry.total_tokens_in,
  total_tokens_out: entry.total_tokens_out,
  avg_latency_ms: entry.run_count > 0 ? Number((entry.avg_latency_ms / entry.run_count).toFixed(0)) : 0,
}));

const experimentItems: TelemetryExperimentSummaryEntry[] = Array.from(experimentMap.values()).map((entry) => ({
  cohort: entry.cohort,
  tag: entry.tag,
  run_count: entry.run_count,
  success_rate: entry.run_count > 0 ? entry.success_rate / entry.run_count : 0,
  error_rate: entry.run_count > 0 ? entry.errorCount / entry.run_count : 0,
  avg_latency_ms: entry.run_count > 0 ? Number((entry.latencySum / entry.run_count).toFixed(0)) : 0,
  total_cost_usd: Number(entry.total_cost_usd.toFixed(2)),
  total_tokens_in: entry.total_tokens_in,
  total_tokens_out: entry.total_tokens_out,
  mttr_ms: entry.errorCount > 0 ? 1800 : null,
  recovery_events: entry.errorCount,
}));

const marketplaceEntries: MarketplacePerformanceEntry[] = telemetryParetoFixture.items.map((item, index) => ({
  entry_id: `${item.provider_id}:${item.route ?? item.lane}`,
  name: `${item.provider_name} · ${item.lane}`,
  origin: index === 0 ? 'internal' : 'marketplace',
  rating: 4.7 - index * 0.3,
  cost: Number((item.cost_usd / Math.max(1, item.run_count)).toFixed(3)),
  run_count: item.run_count,
  success_rate: item.success_rate,
  avg_latency_ms: item.avg_latency_ms,
  total_cost_usd: item.cost_usd,
  total_tokens_in: item.tokens_in,
  total_tokens_out: item.tokens_out,
  cohorts: ['march-rollout'],
  adoption_score: 82 - index * 6,
}));

export const handlers = [
  http.get(`${API_PREFIX}/servers`, () => HttpResponse.json({ servers: serverCatalogPayload })),
  http.get(`${API_PREFIX}/servers/processes`, () => HttpResponse.json({ processes: processSnapshots })),
  http.get(`${API_PREFIX}/servers/:serverId/process/logs`, ({ params }) => {
    const serverId = params.serverId as string;
    const logs = processLogsByServer.get(serverId) ?? [];
    return HttpResponse.json({ logs, cursor: `${serverId}-cursor` });
  }),
  http.get(`${API_PREFIX}/servers/:serverId/health`, ({ params }) => {
    const serverId = params.serverId as string;
    const checks = healthHistoryByServer.get(serverId) ?? [];
    return HttpResponse.json({ checks });
  }),
  http.post(`${API_PREFIX}/servers/:serverId/process/:action`, ({ params }) => {
    const serverId = params.serverId as string;
    const action = params.action as string;
    const snapshot = processSnapshots.find((entry) => entry.server_id === serverId);
    if (!snapshot) {
      return HttpResponse.json({ process: null }, { status: 404 });
    }
    const now = new Date().toISOString();
    const status = action === 'stop' ? 'stopped' : action === 'restart' ? 'running' : 'running';
    const updated = {
      ...snapshot,
      status,
      started_at: status === 'running' ? now : snapshot.started_at,
      stopped_at: status === 'stopped' ? now : null,
      pid: status === 'running' ? Math.floor(Math.random() * 2000) + 3000 : null,
      return_code: status === 'stopped' ? 0 : null,
      last_error: null,
    };
    return HttpResponse.json({ process: updated });
  }),
  http.get(`${API_PREFIX}/sessions`, () => HttpResponse.json({ sessions })),
  http.get(`${API_PREFIX}/secrets`, () => HttpResponse.json({ secrets: [] })),
  http.get(`${API_PREFIX}/notifications`, () => HttpResponse.json({ notifications: [] })),
  http.get(`${API_PREFIX}/policies/compliance`, () => HttpResponse.json(compliancePayload)),
  http.get(`${API_PREFIX}/telemetry/metrics`, () => HttpResponse.json(telemetryMetricsFixture)),
  http.get(`${API_PREFIX}/telemetry/heatmap`, () => HttpResponse.json(telemetryHeatmapFixture)),
  http.get(`${API_PREFIX}/telemetry/timeseries`, () => HttpResponse.json(telemetryTimeseriesFixture)),
  http.get(`${API_PREFIX}/telemetry/pareto`, () => HttpResponse.json(telemetryParetoFixture)),
  http.get(`${API_PREFIX}/telemetry/runs`, () => HttpResponse.json(telemetryRunsFixture)),
  http.get(`${API_PREFIX}/telemetry/experiments`, () => HttpResponse.json({ items: experimentItems })),
  http.get(`${API_PREFIX}/telemetry/lane-costs`, () => HttpResponse.json({ items: laneCostItems })),
  http.get(`${API_PREFIX}/telemetry/marketplace/performance`, () => HttpResponse.json({ items: marketplaceEntries })),
  http.get(`${API_PREFIX}/telemetry/finops/sprints`, () => HttpResponse.json(finopsSprintsFixture)),
  http.get(`${API_PREFIX}/telemetry/finops/pull-requests`, () => HttpResponse.json(finopsPullRequestsFixture)),
  http.post(`${API_PREFIX}/routing/simulate`, () => HttpResponse.json({
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
  })),
  http.get(`${API_PREFIX}/policies/manifest`, () => HttpResponse.json(policyManifestPayload)),
  http.get(`${API_PREFIX}/providers`, () => HttpResponse.json({ providers: Array.from(providersById.values()) })),
];
