import { test, expect } from '@playwright/test';

test.describe('Config reload modal', () => {
  const reloadPlanPayload = {
    intent: 'generate_artifact',
    summary: 'Gerar checklist finops',
    steps: [
      {
        id: 'write-artifact',
        title: 'Escrever artefato',
        description: 'Salvar checklist em disco.',
        depends_on: [],
        actions: [
          {
            type: 'write_file',
            path: 'generated/cache.md',
            contents: '# Checklist',
            encoding: 'utf-8',
            overwrite: true,
          },
        ],
      },
    ],
    diffs: [
      {
        path: 'generated/cache.md',
        summary: 'Atualizar checklist',
        change_type: 'update',
        diff: '--- a/generated/cache.md\n+++ b/generated/cache.md\n+Conteúdo',
      },
    ],
    risks: [],
    status: 'pending',
    context: [],
    approval_rules: [],
  };

  const reloadResponse = {
    message: 'Plano gerado para regerar finops.checklist.',
    plan: reloadPlanPayload,
    patch: '--- a/generated/cache.md\n+++ b/generated/cache.md\n+Conteúdo',
  };

  const applyResponse = {
    status: 'completed',
    mode: 'branch_pr',
    plan_id: 'reload-plan-1',
    record_id: 'rec-reload-1',
    branch: 'chore/reload-artifact',
    base_branch: 'main',
    commit_sha: 'def456',
    diff: { stat: '1 file changed', patch: 'diff --git a/generated/cache.md b/generated/cache.md' },
    hitl_required: false,
    message: 'Artefato regenerado com sucesso.',
    approval_id: null,
    pull_request: null,
  };

  test.beforeEach(async ({ page }) => {
    await page.route('**/api/v1/servers', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ servers: [] }) }),
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
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'pass', items: [] }),
      }),
    );
    await page.route('**/api/v1/config/chat', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ threadId: 'thread-1', messages: [] }),
      }),
    );
  });

  test('aplica plano de reload após revisão', async ({ page }) => {
    const applyRequests: unknown[] = [];
    const notificationRequests: unknown[] = [];

    await page.route('**/api/v1/config/reload', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(reloadResponse) }),
    );
    await page.route('**/api/v1/config/apply', (route) => {
      const payload = route.request().postData();
      applyRequests.push(payload ? JSON.parse(payload) : {});
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(applyResponse) });
    });
    await page.route('**/api/v1/notifications', (route) => {
      notificationRequests.push(route.request());
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ notifications: [] }) });
    });

    await page.goto('/');
    await page.getByRole('button', { name: 'Admin Chat' }).click();
    await expect(page.getByRole('heading', { name: 'Assistente administrativo MCP' })).toBeVisible();

    const reloadButtons = await page.getByRole('button', { name: 'Regenerar artefato' }).all();
    await reloadButtons[reloadButtons.length - 1].click();

    await page.fill('#admin-reload-target', 'generated/cache.md');
    await page.fill('#admin-reload-parameters', '{"owner":"finops"}');
    await page.getByRole('button', { name: 'Gerar plano' }).last().click();

    await expect(page.getByText('Gerar checklist finops')).toBeVisible();
    await page.fill('#admin-reload-actor', 'Ana Operator');
    await page.fill('#admin-reload-email', 'ana@example.com');
    await page.fill('#admin-reload-commit', 'chore: atualizar checklist finops');
    await page.getByRole('button', { name: 'Aplicar plano' }).last().click();

    await expect(page.getByText('Artefato regenerado com sucesso.')).toBeVisible();
    expect(applyRequests).toHaveLength(1);
    const payload = applyRequests[0] as Record<string, unknown>;
    expect(payload.plan_id).toMatch(/^reload-/);
    expect(payload.actor).toBe('Ana Operator');
    expect(payload.actor_email).toBe('ana@example.com');
    expect(payload.patch).toBe(reloadResponse.patch);
    expect(notificationRequests.length).toBeGreaterThan(0);
  });

  test('permite cancelar modal de reload sem aplicar', async ({ page }) => {
    await page.route('**/api/v1/config/reload', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          message: reloadResponse.message,
          plan: reloadResponse.plan,
          patch: reloadResponse.patch,
        }),
      }),
    );

    const applyRequests: unknown[] = [];
    await page.route('**/api/v1/config/apply', (route) => {
      const body = route.request().postData();
      applyRequests.push(body ? JSON.parse(body) : {});
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(applyResponse) });
    });
    await page.route('**/api/v1/notifications', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ notifications: [] }) }),
    );

    await page.goto('/');
    await page.getByRole('button', { name: 'Admin Chat' }).click();
    const reloadButtons = await page.getByRole('button', { name: 'Regenerar artefato' }).all();
    await reloadButtons[reloadButtons.length - 1].click();

    await page.fill('#admin-reload-target', 'generated/cache.md');
    await page.getByRole('button', { name: 'Gerar plano' }).last().click();
    await expect(page.getByText('Gerar checklist finops')).toBeVisible();
    await page.getByRole('button', { name: 'Cancelar' }).click();
    await expect(page.locator('role=dialog')).toHaveCount(0);
    expect(applyRequests).toHaveLength(0);
  });
});
