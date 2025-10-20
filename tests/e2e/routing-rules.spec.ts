import { expect, test } from './fixtures';

test('gera e aplica plano de roteamento com intents customizadas', async ({ page }) => {
  const providersResponse = {
    providers: [
      {
        id: 'provider-balanced-1',
        name: 'Balanced Provider',
        command: 'run-balanced',
        description: 'Lane equilibrado',
        tags: ['balanced'],
        capabilities: ['chat'],
        transport: 'http',
      },
      {
        id: 'provider-turbo-1',
        name: 'Turbo Provider',
        command: 'run-turbo',
        description: 'Lane turbo',
        tags: ['turbo'],
        capabilities: ['chat'],
        transport: 'http',
      },
    ],
  };

  const manifestResponse = {
    policies: { confidence: { approval: 0.9, rejection: 0.4 } },
    routing: {
      max_iters: 4,
      max_attempts: 2,
      request_timeout_seconds: 30,
      total_timeout_seconds: 120,
      default_tier: 'balanced',
      allowed_tiers: ['balanced', 'turbo'],
      fallback_tier: 'turbo',
      intents: [
        {
          intent: 'baseline.general',
          description: 'Intent padrão',
          tags: ['baseline'],
          default_tier: 'balanced',
          fallback_provider_id: null,
        },
      ],
      rules: [
        {
          id: 'baseline-rule',
          description: 'Mantém distribuição padrão',
          intent: 'baseline.general',
          matcher: 'true',
          target_tier: 'balanced',
          provider_id: null,
          weight: null,
        },
      ],
    },
    finops: { cost_center: 'mlops', budgets: [], alerts: [] },
    hitl: {
      enabled: false,
      checkpoints: [],
      pending_approvals: 0,
      updated_at: '2025-01-10T09:00:00Z',
    },
    runtime: {
      max_iters: 4,
      timeouts: { per_iteration: 30, total: 120 },
      retry: { max_attempts: 2, initial_delay: 1, backoff_factor: 2, max_delay: 4 },
      tracing: { enabled: false, sample_rate: 0.1, exporter: 'otlp' },
    },
    overrides: null,
    updated_at: '2025-01-10T10:00:00Z',
  };

  const simulationResponse = {
    total_cost: 120,
    cost_per_million: 10,
    avg_latency: 820,
    reliability_score: 96.5,
    distribution: [
      {
        route: {
          id: 'route-1',
          provider: {
            id: 'provider-turbo-1',
            name: 'Turbo Provider',
            command: 'run-turbo',
            description: 'Lane turbo',
            tags: ['turbo'],
            capabilities: ['chat'],
            transport: 'http',
          },
          lane: 'turbo',
          cost_per_million: 10,
          latency_p95: 700,
          reliability: 0.98,
          capacity_score: 0.9,
        },
        share: 0.6,
        tokens_millions: 6,
        cost: 60,
      },
    ],
    excluded_route: null,
  };

  const planPayloads: unknown[] = [];
  const applyPayloads: unknown[] = [];

  const planResponse = {
    plan: {
      intent: 'edit_routing',
      summary: 'Atualizar intents e regras de roteamento',
      steps: [
        {
          id: 'review-routing',
          title: 'Revisar alterações',
          description: 'Validar intents e regras antes de aplicar.',
          depends_on: [],
          actions: [],
        },
      ],
      diffs: [
        {
          path: 'policies/manifest.json',
          summary: 'Atualizar manifesto de roteamento',
          change_type: 'update',
          diff: 'diff --git a/policies/manifest.json b/policies/manifest.json',
        },
      ],
      risks: [],
      status: 'pending',
      context: [],
      approval_rules: [],
    },
    planPayload: {
      intent: 'edit_routing',
      summary: 'Atualizar intents e regras de roteamento',
      steps: [
        {
          id: 'review-routing',
          title: 'Revisar alterações',
          description: 'Validar intents e regras antes de aplicar.',
          depends_on: [],
          actions: [],
        },
      ],
      diffs: [
        {
          path: 'policies/manifest.json',
          summary: 'Atualizar manifesto de roteamento',
          change_type: 'update',
          diff: 'diff --git a/policies/manifest.json b/policies/manifest.json',
        },
      ],
      risks: [],
      status: 'pending',
      context: [],
      approval_rules: [],
    },
    preview: null,
    previewPayload: null,
  };

  const applyResponse = {
    status: 'completed',
    mode: 'branch_pr',
    plan_id: 'plan-routing-1',
    record_id: 'rec-routing-1',
    branch: 'chore/config-assistant/routing-plan',
    base_branch: 'main',
    commit_sha: 'def5678',
    diff: {
      stat: '1 file changed, 12 insertions(+)',
      patch: 'diff --git a/policies/manifest.json b/policies/manifest.json',
    },
    hitl_required: false,
    message: 'Plano de roteamento aplicado com sucesso.',
    pull_request: {
      provider: 'github',
      id: 'pr-202',
      number: '202',
      url: 'https://github.com/mcp/routing/pull/202',
      title: 'feat: atualizar intents e regras',
      state: 'open',
      head_sha: 'def5678',
      ci_status: 'success',
      review_status: 'approved',
      merged: false,
      last_synced_at: '2025-01-10T12:05:00Z',
    },
  };

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
  await page.route('**/api/v1/providers', (route) =>
    route.fulfill({ status: 200, body: JSON.stringify(providersResponse), contentType: 'application/json' }),
  );
  await page.route('**/api/v1/telemetry/metrics', (route) =>
    route.fulfill({ status: 200, body: JSON.stringify({ buckets: [] }), contentType: 'application/json' }),
  );
  await page.route('**/api/v1/telemetry/heatmap', (route) =>
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

  await page.route('**/api/v1/policies/manifest', (route) =>
    route.fulfill({ status: 200, body: JSON.stringify(manifestResponse), contentType: 'application/json' }),
  );

  await page.route('**/api/v1/routing/simulate', (route) =>
    route.fulfill({ status: 200, body: JSON.stringify(simulationResponse), contentType: 'application/json' }),
  );

  await page.route('**/api/v1/config/policies', (route) => {
    planPayloads.push(route.request().postDataJSON());
    return route.fulfill({ status: 200, body: JSON.stringify(planResponse), contentType: 'application/json' });
  });

  await page.route('**/api/v1/config/apply', (route) => {
    applyPayloads.push(route.request().postDataJSON());
    return route.fulfill({ status: 200, body: JSON.stringify(applyResponse), contentType: 'application/json' });
  });

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

  await page.getByRole('button', { name: 'Gerar plano' }).click();
  await expect(page.getByRole('heading', { name: 'Confirmar alterações de roteamento' })).toBeVisible();

  expect(planPayloads).toHaveLength(1);
  const planRequest = planPayloads[0] as { changes: { routing: { intents: Array<any>; rules: Array<any> } } };
  expect(planRequest.changes.routing.intents).toHaveLength(2);
  expect(planRequest.changes.routing.rules).toHaveLength(2);
  const newIntent = planRequest.changes.routing.intents.find((intent) => intent.intent === 'support.escalate');
  expect(newIntent).toMatchObject({
    intent: 'support.escalate',
    default_tier: 'turbo',
    fallback_provider_id: 'provider-turbo-1',
  });
  const newRule = planRequest.changes.routing.rules.find((rule) => rule.id === 'force-escalation');
  expect(newRule).toMatchObject({
    intent: 'support.escalate',
    matcher: "intent == 'support.escalate'",
    target_tier: 'turbo',
    provider_id: 'provider-turbo-1',
    weight: 75,
  });

  await page.getByLabel('Autor da alteração').fill('Joana Planner');
  await page.getByLabel('E-mail do autor').fill('joana@example.com');
  await page.getByLabel('Mensagem do commit').fill('feat: atualizar intents e regras');

  await page.getByRole('button', { name: 'Aplicar plano' }).click();
  await expect(page.getByText('Plano de roteamento aplicado com sucesso.')).toBeVisible();

  expect(applyPayloads).toHaveLength(1);
  const applyRequest = applyPayloads[0] as {
    actor: string;
    actor_email: string;
    commit_message: string;
  };
  expect(applyRequest.actor).toBe('Joana Planner');
  expect(applyRequest.actor_email).toBe('joana@example.com');
  expect(applyRequest.commit_message).toBe('feat: atualizar intents e regras');
});

test('exibe erro quando geração de plano falha', async ({ page }) => {
  const providersResponse = {
    providers: [
      {
        id: 'provider-balanced-1',
        name: 'Balanced Provider',
        command: 'run-balanced',
        description: 'Lane equilibrado',
        tags: ['balanced'],
        capabilities: ['chat'],
        transport: 'http',
      },
    ],
  };

  const manifestResponse = {
    policies: { confidence: { approval: 0.9, rejection: 0.4 } },
    routing: {
      max_iters: 4,
      max_attempts: 2,
      request_timeout_seconds: 30,
      total_timeout_seconds: 120,
      default_tier: 'balanced',
      allowed_tiers: ['balanced'],
      fallback_tier: null,
      intents: [],
      rules: [],
    },
    finops: { cost_center: 'mlops', budgets: [], alerts: [] },
    hitl: { enabled: false, checkpoints: [], pending_approvals: 0, updated_at: null },
    runtime: {
      max_iters: 4,
      timeouts: { per_iteration: 30, total: 120 },
      retry: { max_attempts: 2, initial_delay: 1, backoff_factor: 2, max_delay: 4 },
      tracing: { enabled: false, sample_rate: 0.1, exporter: 'otlp' },
    },
    overrides: null,
    updated_at: '2025-01-10T10:00:00Z',
  };

  const planPayloads: unknown[] = [];

  const simulationResponse = {
    total_cost: 120,
    cost_per_million: 10,
    avg_latency: 820,
    reliability_score: 96.5,
    distribution: [
      {
        route: {
          id: 'route-1',
          provider: {
            id: 'provider-balanced-1',
            name: 'Balanced Provider',
            command: 'run-balanced',
            description: 'Lane equilibrado',
            tags: ['balanced'],
            capabilities: ['chat'],
            transport: 'http',
          },
          lane: 'balanced',
          cost_per_million: 10,
          latency_p95: 900,
          reliability: 0.97,
          capacity_score: 0.8,
        },
        share: 1,
        tokens_millions: 10,
        cost: 120,
      },
    ],
    excluded_route: null,
  };

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
  await page.route('**/api/v1/providers', (route) =>
    route.fulfill({ status: 200, body: JSON.stringify(providersResponse), contentType: 'application/json' }),
  );
  await page.route('**/api/v1/telemetry/metrics', (route) =>
    route.fulfill({ status: 200, body: JSON.stringify({ buckets: [] }), contentType: 'application/json' }),
  );
  await page.route('**/api/v1/telemetry/heatmap', (route) =>
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

  await page.route('**/api/v1/policies/manifest', (route) =>
    route.fulfill({ status: 200, body: JSON.stringify(manifestResponse), contentType: 'application/json' }),
  );

  await page.route('**/api/v1/routing/simulate', (route) =>
    route.fulfill({ status: 200, body: JSON.stringify(simulationResponse), contentType: 'application/json' }),
  );

  await page.route('**/api/v1/config/policies', (route) => {
    planPayloads.push(route.request().postDataJSON());
    return route.fulfill({ status: 500, body: JSON.stringify({ message: 'error' }), contentType: 'application/json' });
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'Routing' }).click();
  await expect(page.getByRole('heading', { name: 'Intents direcionadas' })).toBeVisible();

  await page.getByRole('button', { name: 'Gerar plano' }).click();
  await expect(page.getByText('Falha ao gerar plano de atualização. Tente novamente.')).toBeVisible();
  expect(planPayloads).toHaveLength(1);
  await expect(page.getByRole('heading', { name: 'Confirmar alterações de roteamento' })).toHaveCount(0);
});
