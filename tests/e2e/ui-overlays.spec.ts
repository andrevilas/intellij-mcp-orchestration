import { expect, test } from './fixtures';
import { registerShowcaseRoutes } from './utils';

test('valida overlays com confirmação dupla e fechamento por ESC', async ({ page }) => {
  await registerShowcaseRoutes(page);
  await page.goto('/');

  await page.waitForLoadState('networkidle');

  const notificationTrigger = page.getByRole('button', { name: /central de notificações/i }).first();
  await expect(notificationTrigger).toBeVisible();
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

  const wizardTrigger = page.getByRole('button', { name: 'Abrir wizard' });
  await wizardTrigger.click();

  const wizardDialog = page.getByRole('dialog', { name: 'Habilitar fluxo governado' });
  await expect(wizardDialog).toBeVisible();

  await wizardDialog.getByRole('button', { name: 'Continuar' }).click();
  await wizardDialog.getByRole('button', { name: 'Continuar' }).click();

  const armButton = wizardDialog.getByRole('button', { name: 'Habilitar confirmação' });
  await armButton.click();
  await expect(page.getByText('Clique novamente para liberar o agente.')).toBeVisible();

  await wizardDialog.getByRole('button', { name: 'Confirmar liberação' }).click();
  await expect(page.getByRole('alert', { name: /Confirme a revisão/ })).toBeVisible();

  await wizardDialog
    .getByLabel('Reconheço que revisei permissões, ambientes e sei que rollback exige dupla confirmação.')
    .click();

  await wizardDialog.getByRole('button', { name: 'Confirmar liberação' }).click();
  await expect(page.getByRole('status', { name: /Fluxo governado habilitado/ })).toBeVisible();
  await expect(wizardDialog).toHaveCount(0);

  await wizardTrigger.click();
  const reopenedWizard = page.getByRole('dialog', { name: 'Habilitar fluxo governado' });
  await expect(reopenedWizard).toBeVisible();
  await reopenedWizard.getByRole('button', { name: 'Fechar modal' }).click();
  await expect(page.getByRole('alert', { name: /Fluxo governado cancelado/ })).toBeVisible();
});
