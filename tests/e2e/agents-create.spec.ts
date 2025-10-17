import { test, expect, type Page } from '@playwright/test';

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
    {
      name: 'orchestrator-control',
      title: 'Orchestrator Control',
      version: '2.4.1',
      description: 'Orquestra prompts e fluxos de validação.',
      capabilities: ['routing', 'finops'],
      model: { provider: 'anthropic', name: 'claude-3-opus', parameters: { temperature: 0.2 } },
      status: 'degraded',
      last_deployed_at: '2025-01-03T12:30:00Z',
      owner: '@orchestrators',
    },
  ],
};

const sampleToolSchema = JSON.stringify(
  {
    type: 'object',
    properties: {
      signal: { type: 'string' },
    },
    required: ['signal'],
  },
  null,
  2,
);

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

test('cria novo agent via wizard e aplica plano com smoke opcional', async ({ page }) => {
  await registerBaseRoutes(page);

  const planRequests: unknown[] = [];
  const applyRequests: unknown[] = [];
  const smokeRequests: unknown[] = [];

  const planResponse = {
    plan: {
      intent: 'add_agent',
      summary: "Adicionar agente sentinel-watcher ao repositório agents-hub",
      steps: [
        {
          id: 'discover-server',
          title: 'Descobrir servidor MCP',
          description: 'Validar tools e schemas disponíveis antes do scaffold.',
          depends_on: [],
          actions: [],
        },
        {
          id: 'scaffold-agent',
          title: "Scaffold agent 'sentinel-watcher'",
          description: 'Gerar manifesto e stub LangGraph.',
          depends_on: ['discover-server'],
          actions: [
            {
              type: 'write_file',
              path: 'agents-hub/app/agents/sentinel-watcher/agent.yaml',
              contents: 'name: sentinel-watcher\n',
              encoding: 'utf-8',
              overwrite: false,
            },
          ],
        },
      ],
      diffs: [
        {
          path: 'agents-hub/app/agents/sentinel-watcher/agent.yaml',
          summary: 'Criar manifesto MCP inicial',
          change_type: 'create',
          diff: '--- /dev/null\n+++ agent.yaml\n+name: sentinel-watcher',
        },
        {
          path: 'agents-hub/app/agents/sentinel-watcher/agent.py',
          summary: 'Criar stub LangGraph',
          change_type: 'create',
          diff: '--- /dev/null\n+++ agent.py\n+class SentinelWatcherAgent: ...',
        },
      ],
      risks: [],
      status: 'pending',
      context: [],
      approval_rules: [],
    },
    preview: {
      branch: 'feature/add-sentinel-watcher',
      base_branch: 'main',
      commit_message: 'feat: adicionar agent sentinel-watcher',
      pull_request: {
        provider: 'github',
        title: 'feat: adicionar agent sentinel-watcher',
      },
    },
  };

  await page.route('**/api/v1/config/agents/plan', (route) => {
    planRequests.push(route.request().postDataJSON());
    route.fulfill({ status: 200, body: JSON.stringify(planResponse), contentType: 'application/json' });
  });

  const applyResponse = {
    status: 'completed',
    mode: 'branch_pr',
    plan_id: 'agent-plan-123',
    record_id: 'record-123',
    branch: 'feature/add-sentinel-watcher',
    base_branch: 'main',
    commit_sha: 'abc123',
    diff: { stat: '2 files changed', patch: 'diff --git a/agent.yaml b/agent.yaml' },
    hitl_required: false,
    message: 'Plano aplicado com sucesso.',
    pull_request: {
      provider: 'github',
      id: 'pr-77',
      number: '77',
      url: 'https://github.com/example/pr/77',
      title: 'feat: adicionar agent sentinel-watcher',
      state: 'open',
      head_sha: 'abc123',
      branch: 'feature/add-sentinel-watcher',
      ci_status: 'success',
      review_status: 'pending',
      merged: false,
      last_synced_at: '2025-01-05T12:00:00Z',
      reviewers: [],
      ci_results: [],
    },
  };

  await page.route('**/api/v1/config/apply', (route) => {
    applyRequests.push(route.request().postDataJSON());
    route.fulfill({ status: 200, body: JSON.stringify(applyResponse), contentType: 'application/json' });
  });

  const smokeResponse = {
    run_id: 'smoke-007',
    status: 'queued',
    summary: 'Smoke agendado para execução no runner.',
    report_url: 'https://runner.example/report/smoke-007',
    started_at: '2025-01-05T12:00:00Z',
    finished_at: null,
  };

  await page.route('**/agents/sentinel-watcher/smoke', (route) => {
    smokeRequests.push(route.request().postDataJSON());
    route.fulfill({ status: 200, body: JSON.stringify(smokeResponse), contentType: 'application/json' });
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'Agents' }).click();
  await page.getByRole('button', { name: '+ Novo agent' }).click();

  const wizard = page.locator('.agent-wizard');
  await expect(wizard).toBeVisible();

  await wizard.getByRole('textbox', { name: 'Identificador do agent' }).fill('sentinel-watcher');
  await wizard.getByRole('textbox', { name: 'Nome exibido' }).fill('Sentinel Watcher');
  await wizard.getByRole('textbox', { name: 'Descrição' }).fill('Observa sinais sentinela.');
  await wizard.getByRole('textbox', { name: 'Owner (opcional)' }).fill('@guardians');
  await wizard.getByRole('textbox', { name: 'Repositório de destino' }).fill('agents-hub');
  await wizard.getByRole('textbox', { name: 'Versão inicial' }).fill('0.1.0');
  await wizard.getByRole('textbox', { name: 'Provider' }).fill('openai');
  await wizard.getByRole('textbox', { name: 'Modelo' }).fill('gpt-4o-mini');
  await wizard.getByRole('textbox', { name: 'Temperatura (opcional)' }).fill('0.2');
  await wizard.getByRole('button', { name: 'Continuar' }).click();

  await wizard.getByRole('textbox', { name: 'Capabilities (separe por vírgula)' }).fill('monitoring,alerts');
  await wizard.getByRole('textbox', { name: 'Nome da tool' }).fill('check_signal');
  await wizard.getByRole('textbox', { name: 'Descrição (opcional)' }).fill('Valida estado do sinal.');
  await wizard.getByRole('textbox', { name: 'Schema JSON' }).fill(sampleToolSchema);
  await wizard.getByRole('button', { name: 'Continuar' }).click();

  await wizard.getByRole('spinbutton', { name: 'Limite de requisições por minuto' }).fill('120');
  await wizard.getByRole('spinbutton', { name: 'Execuções simultâneas' }).fill('3');
  await wizard.getByRole('combobox', { name: 'Safety mode' }).selectOption('balanced');
  await wizard.getByRole('spinbutton', { name: 'Orçamento mensal' }).fill('250');
  await wizard.getByRole('combobox', { name: 'Moeda' }).selectOption('USD');
  await wizard.getByRole('textbox', { name: 'Centro de custo' }).fill('finops-observability');

  await wizard.getByRole('button', { name: 'Gerar plano do agent' }).click();

  await expect(wizard.getByText('Plano gerado. Revise as alterações antes de aplicar.')).toBeVisible();
  await expect(wizard.getByRole('heading', { name: 'Plano de configuração' })).toBeVisible();
  await expect(
    wizard.locator('.diff-viewer__item-file').filter({ hasText: 'agents-hub/app/agents/sentinel-watcher/agent.yaml' }),
  ).toBeVisible();

  await wizard.getByRole('button', { name: 'Aplicar plano' }).click();

  await expect(wizard.getByText('Plano aplicado com sucesso.')).toBeVisible();
  await expect(wizard.getByText('Branch: feature/add-sentinel-watcher')).toBeVisible();
  await expect(wizard.getByText('Smoke do novo agent')).toBeVisible();
  await expect(wizard.getByRole('link', { name: 'Abrir relatório' })).toHaveAttribute(
    'href',
    smokeResponse.report_url,
  );

  expect(planRequests).toHaveLength(1);
  const planRequest = planRequests[0] as { agent?: { slug?: string; manifest?: { capabilities?: string[] } } };
  expect(planRequest?.agent?.slug).toBe('sentinel-watcher');
  expect(planRequest?.agent?.manifest?.capabilities).toEqual(['monitoring', 'alerts']);

  expect(applyRequests).toHaveLength(1);
  const applyRequest = applyRequests[0] as { plan_id?: string; patch?: string };
  expect(typeof applyRequest?.plan_id).toBe('string');
  expect(applyRequest?.plan_id).toMatch(/^agent-plan-/);
  expect(applyRequest?.patch).toContain('agent.yaml');

  expect(smokeRequests).toHaveLength(1);

  await wizard.getByRole('button', { name: 'Fechar' }).click();
  await expect(wizard).toBeHidden();
});

test('mostra mensagens de validação ao tentar criar agent com dados inválidos', async ({ page }) => {
  await registerBaseRoutes(page);

  const planRequests: unknown[] = [];
  await page.route('**/api/v1/config/agents/plan', (route) => {
    planRequests.push(route.request().postDataJSON());
    route.fulfill({ status: 200, body: JSON.stringify(planResponseStub()), contentType: 'application/json' });
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'Agents' }).click();
  await page.getByRole('button', { name: '+ Novo agent' }).click();

  const wizard = page.locator('.agent-wizard');
  await expect(wizard).toBeVisible();

  await wizard.getByRole('button', { name: 'Continuar' }).click();
  await expect(wizard.getByText('Informe um identificador para o agent.')).toBeVisible();

  await wizard.getByRole('textbox', { name: 'Identificador do agent' }).fill('Sentinel Watcher');
  await wizard.getByRole('button', { name: 'Continuar' }).click();
  await expect(wizard.getByText('Informe o nome exibido do agent.')).toBeVisible();

  await wizard.getByRole('textbox', { name: 'Nome exibido' }).fill('Sentinel Watcher');
  await wizard.getByRole('button', { name: 'Continuar' }).click();

  await wizard.getByRole('textbox', { name: 'Capabilities (separe por vírgula)' }).fill('');
  await wizard.getByRole('button', { name: 'Continuar' }).click();
  await expect(wizard.getByText('Informe pelo menos uma capability.')).toBeVisible();

  await wizard.getByRole('textbox', { name: 'Capabilities (separe por vírgula)' }).fill('monitoring');
  await wizard.getByRole('textbox', { name: 'Nome da tool' }).fill('check_signal');
  await wizard.getByRole('textbox', { name: 'Schema JSON' }).fill('{');
  await wizard.getByRole('button', { name: 'Continuar' }).click();
  await expect(wizard.getByText('Schema JSON inválido. Revise a estrutura.')).toBeVisible();

  await wizard.getByRole('textbox', { name: 'Schema JSON' }).fill('');
  await wizard.getByRole('button', { name: 'Continuar' }).click();
  await expect(wizard.getByText('Informe o schema JSON da tool.')).toBeVisible();

  await wizard.getByRole('textbox', { name: 'Schema JSON' }).fill(`{
  "type": "object"
}`);
  await wizard.getByRole('button', { name: 'Continuar' }).click();

  await wizard.getByRole('spinbutton', { name: 'Limite de requisições por minuto' }).fill('0');
  await wizard.getByRole('spinbutton', { name: 'Execuções simultâneas' }).fill('');
  await wizard.getByRole('spinbutton', { name: 'Orçamento mensal' }).fill('-5');
  await wizard.getByRole('textbox', { name: 'Centro de custo' }).fill('');
  await wizard.getByRole('button', { name: 'Gerar plano do agent' }).click();

  expect(planRequests).toHaveLength(0);

  await wizard.getByRole('button', { name: 'Fechar' }).click();
});

function planResponseStub() {
  return {
    plan: {
      intent: 'add_agent',
      summary: 'Plano inválido',
      steps: [],
      diffs: [],
      risks: [],
      status: 'pending',
      context: [],
      approval_rules: [],
    },
  };
}
