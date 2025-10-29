import { expect, test, loadBackendFixture } from './fixtures';
import type { Locator, Page, Route } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, '..', '..');
const evidenceDir = resolve(repoRoot, 'docs', 'evidence', 'TASK-UI-DATA-030');

const ELLIPSIS = '\u2026';
const telemetryLoadingMessage = `Carregando telemetria de custo via fixtures${ELLIPSIS}`;
const telemetryErrorMessage = 'Falha ao carregar telemetria de custo a partir dos fixtures locais.';
const telemetryEmptyMessage = 'Fixture sem movimentação nesta sprint.';
const successIndicatorEmptyMessage = 'Sem execuções registradas nesta janela.';
const tokensIndicatorEmptyMessage = 'Aguardando emissões para calcular a taxa.';
const serverLoadingMessage = `Sincronizando informações dos servidores MCP via fixtures${ELLIPSIS}`;
const serverErrorMessage =
  'Falha ao sincronizar informações dos servidores MCP a partir dos fixtures locais.';
const serverEmptyMessage = 'Nenhum servidor provisionado no momento.';
const detailEmptyMessage = 'Selecione um servidor para visualizar métricas simuladas.';

type BaseRoutePayloads = {
  servers: unknown;
  processes: unknown;
  sessions: unknown;
  telemetryMetrics: unknown;
  telemetryHeatmap: unknown;
  notifications: unknown;
  compliance: unknown;
  agents: unknown;
};

type TelemetryMetricsFixture = {
  total_cost_usd: number;
  total_runs: number;
  total_tokens_in: number;
  total_tokens_out: number;
  avg_latency_ms: number;
  success_rate: number;
  end: string;
};

type ServerEntryFixture = {
  id: string;
  name: string;
  description: string;
  [key: string]: unknown;
};

type ServersFixture = {
  servers: ServerEntryFixture[];
};

type ServerHealthFixture = {
  checks: Record<string, Array<{ status: string; [key: string]: unknown }>>;
};

async function readOptionalText(locator: Locator): Promise<string | null> {
  if ((await locator.count()) === 0) {
    return null;
  }
  return (await locator.first().textContent())?.trim() ?? null;
}

async function analyzeAccessibility(page: Page): Promise<Record<string, unknown>> {
  try {
    const axeModule = await import('@axe-core/playwright');
    const AxeBuilder = axeModule.default;
    return await new AxeBuilder({ page }).analyze();
  } catch (error) {
    console.warn(
      'AxeBuilder indisponível durante os testes E2E; resultados vazios serão usados.',
      error,
    );
    return { violations: [] };
  }
}

async function registerBaseRoutes(page: Page, payloads?: BaseRoutePayloads) {
  const fixtures: BaseRoutePayloads =
    payloads ??
    ({
      servers: await loadBackendFixture('servers.json'),
      processes: await loadBackendFixture('server_processes.json'),
      sessions: await loadBackendFixture('sessions.json'),
      telemetryMetrics: await loadBackendFixture('telemetry_metrics.json'),
      telemetryHeatmap: await loadBackendFixture('telemetry_heatmap.json'),
      notifications: await loadBackendFixture('notifications.json'),
      compliance: await loadBackendFixture('policies_compliance.json'),
      agents: await loadBackendFixture('agents.json'),
    } as BaseRoutePayloads);

  const fulfillJson = (route: Route, body: unknown, status = 200) =>
    route.fulfill({ status, body: JSON.stringify(body), contentType: 'application/json' });

  await page.route('**/api/v1/servers', (route) => fulfillJson(route, fixtures.servers));
  await page.route('**/api/v1/servers/processes', (route) => fulfillJson(route, fixtures.processes));
  await page.route('**/api/v1/sessions', (route) => fulfillJson(route, fixtures.sessions));
  await page.route('**/api/v1/secrets', (route) => fulfillJson(route, { secrets: [] }));
  await page.route('**/api/v1/telemetry/metrics**', (route) => fulfillJson(route, fixtures.telemetryMetrics));
  await page.route('**/api/v1/telemetry/heatmap**', (route) => fulfillJson(route, fixtures.telemetryHeatmap));
  await page.route('**/api/v1/notifications', (route) => fulfillJson(route, fixtures.notifications));
  await page.route('**/api/v1/policies/compliance', (route) => fulfillJson(route, fixtures.compliance));
  await page.route('**/agents/agents', (route) => fulfillJson(route, fixtures.agents));
}

test('interage com o showcase do UI Kit', async ({ page }) => {
  const [
    telemetryMetrics,
    serversFixture,
    serverProcessesFixture,
    sessionsFixture,
    telemetryHeatmapFixture,
    notificationsFixture,
    complianceFixture,
    agentsFixture,
    serverHealthFixture,
  ] = await Promise.all([
    loadBackendFixture<TelemetryMetricsFixture>('telemetry_metrics.json'),
    loadBackendFixture<ServersFixture>('servers.json'),
    loadBackendFixture('server_processes.json'),
    loadBackendFixture('sessions.json'),
    loadBackendFixture('telemetry_heatmap.json'),
    loadBackendFixture('notifications.json'),
    loadBackendFixture('policies_compliance.json'),
    loadBackendFixture('agents.json'),
    loadBackendFixture<ServerHealthFixture>('server_health.json'),
  ]);

  await registerBaseRoutes(page, {
    servers: serversFixture,
    processes: serverProcessesFixture,
    sessions: sessionsFixture,
    telemetryMetrics,
    telemetryHeatmap: telemetryHeatmapFixture,
    notifications: notificationsFixture,
    compliance: complianceFixture,
    agents: agentsFixture,
  });

  const expectedCost = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'USD',
  }).format(telemetryMetrics.total_cost_usd);
  const expectedRuns = telemetryMetrics.total_runs.toLocaleString('pt-BR');
  const expectedLatency = Math.round(telemetryMetrics.avg_latency_ms).toString();
  const expectedSuccessRate = new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(telemetryMetrics.success_rate * 100);
  const expectedSuccessIndicatorValue = `${Math.round(telemetryMetrics.success_rate * 100)}%`;
  const expectedTokensOut = telemetryMetrics.total_tokens_out.toLocaleString('pt-BR');
  const displayedServers = serversFixture.servers.slice(0, 5);
  const expectedToolbarLabel = `${displayedServers.length} conectados`;
  const geminiChecks = serverHealthFixture.checks.gemini ?? [];
  const expectedGeminiStatus = geminiChecks[0]?.status === 'healthy' ? 'Saudável' : 'Verificar';

  await page.goto('/dev/ui-kit');

  const showcase = page.getByTestId('ui-kit-showcase');
  await expect(showcase.getByText('UI Kit')).toBeVisible();

  await showcase.getByRole('button', { name: 'Ações rápidas' }).click();
  const dropdownMenu = page.locator('.mcp-dropdown__menu');
  await expect(dropdownMenu).toBeVisible();
  const dropdownZIndex = await dropdownMenu.evaluate((element) => {
    const style = getComputedStyle(element);
    return (style.zIndex || style.getPropertyValue('--mcp-z-dropdown')).trim();
  });
  expect(dropdownZIndex).toBe('20');
  await page.keyboard.press('Escape');

  const detailsButton = showcase.getByRole('button', { name: 'Detalhes' });
  await detailsButton.hover();
  const tooltip = page.locator('[role="tooltip"]');
  await expect(tooltip).toBeVisible();
  const tooltipZIndex = await tooltip.evaluate((element) => {
    const style = getComputedStyle(element);
    return (style.zIndex || style.getPropertyValue('--mcp-z-tooltip')).trim();
  });
  expect(tooltipZIndex).toBe('30');
  await detailsButton.press('Escape');

  await showcase.getByRole('button', { name: 'Ações rápidas' }).click();
  await page.getByRole('menuitem', { name: /Toast de sucesso/ }).click();
  const toastViewport = page.locator('.mcp-toast-viewport');
  await expect(toastViewport).toBeVisible();
  const toastZIndex = await toastViewport.evaluate((element) => {
    const style = getComputedStyle(element);
    return (style.zIndex || style.getPropertyValue('--mcp-z-toast')).trim();
  });
  expect(toastZIndex).toBe('70');
  await expect(page.getByText('O servidor foi promovido para produção.')).toBeVisible();

  await showcase.getByRole('button', { name: 'Abrir formulário' }).click();
  const modal = page.getByRole('dialog', { name: 'Editar workflow' });
  await expect(modal).toBeVisible();
  await modal.getByLabel('Nome').fill('E2E Workflow');
  await modal.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByText('E2E Workflow salvo com sucesso.')).toBeVisible();

  await showcase.getByRole('button', { name: 'Abrir confirmação' }).click();
  const modalRoot = page.locator('.mcp-modal');
  await expect(modalRoot).toBeVisible();
  const modalZIndex = await modalRoot.evaluate((element) => {
    const style = getComputedStyle(element);
    return (style.zIndex || style.getPropertyValue('--mcp-z-modal')).trim();
  });
  expect(modalZIndex).toBe('80');

  const confirmButton = page.getByRole('button', { name: 'Confirmar' });
  await confirmButton.click();
  await expect(page.getByText('Clique novamente para confirmar.')).toBeVisible();
  await page.getByRole('button', { name: 'Confirmar agora' }).click();
  await expect(page.getByText('Os recursos associados foram desalocados.')).toBeVisible();

  expect(Number(modalZIndex)).toBeGreaterThan(Number(toastZIndex));
  expect(Number(tooltipZIndex)).toBeGreaterThan(Number(dropdownZIndex));
  expect(Number(toastZIndex)).toBeGreaterThan(Number(tooltipZIndex));

  const indicatorsGroup = showcase.locator('.ui-kit-showcase__group').filter({ hasText: 'Indicadores' });
  const kpiCard = indicatorsGroup.locator('.kpi-card').first();
  const firstIndicator = indicatorsGroup.locator('.progress-indicator').first();
  const secondIndicator = indicatorsGroup.locator('.progress-indicator').nth(1);

  expect(await kpiCard.getAttribute('data-status')).toBeNull();
  await expect(kpiCard.getByText(expectedCost)).toBeVisible();
  await expect(kpiCard.getByText(`${expectedRuns} rotinas`)).toBeVisible();
  await expect(kpiCard.getByText(`${expectedLatency} ms`)).toBeVisible();
  await expect(kpiCard.getByText(`${expectedSuccessRate}% de sucesso`)).toBeVisible();
  await expect(firstIndicator).not.toHaveAttribute('data-status', /.*/);
  await expect(firstIndicator.getByText(expectedSuccessIndicatorValue)).toBeVisible();
  await expect(secondIndicator.getByText(`${expectedTokensOut} tokens emitidos nesta sprint.`)).toBeVisible();

  await indicatorsGroup.getByRole('button', { name: 'Carregando' }).click();
  await expect(kpiCard).toHaveAttribute('data-status', 'loading');
  await expect(kpiCard).toHaveAttribute('aria-busy', 'true');
  await expect(kpiCard).toHaveAttribute('aria-live', 'polite');
  await expect(kpiCard.locator('.kpi-card__status-message')).toHaveText(telemetryLoadingMessage);
  await expect(firstIndicator).toHaveAttribute('data-status', 'loading');
  await expect(firstIndicator).toHaveAttribute('aria-busy', 'true');
  await expect(firstIndicator).toHaveAttribute('aria-live', 'polite');
  await expect(
    firstIndicator.locator('.progress-indicator__status-message'),
  ).toHaveText(telemetryLoadingMessage);
  await expect(secondIndicator).toHaveAttribute('data-status', 'loading');
  await expect(secondIndicator).toHaveAttribute('aria-busy', 'true');
  await expect(secondIndicator).toHaveAttribute('aria-live', 'polite');
  await expect(
    secondIndicator.locator('.progress-indicator__status-message'),
  ).toHaveText(telemetryLoadingMessage);

  await indicatorsGroup.getByRole('button', { name: 'Vazio' }).click();
  await expect(kpiCard).toHaveAttribute('data-status', 'empty');
  await expect(kpiCard).toHaveAttribute('aria-busy', 'false');
  await expect(kpiCard).toHaveAttribute('aria-live', 'polite');
  await expect(kpiCard.locator('.kpi-card__status-message')).toHaveText(telemetryEmptyMessage);
  await expect(firstIndicator).toHaveAttribute('data-status', 'empty');
  await expect(firstIndicator).toHaveAttribute('aria-busy', 'false');
  await expect(firstIndicator).toHaveAttribute('aria-live', 'polite');
  await expect(
    firstIndicator.locator('.progress-indicator__status-message'),
  ).toHaveText(successIndicatorEmptyMessage);
  await expect(secondIndicator).toHaveAttribute('data-status', 'empty');
  await expect(secondIndicator).toHaveAttribute('aria-busy', 'false');
  await expect(secondIndicator).toHaveAttribute('aria-live', 'polite');
  await expect(
    secondIndicator.locator('.progress-indicator__status-message'),
  ).toHaveText(tokensIndicatorEmptyMessage);

  await indicatorsGroup.getByRole('button', { name: 'Erro' }).click();
  await expect(kpiCard).toHaveAttribute('data-status', 'error');
  await expect(kpiCard).toHaveAttribute('aria-busy', 'false');
  await expect(kpiCard).toHaveAttribute('aria-live', 'assertive');
  await expect(kpiCard.locator('.kpi-card__status-message')).toHaveText(telemetryErrorMessage);
  await expect(firstIndicator).toHaveAttribute('data-status', 'error');
  await expect(firstIndicator).toHaveAttribute('aria-busy', 'false');
  await expect(firstIndicator).toHaveAttribute('aria-live', 'assertive');
  await expect(
    firstIndicator.locator('.progress-indicator__status-message'),
  ).toHaveText(telemetryErrorMessage);
  await expect(firstIndicator.getByRole('button', { name: 'Recarregar indicador' })).toBeVisible();
  await expect(secondIndicator).toHaveAttribute('data-status', 'error');
  await expect(secondIndicator).toHaveAttribute('aria-busy', 'false');
  await expect(secondIndicator).toHaveAttribute('aria-live', 'assertive');
  await expect(
    secondIndicator.locator('.progress-indicator__status-message'),
  ).toHaveText(telemetryErrorMessage);

  await indicatorsGroup.getByRole('button', { name: 'Dados' }).click();
  await expect(kpiCard).not.toHaveAttribute('data-status', /.*/);
  await expect(kpiCard).toHaveAttribute('aria-busy', 'false');
  await expect(kpiCard).toHaveAttribute('aria-live', 'off');
  await expect(kpiCard.locator('.kpi-card__status-message')).toHaveCount(0);
  await expect(firstIndicator).not.toHaveAttribute('data-status', /.*/);
  await expect(firstIndicator).toHaveAttribute('aria-live', 'off');
  await expect(firstIndicator.locator('.progress-indicator__status-message')).toHaveCount(0);
  await expect(secondIndicator).not.toHaveAttribute('data-status', /.*/);
  await expect(secondIndicator).toHaveAttribute('aria-live', 'off');
  await expect(secondIndicator.locator('.progress-indicator__status-message')).toHaveCount(0);

  const tableGroup = showcase.locator('.ui-kit-showcase__group').filter({ hasText: 'Listas e tabelas' });
  const resourceTable = tableGroup.locator('.resource-table');

  await tableGroup.getByRole('button', { name: 'Carregando' }).click();
  await expect(resourceTable).toHaveAttribute('data-status', 'loading');
  await expect(resourceTable).toHaveAttribute('aria-busy', 'true');
  await expect(tableGroup.getByText(serverLoadingMessage)).toBeVisible();

  await tableGroup.getByRole('button', { name: 'Vazio' }).click();
  await expect(resourceTable).toHaveAttribute('data-status', 'empty');
  await expect(resourceTable).toHaveAttribute('aria-busy', 'false');
  await expect(tableGroup.getByText(serverEmptyMessage)).toBeVisible();
  await expect(
    tableGroup.getByText('Utilize o CTA para registrar o primeiro workspace MCP da squad.'),
  ).toBeVisible();
  await expect(tableGroup.getByRole('button', { name: 'Registrar servidor' })).toBeVisible();

  await tableGroup.getByRole('button', { name: 'Erro' }).click();
  await expect(resourceTable).toHaveAttribute('data-status', 'error');
  await expect(resourceTable).toHaveAttribute('aria-busy', 'false');
  await expect(tableGroup.getByText(serverErrorMessage)).toBeVisible();
  await expect(tableGroup.getByRole('button', { name: 'Tentar novamente' })).toBeVisible();

  await tableGroup.getByRole('button', { name: 'Dados' }).click();
  await expect(resourceTable).not.toHaveAttribute('data-status', /.*/);
  await expect(resourceTable).toHaveAttribute('aria-busy', 'false');
  const firstRow = tableGroup.locator('tbody tr').first();
  await firstRow.focus();
  await expect(firstRow).toHaveAttribute('data-clickable', 'true');
  await expect(firstRow).toHaveAttribute('tabindex', '0');
  const rowCount = await tableGroup.locator('tbody tr').count();
  expect(rowCount).toBe(displayedServers.length);
  await expect(tableGroup.getByText(expectedToolbarLabel)).toBeVisible();

  const detailGroup = showcase.locator('.ui-kit-showcase__group').filter({ hasText: 'Detalhes' });
  const detailCard = detailGroup.locator('.resource-detail-card');

  await detailGroup.getByRole('button', { name: 'Carregando' }).click();
  await expect(detailCard).toHaveAttribute('data-status', 'loading');
  await expect(detailCard).toHaveAttribute('aria-busy', 'true');
  await expect(detailCard).toHaveAttribute('aria-live', 'polite');
  await expect(detailGroup.getByText(serverLoadingMessage)).toBeVisible();

  await detailGroup.getByRole('button', { name: 'Vazio' }).click();
  await expect(detailCard).toHaveAttribute('data-status', 'empty');
  await expect(detailCard).toHaveAttribute('aria-busy', 'false');
  await expect(detailCard).toHaveAttribute('aria-live', 'polite');
  await expect(detailGroup.getByText(detailEmptyMessage)).toBeVisible();

  await detailGroup.getByRole('button', { name: 'Erro' }).click();
  await expect(detailCard).toHaveAttribute('data-status', 'error');
  await expect(detailCard).toHaveAttribute('aria-busy', 'false');
  await expect(detailCard).toHaveAttribute('aria-live', 'assertive');
  await expect(detailGroup.getByText(serverErrorMessage)).toBeVisible();
  await expect(detailGroup.getByRole('button', { name: 'Tentar novamente' })).toBeVisible();

  await detailGroup.getByRole('button', { name: 'Dados' }).click();
  await expect(detailCard).not.toHaveAttribute('data-status', /.*/);
  await expect(detailCard).toHaveAttribute('aria-busy', 'false');
  await expect(detailCard).toHaveAttribute('aria-live', 'off');
  await expect(detailGroup.getByText(expectedGeminiStatus)).toBeVisible();
  await expect(detailGroup.getByRole('button', { name: 'Reexecutar health-check' })).toBeVisible();

  const kpiStatusAttr = (await kpiCard.getAttribute('data-status')) ?? 'default';
  const tableStatusAttr = (await resourceTable.getAttribute('data-status')) ?? 'default';
  const detailStatusAttr = (await detailCard.getAttribute('data-status')) ?? 'default';
  const progressSnapshot = await indicatorsGroup.locator('.progress-indicator').evaluateAll((nodes) =>
    nodes.map((node) => ({
      status: node.getAttribute('data-status') ?? 'default',
      ariaBusy: node.getAttribute('aria-busy'),
      ariaLive: node.getAttribute('aria-live'),
      label: node.querySelector('.progress-indicator__label')?.textContent?.trim() ?? '',
      value: node.querySelector('.progress-indicator__value')?.textContent?.trim() ?? null,
      description: node.querySelector('.progress-indicator__description')?.textContent?.trim() ?? null,
      statusMessage: node.querySelector('.progress-indicator__status-message')?.textContent?.trim() ?? null,
    })),
  );
  const detailItems = await detailCard
    .locator('.resource-detail-card__item-label')
    .evaluateAll((nodes) => nodes.map((node) => node.textContent?.trim() ?? ''));
  const tableToolbar = (await tableGroup.locator('.resource-table__toolbar').textContent())?.trim() ?? '';

  const artifact = {
    kpi: {
      status: kpiStatusAttr,
      label: (await kpiCard.locator('.kpi-card__label').textContent())?.trim() ?? '',
      value: (await kpiCard.locator('.kpi-card__value').textContent())?.trim() ?? '',
      caption: (await kpiCard.locator('.kpi-card__caption').textContent())?.trim() ?? '',
      ariaBusy: await kpiCard.getAttribute('aria-busy'),
      ariaLive: await kpiCard.getAttribute('aria-live'),
      statusMessage: await readOptionalText(kpiCard.locator('.kpi-card__status-message')),
    },
    progressIndicators: progressSnapshot,
    table: {
      status: tableStatusAttr,
      ariaBusy: await resourceTable.getAttribute('aria-busy'),
      ariaLive: await resourceTable.getAttribute('aria-live'),
      rowCount,
      toolbar: tableToolbar,
      statusMessage: await readOptionalText(tableGroup.locator('.resource-table__status-message')),
    },
    detail: {
      status: detailStatusAttr,
      ariaBusy: await detailCard.getAttribute('aria-busy'),
      ariaLive: await detailCard.getAttribute('aria-live'),
      statusMessage: await readOptionalText(detailGroup.locator('.resource-detail-card__status p')),
      items: detailItems,
    },
  };

  const accessibilityScanResults = await analyzeAccessibility(page);
  await mkdir(evidenceDir, { recursive: true });
  await writeFile(
    resolve(evidenceDir, 'axe-ui-kit.json'),
    JSON.stringify(accessibilityScanResults, null, 2),
  );
  await writeFile(resolve(evidenceDir, 'ui-kit-states.json'), JSON.stringify(artifact, null, 2));
});
