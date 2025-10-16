import { test, expect } from '@playwright/test';

test('permite editar e remover servidores MCP via interface', async ({ page }) => {
  const provider = {
    id: 'gemini',
    name: 'Gemini MCP',
    description: 'Servidor principal',
    command: '~/.local/bin/gemini',
    capabilities: ['chat'],
    tags: ['llm'],
    transport: 'stdio',
  };

  let serverRecord: (typeof provider & { created_at: string; updated_at: string }) | null = {
    id: provider.id,
    name: provider.name,
    command: provider.command,
    description: provider.description,
    tags: provider.tags,
    capabilities: provider.capabilities,
    transport: provider.transport,
    created_at: '2024-06-01T09:55:00.000Z',
    updated_at: '2024-06-01T09:55:00.000Z',
  };

  let healthChecks = [
    {
      status: 'healthy',
      checked_at: '2024-06-01T11:00:00.000Z',
      latency_ms: 245,
      message: 'Ping automatizado dentro do SLA.',
      actor: 'console-mcp',
      plan_id: 'plan-operacoes',
    },
    {
      status: 'degraded',
      checked_at: '2024-06-01T10:30:00.000Z',
      latency_ms: 980,
      message: 'Oscilação detectada durante deploy canário.',
      actor: 'mcp-telemetry',
      plan_id: 'plan-operacoes',
    },
  ];

  let lastUpdatePayload: unknown = null;
  let deleteConfirmed = false;

  const processLogs = [
    {
      id: '1',
      timestamp: '2024-06-01T10:00:00.000Z',
      level: 'info',
      message: 'Processo iniciado pelo supervisor (PID 321).',
    },
  ];

  function buildProcessSnapshot() {
    return {
      server_id: provider.id,
      status: 'running',
      command: serverRecord?.command ?? provider.command,
      pid: 321,
      started_at: '2024-06-01T10:00:00.000Z',
      stopped_at: null,
      return_code: null,
      last_error: null,
      logs: processLogs,
      cursor: '1',
    };
  }

  await page.route('**/api/v1/servers', (route) => {
    if (!serverRecord) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ servers: [] }) });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ servers: [serverRecord] }),
    });
  });

  await page.route('**/api/v1/servers/processes', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ processes: serverRecord ? [buildProcessSnapshot()] : [] }),
    }),
  );

  await page.route(`**/api/v1/servers/${provider.id}/process/logs**`, (route) => {
    const url = new URL(route.request().url());
    const cursor = url.searchParams.get('cursor');
    if (!cursor || cursor === '1') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ logs: processLogs, cursor: '1' }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ logs: [], cursor }),
    });
  });

  await page.route(`**/api/v1/servers/${provider.id}/health`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ checks: healthChecks }),
    }),
  );

  await page.route(`**/api/v1/servers/${provider.id}/health/ping`, (route) => {
    healthChecks = [
      {
        status: 'healthy',
        checked_at: '2024-06-01T11:05:00.000Z',
        latency_ms: 210,
        message: 'Ping de monitoramento manual concluído com sucesso.',
        actor: 'Console MCP',
        plan_id: 'plan-operacoes',
      },
      ...healthChecks,
    ].slice(0, 6);
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ check: healthChecks[0] }),
    });
  });

  await page.route(`**/api/v1/servers/${provider.id}`, async (route) => {
    if (route.request().method() === 'PUT') {
      lastUpdatePayload = route.request().postDataJSON();
      const body = lastUpdatePayload as {
        name?: string;
        command?: string;
        description?: string | null;
        tags?: string[];
        capabilities?: string[];
        transport?: string;
      };
      serverRecord = {
        ...serverRecord!,
        name: body.name ?? serverRecord!.name,
        command: body.command ?? serverRecord!.command,
        description: body.description ?? serverRecord!.description,
        tags: body.tags ?? serverRecord!.tags,
        capabilities: body.capabilities ?? serverRecord!.capabilities,
        transport: body.transport ?? serverRecord!.transport,
        updated_at: '2024-06-01T11:05:00.000Z',
      };
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(serverRecord),
      });
      return;
    }
    if (route.request().method() === 'DELETE') {
      deleteConfirmed = true;
      serverRecord = null;
      healthChecks = [];
      await route.fulfill({ status: 204, body: '' });
      return;
    }
    await route.fallback();
  });

  await page.route('**/api/v1/providers', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ providers: [provider] }) }),
  );
  await page.route('**/api/v1/sessions', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sessions: [] }) }),
  );
  await page.route('**/api/v1/secrets', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ secrets: [] }) }),
  );
  await page.route('**/api/v1/notifications', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ notifications: [] }) }),
  );
  await page.route('**/api/v1/telemetry/*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) }),
  );

  await page.goto('/');

  await page.getByRole('button', { name: 'Servidores' }).click();
  await expect(page.getByRole('heading', { name: /Servidores MCP/i })).toBeVisible();

  const healthRegion = page.getByRole('region', { name: 'Resumo de health-checks' });
  await expect(healthRegion.locator('strong')).toHaveText(['1', '0', '0', '0']);
  await expect(page.getByText('Ping automatizado dentro do SLA.')).toBeVisible();

  await page.getByRole('button', { name: 'Ping agora' }).click();
  await expect(page.getByText('Ping de monitoramento manual concluído com sucesso.')).toBeVisible();

  await page.getByRole('button', { name: 'Editar servidor' }).click();
  const editDialog = page.getByRole('dialog', { name: 'Editar servidor MCP' });
  await editDialog.getByLabel('Nome exibido').fill('Gemini MCP · Observabilidade');
  await editDialog.getByLabel('Comando/endpoint').fill('/opt/mcp/gemini');
  await editDialog.getByLabel('Descrição').fill('Servidor MCP supervisionado pela console.');
  await editDialog.getByLabel('Transporte').fill('http');
  await editDialog.getByLabel('Tags (separadas por vírgula)').fill('llm,observabilidade');
  await editDialog.getByLabel('Capacidades (separadas por vírgula)').fill('chat,embeddings');
  await editDialog.getByRole('button', { name: 'Salvar alterações' }).click();

  await expect(page.getByRole('heading', { level: 2, name: 'Gemini MCP · Observabilidade' })).toBeVisible();
  await expect(page.getByText('/opt/mcp/gemini')).toBeVisible();
  await expect(page.getByText('http')).toBeVisible();
  expect(lastUpdatePayload).toEqual({
    name: 'Gemini MCP · Observabilidade',
    command: '/opt/mcp/gemini',
    description: 'Servidor MCP supervisionado pela console.',
    tags: ['llm', 'observabilidade'],
    capabilities: ['chat', 'embeddings'],
    transport: 'http',
  });

  await page.getByRole('button', { name: 'Remover servidor' }).click();
  const deleteDialog = page.getByRole('dialog', { name: 'Remover servidor MCP' });
  await deleteDialog.getByRole('button', { name: 'Remover servidor' }).click();

  await expect(page.getByRole('heading', { level: 2, name: 'Gemini MCP · Observabilidade' })).toHaveCount(0);
  await expect(healthRegion.locator('strong')).toHaveText(['0', '0', '0', '0']);
  expect(deleteConfirmed).toBe(true);
});
