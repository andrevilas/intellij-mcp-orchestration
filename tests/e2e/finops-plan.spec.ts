import { expect, test } from './fixtures';
import manifestFixture from '../fixtures/backend/policy_manifest.json' assert { type: 'json' };
import telemetryParetoFixture from '../fixtures/backend/telemetry_pareto.json' assert { type: 'json' };
import { FINOPS_TEST_IDS } from '../../app/src/pages/testIds';

const DEFAULT_PLAN_END_ISO = '2025-03-07T00:00:00Z';

function resolveEndDate(param: string | null): Date {
  const end = param ? new Date(param) : new Date(DEFAULT_PLAN_END_ISO);
  if (Number.isNaN(end.getTime())) {
    return new Date(DEFAULT_PLAN_END_ISO);
  }
  end.setUTCHours(0, 0, 0, 0);
  return end;
}

function buildTimeseriesPayload(param: string | null) {
  const end = resolveEndDate(param);
  const items = Array.from({ length: 10 }, (_, index) => {
    const offset = 9 - index;
    const cursor = new Date(end);
    cursor.setDate(end.getDate() - offset);
    const isoDay = cursor.toISOString().slice(0, 10);
    const isBaseline = offset >= 7;
    const costUsd = isBaseline ? 110 : 240;
    const tokensIn = isBaseline ? 550_000 : 900_000;
    const tokensOut = isBaseline ? 450_000 : 900_000;
    return {
      day: isoDay,
      provider_id: 'glm',
      run_count: 12,
      tokens_in: tokensIn,
      tokens_out: tokensOut,
      cost_usd: costUsd,
      avg_latency_ms: isBaseline ? 980 : 2100,
      success_count: isBaseline ? 11 : 9,
    };
  });
  return { items };
}

function slugifyIdentifier(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

const paretoSource = telemetryParetoFixture.items ?? [];
const paretoResponse = {
  items: [
    {
      ...paretoSource[0],
      id: 'glm-default',
      provider_id: 'glm',
      provider_name: 'GLM 46',
      route: null,
      lane: 'balanced',
      run_count: 420,
      tokens_in: 3_200_000,
      tokens_out: 3_000_000,
      cost_usd: 1200,
      avg_latency_ms: 2450,
      success_rate: 0.82,
    },
    {
      ...paretoSource[1],
      id: 'glm-fallback',
      provider_id: 'glm',
      provider_name: 'GLM 46',
      route: 'fallback',
      lane: 'turbo',
      run_count: 180,
      tokens_in: 1_000_000,
      tokens_out: 800_000,
      cost_usd: 500,
      avg_latency_ms: 1820,
      success_rate: 0.88,
    },
    {
      ...paretoSource[2],
      id: 'glm-cache',
      provider_id: 'glm',
      provider_name: 'GLM 46',
      route: 'cache',
      lane: 'economy',
      run_count: 90,
      tokens_in: 600_000,
      tokens_out: 400_000,
      cost_usd: 300,
      avg_latency_ms: 910,
      success_rate: 0.97,
    },
  ],
};

test('@finops-plan gera e aplica plano FinOps', async ({ page }) => {
  const manifestResponse = JSON.parse(JSON.stringify(manifestFixture)) as typeof manifestFixture;

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
    const url = new URL(route.request().url());
    const payload = buildTimeseriesPayload(url.searchParams.get('end'));
    route.fulfill({ status: 200, body: JSON.stringify(payload), contentType: 'application/json' });
  });
  await page.route('**/api/v1/telemetry/runs**', (route) => {
    route.fulfill({ status: 200, body: JSON.stringify({ items: [] }), contentType: 'application/json' });
  });
  await page.route('**/api/v1/telemetry/pareto**', (route) => {
    route.fulfill({ status: 200, body: JSON.stringify(paretoResponse), contentType: 'application/json' });
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

  await expect(page.getByTestId(FINOPS_TEST_IDS.alerts.item('cost-surge'))).toBeVisible();
  await expect(page.getByText('Escalada de custo diário')).toBeVisible();
  await expect(page.getByText('Pico de tokens consumidos')).toBeVisible();
  await expect(page.getByText('Custo concentrado em uma rota')).toBeVisible();
  await expect(page.getByText('Taxa de sucesso abaixo do esperado')).toBeVisible();
  const primaryHotspotId = slugifyIdentifier(
    `${paretoResponse.items[0].provider_id}-${paretoResponse.items[0].route ?? 'default'}`,
  );
  await expect(page.getByTestId(FINOPS_TEST_IDS.hotspots.item(`cost-${primaryHotspotId}`))).toBeVisible();
  await expect(page.getByText('Rota domina o custo')).toBeVisible();
  await expect(page.getByText('Queda na confiabilidade')).toBeVisible();
  await expect(page.getByText('Latência elevada')).toBeVisible();
  await expect(page.getByText('Custo por token acima da média')).toBeVisible();

  await expect(page.getByLabel('Cost center responsável')).toHaveValue('finops-core');

  await page.getByRole('button', { name: 'Gerar plano FinOps' }).click();

  await expect(page.getByText('Atualizar políticas FinOps')).toBeVisible();
  await expect(page.getByText('policies/manifest.json')).toBeVisible();
  await expect(
    page.getByText('Atualizar manifesto FinOps (cache TTL, rate limit, graceful degradation)'),
  ).toBeVisible();

  const planPayload = planRequests[0] as {
    changes?: {
      finops?: {
        cache?: { ttl_seconds: number | null };
        rate_limit?: { requests_per_minute: number | null };
        graceful_degradation?: { strategy: string | null; message: string | null };
      };
    };
  };
  const manifestFinOps = manifestResponse.finops ?? {};
  expect(planPayload.changes?.finops?.cache?.ttl_seconds).toBe(
    manifestFinOps.cache?.ttl_seconds ?? null,
  );
  expect(planPayload.changes?.finops?.rate_limit?.requests_per_minute).toBe(
    manifestFinOps.rate_limit?.requests_per_minute ?? null,
  );
  expect(planPayload.changes?.finops?.graceful_degradation?.strategy).toBe(
    manifestFinOps.graceful_degradation?.strategy ?? null,
  );
  expect(planPayload.changes?.finops?.graceful_degradation?.message).toBe(
    manifestFinOps.graceful_degradation?.message ?? null,
  );

  await page.getByRole('button', { name: 'Aplicar plano' }).click();

  await expect(page.getByText(/Plano aplicado com sucesso/)).toBeVisible();
  await expect(page.getByText('Aplicado')).toBeVisible();

  const applyPayload = applyRequests[0] as { plan_id?: string };
  expect(applyPayload.plan_id).toBeDefined();
});
