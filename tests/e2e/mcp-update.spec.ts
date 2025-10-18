import { test, expect } from '@playwright/test';

test.describe('Atualizações assistidas de servidores MCP', () => {
  const serverCatalog = {
    servers: [
      {
        id: 'server-1',
        name: 'Gemini MCP',
        command: './run-mcp --profile production',
        description: 'Servidor MCP de faturamento',
        tags: ['finops'],
        capabilities: ['metrics'],
        transport: 'stdio',
        created_at: '2025-01-10T10:00:00Z',
        updated_at: '2025-01-10T10:00:00Z',
      },
    ],
  };

  const planPayload = {
    plan_id: 'plan-1',
    summary: 'Atualizar manifesto do servidor MCP',
    message: 'Plano gerado para revisar manifesto e descrição.',
    diffs: [
      {
        id: 'diff-1',
        title: 'agents/gemini/agent.yaml',
        summary: 'Atualiza owner e tags do manifesto',
        diff: '--- a/agent.yaml\n+++ b/agent.yaml\n+owner: platform-team',
      },
    ],
  };

  const applyPayload = {
    status: 'applied',
    message: 'Atualização enviada com sucesso.',
    record_id: 'rec-1',
    branch: 'feature/mcp-update',
    pull_request: {
      provider: 'github',
      id: 'pr-101',
      number: '101',
      url: 'https://github.com/mcp/console/pull/101',
      title: 'Atualizar manifesto Gemini MCP',
      state: 'open',
      head_sha: 'abc123',
      branch: 'feature/mcp-update',
      merged: false,
    },
  };

  test.beforeEach(async ({ page }) => {
    await page.route('**/api/v1/servers', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(serverCatalog) }),
    );
    await page.route('**/api/v1/sessions', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sessions: [] }) }),
    );
    await page.route('**/api/v1/secrets', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ secrets: [] }) }),
    );
    await page.route('**/api/v1/providers', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ providers: [] }) }),
    );
    await page.route('**/api/v1/telemetry/metrics', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ buckets: [] }) }),
    );
    await page.route('**/api/v1/telemetry/heatmap', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ heatmap: [] }) }),
    );
    await page.route('**/api/v1/policies/compliance', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'pass', items: [] }) }),
    );
    await page.route('**/api/v1/config/chat', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ threadId: 'thread-1', messages: [] }),
      }),
    );
    await page.route('**/api/v1/notifications', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ notifications: [] }),
      }),
    );
  });

  test('@mcp-update aplica plano de atualização de servidor MCP', async ({ page }) => {
    const planRequests: Record<string, unknown>[] = [];
    const applyRequests: Record<string, unknown>[] = [];

    await page.route('**/api/v1/config/mcp/update', (route) => {
      const body = route.request().postData();
      const payload = body ? (JSON.parse(body) as Record<string, unknown>) : {};
      if (payload.mode === 'plan') {
        planRequests.push(payload);
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(planPayload),
        });
      }
      if (payload.mode === 'apply') {
        applyRequests.push(payload);
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(applyPayload),
        });
      }
      return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({}) });
    });

    await page.goto('/');
    await page.getByRole('button', { name: 'Admin Chat' }).click();
    await expect(page.getByRole('heading', { name: 'Servidores MCP assistidos' })).toBeVisible();

    const serverCard = page.getByRole('article', { name: 'Gemini MCP' });
    await serverCard.getByLabel('Descrição').fill('Servidor MCP com auditoria contínua');
    await serverCard.getByRole('button', { name: 'Gerar plano' }).click();

    const modal = page.getByRole('dialog', { name: /Revisar plano/ });
    await expect(modal.getByText('Atualiza owner e tags do manifesto')).toBeVisible();

    await modal.getByLabel('Autor da alteração').fill('Joana MCP');
    await modal.getByLabel('E-mail do autor').fill('joana@example.com');
    await modal.getByLabel('Mensagem do commit').fill('chore: atualizar manifesto gemini mcp');
    await modal.getByLabel('Nota adicional (opcional)').fill('Sincronizar owners com FinOps');

    await modal.getByRole('button', { name: 'Aplicar atualização' }).click();

    await expect(page.getByText(/Atualização enviada com sucesso\./)).toBeVisible();
    await expect(page.getByText(/Registro: rec-1/)).toBeVisible();
    await expect(page.getByText(/Branch: feature\/mcp-update/)).toBeVisible();
    await expect(page.getByText(/PR: https:\/\/github.com\/mcp\/console\/pull\/101/)).toBeVisible();

    expect(planRequests).toHaveLength(1);
    expect(planRequests[0].mode).toBe('plan');
    expect(planRequests[0].server_id).toBe('server-1');
    expect(planRequests[0].changes).toMatchObject({ description: 'Servidor MCP com auditoria contínua' });

    expect(applyRequests).toHaveLength(1);
    expect(applyRequests[0].mode).toBe('apply');
    expect(applyRequests[0].plan_id).toBe('plan-1');
    expect(applyRequests[0].actor).toBe('Joana MCP');
    expect(applyRequests[0].actor_email).toBe('joana@example.com');
    expect(applyRequests[0].note).toBe('Sincronizar owners com FinOps');
  });
});
