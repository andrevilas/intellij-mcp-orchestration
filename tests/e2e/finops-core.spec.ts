import { expect, test, loadBackendFixture } from './fixtures';
import { FINOPS_TEST_IDS } from '../../app/src/pages/testIds';

function slugifyIdentifier(value: string): string {
  const normalized = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return normalized.length > 0 ? normalized : 'route';
}

test('@finops-plan gera e aplica plano FinOps com fixtures', async ({ page }) => {
  const [manifest, pareto] = await Promise.all([
    loadBackendFixture<Record<string, any>>('policy_manifest.json'),
    loadBackendFixture<{ items: Array<{ provider_id: string; route: string | null }> }>('telemetry_pareto.json'),
  ]);

  await page.goto('/');
  await page.getByRole('link', { name: 'FinOps' }).click();

  const alertsSection = page.getByTestId(FINOPS_TEST_IDS.alerts.section);
  await expect(alertsSection.getByText('Escalada de custo diário')).toBeVisible();
  await expect(alertsSection.getByText('Pico de tokens consumidos')).toBeVisible();
  await expect(alertsSection.getByText('Custo concentrado em uma rota')).toBeVisible();
  await expect(alertsSection.getByText('Taxa de sucesso abaixo do esperado')).toBeVisible();

  const primaryRoute = pareto.items[0];
  const hotspotIdentifier = `cost-${slugifyIdentifier(
    `${primaryRoute.provider_id}-${primaryRoute.route ?? 'default'}`,
  )}`;
  await expect(page.getByTestId(FINOPS_TEST_IDS.hotspots.item(hotspotIdentifier))).toBeVisible();

  const [planRequest] = await Promise.all([
    page.waitForRequest((request) =>
      request.url().includes('/api/v1/config/policies') && request.method() === 'PATCH',
    ),
    page.getByRole('button', { name: 'Gerar plano FinOps' }).click(),
  ]);
  const planPayload = planRequest.postDataJSON() as {
    policy_id: string;
    changes: {
      finops: {
        cost_center: string;
        budgets: Array<{ tier: string; amount: number; currency: string; period: string }>;
        alerts: Array<{ threshold: number; channel: string }>;
        cache: { ttl_seconds: number | null };
        rate_limit: { requests_per_minute: number | null };
        graceful_degradation: { strategy: string | null; message: string | null };
      };
    };
  };

  expect(planPayload.policy_id).toBe('manifest');

  const manifestFinOps = (manifest.finops ?? {}) as {
    cost_center?: string;
    budgets?: Array<{ tier: string; amount: number; currency: string; period: string }>;
    alerts?: Array<{ threshold: number; channel: string }>;
    cache?: { ttl_seconds?: number };
    rate_limit?: { requests_per_minute?: number };
    graceful_degradation?: { strategy?: string; message?: string };
  };

  const expectedBudgets = (manifestFinOps.budgets ?? []).map((budget) => ({
    tier: budget.tier,
    amount: budget.amount,
    currency: budget.currency,
    period: budget.period,
  }));
  const expectedAlerts = (manifestFinOps.alerts ?? []).map((alert) => ({
    threshold: alert.threshold,
    channel: alert.channel,
  }));

  expect(planPayload.changes.finops.cost_center).toBe(manifestFinOps.cost_center);
  expect(planPayload.changes.finops.budgets).toEqual(expectedBudgets);
  expect(planPayload.changes.finops.alerts).toEqual(expectedAlerts);
  expect(planPayload.changes.finops.cache.ttl_seconds).toBe(manifestFinOps.cache?.ttl_seconds ?? null);
  expect(planPayload.changes.finops.rate_limit.requests_per_minute).toBe(
    manifestFinOps.rate_limit?.requests_per_minute ?? null,
  );
  expect(planPayload.changes.finops.graceful_degradation).toEqual({
    strategy: manifestFinOps.graceful_degradation?.strategy ?? null,
    message: manifestFinOps.graceful_degradation?.message ?? null,
  });

  await expect(
    page.getByTestId(FINOPS_TEST_IDS.plan.summary).getByText(
      'Atualizar limites e alertas FinOps usando fixtures locais.',
    ),
  ).toBeVisible();
  await expect(page.getByTestId(FINOPS_TEST_IDS.plan.diffs)).toContainText('policies/manifest.json');

  await page.getByRole('button', { name: 'Aplicar plano' }).click();
  const confirmationModal = page.getByRole('dialog', { name: 'Aplicar plano FinOps' });
  await expect(confirmationModal).toBeVisible();
  await confirmationModal.getByRole('button', { name: 'Aplicar plano' }).click();
  const [applyRequest] = await Promise.all([
    page.waitForRequest((request) => request.url().includes('/api/v1/config/apply') && request.method() === 'POST'),
    confirmationModal.getByRole('button', { name: 'Aplicar agora' }).click(),
  ]);
  const applyPayload = applyRequest.postDataJSON() as {
    plan_id: string;
    actor: string;
    actor_email: string;
    commit_message: string;
  };

  expect(typeof applyPayload.plan_id).toBe('string');
  expect(applyPayload.actor).toBe('Console MCP');
  expect(applyPayload.actor_email).toBe('finops@console.mcp');
  expect(applyPayload.commit_message).toBe('chore: atualizar políticas FinOps');

  await expect(
    page.getByTestId(FINOPS_TEST_IDS.policy.section).getByText('Plano FinOps aplicado com sucesso via fixtures.'),
  ).toBeVisible();
  await expect(
    page.getByTestId(FINOPS_TEST_IDS.policy.section).getByText('Branch: chore/finops-plan-fixtures'),
  ).toBeVisible();
  await expect(
    page.getByTestId(FINOPS_TEST_IDS.policy.section).getByText('PR: https://github.com/example/console-mcp/pull/42'),
  ).toBeVisible();
  await expect(page.getByTestId(FINOPS_TEST_IDS.plan.summary)).toContainText('Aplicado');
});
