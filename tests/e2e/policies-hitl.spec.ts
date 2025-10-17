import { test, expect } from '@playwright/test';

test('gera e aplica plano de políticas com HITL', async ({ page }) => {
  const templatesResponse = {
    templates: [
      {
        id: 'balanced',
        name: 'Balanced Rollout',
        tagline: 'Equilíbrio entre custo e latência',
        description: 'Distribuição recomendada entre provedores MCP.',
        priceDelta: '+5%',
        latencyTarget: 'p95 1500ms',
        guardrailLevel: 'Moderado',
        features: ['Canário automático', 'Monitoramento contínuo'],
      },
    ],
    rollout: null,
  };

  const deploymentsResponse = {
    deployments: [
      {
        id: 'deploy-1',
        template_id: 'balanced',
        deployed_at: '2025-01-10T12:00:00Z',
        author: 'Console MCP',
        window: 'Staged rollout',
        note: 'Deploy inicial para frota MCP.',
        slo_p95_ms: 1500,
        budget_usage_pct: 45,
        incidents_count: 0,
        guardrail_score: 92,
        created_at: '2025-01-10T11:00:00Z',
        updated_at: '2025-01-10T12:00:00Z',
      },
    ],
    activeId: 'deploy-1',
  };

  const manifestResponse = {
    policies: {
      confidence: {
        approval: 0.9,
        rejection: 0.7,
      },
    },
    routing: {
      max_iters: 4,
      max_attempts: 2,
      request_timeout_seconds: 30,
      total_timeout_seconds: 120,
      default_tier: 'balanced',
      allowed_tiers: ['balanced', 'turbo'],
      fallback_tier: 'economy',
    },
    finops: {
      cost_center: 'main',
      budgets: [],
      alerts: [],
    },
    hitl: {
      enabled: false,
      checkpoints: [],
      pending_approvals: 0,
      updated_at: '2025-01-10T10:00:00Z',
    },
    runtime: {
      max_iters: 4,
      timeouts: { per_iteration: 30, total: 120 },
      retry: { max_attempts: 2, initial_delay: 1, backoff_factor: 2, max_delay: 4 },
      tracing: { enabled: true, sample_rate: 0.1, exporter: 'otlp' },
    },
    overrides: null,
    updated_at: '2025-01-10T10:00:00Z',
  };

  const hitlQueueResponse = { pending: [], resolved: [], updated_at: '2025-01-10T09:00:00Z' };

  const planPayloads: unknown[] = [];
  const applyPayloads: unknown[] = [];

  const planResponse = {
    plan: {
      intent: 'edit_policies',
      summary: 'Atualizar runtime e checkpoints HITL do manifesto',
      steps: [
        {
          id: 'review-policy',
          title: 'Revisar alterações',
          description: 'Validar ajustes de runtime e HITL antes de aplicar.',
          depends_on: [],
          actions: [],
        },
      ],
      diffs: [
        {
          path: 'policies/manifest.json',
          summary: 'Atualizar manifesto com novas configurações',
          change_type: 'update',
        },
      ],
      risks: [],
      status: 'pending',
      context: [],
      approval_rules: [],
    },
  };

  const applyResponse = {
    status: 'completed',
    mode: 'branch_pr',
    plan_id: 'plan-manifest-1',
    record_id: 'rec-manifest-1',
    branch: 'chore/config-assistant/runtime-plan',
    base_branch: 'main',
    commit_sha: 'abc1234',
    diff: { stat: '1 file changed, 6 insertions(+)', patch: 'diff --git a/policies/manifest.json b/policies/manifest.json' },
    hitl_required: false,
    message: 'Plano aplicado com sucesso.',
    pull_request: {
      provider: 'github',
      id: 'pr-101',
      number: '101',
      url: 'https://github.com/mcp/runtime/pull/101',
      title: 'feat: atualizar runtime e HITL',
      state: 'open',
      head_sha: 'abc1234',
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
    route.fulfill({ status: 200, body: JSON.stringify({ providers: [] }), contentType: 'application/json' }),
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

  await page.route('**/api/v1/policies/templates', (route) =>
    route.fulfill({ status: 200, body: JSON.stringify(templatesResponse), contentType: 'application/json' }),
  );
  await page.route('**/api/v1/policies/deployments', (route) =>
    route.fulfill({ status: 200, body: JSON.stringify(deploymentsResponse), contentType: 'application/json' }),
  );
  await page.route('**/api/v1/policies/manifest', (route) =>
    route.fulfill({ status: 200, body: JSON.stringify(manifestResponse), contentType: 'application/json' }),
  );
  await page.route('**/api/v1/policies/hitl/queue', (route) =>
    route.fulfill({ status: 200, body: JSON.stringify(hitlQueueResponse), contentType: 'application/json' }),
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
  await page.getByRole('button', { name: 'Políticas' }).click();
  await expect(page.getByRole('heading', { name: 'Runtime, timeouts e tracing' })).toBeVisible();

  await page.getByLabel('Máximo de iterações').fill('8');
  await page.getByLabel('Timeout por iteração (s)').fill('45');
  await page.getByLabel('Timeout total (s)').fill('200');
  await page.getByLabel('Sample rate de tracing (%)').fill('15');

  await page.getByLabel('Exigir aprovação humana para este agente').check();
  await page.getByRole('button', { name: 'Adicionar checkpoint' }).click();
  await page.getByPlaceholder('ex.: Ops review').fill('Ops Review');
  await page.getByPlaceholder('Contextualize o checkpoint').fill('Validação operacional completa.');
  await page.getByLabel('Obrigatório para continuar').check();
  await page.getByLabel('Escalonamento').selectOption('slack');

  await page.getByRole('button', { name: 'Gerar plano' }).click();

  const dialog = page.getByRole('dialog', { name: 'Confirmar alterações nas políticas' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Atualizar manifesto com novas configurações')).toBeVisible();

  await dialog.getByLabel('Autor da alteração').fill('Patrícia SRE');
  await dialog.getByLabel('E-mail do autor').fill('patricia.sre@example.com');
  await dialog.getByLabel('Mensagem do commit').fill('feat: ajustar runtime e HITL');

  expect(planPayloads).toHaveLength(1);
  const planPayload = planPayloads[0] as Record<string, unknown>;
  expect(planPayload.policy_id).toBe('manifest');
  const changes = planPayload.changes as Record<string, any>;
  expect(changes.runtime.max_iters).toBe(8);
  expect(changes.runtime.timeouts.per_iteration).toBe(45);
  expect(changes.runtime.timeouts.total).toBe(200);
  expect(changes.runtime.tracing.enabled).toBe(true);
  expect(changes.runtime.tracing.sample_rate).toBeCloseTo(0.15, 5);
  expect(changes.hitl.enabled).toBe(true);
  expect(Array.isArray(changes.hitl.checkpoints)).toBe(true);
  expect(changes.hitl.checkpoints[0].name).toBe('Ops Review');
  expect(changes.hitl.checkpoints[0].required).toBe(true);
  expect(changes.hitl.checkpoints[0].escalation_channel).toBe('slack');

  await dialog.getByRole('button', { name: 'Aplicar plano' }).click();

  await expect(dialog).toBeHidden();
  await expect(page.getByText('Plano aplicado com sucesso.', { exact: false })).toBeVisible();
  await expect(page.getByText('Branch: chore/config-assistant/runtime-plan')).toBeVisible();
  await expect(page.getByText('PR: https://github.com/mcp/runtime/pull/101')).toBeVisible();

  expect(applyPayloads).toHaveLength(1);
  const applyPayload = applyPayloads[0] as Record<string, unknown>;
  expect(typeof applyPayload.plan_id).toBe('string');
  expect(applyPayload.actor).toBe('Patrícia SRE');
  expect(applyPayload.actor_email).toBe('patricia.sre@example.com');
  expect(applyPayload.commit_message).toBe('feat: ajustar runtime e HITL');
  const patch = applyPayload.patch as string;
  expect(patch).toContain('policies/manifest.json');
  expect(patch).toContain('"sampleRate": 0.15');
  expect(patch).toContain('"enabled": true');
  expect(patch).toContain('Ops Review');
});
