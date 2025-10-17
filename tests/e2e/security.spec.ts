import { test, expect } from '@playwright/test';

test('@security gerencia identidades e credenciais MCP', async ({ page }) => {
  const providers = [
    {
      id: 'glm',
      name: 'GLM 46',
      description: 'Modelo GLM 46',
      command: 'glm46',
      capabilities: ['chat'],
      tags: ['llm'],
      transport: 'stdio',
      is_available: true,
    },
  ];

  const users = [
    {
      id: 'user-1',
      name: 'Ana Silva',
      email: 'ana@empresa.com',
      roles: ['role-ops'],
      status: 'active',
      created_at: '2024-03-01T12:00:00Z',
      updated_at: '2024-03-05T09:30:00Z',
      last_seen_at: '2024-03-05T09:30:00Z',
      mfa_enabled: true,
    },
  ];

  const roles = [
    {
      id: 'role-ops',
      name: 'Operações',
      description: 'Acesso a provisionamento e smoke tests',
      permissions: ['mcp.sessions.create'],
      members: 1,
      created_at: '2024-02-01T12:00:00Z',
      updated_at: '2024-02-10T12:00:00Z',
    },
  ];

  const apiKeys = [
    {
      id: 'key-1',
      user_id: 'user-ops',
      user_name: 'Operações',
      name: 'Observabilidade Prod',
      scopes: ['mcp:invoke'],
      status: 'active',
      created_at: '2024-01-01T12:00:00Z',
      updated_at: '2024-01-01T12:00:00Z',
      last_used_at: '2024-03-07T10:00:00Z',
      expires_at: null,
      token_preview: 'obs****',
    },
  ];

  const auditEvents: Record<string, Array<{ id: string; timestamp: string; actor: string; action: string; target: string; description: string; metadata?: Record<string, unknown> }>> = {
    'user:user-1': [
      {
        id: 'audit-1',
        timestamp: '2024-03-06T08:45:00Z',
        actor: 'auditor@empresa.com',
        action: 'mfa.enforced',
        target: 'user-1',
        description: 'Aplicou MFA obrigatório para Ana Silva.',
        metadata: { ip: '10.0.0.1' },
      },
    ],
    'api-key:key-1': [
      {
        id: 'audit-2',
        timestamp: '2024-03-07T11:00:00Z',
        actor: 'observability',
        action: 'token.rotated',
        target: 'key-1',
        description: 'Token rotacionado antes de expiração.',
        metadata: { reason: 'rotina mensal' },
      },
    ],
  };

  await page.route('**/api/v1/providers', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ providers }) }),
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
  await page.route('**/api/v1/telemetry/metrics**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        start: '2024-03-07T12:00:00.000Z',
        end: '2024-03-08T12:00:00.000Z',
        total_runs: 0,
        total_tokens_in: 0,
        total_tokens_out: 0,
        total_cost_usd: 0,
        avg_latency_ms: 0,
        success_rate: 1,
        providers: [],
      }),
    }),
  );
  await page.route('**/api/v1/telemetry/heatmap**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ buckets: [] }) }),
  );
  await page.route('**/api/v1/policies/compliance', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'pass', updated_at: '2024-03-07T12:00:00Z', items: [] }),
    }),
  );

  await page.route('**/api/v1/security/users', async (route) => {
    const request = route.request();
    if (request.method() === 'POST') {
      const payload = JSON.parse(request.postData() ?? '{}');
      const now = new Date().toISOString();
      const newUser = {
        id: `user-${users.length + 1}`,
        name: payload.name,
        email: payload.email,
        roles: payload.roles ?? [],
        status: 'active',
        created_at: now,
        updated_at: now,
        last_seen_at: null,
        mfa_enabled: payload.mfa_enabled ?? false,
      };
      users.push(newUser);
      return route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ user: newUser, secret: 'generated-secret' }),
      });
    }

    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ users }) });
  });

  await page.route('**/api/v1/security/users/*', async (route) => {
    const request = route.request();
    const userId = request.url().split('/').pop() ?? '';
    const index = users.findIndex((user) => user.id === userId);

    if (request.method() === 'GET') {
      const user = users[index];
      if (!user) {
        return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ detail: 'not found' }) });
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user }) });
    }

    if (request.method() === 'PUT') {
      if (index === -1) {
        return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ detail: 'not found' }) });
      }
      const payload = JSON.parse(request.postData() ?? '{}');
      users[index] = {
        ...users[index],
        name: payload.name ?? users[index].name,
        email: payload.email ?? users[index].email,
        roles: payload.roles ?? users[index].roles,
        updated_at: new Date().toISOString(),
      };
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user: users[index] }) });
    }

    if (request.method() === 'DELETE') {
      if (index >= 0) {
        users.splice(index, 1);
      }
      return route.fulfill({ status: 204 });
    }

    return route.fulfill({ status: 405 });
  });

  await page.route('**/api/v1/security/roles', (route) => {
    const request = route.request();
    if (request.method() === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ roles }) });
    }
    if (request.method() === 'POST') {
      const payload = JSON.parse(request.postData() ?? '{}');
      const now = new Date().toISOString();
      const role = {
        id: `role-${roles.length + 1}`,
        name: payload.name,
        description: payload.description ?? null,
        created_at: now,
        updated_at: now,
        members: 0,
      };
      roles.push(role);
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(role) });
    }
    return route.fulfill({ status: 405 });
  });

  await page.route('**/api/v1/security/roles/*', (route) => {
    const request = route.request();
    const roleId = request.url().split('/').pop() ?? '';
    const index = roles.findIndex((role) => role.id === roleId);

    if (request.method() === 'PUT') {
      if (index === -1) {
        return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ detail: 'not found' }) });
      }
      const payload = JSON.parse(request.postData() ?? '{}');
      roles[index] = {
        ...roles[index],
        description: payload.description ?? roles[index].description,
        updated_at: new Date().toISOString(),
      };
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(roles[index]) });
    }

    if (request.method() === 'DELETE') {
      if (index >= 0) {
        roles.splice(index, 1);
      }
      return route.fulfill({ status: 204 });
    }

    return route.fulfill({ status: 405 });
  });

  await page.route('**/api/v1/security/api-keys', (route) => {
    const request = route.request();
    if (request.method() === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ keys: apiKeys }) });
    }
    const payload = JSON.parse(request.postData() ?? '{}');
    const now = new Date().toISOString();
    const owner = users.find((user) => user.id === payload.user_id);
    const createdKey = {
      id: `key-${apiKeys.length + 1}`,
      name: payload.name,
      user_id: payload.user_id,
      user_name: owner?.name ?? payload.user_id,
      scopes: payload.scopes ?? [],
      status: 'active',
      created_at: now,
      updated_at: now,
      last_used_at: null,
      expires_at: payload.expires_at ?? null,
      token_preview: `${payload.name.slice(0, 3)}****`,
    };
    apiKeys.push(createdKey);
    return route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({ key: createdKey, secret: 'generated-secret' }),
    });
  });

  await page.route('**/api/v1/security/api-keys/*', (route) => {
    const request = route.request();
    const keyId = request.url().split('/').pop() ?? '';
    if (request.url().includes('/rotate')) {
      return route.fallback();
    }
    const key = apiKeys.find((item) => item.id === keyId);

    if (request.method() === 'DELETE') {
      if (key) {
        key.status = 'revoked';
        key.updated_at = new Date().toISOString();
      }
      return route.fulfill({ status: 204 });
    }

    return route.fulfill({ status: 405 });
  });

  await page.route('**/api/v1/security/api-keys/*/rotate', (route) => {
    const id = route.request().url().split('/').slice(-2)[0];
    const key = apiKeys.find((item) => item.id === id);
    if (key) {
      key.token_preview = 'rot****';
      key.updated_at = new Date().toISOString();
      const payload = { key, secret: 'rotated-secret' };
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) });
    }
    return route.fulfill({ status: 404 });
  });

  await page.route('**/api/v1/security/audit/**', (route) => {
    const url = new URL(route.request().url());
    const segments = url.pathname.split('/');
    const resource = segments[segments.length - 2];
    const id = segments[segments.length - 1];
    const key = `${resource}:${id}`;
    const events = auditEvents[key] ?? [];
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ events }) });
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'Segurança' }).click();

  await expect(page.getByRole('heading', { name: 'Central de segurança' })).toBeVisible();
  const usersTable = page.getByRole('table', { name: /Tabela de usuários/ });
  await expect(usersTable.getByText('Ana Silva')).toBeVisible();

  await page.getByRole('button', { name: 'Auditoria' }).click();
  const auditPanel = await page.getByRole('complementary', { name: /Auditoria • Ana Silva/ });
  await expect(auditPanel.getByText('Aplicou MFA obrigatório para Ana Silva.')).toBeVisible();
  await auditPanel.getByRole('button', { name: 'Fechar' }).click();

  await page.getByRole('button', { name: 'Novo usuário' }).click();
  const dialog = page.getByRole('dialog', { name: 'Convidar novo usuário' });
  await dialog.getByLabel('Nome completo').fill('Bruno Costa');
  await dialog.getByLabel('E-mail corporativo').fill('bruno@empresa.com');
  await dialog.getByLabel('Papéis atribuídos').selectOption('role-ops');
  await dialog.getByRole('button', { name: 'Enviar convite' }).click();
  await expect(usersTable.getByText('Bruno Costa')).toBeVisible();

  await page.getByRole('tab', { name: 'API keys' }).click();
  const keysTable = page.getByRole('table', { name: /Tabela de API keys/ });
  await expect(keysTable.getByText('Observabilidade Prod')).toBeVisible();

  await keysTable.getByRole('button', { name: 'Rotacionar' }).click();
  const secretDialog = await page.getByRole('dialog', { name: 'Novo segredo gerado' });
  await expect(secretDialog.getByLabel('Token')).toHaveValue('rotated-secret');
  await secretDialog.getByRole('button', { name: 'Entendi' }).click();

  await keysTable.getByRole('button', { name: 'Auditoria' }).click();
  const keyAudit = await page.getByRole('complementary', { name: /Observabilidade Prod/ });
  await expect(keyAudit.getByText('Token rotacionado antes de expiração.')).toBeVisible();
});
