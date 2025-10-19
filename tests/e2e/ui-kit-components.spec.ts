import { test, expect, type Page } from '@playwright/test';

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
  await page.route('**/api/v1/policies/compliance', (route) =>
    route.fulfill({ status: 200, body: JSON.stringify({ status: 'pass', items: [] }), contentType: 'application/json' }),
  );
  await page.route('**/agents/agents', (route) =>
    route.fulfill({ status: 200, body: JSON.stringify({ agents: [] }), contentType: 'application/json' }),
  );
}

test('interage com o showcase do UI Kit', async ({ page }) => {
  await registerBaseRoutes(page);
  await page.goto('/');

  const showcase = page.getByTestId('ui-kit-showcase');
  await expect(showcase.getByText('UI Kit')).toBeVisible();

  await showcase.getByRole('button', { name: 'Ações rápidas' }).click();
  await page.getByRole('menuitem', { name: /Toast de sucesso/ }).click();
  await expect(page.getByText('O servidor foi promovido para produção.')).toBeVisible();

  await showcase.getByRole('button', { name: 'Abrir formulário' }).click();
  const modal = page.getByRole('dialog', { name: 'Editar workflow' });
  await expect(modal).toBeVisible();
  await modal.getByLabel('Nome').fill('E2E Workflow');
  await modal.getByRole('button', { name: 'Salvar' }).click();

  await expect(page.getByText('E2E Workflow salvo com sucesso.')).toBeVisible();
});
