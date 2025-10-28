import { expect, test } from './fixtures';

test.describe('Atualizações assistidas de servidores MCP', () => {
  const serverCatalog = {
    servers: [
      {
        id: 'gemini',
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

  const applyPayload = {
    status: 'applied',
    message: 'Atualização enviada com sucesso via fixtures.',
    record_id: 'mcp-update-record-fixture',
    branch: 'feature/fixtures',
    pull_request: {
      provider: 'github',
      id: 'pr-fixture',
      number: '101',
      url: 'https://github.com/example/console-mcp/pull/101',
      title: 'Atualizar manifesto Gemini MCP (fixtures)',
      state: 'open',
      head_sha: 'f1x7ur3',
      branch: 'feature/fixtures',
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
    await page.goto('/');
    await page.waitForSelector('role=status[name="Carregando Dashboard…"]', { state: 'detached' });
    await page.getByRole('link', { name: 'Admin Chat' }).click();
    await page.waitForSelector('role=status[name="Carregando Admin Chat…"]', { state: 'detached' });
    const serverCard = page.getByRole('article', { name: 'Gemini MCP' });
    await serverCard.getByLabel('Descrição').fill('Servidor MCP com auditoria contínua');
    const planResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes('/api/v1/config/mcp/update') &&
        response.request().method() === 'POST' &&
        response.request().postData()?.includes('"mode":"plan"'),
    );
    const planRequestPromise = page.waitForRequest(
      (request) =>
        request.url().includes('/api/v1/config/mcp/update') &&
        request.method() === 'POST' &&
        request.postData()?.includes('"mode":"plan"'),
    );
    await Promise.all([
      planResponsePromise,
      serverCard.getByRole('button', { name: 'Gerar plano' }).click(),
    ]);
    const planRequest = await planRequestPromise;
    const planPayloadCaptured = JSON.parse(planRequest.postData() ?? '{}') as {
      mode?: string;
      server_id?: string;
      changes?: Record<string, unknown>;
    };
    expect(planPayloadCaptured.mode).toBe('plan');
    expect(planPayloadCaptured.server_id).toBe('gemini');
    expect(planPayloadCaptured.changes).toMatchObject({ description: 'Servidor MCP com auditoria contínua' });
    const planResponseData = (await planResponsePromise.then((response) => response.json())) as {
      plan_id?: string;
    };
    const planIdFromResponse =
      typeof planResponseData.plan_id === 'string' ? planResponseData.plan_id : 'mcp-update-plan-fixture';

    const modal = page.getByRole('dialog', { name: /Revisar plano/ });
    await expect(modal.getByText('Atualiza owner e descrição.')).toBeVisible();

    await modal.getByLabel('Autor da alteração').fill('Joana MCP');
    await modal.getByLabel('E-mail do autor').fill('joana@example.com');
    await modal.getByLabel('Mensagem do commit').fill('chore: atualizar manifesto gemini mcp');
    await modal.getByLabel('Nota adicional (opcional)').fill('Sincronizar owners com FinOps');

    const applyRequestPromise = page.waitForRequest(
      (request) =>
        request.url().includes('/api/v1/config/mcp/update') &&
        request.method() === 'POST' &&
        request.postData()?.includes('"mode":"apply"'),
    );
    const applyResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes('/api/v1/config/mcp/update') &&
        response.request().method() === 'POST' &&
        response.request().postData()?.includes('"mode":"apply"'),
    );
    await modal.getByRole('button', { name: 'Aplicar atualização' }).click();
    const applyRequestCaptured = await applyRequestPromise;
    await applyResponsePromise;
    const applyPayloadCaptured = JSON.parse(applyRequestCaptured.postData() ?? '{}') as {
      mode?: string;
      plan_id?: string;
      actor?: string;
      actor_email?: string;
      note?: string | null;
    };

    const resultPanel = page.locator('.mcp-servers__result');
    await expect(resultPanel).toBeVisible();
    await expect(resultPanel).toContainText(applyPayload.message);
    await expect(resultPanel).toContainText(`Registro: ${applyPayload.record_id}`);
    await expect(resultPanel).toContainText(`Branch: ${applyPayload.branch}`);
    await expect(resultPanel).toContainText(`PR: ${applyPayload.pull_request.url}`);

    expect(applyPayloadCaptured.mode).toBe('apply');
    expect(applyPayloadCaptured.plan_id).toBe(planIdFromResponse);
    expect(applyPayloadCaptured.actor).toBe('Joana MCP');
    expect(applyPayloadCaptured.actor_email).toBe('joana@example.com');
    expect(applyPayloadCaptured.note).toBe('Sincronizar owners com FinOps');
  });
});
