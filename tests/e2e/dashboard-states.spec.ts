import { expect, test } from './fixtures';

test('exibe estados de carregamento para indicadores e sessões', async ({ page }) => {
  await page.goto('/?view=dashboard&dashboardState=loading');
  const dashboardPanel = page.getByRole('tabpanel', { name: 'Dashboard' });
  await dashboardPanel.waitFor();
  const kpiCard = page.getByRole('article', { name: 'Custo (24h)' });
  await kpiCard.waitFor();
  await expect(page.getByRole('heading', { name: 'Promenade Agent Hub · Dashboard Executivo' })).toBeVisible();

  await expect(kpiCard).toContainText('Carregando indicadores de telemetria');

  const sessionsSection = page.getByTestId('dashboard-sessions');
  await expect(sessionsSection).toContainText('Carregando histórico de sessões');
});

test('exibe placeholders skeleton durante o bootstrap', async ({ page }) => {
  await page.goto('/?view=dashboard&dashboardState=skeleton');
  const dashboardPanel = page.getByRole('tabpanel', { name: 'Dashboard' });
  await dashboardPanel.waitFor();
  const kpiCard = page.getByRole('article', { name: 'Custo (24h)' });
  await kpiCard.waitFor();
  await expect(page.getByRole('heading', { name: 'Promenade Agent Hub · Dashboard Executivo' })).toBeVisible();

  await expect(kpiCard).toHaveAttribute('data-status', 'skeleton');
  await expect(page.locator('.resource-table__skeleton-row')).not.toHaveCount(0);
});

test('exibe estados vazios quando não há dados de telemetria ou sessões', async ({ page }) => {
  await page.goto('/?view=dashboard&dashboardState=empty');
  const dashboardPanel = page.getByRole('tabpanel', { name: 'Dashboard' });
  await dashboardPanel.waitFor();
  const kpiCard = page.getByRole('article', { name: 'Custo (24h)' });
  await kpiCard.waitFor();
  await expect(page.getByRole('heading', { name: 'Promenade Agent Hub · Dashboard Executivo' })).toBeVisible();

  await expect(kpiCard.getByText('Nenhum indicador disponível no momento.')).toBeVisible();
  await expect(page.getByTestId('dashboard-sessions').getByText('Ainda não há sessões registradas nesta execução.')).toBeVisible();
  await expect(
    page
      .getByTestId('dashboard-sessions')
      .getByText('Provisionamentos aparecerão aqui assim que novas execuções forem registradas.')
      .first(),
  ).toBeVisible();
});

test('exibe estados de erro quando a sincronização falha', async ({ page }) => {
  await page.goto('/?view=dashboard&dashboardState=error');
  const dashboardPanel = page.getByRole('tabpanel', { name: 'Dashboard' });
  await dashboardPanel.waitFor();
  const kpiCard = page.getByRole('article', { name: 'Custo (24h)' });
  await kpiCard.waitFor();
  await expect(page.getByRole('heading', { name: 'Promenade Agent Hub · Dashboard Executivo' })).toBeVisible();

  await expect(
    kpiCard.getByText('Falha ao carregar indicadores de telemetria a partir dos fixtures locais.'),
  ).toBeVisible();

  await expect(
    page
      .getByTestId('dashboard-sessions')
      .getByText('Falha ao carregar histórico de sessões a partir dos fixtures locais.'),
  ).toBeVisible();
});
