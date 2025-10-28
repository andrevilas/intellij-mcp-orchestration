import { expect, test } from './fixtures';
import type { Page, Route } from '@playwright/test';

const providers = [
  {
    id: 'glm',
    name: 'GLM 46',
    description: 'Modelo GLM 46',
    command: 'glm46',
    capabilities: ['chat'],
    tags: ['llm'],
    transport: 'stdio',
    is_available: true,
  },
];

const servers = providers.map((provider) => ({
  id: provider.id,
  name: provider.name,
  command: provider.command,
  description: provider.description ?? null,
  tags: provider.tags,
  capabilities: provider.capabilities,
  transport: provider.transport,
  created_at: '2024-03-07T12:00:00.000Z',
  updated_at: '2024-03-08T12:00:00.000Z',
}));

const telemetryMetrics = {
  start: '2024-03-07T12:00:00.000Z',
  end: '2024-03-08T12:00:00.000Z',
  total_runs: 8,
  total_tokens_in: 1800,
  total_tokens_out: 900,
  total_cost_usd: 24.68,
  avg_latency_ms: 780,
  success_rate: 0.85,
  providers: [
    {
      provider_id: 'glm',
      run_count: 5,
      tokens_in: 1200,
      tokens_out: 600,
      cost_usd: 14.2,
      avg_latency_ms: 740,
      success_rate: 0.9,
    },
  ],
  extended: {
    cache_hit_rate: 0.64,
    cached_tokens: 650,
    latency_p95_ms: 930,
    latency_p99_ms: 1180,
    error_rate: 0.12,
    cost_breakdown: [{ label: 'Balanced', cost_usd: 14.2 }],
    error_breakdown: [{ category: 'Timeout', count: 3 }],
  },
};

const telemetryHeatmap = {
  buckets: [{ day: '2024-03-07', provider_id: 'glm', run_count: 3 }],
};

const observabilityMetrics = {
  window_start: telemetryMetrics.start,
  window_end: telemetryMetrics.end,
  totals: {
    runs: telemetryMetrics.total_runs,
    tokens_in: telemetryMetrics.total_tokens_in,
    tokens_out: telemetryMetrics.total_tokens_out,
    avg_latency_ms: telemetryMetrics.avg_latency_ms,
    success_rate: telemetryMetrics.success_rate,
    cost_usd: telemetryMetrics.total_cost_usd,
  },
  providers: telemetryMetrics.providers,
  kpis: {
    latency_p95_ms: telemetryMetrics.extended.latency_p95_ms,
    error_rate: telemetryMetrics.extended.error_rate,
    cache_hit_rate: telemetryMetrics.extended.cache_hit_rate,
    total_cost_usd: telemetryMetrics.total_cost_usd,
  },
  error_breakdown: telemetryMetrics.extended.error_breakdown,
};

const observabilityTracing = {
  window_start: observabilityMetrics.window_start,
  window_end: observabilityMetrics.window_end,
  providers: telemetryMetrics.providers,
};

async function setupCommonRoutes(
  page: Page,
  options: {
    preferencesGet: Record<string, unknown>;
    onUpdate?: (route: Route) => Promise<void> | void;
  },
) {
  await page.route('**/api/v1/servers**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ servers }) }),
  );

  await page.route('**/api/v1/sessions', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sessions: [] }) }),
  );

  await page.route('**/api/v1/secrets', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ secrets: [] }) }),
  );

  await page.route('**/api/v1/notifications', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ notifications: [] }) }),
  );

  await page.route('**/api/v1/telemetry/metrics**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(telemetryMetrics) }),
  );

  await page.route('**/api/v1/telemetry/heatmap**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(telemetryHeatmap) }),
  );

  await page.route('**/api/v1/observability/metrics**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(observabilityMetrics) }),
  );

  await page.route('**/api/v1/observability/tracing**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(observabilityTracing) }),
  );

  await page.route('**/api/v1/observability/evals/run', (route) =>
    route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        run_id: 'eval-sample',
        status: 'completed',
        preset_id: 'latency-regression',
        provider_id: 'glm',
        evaluated_runs: 5,
        success_rate: 0.9,
        avg_latency_ms: 720,
        summary: 'Eval executada.',
        started_at: '2024-03-08T12:00:00.000Z',
        completed_at: '2024-03-08T12:00:05.000Z',
        window_start: observabilityMetrics.window_start,
        window_end: observabilityMetrics.window_end,
      }),
    }),
  );

  await page.route('**/api/v1/policies/compliance', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [], status: 'pass' }) }),
  );

  await page.route('**/api/v1/observability/preferences', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(options.preferencesGet),
      });
      return;
    }

    if (options.onUpdate) {
      await options.onUpdate(route);
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(options.preferencesGet),
    });
  });
}

test('salva preferências de observabilidade com sucesso', async ({ page }) => {
  const preferencesGet = {
    tracing: { provider: 'langsmith', project: 'Observability' },
    metrics: { provider: 'otlp', endpoint: 'https://collector.exemplo.com/v1/traces' },
    evals: null,
    updated_at: '2024-03-08T12:00:00.000Z',
    audit: { actor_id: 'user-123', actor_name: 'Observability Admin', actor_roles: ['approver'] },
  };

  const updatedPreferences = {
    tracing: { provider: 'langsmith', project: 'Observability' },
    metrics: { provider: 'otlp', endpoint: 'https://collector.exemplo.com/v1/traces' },
    evals: { provider: 'langsmith', project: 'Eval Warmups' },
    updated_at: '2024-04-01T10:00:00.000Z',
    audit: { actor_id: 'user-456', actor_name: 'Audit Bot', actor_roles: ['approver'] },
  };

  let updatePayload: Record<string, unknown> | undefined;

  await setupCommonRoutes(page, {
    preferencesGet,
    onUpdate: async (route) => {
      updatePayload = JSON.parse(route.request().postData() ?? '{}');
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(updatedPreferences),
      });
    },
  });

  await page.goto('/');
  await page.getByRole('link', { name: 'Observabilidade' }).click();

  const evalsGroup = page.getByRole('group', { name: 'Evals' });
  const evalsToggle = evalsGroup.getByRole('checkbox');
  await evalsToggle.check();

  const projectInput = evalsGroup.getByLabel('Projeto');
  await projectInput.fill('Eval Warmups');

  await page.getByRole('button', { name: 'Salvar preferências' }).click();

  await expect(page.getByText('Preferências de observabilidade atualizadas com sucesso.')).toBeVisible();

  await expect.poll(() => updatePayload).toMatchObject({
    tracing: { provider: 'langsmith', project: 'Observability' },
    metrics: { provider: 'otlp', endpoint: 'https://collector.exemplo.com/v1/traces' },
    evals: { provider: 'langsmith', project: 'Eval Warmups' },
  });

  await expect(page.getByText('Audit Bot')).toBeVisible();
});

test('exibe mensagem de erro quando atualização retorna 400', async ({ page }) => {
  const preferencesGet = {
    tracing: null,
    metrics: null,
    evals: null,
    updated_at: null,
    audit: null,
  };

  await setupCommonRoutes(page, {
    preferencesGet,
    onUpdate: async (route) => {
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'endpoint é obrigatório para providers OTLP.' }),
      });
    },
  });

  await page.goto('/');
  await page.getByRole('link', { name: 'Observabilidade' }).click();

  const metricsGroup = page.getByRole('group', { name: 'Métricas' });
  const metricsToggle = metricsGroup.getByRole('checkbox');
  await metricsToggle.check();

  await metricsGroup.getByLabel('Endpoint').fill('collector');
  await page.getByRole('button', { name: 'Salvar preferências' }).click();

  await expect(page.getByText('endpoint é obrigatório para providers OTLP.')).toBeVisible();
});

test('bloqueia formulário quando carregamento retorna 401', async ({ page }) => {
  await setupCommonRoutes(page, {
    preferencesGet: {},
  });

  await page.route('**/api/v1/observability/preferences', (route) => {
    if (route.request().method() === 'GET') {
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Permissão negada.' }),
      });
    } else {
      route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({}) });
    }
  });

  await page.goto('/');
  await page.getByRole('link', { name: 'Observabilidade' }).click();

  await expect(
    page.getByText('Você não tem permissão para visualizar as preferências de observabilidade.'),
  ).toBeVisible();

  await expect(page.getByRole('button', { name: 'Salvar preferências' })).toBeDisabled();
});
