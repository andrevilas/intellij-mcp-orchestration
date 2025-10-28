import { expect, test, loadBackendFixture } from './fixtures';
import type { Page } from '@playwright/test';

type MarketplaceCatalogFixture = {
  entries: Array<Record<string, unknown>>;
  imports: Record<string, unknown>;
  errors: Record<string, string>;
};

async function mockMarketplaceFetch(
  page: Page,
  {
    entries,
    imports,
    errors,
  }: {
    entries: Array<Record<string, unknown>>;
    imports: Record<string, unknown>;
    errors?: Record<string, string>;
  },
): Promise<void> {
  await page.addInitScript(({ entries, imports, errors }) => {
    const globalObject = window as typeof window & {
      __marketplaceMocks__?: {
        entries: Array<Record<string, unknown>>;
        imports: Record<string, unknown>;
        errors?: Record<string, string>;
      };
      __marketplaceFetchPatched__?: boolean;
    };

    globalObject.__marketplaceMocks__ = { entries, imports, errors };

    if (globalObject.__marketplaceFetchPatched__) {
      return;
    }

    const originalFetch = window.fetch.bind(window);

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = input instanceof Request ? input : new Request(input, init);
      const url = request.url;
      const method = request.method.toUpperCase();
      const mocks = globalObject.__marketplaceMocks__;

      if (mocks && url.includes('/api/v1/marketplace') && !url.includes('/import')) {
        return new Response(JSON.stringify({ entries: mocks.entries }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (mocks && url.includes('/api/v1/marketplace') && url.includes('/import') && method === 'POST') {
        const match = url.match(/\/marketplace\/([^/]+)\/import/);
        const entryId = match?.[1];
        if (entryId && mocks.errors && Object.prototype.hasOwnProperty.call(mocks.errors, entryId)) {
          return new Response(JSON.stringify({ detail: mocks.errors[entryId] }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        if (entryId && mocks.imports && Object.prototype.hasOwnProperty.call(mocks.imports, entryId)) {
          return new Response(JSON.stringify(mocks.imports[entryId]), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return new Response(JSON.stringify({ detail: 'Marketplace entry not found nas fixtures locais.' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      return originalFetch(request);
    };

    globalObject.__marketplaceFetchPatched__ = true;
  }, { entries, imports, errors: errors ?? {} });
}

test.describe('Marketplace - catálogo e importação assistida', () => {
  let catalogFixture: MarketplaceCatalogFixture;

  test.beforeEach(async () => {
    catalogFixture = await loadBackendFixture<MarketplaceCatalogFixture>('marketplace_catalog.json');
  });

  test('filtra catálogo e importa agente com sucesso', async ({ page }) => {
    const adjustedEntries = catalogFixture.entries.map((entry) => ({
      ...entry,
      rating: typeof entry.rating === 'number' ? Math.max(entry.rating, 5) : 5,
    }));

    await mockMarketplaceFetch(page, {
      entries: adjustedEntries,
      imports: catalogFixture.imports,
    });
    await page.goto('/?view=marketplace');
    await page.waitForSelector('role=status[name="Carregando Marketplace…"]', { state: 'detached' });

    const marketplacePanel = page.getByRole('tabpanel', { name: 'Marketplace' });
    const listItems = marketplacePanel.getByRole('listitem');

    await marketplacePanel.getByLabel('Pesquisar').fill('checkout');
    await expect(listItems).toHaveCount(1);

    await marketplacePanel.getByLabel('Pesquisar').fill('');
    const originFilter = marketplacePanel.getByRole('combobox', { name: /^Origem$/ });
    await originFilter.selectOption('community');
    await expect(listItems).toHaveCount(1);
    await originFilter.selectOption('all');
    await expect(listItems).toHaveCount(adjustedEntries.length);

    const costInput = marketplacePanel.getByLabel('Custo máx. estimado (USD)');
    await costInput.fill('5');
    await expect(listItems).toHaveCount(1);
    await costInput.fill('');
    await expect(listItems).toHaveCount(adjustedEntries.length);

    const checkoutCard = listItems.filter({ hasText: 'Governed Checkout' });
    await expect(checkoutCard).toHaveCount(1);

    const importButton = checkoutCard.getByRole('button', { name: 'Importar via Config Assistant' });
    await importButton.click();
    await expect(page.getByRole('heading', { name: 'Plano gerado para Governed Checkout' })).toBeVisible();
    await expect(marketplacePanel.locator('.marketplace__steps li')).toHaveCount(1);
    await expect(marketplacePanel.locator('.marketplace__code').first()).toContainText('name: governed-checkout');
    await expect(marketplacePanel.locator('.marketplace__import')).toContainText('Assinatura verificada com sucesso');
  });

  test('exibe feedback de erro quando importação falha', async ({ page }) => {
    const adjustedEntries = catalogFixture.entries.map((entry) => ({
      ...entry,
      rating: typeof entry.rating === 'number' ? Math.max(entry.rating, 5) : 5,
    }));

    await mockMarketplaceFetch(page, {
      entries: adjustedEntries,
      imports: catalogFixture.imports,
      errors: catalogFixture.errors,
    });
    await page.goto('/?view=marketplace');
    await page.waitForSelector('role=status[name="Carregando Marketplace…"]', { state: 'detached' });

    const marketplacePanel = page.getByRole('tabpanel', { name: 'Marketplace' });
    const codexCard = marketplacePanel.getByRole('listitem').filter({ hasText: 'Codex Labs Analyzer' });
    const importButton = codexCard.getByRole('button', { name: 'Importar via Config Assistant' });

    await importButton.click();

    const errorStatus = marketplacePanel.locator('.marketplace__status--error');
    await expect(errorStatus).toBeVisible();
    await expect(errorStatus).toContainText('Falha ao importar Codex Labs Analyzer via fixtures.');
    await expect(marketplacePanel.locator('.marketplace__import')).not.toBeVisible();
  });
});
