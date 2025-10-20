import { expect, test } from './fixtures';
import type { Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, '..', '..');
const evidenceDir = resolve(repoRoot, 'docs', 'evidence', 'TASK-UI-DATA-030');

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

  const indicatorsGroup = showcase.locator('.ui-kit-showcase__group').filter({ hasText: 'Indicadores' });
  await indicatorsGroup.getByRole('button', { name: 'Carregando' }).click();
  await expect(indicatorsGroup.getByText('Sincronizando métricas do fixture…')).toBeVisible();
  await indicatorsGroup.getByRole('button', { name: 'Erro' }).click();
  await expect(indicatorsGroup.getByText('Não foi possível ler telemetry_metrics.json.')).toBeVisible();
  await indicatorsGroup.getByRole('button', { name: 'Dados' }).click();
  await expect(indicatorsGroup.getByText('Custo semanal')).toBeVisible();

  const tableGroup = showcase.locator('.ui-kit-showcase__group').filter({ hasText: 'Listas e tabelas' });
  await tableGroup.getByRole('button', { name: 'Vazio' }).click();
  await expect(tableGroup.getByText('Nenhum servidor provisionado')).toBeVisible();
  await tableGroup.getByRole('button', { name: 'Erro' }).click();
  await expect(tableGroup.getByText('Falha ao sincronizar com fixture de servidores.')).toBeVisible();
  await tableGroup.getByRole('button', { name: 'Dados' }).click();
  const firstRow = tableGroup.locator('tbody tr').first();
  await firstRow.focus();
  await expect(firstRow).toHaveAttribute('data-clickable', 'true');
  await expect(firstRow).toHaveAttribute('tabindex', '0');

  const detailGroup = showcase.locator('.ui-kit-showcase__group').filter({ hasText: 'Detalhes' });
  await detailGroup.getByRole('button', { name: 'Vazio' }).click();
  await expect(detailGroup.getByText('Selecione um servidor')).toBeVisible();
  await detailGroup.getByRole('button', { name: 'Erro' }).click();
  await expect(detailGroup.getByText('Fixture de health-check indisponível.')).toBeVisible();
  await detailGroup.getByRole('button', { name: 'Dados' }).click();
  await expect(detailGroup.getByText('Saudável')).toBeVisible();

  const accessibilityScanResults = await new AxeBuilder({ page }).analyze();
  await mkdir(evidenceDir, { recursive: true });
  await writeFile(
    resolve(evidenceDir, 'axe-ui-kit.json'),
    JSON.stringify(accessibilityScanResults, null, 2),
  );
});
