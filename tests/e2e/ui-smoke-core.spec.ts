import { expect, test } from './fixtures';
import { DASHBOARD_TEST_IDS, POLICIES_TEST_IDS } from '../../app/src/pages/testIds';

test.describe('@ui-smoke fixtures coverage', () => {
  test('dashboard renders KPI snapshot using fixtures', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByTestId(DASHBOARD_TEST_IDS.hero)).toBeVisible();
    await expect(page.getByRole('heading', { name: /Dashboard Executivo/ })).toBeVisible();

    const costCard = page.getByTestId('dashboard-kpi-cost');
    await expect(costCard).toBeVisible();
    await expect(costCard).not.toHaveAttribute('data-status', /.+/);
    await expect(costCard.getByText(/R\$/)).toBeVisible();

    await expect(page.getByTestId(DASHBOARD_TEST_IDS.insightCards)).not.toHaveAttribute('data-status', /.+/);
    await expect(page.getByTestId(DASHBOARD_TEST_IDS.sections.heatmap)).toBeVisible();
  });

  test('policies page loads rollout fixtures and CTA flow', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Políticas' }).click();

    const policiesMain = page.getByTestId(POLICIES_TEST_IDS.main);
    await expect(policiesMain).toBeVisible();
    await expect(policiesMain.getByRole('heading', { name: /Políticas MCP/i })).toBeVisible();

    const statusSection = page.getByTestId(POLICIES_TEST_IDS.status);
    await expect(statusSection.getByRole('heading', { name: /ativado/i })).toBeVisible();
    await expect(statusSection.getByText(/ativado para toda a frota/)).toBeVisible();

    const rolloutChart = page.getByTestId(POLICIES_TEST_IDS.rolloutChart);
    await expect(rolloutChart.locator('svg')).toBeVisible();

    await page.getByRole('button', { name: 'Aplicar template' }).click();
    const modal = page.getByRole('dialog', { name: /Aplicar template/ });
    await expect(modal).toBeVisible();
  });
});
