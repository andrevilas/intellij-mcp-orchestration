import { test, expect } from '@playwright/test';

test('@finops-plan gera e aplica plano FinOps', async ({ page }) => {
  const manifestResponse = {
    policies: { confidence: null },
    routing: {
      default_tier: 'balanced',
      allowed_tiers: ['balanced', 'turbo'],
      fallback_tier: 'economy',
      max_attempts: 2,
      max_iters: 4,
      request_timeout_seconds: 30,
      total_timeout_seconds: 120,
      intents: [],
      rules: [],
    },
    finops: {
      cost_center: 'finops-core',
      budgets: [
        { tier: 'economy', amount: 1200, currency: 'USD', period: 'monthly' },
        { tier: 'balanced', amount: 3400, currency: 'USD', period: 'monthly' },
      ],
      alerts: [
        { threshold: 0.75, channel: 'slack' },
        { threshold: 0.9, channel: 'email' },
      ],
      cache: { ttl_seconds: 600 },
      rate_limit: { requests_per_minute: 180 },
      graceful_degradation: { strategy: 'fallback', message: 'Servindo rotas alternativas' },
    },
    hitl: { enabled: false, checkpoints: [], pending_approvals: 0, updated_at: null },
    runtime: {
      max_iters: 4,
      timeouts: { per_iteration: 30, total: 120 },
      retry: { max_attempts: 2, initial_delay: 1, backoff_factor: 2, max_delay: 4 },
      tracing: { enabled: true, sample_rate: 0.2, exporter: null },
    },
    overrides: null,
    updated_at: '2025-04-01T12:00:00Z',
  };

  const planRequests: unknown[] = [];

  await page.route('**/api/v1/policies/manifest', (route) => {
    route.fulfill({ status: 200, body: JSON.stringify(manifestResponse), contentType: 'application/json' });
  });

  const planResponse = {
    plan: {
      intent: 'edit_finops',
      summary: 'Atualizar políticas FinOps',
      steps: [
        {
          id: 'update-finops',
          title: 'Atualizar budgets e alertas',
          description: 'Escrever ajustes no manifesto.',
          depends_on: [],
          actions: [
            {
              type: 'write',
              path: 'policies/manifest.json',
              contents: '{"finops": {}}',
              encoding: 'utf-8',
              overwrite: true,
            },
          ],
        },
      ],
      diffs: [
        {
          path: 'policies/manifest.json',
          summary: 'Atualizar manifesto FinOps (cache TTL, rate limit, graceful degradation)',
          change_type: 'update',
          diff: '---',
        },
      ],
      risks: [],
      status: 'pending',
      context: [],
      approval_rules: [],
    },
    plan_payload: { intent: 'edit_finops', summary: 'Atualizar políticas FinOps', status: 'pending' },
    preview: {
      branch: 'chore/finops-plan',
      base_branch: 'main',
      commit_message: 'chore: atualizar finops',
      pull_request: { provider: 'github', title: 'Atualizar políticas FinOps' },
    },
    preview_payload: null,
  };

  await page.route('**/api/v1/config/policies', async (route) => {
    planRequests.push(JSON.parse(route.request().postData() || '{}'));
    await route.fulfill({ status: 200, body: JSON.stringify(planResponse), contentType: 'application/json' });
  });

  const applyRequests: unknown[] = [];
  const applyResponse = {
    status: 'completed',
    mode: 'branch_pr',
    plan_id: 'finops-plan-test',
    record_id: 'rec-1',
    branch: 'chore/finops-plan',
    base_branch: 'main',
    commit_sha: 'abc123',
    diff: { stat: '1 file changed', patch: 'diff --git a/policies/manifest.json b/policies/manifest.json' },
    hitl_required: false,
    message: 'Plano aplicado com sucesso.',
    pull_request: {
      provider: 'github',
      id: 'pr-101',
      number: '101',
      url: 'https://github.com/mcp/finops/pull/101',
      title: 'chore: atualizar finops',
      state: 'open',
      head_sha: 'abc123',
      branch: 'chore/finops-plan',
      ci_status: 'success',
      review_status: 'approved',
      merged: false,
      reviewers: [],
      ci_results: [],
    },
  };

  await page.route('**/api/v1/config/apply', async (route) => {
    applyRequests.push(JSON.parse(route.request().postData() || '{}'));
    await route.fulfill({ status: 200, body: JSON.stringify(applyResponse), contentType: 'application/json' });
  });

  const emptyList = { items: [] };
  await page.route('**/api/v1/telemetry/timeseries**', (route) => {
    route.fulfill({ status: 200, body: JSON.stringify(emptyList), contentType: 'application/json' });
  });
  await page.route('**/api/v1/telemetry/runs**', (route) => {
    route.fulfill({ status: 200, body: JSON.stringify({ items: [] }), contentType: 'application/json' });
  });
  await page.route('**/api/v1/telemetry/pareto**', (route) => {
    route.fulfill({ status: 200, body: JSON.stringify({ items: [] }), contentType: 'application/json' });
  });
  await page.route('**/api/v1/telemetry/experiments**', (route) => {
    route.fulfill({ status: 200, body: JSON.stringify({ items: [] }), contentType: 'application/json' });
  });
  await page.route('**/api/v1/telemetry/lanes/costs**', (route) => {
    route.fulfill({ status: 200, body: JSON.stringify({ items: [] }), contentType: 'application/json' });
  });
  await page.route('**/api/v1/marketplace/performance**', (route) => {
    route.fulfill({ status: 200, body: JSON.stringify({ items: [] }), contentType: 'application/json' });
  });
  await page.route('**/api/v1/finops/sprint-reports**', (route) => {
    route.fulfill({ status: 200, body: JSON.stringify({ items: [] }), contentType: 'application/json' });
  });
  await page.route('**/api/v1/finops/pull-request-reports**', (route) => {
    route.fulfill({ status: 200, body: JSON.stringify({ items: [] }), contentType: 'application/json' });
  });

  await page.route('**/api/v1/providers', (route) => {
    route.fulfill({
      status: 200,
      body: JSON.stringify({ providers: [{ id: 'glm', name: 'GLM 46', command: 'glm46', description: 'Modelo GLM 46', capabilities: ['chat'], tags: ['llm'], transport: 'stdio', is_available: true }] }),
      contentType: 'application/json',
    });
  });

  await page.route('**/api/v1/notifications', (route) => {
    route.fulfill({ status: 200, body: JSON.stringify({ notifications: [] }), contentType: 'application/json' });
  });

  await page.route('**/api/v1/servers', (route) => {
    route.fulfill({ status: 200, body: JSON.stringify({ servers: [] }), contentType: 'application/json' });
  });
  await page.route('**/api/v1/servers/processes', (route) => {
    route.fulfill({ status: 200, body: JSON.stringify({ processes: [] }), contentType: 'application/json' });
  });
  await page.route('**/api/v1/sessions', (route) => {
    route.fulfill({ status: 200, body: JSON.stringify({ sessions: [] }), contentType: 'application/json' });
  });
  await page.route('**/api/v1/secrets', (route) => {
    route.fulfill({ status: 200, body: JSON.stringify({ secrets: [] }), contentType: 'application/json' });
  });

  await page.goto('/');
  await page.getByRole('link', { name: 'FinOps' }).click();

  await expect(page.getByLabel('Cost center responsável')).toHaveValue('finops-core');

  await page.getByRole('button', { name: 'Gerar plano FinOps' }).click();

  await expect(page.getByText('Atualizar políticas FinOps')).toBeVisible();
  await expect(page.getByText('policies/manifest.json')).toBeVisible();
  await expect(
    page.getByText('Atualizar manifesto FinOps (cache TTL, rate limit, graceful degradation)'),
  ).toBeVisible();

  const planPayload = planRequests[0] as {
    changes?: { finops?: { cache?: { ttl_seconds: number }; rate_limit?: { requests_per_minute: number }; graceful_degradation?: { strategy: string | null; message: string | null } } };
  };
  expect(planPayload.changes?.finops?.cache?.ttl_seconds).toBe(600);
  expect(planPayload.changes?.finops?.rate_limit?.requests_per_minute).toBe(180);
  expect(planPayload.changes?.finops?.graceful_degradation?.strategy).toBe('fallback');
  expect(planPayload.changes?.finops?.graceful_degradation?.message).toBe(
    'Servindo rotas alternativas',
  );

  await page.getByRole('button', { name: 'Aplicar plano' }).click();

  await expect(page.getByText(/Plano aplicado com sucesso/)).toBeVisible();
  await expect(page.getByText('Aplicado')).toBeVisible();

  const applyPayload = applyRequests[0] as { plan_id?: string };
  expect(applyPayload.plan_id).toBeDefined();
});
