import { test, expect } from '@playwright/test';

test('filtra catálogo de agents e executa smoke tests', async ({ page }) => {
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

  const smokeResponse = {
    run_id: 'smoke-run-42',
    status: 'passed',
    summary: 'Execução concluída sem falhas.',
    report_url: 'https://runner.example/report/smoke-run-42',
    started_at: '2025-01-03T12:45:00Z',
    finished_at: '2025-01-03T12:48:00Z',
  };

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
  await page.route('**/api/v1/policy/compliance', (route) =>
    route.fulfill({ status: 200, body: JSON.stringify({ status: 'pass', items: [] }), contentType: 'application/json' }),
  );

  await page.route('**/agents/agents', (route) =>
    route.fulfill({ status: 200, body: JSON.stringify(agentsResponse), contentType: 'application/json' }),
  );

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
