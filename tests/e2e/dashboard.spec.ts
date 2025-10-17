import { test, expect } from '@playwright/test';

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
  {
    id: 'gemini',
    name: 'Gemini MCP',
    description: 'Gemini',
    command: 'gemini',
    capabilities: ['chat'],
    tags: ['llm'],
    transport: 'stdio',
    is_available: true,
  },
];

const compliancePayload = {
  status: 'pass',
  updated_at: '2024-03-08T12:00:00.000Z',
  items: [
    { id: 'logging', label: 'Logging centralizado', description: null, required: true, configured: true, active: true },
    { id: 'review', label: 'Revisão humana', description: null, required: false, configured: false, active: false },
  ],
};

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
    {
      provider_id: 'gemini',
      run_count: 3,
      tokens_in: 600,
      tokens_out: 300,
      cost_usd: 10.48,
      avg_latency_ms: 840,
      success_rate: 0.76,
    },
  ],
  extended: {
    cache_hit_rate: 0.64,
    cached_tokens: 650,
    latency_p95_ms: 930,
    latency_p99_ms: 1180,
    error_rate: 0.12,
    cost_breakdown: [
      { label: 'Balanced', cost_usd: 14.2 },
      { label: 'Turbo', cost_usd: 10.48 },
    ],
    error_breakdown: [
      { category: 'Timeout', count: 3 },
      { category: 'Quota', count: 1 },
    ],
  },
};

const telemetryHeatmap = {
  buckets: [
    { day: '2024-03-07', provider_id: 'glm', run_count: 3 },
    { day: '2024-03-07', provider_id: 'gemini', run_count: 2 },
    { day: '2024-03-06', provider_id: 'glm', run_count: 2 },
  ],
};

test('exibe métricas extendidas no dashboard', async ({ page }) => {
  await page.route('**/api/v1/providers', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ providers }),
    }),
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

  await page.route('**/api/v1/policies/compliance', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(compliancePayload) }),
  );

  await page.goto('/');

  await expect(page.getByRole('heading', { name: /Dashboard Executivo/ })).toBeVisible();

  const insightsRegion = page.getByRole('region', { name: 'Indicadores complementares de telemetria' });
  await expect(insightsRegion.getByText('Taxa de acertos em cache')).toBeVisible();
  await expect(insightsRegion.getByText('64%')).toBeVisible();
  await expect(insightsRegion.getByText('650 tok')).toBeVisible();
  await expect(insightsRegion.getByText('Latência P95')).toBeVisible();
  await expect(insightsRegion.getByText('930 ms')).toBeVisible();
  await expect(insightsRegion.getByText('Taxa de erro')).toBeVisible();
  await expect(insightsRegion.getByText('12%')).toBeVisible();

  await expect(insightsRegion.getByText('Balanced — 57,5%')).toBeVisible();
  await expect(insightsRegion.getByText('Turbo — 42,5%')).toBeVisible();
  await expect(insightsRegion.getByText('Timeout')).toBeVisible();
  await expect(insightsRegion.getByText('Quota')).toBeVisible();

  await expect(insightsRegion.getByRole('img', { name: /Distribuição de custo por rota/ })).toBeVisible();
  await expect(insightsRegion.getByRole('img', { name: /Ocorrências de erro por categoria/ })).toBeVisible();
  await expect(insightsRegion.getByText('Sem custos computados na janela selecionada.')).toHaveCount(0);
  await expect(insightsRegion.getByText('Nenhum erro categorizado na janela analisada.')).toHaveCount(0);
});
