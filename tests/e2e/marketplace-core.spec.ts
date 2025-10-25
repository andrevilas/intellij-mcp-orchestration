import { expect, test, loadBackendFixture } from './fixtures';

type MarketplaceCatalogFixture = {
  entries: Array<Record<string, unknown>>;
  imports: Record<string, unknown>;
  errors: Record<string, string>;
};

test.describe('Marketplace - catálogo e importação assistida', () => {
  let catalogFixture: MarketplaceCatalogFixture;

  test.beforeEach(async ({ page }) => {
    catalogFixture = await loadBackendFixture<MarketplaceCatalogFixture>('marketplace_catalog.json');

    await page.route('**/api/v1/marketplace', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ entries: catalogFixture.entries }),
      }),
    );

    await page.route('**/api/v1/marketplace/*/import', async (route) => {
      const request = route.request();
      if (request.method() !== 'POST') {
        return route.fallback();
      }

      const url = new URL(request.url());
      const segments = url.pathname.split('/').filter(Boolean);
      const entryId = decodeURIComponent(segments[segments.length - 2] ?? '');

      if (catalogFixture.errors[entryId]) {
        return route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ detail: catalogFixture.errors[entryId] }),
        });
      }

      const payload = catalogFixture.imports[entryId];
      if (!payload) {
        return route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ detail: 'Marketplace entry not found in fixtures.' }),
        });
      }

      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(payload),
      });
    });
  });

  test('filtra catálogo e importa agente com sucesso', async ({ page }) => {
    await page.goto('/?view=marketplace');

    const listItems = page.getByRole('listitem');
    await expect(listItems).toHaveCount(catalogFixture.entries.length);

    await page.getByLabel('Pesquisar').fill('checkout');
    await expect(listItems).toHaveCount(1);

    await page.getByLabel('Pesquisar').fill('');
    await page.getByLabel('Origem').selectOption('community');
    await expect(listItems).toHaveCount(1);
    await page.getByLabel('Origem').selectOption('all');

    const ratingSlider = page.locator('input[type="range"]').first();
    await ratingSlider.evaluate((element) => {
      (element as HTMLInputElement).value = '4.8';
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await expect(listItems).toHaveCount(2);

    await ratingSlider.evaluate((element) => {
      (element as HTMLInputElement).value = '0';
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const costInput = page.getByLabel('Custo máx. estimado (USD)');
    await costInput.fill('5');
    await expect(listItems).toHaveCount(1);
    await costInput.fill('');

    const checkoutCard = listItems.filter({ hasText: 'Governed Checkout' });
    await expect(checkoutCard).toHaveCount(1);

    const importButton = checkoutCard.getByRole('button', { name: 'Importar via Config Assistant' });
    await Promise.all([
      page.waitForRequest('**/api/v1/marketplace/governed-checkout/import'),
      importButton.click(),
    ]);

    await expect(importButton).toHaveText('Gerando plano…');
    await expect(page.getByRole('heading', { name: 'Plano gerado para Governed Checkout' })).toBeVisible();
    await expect(page.locator('.marketplace__steps li')).toHaveCount(1);
    await expect(page.locator('.marketplace__code').first()).toContainText('name: governed-checkout');
    await expect(page.locator('.marketplace__import')).toContainText('Assinatura verificada com sucesso');
  });

  test('exibe feedback de erro quando importação falha', async ({ page }) => {
    await page.goto('/?view=marketplace');

    const codexCard = page.getByRole('listitem').filter({ hasText: 'Codex Labs Analyzer' });
    const importButton = codexCard.getByRole('button', { name: 'Importar via Config Assistant' });

    await Promise.all([
      page.waitForRequest('**/api/v1/marketplace/codex-labs/import'),
      importButton.click(),
    ]);

    const errorStatus = page.locator('.marketplace__status--error');
    await expect(errorStatus).toBeVisible();
    await expect(errorStatus).toContainText('Falha ao importar Codex Labs Analyzer via fixtures.');
    await expect(page.locator('.marketplace__import')).not.toBeVisible();
  });
});
