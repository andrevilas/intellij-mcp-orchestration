import { expect, test } from './fixtures';

test.describe('@config-reload governed flow', () => {
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
    status: 'pending' as const,
    context: [],
    approval_rules: [],
  };

  const reloadResponse = {
    message: 'Plano gerado para regerar finops.checklist.',
    plan: reloadPlanPayload,
    patch: '--- a/generated/cache.md\n+++ b/generated/cache.md\n+Conteúdo',
    plan_id: 'reload-plan-1',
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
    pull_request: {
      provider: 'github',
      id: 'pr-42',
      number: '42',
      url: 'https://github.com/example/pr/42',
      title: 'chore: regenerate artifact',
      state: 'open',
      head_sha: 'def456',
      branch: 'chore/reload-artifact',
      ci_status: 'pending',
      review_status: 'review_required',
      merged: false,
      last_synced_at: '2025-02-10T12:00:00Z',
      reviewers: [],
      ci_results: [],
    },
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
    await page.route('**/api/v1/security/users', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ users: [] }) }),
    );
    await page.route('**/api/v1/security/roles', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ roles: [] }) }),
    );
    await page.route('**/api/v1/security/api-keys', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ api_keys: [] }) }),
    );
    await page.route('**/api/v1/audit/logs**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ events: [], page: 1, page_size: 25, total: 0, total_pages: 0 }),
      }),
    );
  });

  test('aplica plano governado após revisão', async ({ page }) => {
    let lastApplyPayload: Record<string, unknown> | null = null;

    await page.route('**/api/v1/config/reload**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(reloadResponse) }),
    );
    await page.route('**/api/v1/config/apply**', (route) => {
      const payload = route.request().postDataJSON() as Record<string, unknown> | null;
      lastApplyPayload = payload ?? {};
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(applyResponse) });
    });

    await page.goto('/');
    await page.getByRole('link', { name: 'Segurança' }).click();
    await page.getByRole('tab', { name: 'Auditoria' }).click();
    await expect(page.getByRole('heading', { name: 'Reload governado de configuração' })).toBeVisible();

    await page.selectOption('#config-reload-artifact', 'finops.checklist');
    await page.fill('#config-reload-target', 'generated/cache.md');
    await page.fill('#config-reload-parameters', '{"owner":"finops"}');
    await page.getByRole('button', { name: 'Gerar plano' }).click();

    await expect(page.getByRole('heading', { name: 'Plano gerado' })).toBeVisible();
    await page.fill('#config-reload-actor', 'Ana Operator');
    await page.fill('#config-reload-email', 'ana@example.com');
    await page.fill('#config-reload-commit', 'chore: atualizar checklist finops');
    await page.fill('#config-reload-justification', 'Validar com FinOps.');
    await page.getByRole('button', { name: 'Aplicar plano' }).click();

    const confirmation = page.getByRole('dialog', { name: 'Confirmar aplicação governada' });
    await expect(confirmation).toBeVisible();
    await confirmation.getByRole('button', { name: 'Aplicar plano' }).click();
    const [applyRequest] = await Promise.all([
      page.waitForRequest(
        (request) => request.url().includes('/api/v1/config/apply') && request.method() === 'POST',
      ),
      confirmation.getByRole('button', { name: 'Aplicar agora' }).click(),
    ]);

    await expect(page.locator('.config-reload__success')).toContainText('Plano aplicado com sucesso via fixtures');
    await expect(page.getByText(/Executor: Ana Operator/)).toBeVisible();

    await page.getByRole('button', { name: 'Ver auditoria' }).click();
    await expect(
      page.getByRole('complementary', { name: 'Auditoria de reloads governados' }),
    ).toBeVisible();
    await expect(page.getByText(/config\.reload\.apply/)).toBeVisible();

    const payload = (lastApplyPayload ?? (applyRequest.postDataJSON() as Record<string, unknown> | null)) ?? {};
    expect(typeof payload.plan_id).toBe('string');
    expect(String(payload.plan_id)).not.toHaveLength(0);
    expect(payload.actor).toBe('Ana Operator');
    expect(payload.actor_email).toBe('ana@example.com');
    expect(payload.commit_message).toBe('chore: atualizar checklist finops');
    expect(typeof payload.patch).toBe('string');
    expect(String(payload.patch)).not.toHaveLength(0);
  });

  test('permite limpar plano governado antes de aplicar', async ({ page }) => {
    await page.route('**/api/v1/config/reload**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(reloadResponse) }),
    );

    let applyCalls = 0;
    await page.route('**/api/v1/config/apply**', (route) => {
      applyCalls += 1;
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(applyResponse) });
    });

    await page.goto('/');
    await page.getByRole('link', { name: 'Segurança' }).click();
    await page.getByRole('tab', { name: 'Auditoria' }).click();
    await expect(page.getByRole('heading', { name: 'Reload governado de configuração' })).toBeVisible();

    await page.selectOption('#config-reload-artifact', 'finops.checklist');
    await page.fill('#config-reload-target', 'generated/cache.md');
    await page.getByRole('button', { name: 'Gerar plano' }).click();
    await expect(page.getByRole('heading', { name: 'Plano gerado' })).toBeVisible();

    await page.locator('.config-reload').getByRole('button', { name: 'Limpar', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Plano gerado' })).toHaveCount(0);
    expect(applyCalls).toBe(0);
  });
});
