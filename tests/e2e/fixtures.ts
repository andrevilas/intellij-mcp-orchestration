import { expect as baseExpect, test as base } from '@playwright/test';
import { waitForFixtureWorker } from '../../app/src/mocks/playwright';

export const test = base.extend({
  page: async ({ page }, use) => {
    const originalGoto = page.goto.bind(page);
    const originalReload = page.reload.bind(page);

    await page.addInitScript(() => {
      try {
        window.localStorage?.clear();
        window.sessionStorage?.clear();
      } catch (error) {
        console.warn('Não foi possível limpar storage antes do teste', error);
      }
    });

    page.goto = (async (...args) => {
      const response = await originalGoto(...args);
      await waitForFixtureWorker(page);
      return response;
    }) as typeof page.goto;

    page.reload = (async (...args) => {
      const response = await originalReload(...args);
      await waitForFixtureWorker(page);
      return response;
    }) as typeof page.reload;

    await use(page);
  },
});

export const expect = baseExpect;
