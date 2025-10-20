import { expect, test } from './fixtures';
import type { Page } from '@playwright/test';

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

const serversResponse = {
  servers: [
    {
      id: 'catalog',
      name: 'Catalog MCP',
      command: 'python app.py',
      description: 'Catálogo estruturado',
      tags: [],
      capabilities: ['search'],
      transport: 'stdio',
    },
  ],
};

async function registerBaseRoutes(page: Page) {
  await page.route('**/api/v1/servers', (route) =>
    route.fulfill({ status: 200, body: JSON.stringify(serversResponse), contentType: 'application/json' }),
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

test.describe('@agent-create', () => {
  test('cria novo agent governado e aplica plano', async ({ page }) => {
    await registerBaseRoutes(page);

    const planRequests: unknown[] = [];
    const applyRequests: unknown[] = [];

    const planResponse = {
      plan: {
        intent: 'add_agent',
        summary: "Adicionar agente sentinel-watcher ao repositório agents-hub",
        steps: [
          {
            id: 'scaffold-agent',
            title: "Scaffold agent 'sentinel-watcher'",
            description: 'Gerar manifesto e stub LangGraph.',
            depends_on: [],
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
        ],
        risks: [
          {
            title: 'Revisar variáveis de ambiente',
            impact: 'médio',
            mitigation: 'Confirmar segredos no cofre.',
          },
        ],
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

    await page.route('**/api/v1/config/agents?intent=plan', (route) => {
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

    await page.route('**/api/v1/config/agents/apply', (route) => {
      applyRequests.push(route.request().postDataJSON());
      route.fulfill({ status: 200, body: JSON.stringify(applyResponse), contentType: 'application/json' });
    });

    await page.goto('/');
    await page.getByRole('button', { name: 'Agents' }).click();
    await page.getByRole('button', { name: '+ Novo agent' }).click();

    const wizard = page.locator('.agent-wizard');
    await expect(wizard).toBeVisible();

    await wizard.getByRole('textbox', { name: 'Identificador do agent' }).fill('sentinel-watcher');
    await wizard
      .getByRole('textbox', { name: 'Manifesto base (JSON)' })
      .fill('{"title":"Sentinel Watcher","capabilities":["monitoring"],"tools":[]}');

    await wizard.getByRole('checkbox', { name: /Catalog MCP/ }).check();

    await wizard.getByRole('button', { name: 'Gerar plano governado' }).click();

    await expect(wizard.getByText('Plano gerado. Revise as alterações antes de aplicar.')).toBeVisible();
    await expect(
      wizard.locator('.diff-viewer__item-file').filter({ hasText: 'agents-hub/app/agents/sentinel-watcher/agent.yaml' }),
    ).toBeVisible();
    await expect(wizard.getByText('Riscos identificados')).toBeVisible();
    await expect(wizard.getByLabelText('Mensagem do commit')).toHaveValue(
      planResponse.preview.commit_message,
    );

    await wizard.getByRole('button', { name: 'Aplicar plano' }).click();

    await expect(wizard.getByText(/Plano aplicado com sucesso\./)).toBeVisible();
    await expect(wizard.getByText(/Branch: feature\/add-sentinel-watcher/)).toBeVisible();
    await expect(wizard.getByRole('link', { name: 'Abrir pull request aprovado' })).toHaveAttribute(
      'href',
      applyResponse.pull_request.url,
    );

    expect(planRequests).toHaveLength(1);
    const planRequest = planRequests[0] as {
      agent?: { slug?: string; manifest?: { name?: string } };
      manifestSource?: string;
      mcpServers?: string[];
    };
    expect(planRequest?.agent?.slug).toBe('sentinel-watcher');
    expect(planRequest?.agent?.manifest?.name).toBe('sentinel-watcher');
    expect(planRequest?.manifestSource).toContain('Sentinel Watcher');
    expect(planRequest?.mcpServers).toEqual(['catalog']);

    expect(applyRequests).toHaveLength(1);
    const applyRequest = applyRequests[0] as { plan_id?: string; commit_message?: string };
    expect(applyRequest?.plan_id).toMatch(/^agent-plan-/);
    expect(applyRequest?.commit_message).toBe(planResponse.preview.commit_message);

    await wizard.getByRole('button', { name: 'Fechar' }).click();
    await expect(wizard).toBeHidden();
  });

  test('exibe validações do wizard governado', async ({ page }) => {
    await registerBaseRoutes(page);

    const planRequests: unknown[] = [];

    await page.route('**/api/v1/config/agents?intent=plan', (route) => {
      planRequests.push(route.request().postDataJSON());
      route.fulfill({
        status: 200,
        body: JSON.stringify({ plan: { intent: 'add_agent', summary: 'Stub', steps: [], diffs: [], risks: [], status: 'pending', context: [], approval_rules: [] } }),
        contentType: 'application/json',
      });
    });

    await page.goto('/');
    await page.getByRole('button', { name: 'Agents' }).click();
    await page.getByRole('button', { name: '+ Novo agent' }).click();

    const wizard = page.locator('.agent-wizard');
    await expect(wizard).toBeVisible();

    await wizard.getByRole('button', { name: 'Gerar plano governado' }).click();
    await expect(wizard.getByText('Informe o identificador do agent.')).toBeVisible();

    await wizard.getByRole('textbox', { name: 'Identificador do agent' }).fill('sentinel-watcher');
    await wizard.getByRole('textbox', { name: 'Manifesto base (JSON)' }).fill('{');
    await wizard.getByRole('button', { name: 'Gerar plano governado' }).click();
    await expect(wizard.getByText('Manifesto base inválido. Forneça JSON válido.')).toBeVisible();

    await wizard
      .getByRole('textbox', { name: 'Manifesto base (JSON)' })
      .fill('{"name":"sentinel-watcher"}');
    await wizard.getByRole('button', { name: 'Gerar plano governado' }).click();
    await expect(wizard.getByText('Selecione pelo menos um servidor MCP.')).toBeVisible();

    expect(planRequests).toHaveLength(0);

    await wizard.getByRole('button', { name: 'Fechar' }).click();
  });
});
