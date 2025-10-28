import { expect, test, loadBackendFixture } from './fixtures';

type SecurityUserFixture = { id: string; name: string };
type SecurityRoleFixture = { id: string; name: string };
type SecurityApiKeyFixture = { id: string; name: string };
type AuditTrailFixture = { events: Record<string, Array<{ description: string }>> };
type AuditLogFixture = {
  events: Array<{
    id: string;
    created_at: string;
    action: string;
    actor_id?: string | null;
    actor_name?: string | null;
  }>;
};

test.describe('Console de segurança', () => {
  let users: SecurityUserFixture[];
  let roles: SecurityRoleFixture[];
  let apiKeys: SecurityApiKeyFixture[];
  let auditTrail: AuditTrailFixture;
  test.beforeEach(async ({ page }) => {
    const [usersFixture, rolesFixture, keysFixture, auditTrailFixture] = await Promise.all([
      loadBackendFixture<{ users: SecurityUserFixture[] }>('security_users.json'),
      loadBackendFixture<{ roles: SecurityRoleFixture[] }>('security_roles.json'),
      loadBackendFixture<{ keys: SecurityApiKeyFixture[] }>('security_api_keys.json'),
      loadBackendFixture<AuditTrailFixture>('security_audit_trail.json'),
    ]);
    users = usersFixture.users.map((item) => ({ ...item }));
    roles = rolesFixture.roles.map((item) => ({ ...item }));
    apiKeys = keysFixture.keys.map((item) => ({ ...item }));
    auditTrail = {
      events: Object.fromEntries(
        Object.entries(auditTrailFixture.events).map(([key, value]) => [key, value.map((item) => ({ ...item }))]),
      ),
    };
    await page.addInitScript(() => {
      (globalThis as { __CONSOLE_MCP_FIXTURES__?: string }).__CONSOLE_MCP_FIXTURES__ = 'ready';
      try {
        if ('serviceWorker' in navigator) {
          navigator.serviceWorker.register = async () =>
            ({
              scope: window.location.origin,
              update: async () => undefined,
              unregister: async () => true,
              addEventListener: () => undefined,
              removeEventListener: () => undefined,
              dispatchEvent: () => false,
            } as unknown as ServiceWorkerRegistration);
        }
      } catch (error) {
        console.warn('Não foi possível preparar o ambiente de fixtures da central de segurança.', error);
      }
    });
    await page.route('**/api/v1/security/users**', async (route) => {
      const request = route.request();
      const method = request.method();
      if (method === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ users }),
        });
        return;
      }
      if (method === 'POST') {
        const payload = JSON.parse(request.postData() ?? '{}') as {
          name?: string;
          email?: string;
          roles?: string[];
          status?: string;
          mfa_enabled?: boolean;
        };
        const newUser = {
          id: `user-${Date.now()}`,
          name: payload.name ?? 'Novo usuário',
          email: payload.email ?? 'novo@example.com',
          roles: payload.roles ?? [],
          status: payload.status ?? 'active',
          created_at: new Date('2025-03-08T10:00:00Z').toISOString(),
          last_seen_at: null,
          mfa_enabled: payload.mfa_enabled ?? false,
        };
        users = [newUser, ...users];
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify(newUser),
        });
        return;
      }
      await route.fallback();
    });
    await page.route('**/api/v1/security/roles**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ roles }),
      }),
    );
    await page.route('**/api/v1/security/api-keys**', (route) => {
      const request = route.request();
      if (request.method() === 'GET') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ keys: apiKeys }),
        });
      }
      return route.fallback();
    });
    await page.route('**/api/v1/security/api-keys/*/rotate', async (route) => {
      const request = route.request();
      if (request.method() !== 'POST') {
        await route.fallback();
        return;
      }
      const url = new URL(request.url());
      const segments = url.pathname.split('/').filter(Boolean);
      const keyId = decodeURIComponent(segments[segments.length - 2] ?? '');
      const existing = apiKeys.find((key) => key.id === keyId);
      if (existing) {
        const secret = `secret-${existing.id}-${Date.now().toString(36)}`;
        const updated = {
          ...existing,
          token_preview: `${secret.slice(0, 3)}***`,
          last_used_at: new Date('2025-03-07T10:00:00Z').toISOString(),
        };
        apiKeys = apiKeys.map((key) => (key.id === keyId ? updated : key));
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ key: updated, secret }),
        });
        return;
      }
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'API key not found' }),
      });
    });
    await page.route('**/api/v1/security/audit/*/*', async (route) => {
      const request = route.request();
      if (request.method() !== 'GET') {
        await route.fallback();
        return;
      }
      const url = new URL(request.url());
      const segments = url.pathname.split('/').filter(Boolean);
      const resource = decodeURIComponent(segments[segments.length - 2] ?? '');
      const resourceId = decodeURIComponent(segments[segments.length - 1] ?? '');
      const key = `${resource}:${resourceId}`;
      const events = auditTrail.events[key] ?? [];
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ events }),
      });
    });
    await page.goto('/');
    await page.getByRole('link', { name: 'Segurança' }).click();
    await expect(page.getByRole('heading', { name: 'Central de segurança' })).toBeVisible();
  });

  test('@security gerencia identidades e credenciais MCP', async ({ page }) => {
    const usersTable = page.getByRole('table', { name: /Tabela de usuários/i });
    const primaryUser = users[0];
    await expect(usersTable.getByText(primaryUser.name)).toBeVisible();

    const userRow = usersTable.locator('tbody tr', { hasText: primaryUser.name }).first();
    await userRow.getByRole('button', { name: 'Auditoria' }).click();
    const auditPanel = page.getByRole('complementary', {
      name: new RegExp(`Auditoria • ${primaryUser.name}`),
    });
    const userAuditEvents = auditTrail.events[`user:${primaryUser.id}`] ?? [];
    if (userAuditEvents.length > 0) {
      await expect(auditPanel.getByText(userAuditEvents[0].description)).toBeVisible();
    }
    await auditPanel.getByRole('button', { name: 'Fechar' }).click();

    await page.getByRole('button', { name: 'Novo usuário' }).click();
    const dialog = page.getByRole('dialog', { name: 'Convidar novo usuário' });
    await dialog.getByLabel('Nome completo').fill('Bruno Costa');
    await dialog.getByLabel('E-mail corporativo').fill('bruno@empresa.com');
    const primaryRole = roles[0];
    await dialog.getByLabel('Papéis atribuídos').selectOption(primaryRole.id);

    const createRequest = page.waitForRequest(
      (request) => request.url().includes('/api/v1/security/users') && request.method() === 'POST',
    );
    const createResponse = page.waitForResponse(
      (response) => response.url().includes('/api/v1/security/users') && response.request().method() === 'POST',
    );
    await dialog.getByRole('button', { name: 'Enviar convite' }).click();
    const request = await createRequest;
    const payload = JSON.parse(request.postData() ?? '{}');
    expect(payload).toMatchObject({
      name: 'Bruno Costa',
      email: 'bruno@empresa.com',
      roles: [primaryRole.id],
      status: 'active',
      mfa_enabled: true,
    });
    await createResponse;
    await expect(usersTable.getByText('Bruno Costa')).toBeVisible();

    await page.getByRole('tab', { name: 'API keys' }).click();
    const keysTable = page.getByRole('table', { name: /Tabela de API keys/i });
    const primaryKey = apiKeys[0];
    await expect(keysTable.getByText(primaryKey.name)).toBeVisible();

    const keyRow = keysTable.locator('tbody tr', { hasText: primaryKey.name }).first();
    const rotateResponse = page.waitForResponse(
      (response) =>
        response
          .url()
          .includes(`/api/v1/security/api-keys/${encodeURIComponent(primaryKey.id)}/rotate`) &&
        response.request().method() === 'POST',
    );
    await keyRow.getByRole('button', { name: 'Rotacionar' }).click();
    await rotateResponse;

    const secretDialog = page.getByRole('dialog', { name: 'Novo segredo gerado' });
    await expect(secretDialog.getByLabel('Token')).toHaveValue(
      new RegExp(`^secret-${primaryKey.id}-`),
    );
    await secretDialog.getByRole('button', { name: 'Entendi' }).click();

    await keyRow.getByRole('button', { name: 'Auditoria' }).click();
    const keyAuditPanel = page.getByRole('complementary', {
      name: new RegExp(primaryKey.name),
    });
    const keyAuditEvents = auditTrail.events[`api-key:${primaryKey.id}`] ?? [];
    if (keyAuditEvents.length > 0) {
      await expect(keyAuditPanel.getByText(keyAuditEvents[0].description)).toBeVisible();
    }
  });

  test('@audit acompanha eventos de auditoria paginados', async ({ page }) => {
    const auditFixture = await loadBackendFixture<AuditLogFixture>('security_audit_logs.json');
    const sortedEvents = [...auditFixture.events].sort((a, b) =>
      a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0,
    );
    await page.route('**/api/v1/audit/logs**', (route) => {
      const request = route.request();
      if (request.method() !== 'GET') {
        return route.fallback();
      }
      const url = new URL(request.url());
      const pageParam = Number(url.searchParams.get('page') ?? '1');
      const pageSizeParam = Number(url.searchParams.get('page_size') ?? '20');
      const actorFilter = (url.searchParams.get('actor') ?? '').trim().toLowerCase();
      const targetEvents = actorFilter
        ? sortedEvents.filter((event) => (event.actor_name ?? '').toLowerCase().includes(actorFilter))
        : sortedEvents;
      const pageIndex = Number.isFinite(pageParam) && pageParam > 0 ? pageParam - 1 : 0;
      const pageSize = Number.isFinite(pageSizeParam) && pageSizeParam > 0 ? pageSizeParam : 20;
      const start = pageIndex * pageSize;
      const slice = targetEvents.slice(start, start + pageSize);
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          events: slice,
          total: targetEvents.length,
          page: pageIndex + 1,
          page_size: pageSize,
          total_pages: Math.max(1, Math.ceil(targetEvents.length / pageSize)),
        }),
      });
    });

    await page.getByRole('tab', { name: 'Auditoria' }).click();
    const table = page.getByRole('table', {
      name: /Tabela de eventos de auditoria com filtros avançados/i,
    });
    await expect(table.getByText(sortedEvents[0].action)).toBeVisible();
    await page.getByLabel('Itens por página').selectOption('1');
    await expect
      .poll(async () => await table.locator('tbody tr').count())
      .toBe(1);
    await expect(table.getByText(sortedEvents[0].action)).toBeVisible();

    await page.getByRole('button', { name: 'Próxima página' }).click();
    await expect
      .poll(async () => await table.getByText(sortedEvents[1].action).count())
      .toBe(1);
    await expect(table.getByText(sortedEvents[0].action)).toHaveCount(0);

    await page.getByLabel('Filtro por ator').fill('Sistema');
    await page.getByRole('button', { name: 'Aplicar filtros' }).click();
    await expect
      .poll(async () => await table.getByText(sortedEvents[1].action).count())
      .toBe(1);
    await expect(table.getByText(sortedEvents[0].action)).toHaveCount(0);

    const csvDownload = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Exportar CSV' }).click();
    const csvFile = await csvDownload;
    await expect(csvFile.suggestedFilename()).toMatch(/audit-logs-.*\.csv/);

    const jsonDownload = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Exportar JSON' }).click();
    const jsonFile = await jsonDownload;
    await expect(jsonFile.suggestedFilename()).toMatch(/audit-logs-.*\.json/);
  });
});
