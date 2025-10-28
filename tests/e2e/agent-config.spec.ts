import { expect, test } from './fixtures';
import type { Page } from '@playwright/test';
import { AGENTS_TEST_IDS, AGENT_DETAIL_TEST_IDS } from '../../app/src/pages/testIds';

const agentsResponse = {
  agents: [
    {
      name: 'catalog-search',
      title: 'Catalog Search',
      version: '1.2.0',
      description: 'Busca estruturada.',
      capabilities: ['search'],
      model: { provider: 'openai', name: 'o3-mini', parameters: { temperature: 0 } },
      status: 'healthy',
      last_deployed_at: '2025-01-02T10:00:00Z',
      owner: '@catalog',
    },
  ],
};

async function registerBaseRoutes(page: Page) {
  await page.route('**/api/v1/servers', (route) =>
    route.fulfill({ status: 200, body: JSON.stringify({ servers: [] }), contentType: 'application/json' }),
  );
  await page.route('**/api/v1/servers/processes', (route) =>
    route.fulfill({ status: 200, body: JSON.stringify({ processes: [] }), contentType: 'application/json' }),
  );
  await page.route('**/api/v1/sessions', (route) =>
    route.fulfill({ status: 200, body: JSON.stringify({ sessions: [] }), contentType: 'application/json' }),
  );
  await page.route('**/api/v1/secrets', (route) =>
    route.fulfill({ status: 200, body: JSON.stringify({ secrets: [] }), contentType: 'application/json' }),
  );
  await page.route('**/api/v1/telemetry/metrics**', (route) =>
    route.fulfill({ status: 200, body: JSON.stringify({ buckets: [] }), contentType: 'application/json' }),
  );
  await page.route('**/api/v1/telemetry/heatmap**', (route) =>
    route.fulfill({ status: 200, body: JSON.stringify({ heatmap: [] }), contentType: 'application/json' }),
  );
  await page.route('**/api/v1/notifications', (route) =>
    route.fulfill({ status: 200, body: JSON.stringify({ notifications: [] }), contentType: 'application/json' }),
  );
  const compliancePayload = { status: 'pass', items: [] };
  const fulfillCompliance = (route: { fulfill: (options: { status: number; body: string; contentType: string }) => void }) =>
    route.fulfill({ status: 200, body: JSON.stringify(compliancePayload), contentType: 'application/json' });
  await page.route('**/api/v1/policies/compliance', fulfillCompliance);
  await page.route('**/api/v1/policy/compliance', fulfillCompliance);
  await page.route('**/api/v1/smoke/endpoints', (route) =>
    route.fulfill({ status: 200, body: JSON.stringify({ endpoints: [] }), contentType: 'application/json' }),
  );
  await page.route('**/agents/agents', (route) =>
    route.fulfill({ status: 200, body: JSON.stringify(agentsResponse), contentType: 'application/json' }),
  );
}

async function openAgentPoliciesTab(page: Page) {
  await page.goto('/#agents');
  const loadingStatus = page.getByRole('status', { name: /Carregando Agents/i });
  await loadingStatus.waitFor({ state: 'detached' }).catch(() => undefined);
  const detailButton = page.getByTestId(AGENTS_TEST_IDS.detailButton('catalog-search'));
  await detailButton.waitFor({ state: 'visible' });
  await detailButton.click();
  await expect(page.getByRole('heading', { name: 'Catalog Search' })).toBeVisible();
  await expect(page.getByTestId(AGENT_DETAIL_TEST_IDS.tabs)).toBeVisible();
  await page.getByRole('tab', { name: 'Policies' }).click();
  const panel = page.getByRole('tabpanel', { name: 'Policies' });
  await expect(panel).toBeVisible();
  return panel;
}

test('@agent-governance gera plano e aplica configuração de policies', async ({ page }) => {
  await registerBaseRoutes(page);

  const policiesPanel = await openAgentPoliciesTab(page);

  await policiesPanel.getByLabel('Configuração de Policies').fill('{\n  "rateLimit": 42\n}');
  const planRequestPromise = page.waitForRequest('**/config/agents/catalog-search/plan');
  await policiesPanel.getByRole('button', { name: 'Gerar plano' }).click();
  const planRequest = await planRequestPromise;

  const planPayload = planRequest.postDataJSON() as {
    layer?: string;
    changes?: { rateLimit?: number };
  };
  expect(planPayload.layer).toBe('policies');
  expect(planPayload.changes?.rateLimit).toBe(42);

  await expect(policiesPanel.getByRole('heading', { name: 'Plano de configuração' })).toBeVisible();
  await expect(policiesPanel.getByRole('list')).toBeVisible();

  const [applyRequest] = await Promise.all([
    page.waitForRequest('**/config/agents/catalog-search/apply'),
    policiesPanel.getByRole('button', { name: 'Aplicar alterações' }).click(),
  ]);

  const applyPayload = applyRequest.postDataJSON() as { layer?: string; commit_message?: string };
  expect(applyPayload.layer).toBe('policies');
  expect(applyPayload.commit_message).toContain('atualizar policies');
  expect(applyRequest.url()).toContain('/config/agents/catalog-search/apply');

  await expect(policiesPanel.getByText(/Plano .* aplicado para catalog-search via fixtures\./i)).toBeVisible();
});

test('@agent-governance permite rollback a partir do histórico', async ({ page }) => {
  await registerBaseRoutes(page);

  await page.route('**/config/agents/catalog-search/plan', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        plan_id: 'plan-999',
        plan: {
          id: 'plan-999',
          threadId: 'thread-rollback',
          status: 'ready',
          generatedAt: '2025-01-05T12:00:00Z',
          author: 'console',
          scope: 'Policies',
          steps: [],
        },
        plan_payload: {
          intent: 'update',
          summary: 'Atualizar policies',
          status: 'pending',
        },
        patch: '---',
        message: 'Plano gerado.',
        diffs: [],
      }),
    }),
  );

  await openAgentPoliciesTab(page);

  const rollbackRequestPromise = page.waitForRequest('**/config/agents/catalog-search/apply');
  await page.getByRole('button', { name: 'Criar rollback' }).click();
  const rollbackRequest = await rollbackRequestPromise;

  const rollbackPayload = rollbackRequest.postDataJSON() as { plan_id?: string; patch?: string };
  expect(typeof rollbackPayload.plan_id).toBe('string');
  expect(rollbackPayload.patch).toBeTruthy();
  await expect(page.getByText(/Plano .* aplicado para catalog-search via fixtures\./i).first()).toBeVisible();
});

test('@agent-governance exibe erro de validação para JSON inválido', async ({ page }) => {
  await registerBaseRoutes(page);

  const planRequests: unknown[] = [];
  await page.route('**/config/agents/catalog-search/plan', (route) => {
    planRequests.push(route.request().postDataJSON());
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        plan_id: 'plan-ignore',
        plan: null,
        plan_payload: { intent: 'noop', summary: 'noop', status: 'pending' },
        patch: '',
        diffs: [],
      }),
    });
  });

  const policiesPanel = await openAgentPoliciesTab(page);

  await policiesPanel.getByLabel('Configuração de Policies').fill('{"limit": 10');
  await policiesPanel.getByRole('button', { name: 'Gerar plano' }).click();
  await expect(policiesPanel.getByText('Configuração contém JSON inválido.')).toBeVisible();
  expect(planRequests).toHaveLength(0);
});
