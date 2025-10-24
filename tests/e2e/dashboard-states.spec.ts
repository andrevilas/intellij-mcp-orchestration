import { expect, test } from './fixtures';

test('exibe estados de carregamento para indicadores e sessões', async ({ page }) => {
  await page.goto('/?dashboardState=loading');

  await expect(page.getByTestId('dashboard-kpi-cost').getByText('Carregando indicadores de telemetria…'))
    .toBeVisible();

  const sessionsSection = page.getByTestId('dashboard-sessions');
  await expect(sessionsSection.getByText('Carregando histórico de sessões…')).toBeVisible();
});

test('exibe estados vazios quando não há dados de telemetria ou sessões', async ({ page }) => {
  await page.goto('/?dashboardState=empty');

  await expect(page.getByTestId('dashboard-kpi-cost').getByText('Nenhum indicador disponível no momento.')).toBeVisible();
  await expect(page.getByTestId('dashboard-sessions').getByText('Ainda não há sessões registradas nesta execução.')).toBeVisible();
  await expect(
    page.getByTestId('dashboard-sessions').getByText('Provisionamentos aparecerão aqui assim que novas execuções forem registradas.'),
  ).toBeVisible();
});

test('exibe estados de erro quando a sincronização falha', async ({ page }) => {
  await page.goto('/?dashboardState=error');

  await expect(
    page
      .getByTestId('dashboard-kpi-cost')
      .getByText('Falha ao carregar indicadores de telemetria a partir dos fixtures locais.'),
  ).toBeVisible();

  await expect(
    page
      .getByTestId('dashboard-sessions')
      .getByText('Falha ao carregar histórico de sessões a partir dos fixtures locais.'),
  ).toBeVisible();
});
