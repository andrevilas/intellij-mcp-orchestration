import { expect, test } from './fixtures';
import type { Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, '..', '..');
const evidenceDir = resolve(repoRoot, 'docs', 'evidence', 'TASK-UI-FORM-040');

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

test('suporta navegação por teclado no formulário do UI Kit', async ({ page }) => {
  await registerBaseRoutes(page);
  await page.goto('/');

  const form = page.getByTestId('form-controls-demo');
  await form.scrollIntoViewIfNeeded();

  const focusLog: string[] = [];

  await page.getByLabel('Nome do serviço').focus();
  focusLog.push('Nome do serviço');
  await expect(page.getByLabel('Nome do serviço')).toBeFocused();

  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Ambiente')).toBeFocused();
  focusLog.push('Ambiente');

  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Descrição')).toBeFocused();
  focusLog.push('Descrição');

  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Ativar alertas proativos')).toBeFocused();
  focusLog.push('Ativar alertas proativos');

  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Gateway de provisionamento')).toBeFocused();
  focusLog.push('Gateway de provisionamento');

  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Limpar' })).toBeFocused();
  focusLog.push('Limpar');

  await page.keyboard.press('Tab');
  const submitButton = page.getByRole('button', { name: 'Salvar formulário' });
  await expect(submitButton).toBeFocused();
  focusLog.push('Salvar formulário');

  await page.keyboard.press('Shift+Tab');
  await expect(page.getByRole('button', { name: 'Limpar' })).toBeFocused();

  await mkdir(evidenceDir, { recursive: true });
  await writeFile(resolve(evidenceDir, 'forms-tab-order.json'), JSON.stringify({ order: focusLog }, null, 2));
});

test('aciona upload de arquivo via teclado no UI Kit', async ({ page }) => {
  await registerBaseRoutes(page);
  await page.goto('/');

  await mkdir(evidenceDir, { recursive: true });
  const uploadFixture = resolve(evidenceDir, 'sample-upload.json');
  await writeFile(uploadFixture, JSON.stringify({ credential: 'sk-test-123' }, null, 2));

  const uploadButton = page.getByRole('button', { name: 'Selecionar arquivo' });
  await uploadButton.scrollIntoViewIfNeeded();
  await uploadButton.focus();
  await expect(uploadButton).toBeFocused();

  const [fileChooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.keyboard.press('Enter'),
  ]);

  await fileChooser.setFiles(uploadFixture);

  await expect(page.getByText(/Upload concluído: sample-upload\.json/i)).toBeVisible();
  await expect(page.getByText(/enviado com sucesso\./i)).toBeVisible();
});
