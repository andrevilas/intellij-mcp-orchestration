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
  const dropdownMenu = page.locator('.mcp-dropdown__menu');
  await expect(dropdownMenu).toBeVisible();
  const dropdownZIndex = await dropdownMenu.evaluate((element) => {
    const style = getComputedStyle(element);
    return (style.zIndex || style.getPropertyValue('--mcp-z-dropdown')).trim();
  });
  expect(dropdownZIndex).toBe('20');
  await page.keyboard.press('Escape');

  const detailsButton = showcase.getByRole('button', { name: 'Detalhes' });
  await detailsButton.hover();
  const tooltip = page.locator('[role="tooltip"]');
  await expect(tooltip).toBeVisible();
  const tooltipZIndex = await tooltip.evaluate((element) => {
    const style = getComputedStyle(element);
    return (style.zIndex || style.getPropertyValue('--mcp-z-tooltip')).trim();
  });
  expect(tooltipZIndex).toBe('30');
  await detailsButton.press('Escape');

  await showcase.getByRole('button', { name: 'Ações rápidas' }).click();
  await page.getByRole('menuitem', { name: /Toast de sucesso/ }).click();
  const toastViewport = page.locator('.mcp-toast-viewport');
  await expect(toastViewport).toBeVisible();
  const toastZIndex = await toastViewport.evaluate((element) => {
    const style = getComputedStyle(element);
    return (style.zIndex || style.getPropertyValue('--mcp-z-toast')).trim();
  });
  expect(toastZIndex).toBe('70');
  await expect(page.getByText('O servidor foi promovido para produção.')).toBeVisible();

  await showcase.getByRole('button', { name: 'Abrir formulário' }).click();
  const modal = page.getByRole('dialog', { name: 'Editar workflow' });
  await expect(modal).toBeVisible();
  await modal.getByLabel('Nome').fill('E2E Workflow');
  await modal.getByRole('button', { name: 'Salvar' }).click();

  await expect(page.getByText('E2E Workflow salvo com sucesso.')).toBeVisible();

  await showcase.getByRole('button', { name: 'Abrir confirmação' }).click();
  const modalRoot = page.locator('.mcp-modal');
  await expect(modalRoot).toBeVisible();
  const modalZIndex = await modalRoot.evaluate((element) => {
    const style = getComputedStyle(element);
    return (style.zIndex || style.getPropertyValue('--mcp-z-modal')).trim();
  });
  expect(modalZIndex).toBe('80');

  const confirmButton = page.getByRole('button', { name: 'Confirmar' });
  await confirmButton.click();
  await expect(page.getByText('Clique novamente para confirmar.')).toBeVisible();
  await page.getByRole('button', { name: 'Confirmar agora' }).click();
  await expect(page.getByText('Os recursos associados foram desalocados.')).toBeVisible();

  expect(Number(modalZIndex)).toBeGreaterThan(Number(toastZIndex));
  expect(Number(tooltipZIndex)).toBeGreaterThan(Number(dropdownZIndex));
  expect(Number(toastZIndex)).toBeGreaterThan(Number(tooltipZIndex));
});
