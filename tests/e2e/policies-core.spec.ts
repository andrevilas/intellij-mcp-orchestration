import { expect, test, loadBackendFixture } from './fixtures';
import { POLICIES_TEST_IDS } from '../../app/src/pages/testIds';

type PolicyTemplatesFixture = {
  rollout: {
    plans: Array<{
      templateId: string;
      allocations: Array<{
        segment: { id: string; name: string; description: string };
        coverage: number;
      }>;
    }>;
  } | null;
};

type PolicyDeploymentsFixture = {
  deployments: Array<{ id: string; template_id: string }>;
  active_id: string;
};

test('@policies-core aplica e executa rollback de templates com fixtures', async ({ page }) => {
  const [templatesFixture, deploymentsFixture] = await Promise.all([
    loadBackendFixture<PolicyTemplatesFixture>('policy_templates.json'),
    loadBackendFixture<PolicyDeploymentsFixture>('policy_deployments.json'),
  ]);

  const activeDeployment = deploymentsFixture.deployments.find(
    (deployment) => deployment.id === deploymentsFixture.active_id,
  );
  if (!activeDeployment) {
    throw new Error('Fixture de deploys não informou template ativo.');
  }

  const activePlan = templatesFixture.rollout?.plans.find(
    (plan) => plan.templateId === activeDeployment.template_id,
  );
  if (!activePlan) {
    throw new Error(`Plano de rollout para ${activeDeployment.template_id} não encontrado.`);
  }

  await page.goto('/');
  await page.getByRole('link', { name: 'Políticas' }).click();

  await expect(page.getByRole('heading', { name: 'Políticas MCP · roteamento inteligente' })).toBeVisible();

  const rolloutChart = page.getByTestId(POLICIES_TEST_IDS.rolloutChart);
  for (const allocation of activePlan.allocations) {
    await expect(rolloutChart.getByText(allocation.segment.name)).toBeVisible();
    await expect(rolloutChart.getByText(`${Math.round(allocation.coverage)}%`)).toBeVisible();
  }

  await page.getByLabel('Template Routing focado em latência').check();

  const routingPlan = templatesFixture.rollout?.plans.find(
    (plan) => plan.templateId === 'policy-routing-latency',
  );
  if (!routingPlan) {
    throw new Error('Fixture de templates não contém plano para routing.');
  }

  for (const allocation of routingPlan.allocations) {
    await expect(rolloutChart.getByText(allocation.segment.name)).toBeVisible();
    await expect(rolloutChart.getByText(`${Math.round(allocation.coverage)}%`)).toBeVisible();
  }

  await page.getByRole('button', { name: 'Aplicar template' }).click();
  const applyModal = page.getByRole('dialog', { name: 'Aplicar template · Routing focado em latência' });
  await expect(applyModal).toBeVisible();
  await applyModal.getByRole('button', { name: 'Aplicar template' }).click();

  const [deploymentRequest] = await Promise.all([
    page.waitForRequest(
      (request) => request.url().includes('/api/v1/policies/deployments') && request.method() === 'POST',
    ),
    applyModal.getByRole('button', { name: 'Aplicar agora' }).click(),
  ]);

  const deploymentPayload = deploymentRequest.postDataJSON() as {
    template_id: string;
    author: string;
    window: string | null;
    note: string | null;
  };

  expect(deploymentPayload.template_id).toBe('policy-routing-latency');
  expect(deploymentPayload.author).toBe('Console MCP');
  expect(deploymentPayload.window).toBe('Rollout monitorado');
  expect(deploymentPayload.note).toContain('Routing focado em latência');

  await expect(
    page.getByTestId(POLICIES_TEST_IDS.main).getByText('Routing focado em latência ativado para toda a frota.'),
  ).toBeVisible();
  await expect(
    page.getByTestId(POLICIES_TEST_IDS.status).getByRole('heading', { name: 'Routing focado em latência' }),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Rollback imediato' }).click();
  const rollbackModal = page.getByRole('dialog', { name: 'Rollback imediato · FinOps burn-rate' });
  await expect(rollbackModal).toBeVisible();
  await rollbackModal.getByRole('button', { name: 'Confirmar rollback' }).click();

  const [rollbackRequest] = await Promise.all([
    page.waitForRequest(
      (request) => request.url().includes('/api/v1/policies/deployments/') && request.method() === 'DELETE',
    ),
    rollbackModal.getByRole('button', { name: 'Rollback agora' }).click(),
  ]);

  expect(rollbackRequest.url()).toContain('policy-routing-latency-');
  await expect(
    page.getByTestId(POLICIES_TEST_IDS.main).getByText('Rollback concluído para FinOps burn-rate.'),
  ).toBeVisible();
  await expect(
    page.getByTestId(POLICIES_TEST_IDS.status).getByRole('heading', { name: 'FinOps burn-rate' }),
  ).toBeVisible();
});
