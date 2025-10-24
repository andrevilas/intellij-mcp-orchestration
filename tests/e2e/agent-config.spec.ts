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
  await page.goto('/');
  await page.getByRole('button', { name: 'Agents' }).click();
  const detailButton = page.getByTestId(AGENTS_TEST_IDS.detailButton('catalog-search'));
  await expect(detailButton).toBeVisible();
  await detailButton.click();
  await expect(page.getByRole('heading', { name: 'Catalog Search' })).toBeVisible();
  await expect(page.getByTestId(AGENT_DETAIL_TEST_IDS.tabs)).toBeVisible();
  await page.getByRole('tab', { name: 'Policies' }).click();
  await expect(page.getByRole('tabpanel', { name: 'Policies' })).toBeVisible();
}

test('@agent-governance gera plano e aplica configuração de policies', async ({ page }) => {
  await registerBaseRoutes(page);

  const planRequests: unknown[] = [];
  await page.route('**/config/agents/catalog-search/plan', (route) => {
    planRequests.push(route.request().postDataJSON());
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        plan_id: 'plan-123',
        plan: {
          id: 'plan-123',
          threadId: 'thread-1',
          status: 'ready',
          generatedAt: '2025-01-04T12:00:00Z',
          author: 'console',
          scope: 'Policies',
          steps: [],
        },
        plan_payload: {
          intent: 'update',
          summary: 'Atualizar policies',
          status: 'pending',
        },
        patch: '--- a/agent.yaml\n+++ b/agent.yaml\n@@',
        message: 'Plano de atualização gerado.',
        diffs: [
          { id: 'agent.yaml', file: 'agent.yaml', summary: 'Atualizar rate limit', diff: 'diff --git' },
        ],
      }),
    });
  });

  const applyRequests: unknown[] = [];
  await page.route('**/config/agents/catalog-search/apply', (route) => {
    applyRequests.push(route.request().postDataJSON());
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        status: 'completed',
        mode: 'branch_pr',
        plan_id: 'plan-123',
        record_id: 'record-42',
        message: 'Plano aplicado com sucesso.',
        branch: 'feature/policies-update',
        pull_request: {
          provider: 'github',
          id: 'pr-1',
          number: '123',
          url: 'https://github.com/example/repo/pull/123',
          title: 'Atualizar policies do agent',
          state: 'open',
          head_sha: 'abc123',
          merged: false,
        },
      }),
    });
  });

  await openAgentPoliciesTab(page);

  await page.getByLabel('Configuração de Policies').fill('{\n  "rateLimit": 42\n}');
  await page.getByRole('button', { name: 'Gerar plano' }).click();

  await expect(page.getByRole('heading', { name: 'Plano de configuração' })).toBeVisible();
  await expect(page.getByText('Atualizar rate limit')).toBeVisible();
  expect(planRequests).toHaveLength(1);
  expect((planRequests[0] as { layer?: string }).layer).toBe('policies');
  expect((planRequests[0] as { changes?: { rateLimit?: number } }).changes?.rateLimit).toBe(42);

  const [applyRequest] = await Promise.all([
    page.waitForRequest('**/config/agents/catalog-search/apply'),
    page.getByRole('button', { name: 'Aplicar alterações' }).click(),
  ]);

  expect(applyRequests).toHaveLength(1);
  const applyPayload = applyRequests[0] as { layer?: string; commit_message?: string };
  expect(applyPayload.layer).toBe('policies');
  expect(applyPayload.commit_message).toContain('atualizar policies');
  expect(applyRequest.url()).toContain('/config/agents/catalog-search/apply');

  await expect(
    page.getByText('Plano aplicado com sucesso. Branch: feature/policies-update PR: https://github.com/example/repo/pull/123'),
  ).toBeVisible();
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

  const historyResponse = {
    items: [
      {
        id: 'hist-1',
        layer: 'policies',
        status: 'applied',
        requested_by: 'carol',
        created_at: '2025-01-03T11:00:00Z',
        summary: 'Rollback anterior',
        plan_id: 'plan-old',
        plan_payload: { intent: 'update', summary: 'Rollback', status: 'pending' },
        patch: 'diff --git',
      },
    ],
  };

  const rollbackRequests: unknown[] = [];
  await page.route('**/config/agents/catalog-search/history?layer=policies', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(historyResponse) }),
  );
  await page.route('**/config/agents/catalog-search/apply', (route) => {
    rollbackRequests.push(route.request().postDataJSON());
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        status: 'completed',
        mode: 'branch_pr',
        plan_id: 'plan-old',
        record_id: 'record-rollback',
        message: 'Rollback disparado.',
      }),
    });
  });

  await openAgentPoliciesTab(page);

  await page.getByRole('button', { name: 'Criar rollback' }).click();
  await expect(page.getByText('Rollback disparado.')).toBeVisible();

  expect(rollbackRequests).toHaveLength(1);
  const rollbackPayload = rollbackRequests[0] as { plan_id?: string; patch?: string };
  expect(rollbackPayload.plan_id).toBe('plan-old');
  expect(rollbackPayload.patch).toBe('diff --git');
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

  await openAgentPoliciesTab(page);

  await page.getByLabel('Configuração de Policies').fill('{"limit": 10');
  await page.getByRole('button', { name: 'Gerar plano' }).click();
  await expect(page.getByText('Configuração contém JSON inválido.')).toBeVisible();
  expect(planRequests).toHaveLength(0);
});
