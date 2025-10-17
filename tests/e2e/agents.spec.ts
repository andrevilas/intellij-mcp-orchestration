import { test, expect, type Page } from '@playwright/test';

const agentsResponse = {
  agents: [
    {
      name: 'catalog-search',
      title: 'Catalog Search',
      version: '1.2.0',
      description: 'Busca estruturada.',
      capabilities: ['search'],
      model: { provider: 'openai', name: 'o3-mini', parameters: { temperature: 0 } },
      status: 'healthy',
      last_deployed_at: '2025-01-02T10:00:00Z',
      owner: '@catalog',
    },
    {
      name: 'orchestrator-control',
      title: 'Orchestrator Control',
      version: '2.4.1',
      description: 'Orquestra prompts e fluxos de validação.',
      capabilities: ['routing', 'finops'],
      model: { provider: 'anthropic', name: 'claude-3-opus', parameters: { temperature: 0.2 } },
      status: 'degraded',
      last_deployed_at: '2025-01-03T12:30:00Z',
      owner: '@orchestrators',
    },
  ],
};

async function registerBaseRoutes(page: Page) {
  await page.route('**/api/v1/servers', (route) =>
    route.fulfill({ status: 200, body: JSON.stringify({ servers: [] }), contentType: 'application/json' }),
  );
  await page.route('**/api/v1/servers/processes', (route) =>
    route.fulfill({ status: 200, body: JSON.stringify({ processes: [] }), contentType: 'application/json' }),
  );
  await page.route('**/api/v1/sessions', (route) =>
    route.fulfill({ status: 200, body: JSON.stringify({ sessions: [] }), contentType: 'application/json' }),
  );
  await page.route('**/api/v1/secrets', (route) =>
    route.fulfill({ status: 200, body: JSON.stringify({ secrets: [] }), contentType: 'application/json' }),
  );
  await page.route('**/api/v1/telemetry/metrics**', (route) =>
    route.fulfill({ status: 200, body: JSON.stringify({ buckets: [] }), contentType: 'application/json' }),
  );
  await page.route('**/api/v1/telemetry/heatmap**', (route) =>
    route.fulfill({ status: 200, body: JSON.stringify({ heatmap: [] }), contentType: 'application/json' }),
  );
  await page.route('**/api/v1/notifications', (route) =>
    route.fulfill({ status: 200, body: JSON.stringify({ notifications: [] }), contentType: 'application/json' }),
  );
  const compliancePayload = { status: 'pass', items: [] };
  const fulfillCompliance = (route: { fulfill: (options: { status: number; body: string; contentType: string }) => void }) =>
    route.fulfill({ status: 200, body: JSON.stringify(compliancePayload), contentType: 'application/json' });
  await page.route('**/api/v1/policies/compliance', fulfillCompliance);
  await page.route('**/api/v1/policy/compliance', fulfillCompliance);
  await page.route('**/api/v1/smoke/endpoints', (route) =>
    route.fulfill({ status: 200, body: JSON.stringify({ endpoints: [] }), contentType: 'application/json' }),
  );
  await page.route('**/agents/agents', (route) =>
    route.fulfill({ status: 200, body: JSON.stringify(agentsResponse), contentType: 'application/json' }),
  );
}

test('filtra catálogo de agents e executa smoke tests', async ({ page }) => {
  await registerBaseRoutes(page);

  const smokeResponse = {
    run_id: 'smoke-run-42',
    status: 'passed',
    summary: 'Execução concluída sem falhas.',
    report_url: 'https://runner.example/report/smoke-run-42',
    started_at: '2025-01-03T12:45:00Z',
    finished_at: '2025-01-03T12:48:00Z',
  };

  const smokeRequests: unknown[] = [];
  await page.route('**/agents/orchestrator-control/smoke', (route) => {
    smokeRequests.push(route.request().postDataJSON());
    route.fulfill({ status: 200, body: JSON.stringify(smokeResponse), contentType: 'application/json' });
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'Agents' }).click();

  await expect(page.getByRole('heading', { name: 'Catálogo de agents' })).toBeVisible();

  const table = page.locator('.agents__table');
  await expect(table.getByRole('row')).toHaveCount(3);
  await expect(table.getByRole('row', { name: /Orchestrator Control/ })).toContainText('Instável');

  await page.getByLabel('Buscar agente').fill('orchestrator');
  await expect(table.getByRole('row')).toHaveCount(2);

  await page.getByLabel('Filtrar status').selectOption('degraded');
  await expect(table.getByRole('row')).toHaveCount(2);

  await page.getByLabel('Buscar agente').fill('');
  await expect(table.getByRole('row')).toHaveCount(2);
  await page.getByLabel('Filtrar status').selectOption('all');
  await expect(table.getByRole('row')).toHaveCount(3);

  const orchestratorRow = table.getByRole('row', { name: /Orchestrator Control/ });
  await orchestratorRow.getByRole('button', { name: 'Smoke' }).click();

  await expect(orchestratorRow.getByRole('button', { name: 'Executando…' })).toBeVisible();
  await expect(page.getByText('Execução smoke-run-42:')).toBeVisible();
  await expect(page.getByText('Execução concluída sem falhas.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Abrir relatório' })).toHaveAttribute('href', smokeResponse.report_url);

  expect(smokeRequests).toHaveLength(1);
});

test('abre detalhes do agente e executa playground com overrides', async ({ page }) => {
  await registerBaseRoutes(page);

  const invokeRequests: unknown[] = [];
  await page.route('**/agents/catalog-search/invoke', (route) => {
    invokeRequests.push(route.request().postDataJSON());
    route.fulfill({
      status: 200,
      body: JSON.stringify({
        result: { message: 'Consulta concluída', items: 3 },
        trace: [
          { step: 'model-call', tokens: 120 },
          { step: 'rerank', tokens: 42 },
        ],
      }),
      contentType: 'application/json',
    });
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'Agents' }).click();

  const table = page.locator('.agents__table');
  await table.getByRole('row', { name: /Catalog Search/ }).getByRole('button', { name: 'Detalhes' }).click();

  await expect(page.getByRole('heading', { name: 'Catalog Search' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Playground' })).toHaveAttribute('aria-selected', 'true');

  await page.getByLabel('Payload').fill('{\n  "query": "latency budget"\n}');
  await page.getByLabel('Overrides').fill('{\n  "parameters": { "temperature": 0.5 }\n}');

  await page.getByRole('button', { name: 'Invocar agent' }).click();

  await expect(page.getByRole('heading', { name: 'Trace' })).toBeVisible();
  await expect(page.getByText('model-call')).toBeVisible();
  await expect(page.getByText('tokens": 120')).toBeVisible();

  const snippet = page.locator('.agent-detail__snippet code');
  await expect(snippet).toContainText('curl -X POST');
  await expect(snippet).toContainText('"temperature": 0.5');
  await expect(snippet).toContainText('X-API-Key:');

  expect(invokeRequests).toHaveLength(1);
  const requestBody = invokeRequests[0] as {
    input?: { query?: string };
    config?: { metadata?: Record<string, unknown>; parameters?: Record<string, unknown> };
  };

  expect(requestBody?.input?.query).toBe('latency budget');
  expect(requestBody?.config?.parameters?.temperature).toBe(0.5);
  expect(typeof requestBody?.config?.metadata?.requestId).toBe('string');
  expect(requestBody?.config?.metadata?.caller).toBe('console-playground');
  expect(requestBody?.config?.metadata?.surface).toBe('agent-detail');
});
