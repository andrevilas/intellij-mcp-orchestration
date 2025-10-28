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
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Segurança' }).click();
    await expect(page.getByRole('heading', { name: 'Central de segurança' })).toBeVisible();
  });

  test('@security gerencia identidades e credenciais MCP', async ({ page }) => {
    const [{ users }, { roles }, { keys }, auditTrail] = await Promise.all([
      loadBackendFixture<{ users: SecurityUserFixture[] }>('security_users.json'),
      loadBackendFixture<{ roles: SecurityRoleFixture[] }>('security_roles.json'),
      loadBackendFixture<{ keys: SecurityApiKeyFixture[] }>('security_api_keys.json'),
      loadBackendFixture<AuditTrailFixture>('security_audit_trail.json'),
    ]);

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
    const primaryKey = keys[0];
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

    await page.getByRole('tab', { name: 'Auditoria' }).click();
    const initialResponse = page.waitForResponse(
      (response) => response.url().includes('/api/v1/audit/logs') && response.request().method() === 'GET',
    );
    const table = page.getByRole('table', {
      name: /Tabela de eventos de auditoria com filtros avançados/i,
    });
    await initialResponse;
    await expect(table.getByText(sortedEvents[0].action)).toBeVisible();

    const pageSizeResponse = page.waitForResponse(
      (response) => response.url().includes('/api/v1/audit/logs') && response.request().method() === 'GET',
    );
    await page.getByLabel('Itens por página').selectOption('1');
    await pageSizeResponse;
    await expect(table.getByText(sortedEvents[0].action)).toBeVisible();

    const nextPageResponse = page.waitForResponse(
      (response) => response.url().includes('/api/v1/audit/logs') && response.request().method() === 'GET',
    );
    await page.getByRole('button', { name: 'Próxima página' }).click();
    await nextPageResponse;
    await expect(table.getByText(sortedEvents[1].action)).toBeVisible();

    const filterResponse = page.waitForResponse(
      (response) => response.url().includes('/api/v1/audit/logs') && response.request().method() === 'GET',
    );
    await page.getByLabel('Filtro por ator').fill('Sistema');
    await page.getByRole('button', { name: 'Aplicar filtros' }).click();
    await filterResponse;
    await expect(table.getByText(sortedEvents[1].action)).toBeVisible();
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
