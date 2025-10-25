import { expect, test } from './fixtures';
import { registerShowcaseRoutes } from './utils';

test('valida overlays com confirmação dupla e fechamento por ESC', async ({ page }) => {
  await registerShowcaseRoutes(page);
  await page.goto('/');

  const notificationTrigger = page.getByRole('button', { name: /Notificações/ });
  await notificationTrigger.click();
  const notificationDialog = page.getByRole('dialog', { name: 'Status operacionais e FinOps' });
  await expect(notificationDialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#notification-center-panel')).toHaveCount(0);
  await expect(notificationTrigger).toBeFocused();

  const showcase = page.locator('aside[aria-label="Mostruário UI Kit"]');
  await showcase.getByRole('button', { name: 'Abrir confirmação' }).click();

  const confirmButton = page.getByRole('button', { name: 'Confirmar' });
  await confirmButton.click();
  await expect(page.getByText('Clique novamente para confirmar.')).toBeVisible();
  const armedButton = page.getByRole('button', { name: 'Confirmar agora' });
  await armedButton.click();

  await expect(page.locator('[role="dialog"]').filter({ hasText: 'Excluir instância' })).toHaveCount(0);
  await expect(page.getByRole('alert', { name: /Instância removida/i })).toBeVisible();
});
