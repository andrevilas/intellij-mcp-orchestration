import { expect, test, loadBackendFixture } from './fixtures';
import { POLICIES_TEST_IDS } from '../../app/src/pages/testIds';

test('gera e aplica plano de políticas com HITL usando fixtures', async ({ page }) => {
  const manifest = await loadBackendFixture<Record<string, any>>('policy_manifest.json');
  const initialCheckpoints = (manifest.hitl?.checkpoints ?? []) as Array<{
    name: string;
    description?: string | null;
    required?: boolean;
    escalation_channel?: string | null;
  }>;

  await page.goto('/');
  await page.getByRole('link', { name: 'Políticas' }).click();

  await expect(page.getByRole('heading', { name: 'Runtime, timeouts e tracing' })).toBeVisible();

  await page.getByLabel('Máximo de iterações').fill('8');
  await page.getByLabel('Timeout por iteração (s)').fill('45');
  await page.getByLabel('Timeout total (s)').fill('200');
  await page.getByLabel('Sample rate de tracing (%)').fill('15');

  const approvalToggle = page.getByLabel('Exigir aprovação humana para este agente');
  if ((await approvalToggle.isChecked()) === false) {
    await approvalToggle.check();
  }

  await page.getByRole('button', { name: 'Adicionar checkpoint' }).click();
  await page.getByPlaceholder('ex.: Ops review').last().fill('Ops Review');
  await page.getByPlaceholder('Contextualize o checkpoint').last().fill('Validação operacional completa.');
  await page
    .getByLabel('Obrigatório para continuar')
    .last()
    .check();
  await page.getByLabel('Escalonamento').last().selectOption('slack');

  const [planRequest] = await Promise.all([
    page.waitForRequest((request) =>
      request.url().includes('/api/v1/config/policies') && request.method() === 'PATCH',
    ),
    page.getByRole('button', { name: 'Gerar plano' }).click(),
  ]);
  const planPayload = planRequest.postDataJSON() as {
    changes: {
      runtime: {
        max_iters: number;
        timeouts: { per_iteration?: number | null; total?: number | null };
        tracing: { enabled: boolean; sample_rate: number };
      };
      hitl: {
        enabled: boolean;
        checkpoints: Array<{
          name: string;
          description: string | null;
          required: boolean;
          escalation_channel: string | null;
        }>;
      };
    };
  };

  expect(planPayload.changes.runtime.max_iters).toBe(8);
  expect(planPayload.changes.runtime.timeouts.per_iteration).toBe(45);
  expect(planPayload.changes.runtime.timeouts.total).toBe(200);
  expect(planPayload.changes.runtime.tracing).toEqual({ enabled: true, sample_rate: 0.15 });

  expect(planPayload.changes.hitl.enabled).toBe(true);
  expect(planPayload.changes.hitl.checkpoints).toHaveLength(initialCheckpoints.length + 1);
  const addedCheckpoint = planPayload.changes.hitl.checkpoints.find((checkpoint) => checkpoint.name === 'Ops Review');
  expect(addedCheckpoint).toMatchObject({
    description: 'Validação operacional completa.',
    required: true,
    escalation_channel: 'slack',
  });

  await expect(page.getByRole('heading', { name: 'Confirmar alterações nas políticas' })).toBeVisible();
  await expect(page.getByText('Atualizar limites e alertas FinOps usando fixtures locais.')).toBeVisible();
  await expect(page.getByTestId(POLICIES_TEST_IDS.planDiffs)).toContainText('policies/manifest.json');

  await page.getByLabel('Autor da alteração').fill('Patrícia SRE');
  await page.getByLabel('E-mail do autor').fill('patricia.sre@example.com');
  await page.getByLabel('Mensagem do commit').fill('feat: ajustar runtime e HITL');

  const [applyRequest] = await Promise.all([
    page.waitForRequest((request) => request.url().includes('/api/v1/config/apply') && request.method() === 'POST'),
    page.getByRole('button', { name: 'Aplicar plano' }).click(),
  ]);
  const applyPayload = applyRequest.postDataJSON() as {
    plan_id: string;
    actor: string;
    actor_email: string;
    commit_message: string;
  };

  expect(typeof applyPayload.plan_id).toBe('string');
  expect(applyPayload.actor).toBe('Patrícia SRE');
  expect(applyPayload.actor_email).toBe('patricia.sre@example.com');
  expect(applyPayload.commit_message).toBe('feat: ajustar runtime e HITL');

  await expect(page.getByText('Plano FinOps aplicado com sucesso via fixtures.')).toBeVisible();
  await expect(page.getByText('Branch: chore/finops-plan-fixtures')).toBeVisible();
  await expect(page.getByText('PR: https://github.com/example/console-mcp/pull/42')).toBeVisible();
});
