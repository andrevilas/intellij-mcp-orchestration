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
    is_available: false,
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
  ],
};

test('painel de observabilidade exibe métricas e aciona evals @observability', async ({ page }) => {
  await page.route('**/api/v1/servers**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ servers }),
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
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [], status: 'pass' }) }),
  );

  await page.goto('/');

  await page.getByRole('button', { name: 'Observabilidade' }).click();

  await expect(page.getByRole('heading', { name: 'Observabilidade unificada' })).toBeVisible();
  await expect(page.getByText('930 ms')).toBeVisible();
  await expect(page.getByText('12%')).toBeVisible();
  await expect(page.getByText(/R\$\s24,68/)).toBeVisible();
  await expect(page.getByText('64%')).toBeVisible();

  await page.getByRole('tab', { name: /Tracing/ }).click();
  await expect(page.getByRole('table', { name: /Visão agregada dos spans/ })).toBeVisible();
  await expect(page.getByRole('row', { name: /GLM 46/ })).toBeVisible();

  await page.getByRole('tab', { name: /Evals/ }).click();
  await page.getByRole('button', { name: 'Disparar eval agora' }).click();
  await expect(page.getByRole('button', { name: 'Executando eval…' })).toBeVisible();
  await expect(
    page.getByText('Eval “Latência P95 vs baseline” concluída para GLM 46. Nenhuma regressão detectada.'),
  ).toBeVisible();
});
