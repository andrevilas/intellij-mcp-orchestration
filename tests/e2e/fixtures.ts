import { expect as baseExpect, test as base } from '@playwright/test';
import { waitForFixtureWorker } from '../../app/src/mocks/playwright';

export const test = base.extend({
  page: async ({ page }, use) => {
    const originalGoto = page.goto.bind(page);
    page.goto = (async (...args) => {
      const response = await originalGoto(...args);
      await waitForFixtureWorker(page);
      return response;
    }) as typeof page.goto;

    await use(page);
  },
});

export const expect = baseExpect;
