import { expect, test } from './fixtures';
import { registerShowcaseRoutes } from './utils';

test('valida estados de botões e dropdowns no showcase', async ({ page }) => {
  await registerShowcaseRoutes(page);
  await page.goto('/');

  const showcase = page.locator('aside[aria-label="Mostruário UI Kit"]');
  const loadingButton = showcase.getByRole('button', { name: 'Sincronizando' });
  await expect(loadingButton).toHaveAttribute('aria-busy', 'true');

  const dropdownTrigger = showcase.getByRole('button', { name: 'Ações rápidas' }).first();
  await dropdownTrigger.click();
  await expect(page.getByRole('menu')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('[role="menu"]')).toHaveCount(0);

  const toolbarButton = showcase.getByRole('button', { name: 'Executar blueprint' });
  await toolbarButton.focus();
  await expect(toolbarButton).toBeFocused();
});
