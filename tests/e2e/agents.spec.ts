import { expect, test, loadBackendFixture } from './fixtures';
import { AGENTS_TEST_IDS, AGENT_DETAIL_TEST_IDS } from '../../app/src/pages/testIds';

test('filtra catálogo de agents e executa smoke tests', async ({ page }) => {
  const agentsFixture = await loadBackendFixture<{ agents: Array<{ name: string; title: string }> }>('agents.json');

  await page.route('**/agents/cache-tuner/smoke', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        run_id: 'cache-tuner-smoke-fixture',
        status: 'passed',
        summary: 'Smoke executado com sucesso usando fixtures locais.',
        report_url: 'https://observability.example.com/smoke/report-fixture',
        started_at: '2025-03-07T09:00:00Z',
        finished_at: '2025-03-07T09:01:00Z',
      }),
    });
  });

  await page.goto('/');
  await page.getByRole('link', { name: 'Agents' }).click();

  await expect(page.getByRole('heading', { name: 'Catálogo de agents' })).toBeVisible();

  const table = page.locator(`[data-testid="${AGENTS_TEST_IDS.table}"]`);
  await expect(table.getByRole('row')).toHaveCount(agentsFixture.agents.length + 1);
  await expect(table.getByRole('row', { name: /Inventory Summarizer/ })).toContainText('Instável');

  await page.getByLabel('Buscar agente').fill('cache');
  await expect(table.getByRole('row')).toHaveCount(2);

  await page.getByLabel('Filtrar status').selectOption('pending');
  await expect(table.getByRole('row')).toHaveCount(2);

  await page.getByLabel('Buscar agente').fill('');
  await page.getByLabel('Filtrar status').selectOption('all');
  await expect(table.getByRole('row')).toHaveCount(agentsFixture.agents.length + 1);

  const cacheRow = table.getByRole('row', { name: /Cache Tuner/ });
  const [smokeRequest] = await Promise.all([
    page.waitForRequest('**/agents/cache-tuner/smoke'),
    cacheRow.getByRole('button', { name: 'Smoke' }).click(),
  ]);

  await expect(page.getByRole('link', { name: 'Abrir relatório' })).toHaveAttribute(
    'href',
    'https://observability.example.com/smoke/report-fixture',
  );

  expect(smokeRequest.postData()).toBeNull();
});

test('abre detalhes do agente e executa playground com overrides', async ({ page }) => {
  await page.route('**/agents/catalog-search/invoke', (route) => {
    const payload = route.request().postDataJSON() as {
      config?: { metadata?: { requestId?: string } };
      input?: Record<string, unknown>;
    } | null;
    const requestId = payload?.config?.metadata?.requestId ?? 'req-123';
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        requestId,
        status: 200,
        result: {
          output: 'Invocation of catalog-search concluída com sucesso via fixtures.',
          metadata: { runId: `${requestId}-fixtures` },
          finished_at: '2025-03-07T09:05:00Z',
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
        raw: null,
        request: payload ?? { input: {}, config: {} },
      }),
    });
  });

  await page.goto('/');
  await page.getByRole('link', { name: 'Agents' }).click();

  const table = page.locator(`[data-testid="${AGENTS_TEST_IDS.table}"]`);
  await table.getByRole('row', { name: /Catalog Search/ }).getByRole('button', { name: 'Detalhes' }).click();

  await expect(page.getByRole('heading', { name: 'Catalog Search' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Playground' })).toHaveAttribute('aria-selected', 'true');

  await page.getByLabel('Payload').fill('{\n  "query": "latency budget"\n}');
  await page.getByLabel('Overrides').fill('{\n  "parameters": { "temperature": 0.5 }\n}');

  const [invokeRequest] = await Promise.all([
    page.waitForRequest('**/agents/catalog-search/invoke'),
    page.waitForResponse(
      (response) =>
        response.url().includes('/agents/catalog-search/invoke') && response.request().method() === 'POST',
    ),
    page.getByRole('button', { name: 'Invocar agent' }).click(),
  ]);

  await expect(page.getByRole('heading', { name: 'Trace' })).toBeVisible();
  await expect(page.getByText('Resposta simulada pelo ambiente de fixtures.')).toBeVisible();
  await expect(page.getByText('Invocation of catalog-search concluída com sucesso via fixtures.')).toBeVisible();

  const snippet = page.locator(`[data-testid="${AGENT_DETAIL_TEST_IDS.snippet}"] code`);
  await expect(snippet).toContainText('curl -X POST');
  await expect(snippet).toContainText('"temperature": 0.5');
  await expect(snippet).toContainText('X-API-Key:');

  const requestBody = invokeRequest.postDataJSON() as {
    input?: { query?: string };
    config?: { metadata?: Record<string, unknown>; parameters?: Record<string, unknown> };
  };

  expect(requestBody?.input?.query).toBe('latency budget');
  expect(requestBody?.config?.parameters?.temperature).toBe(0.5);
  expect(typeof requestBody?.config?.metadata?.requestId).toBe('string');
  expect(requestBody?.config?.metadata?.caller).toBe('console-playground');
  expect(requestBody?.config?.metadata?.surface).toBe('agent-detail');
});

test('fecha painel de detalhes com tecla Escape e retorna foco', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Agents' }).click();

  const table = page.locator(`[data-testid="${AGENTS_TEST_IDS.table}"]`);
  const detailButton = table
    .getByRole('row', { name: /Catalog Search/ })
    .getByRole('button', { name: 'Detalhes' });

  await detailButton.click();

  const panel = page.getByTestId(AGENT_DETAIL_TEST_IDS.root);
  await expect(panel).toBeVisible();

  await page.keyboard.press('Escape');

  await expect(panel).toBeHidden();
  await expect(detailButton).toBeFocused();
});
