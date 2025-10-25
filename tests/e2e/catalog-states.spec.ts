import { expect, test } from './fixtures';

test.describe('Marketplace - estados alternativos', () => {
  test('exibe mensagem de carregamento do catálogo', async ({ page }) => {
    await page.goto('/marketplace?catalogState=loading');

    const catalogCard = page.getByTestId('marketplace-catalog');
    await expect(catalogCard).toHaveAttribute('data-status', 'loading');
    await expect(catalogCard.getByText('Carregando catálogo do marketplace…')).toBeVisible();
  });

  test('exibe estado vazio do catálogo quando o cenário força ausência de agentes', async ({ page }) => {
    await page.goto('/marketplace?catalogState=empty');

    const catalogCard = page.getByTestId('marketplace-catalog');
    await expect(catalogCard).toHaveAttribute('data-status', 'empty');
    await expect(
      catalogCard.getByText('Nenhum agente disponível para o cenário selecionado.'),
    ).toBeVisible();
  });

  test('exibe estado de erro quando a simulação falha via fixtures', async ({ page }) => {
    await page.goto('/marketplace?catalogState=error');

    const catalogCard = page.getByTestId('marketplace-catalog');
    await expect(catalogCard).toHaveAttribute('data-status', 'error');
    await expect(
      catalogCard.getByText('Falha ao carregar catálogo a partir dos fixtures do MSW.'),
    ).toBeVisible();
  });
});
