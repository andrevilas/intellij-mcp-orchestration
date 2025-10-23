import { expect, test, loadBackendFixture } from './fixtures';
import { AGENTS_TEST_IDS, AGENT_DETAIL_TEST_IDS } from '../../app/src/pages/testIds';

test('filtra catálogo de agents e executa smoke tests', async ({ page }) => {
  const agentsFixture = await loadBackendFixture<{ agents: Array<{ name: string; title: string }> }>('agents.json');

  await page.goto('/');
  await page.getByRole('button', { name: 'Agents' }).click();

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

  await expect(cacheRow.getByRole('button', { name: 'Executando…' })).toBeVisible();
  await expect(page.getByText('Smoke executado com sucesso usando fixtures locais.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Abrir relatório' })).toHaveAttribute(
    'href',
    'https://observability.example.com/smoke/report-fixture',
  );

  expect(smokeRequest.postData()).toBeNull();
});

test('abre detalhes do agente e executa playground com overrides', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Agents' }).click();

  const table = page.locator(`[data-testid="${AGENTS_TEST_IDS.table}"]`);
  await table.getByRole('row', { name: /Catalog Search/ }).getByRole('button', { name: 'Detalhes' }).click();

  await expect(page.getByRole('heading', { name: 'Catalog Search' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Playground' })).toHaveAttribute('aria-selected', 'true');

  await page.getByLabel('Payload').fill('{\n  "query": "latency budget"\n}');
  await page.getByLabel('Overrides').fill('{\n  "parameters": { "temperature": 0.5 }\n}');

  const [invokeRequest] = await Promise.all([
    page.waitForRequest('**/agents/catalog-search/invoke'),
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
