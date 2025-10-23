import { expect, test, loadBackendFixture } from './fixtures';
import { ROUTING_TEST_IDS } from '../../app/src/pages/testIds';

test('gera e aplica plano de roteamento com intents customizadas', async ({ page }) => {
  const manifest = await loadBackendFixture<Record<string, any>>('policy_manifest.json');
  const existingIntents = (manifest.routing?.intents ?? []) as Array<{ intent: string }>;
  const existingRules = (manifest.routing?.rules ?? []) as Array<{ id: string }>;

  await page.goto('/');
  await page.getByRole('button', { name: 'Routing' }).click();

  await expect(page.getByRole('heading', { name: 'Intents direcionadas' })).toBeVisible();

  await page.getByRole('button', { name: 'Adicionar intent' }).click();
  await page.getByPlaceholder('ex.: search.results').last().fill('support.escalate');
  await page.getByPlaceholder('Resumo da finalidade').last().fill('Escalonamento com operadores humanos.');
  await page.getByPlaceholder('ex.: canary, critical').last().fill('critical, escalation');
  await page.getByLabel('Tier padrão').last().selectOption('turbo');
  await page.getByLabel('Fallback dedicado').last().selectOption('provider-turbo-1');

  await page.getByRole('button', { name: 'Adicionar regra' }).click();
  await page.getByPlaceholder('ex.: boost-turbo').last().fill('force-escalation');
  await page.getByPlaceholder('Objetivo da regra').last().fill('Forçar turbo para intents críticas.');
  await page.getByLabel('Intent associada').last().selectOption('support.escalate');
  await page.getByPlaceholder("ex.: latency_p95_ms > 800").last().fill("intent == 'support.escalate'");
  await page.getByLabel('Tier alvo').last().selectOption('turbo');
  await page.getByLabel('Provider forçado').last().selectOption('provider-turbo-1');
  await page.getByLabel('Peso (%)').last().fill('75');

  const [planRequest] = await Promise.all([
    page.waitForRequest((request) =>
      request.url().includes('/api/v1/config/policies') && request.method() === 'PATCH',
    ),
    page.getByRole('button', { name: 'Gerar plano' }).click(),
  ]);
  const planPayload = planRequest.postDataJSON() as {
    changes: {
      routing: {
        intents: Array<{
          intent: string;
          description: string | null;
          tags: string[];
          default_tier: string;
          fallback_provider_id: string | null;
        }>;
        rules: Array<{
          id: string;
          description: string | null;
          intent: string | null;
          matcher: string;
          target_tier: string | null;
          provider_id: string | null;
          weight: number | null;
        }>;
      };
    };
  };

  expect(planPayload.changes.routing.intents.length).toBe(existingIntents.length + 1);
  const createdIntent = planPayload.changes.routing.intents.find((intent) => intent.intent === 'support.escalate');
  expect(createdIntent).toMatchObject({
    description: 'Escalonamento com operadores humanos.',
    tags: ['critical', 'escalation'],
    default_tier: 'turbo',
    fallback_provider_id: 'provider-turbo-1',
  });

  expect(planPayload.changes.routing.rules.length).toBe(existingRules.length + 1);
  const createdRule = planPayload.changes.routing.rules.find((rule) => rule.id === 'force-escalation');
  expect(createdRule).toMatchObject({
    description: 'Forçar turbo para intents críticas.',
    intent: 'support.escalate',
    matcher: "intent == 'support.escalate'",
    target_tier: 'turbo',
    provider_id: 'provider-turbo-1',
    weight: 75,
  });

  await expect(page.getByRole('heading', { name: 'Confirmar alterações de roteamento' })).toBeVisible();
  await expect(page.getByText('Atualizar limites e alertas FinOps usando fixtures locais.')).toBeVisible();

  await page.getByLabel('Autor da alteração').fill('Joana Planner');
  await page.getByLabel('E-mail do autor').fill('joana@example.com');
  await page.getByLabel('Mensagem do commit').fill('feat: atualizar intents e regras');

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
  expect(applyPayload.actor).toBe('Joana Planner');
  expect(applyPayload.actor_email).toBe('joana@example.com');
  expect(applyPayload.commit_message).toBe('feat: atualizar intents e regras');

  await expect(page.getByText('Plano FinOps aplicado com sucesso via fixtures.')).toBeVisible();
  await expect(page.getByText('Branch: chore/finops-plan-fixtures')).toBeVisible();
  await expect(page.getByText('PR: https://github.com/example/console-mcp/pull/42')).toBeVisible();
});

test('exibe erros de validação quando campos obrigatórios estão vazios', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Routing' }).click();

  await expect(page.getByRole('heading', { name: 'Intents direcionadas' })).toBeVisible();

  await page.getByLabel('Máximo de iterações').fill('');
  await page.getByLabel('Timeout por iteração (s)').fill('');

  await page.getByRole('button', { name: 'Gerar plano' }).click();

  await expect(page.getByText('Informe um número maior que zero.')).toBeVisible();
  await expect(page.getByText('Timeout por iteração deve ser maior que zero.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Confirmar alterações de roteamento' })).toHaveCount(0);
});
