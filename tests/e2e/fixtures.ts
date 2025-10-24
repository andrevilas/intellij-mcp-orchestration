import { expect as baseExpect, test as base } from '@playwright/test';
import { waitForFixtureWorker, FIXTURE_READY_FLAG } from '../../app/src/mocks/playwright';

type FixturePreference = 'force' | 'off' | 'auto';

function resolveFixturePreference(): FixturePreference {
  const raw = process.env.CONSOLE_MCP_USE_FIXTURES;
  if (!raw) {
    return 'auto';
  }

  const normalized = raw.trim().toLowerCase();
  if (['off', '0', 'false', 'no'].includes(normalized)) {
    return 'off';
  }
  if (['force', 'on', 'true', 'yes', '1', 'fixtures'].includes(normalized)) {
    return 'force';
  }
  return 'auto';
}

export const test = base.extend({
  page: async ({ page }, use) => {
    const originalGoto = page.goto.bind(page);
    const originalReload = page.reload.bind(page);
    const preference = resolveFixturePreference();

    await page.addInitScript(
      ({ flag, status }) => {
        if (!status) {
          return;
        }

        try {
          const globalObject = window as typeof window & { [key: string]: unknown };
          globalObject[flag] = status;
        } catch (error) {
          console.warn('Não foi possível inicializar flag de fixtures antes do carregamento.', error);
        }
      },
      {
        flag: FIXTURE_READY_FLAG,
        status: preference === 'force' ? ('ready' as const) : preference === 'off' ? ('disabled' as const) : undefined,
      },
    );

    await page.addInitScript(() => {
      try {
        window.localStorage?.clear();
        window.sessionStorage?.clear();
      } catch (error) {
        console.warn('Não foi possível limpar storage antes do teste', error);
      }
    });

    const waitForNetworkIdle = async () => {
      try {
        await page.waitForLoadState('networkidle', { timeout: 2_000 });
      } catch {
        // ignore timeouts — networkidle nem sempre é atingido em páginas leves
      }
    };

    page.goto = (async (...args) => {
      const response = await originalGoto(...args);
      await waitForFixtureWorker(page);
      await waitForNetworkIdle();
      return response;
    }) as typeof page.goto;

    page.reload = (async (...args) => {
      const response = await originalReload(...args);
      await waitForFixtureWorker(page);
      await waitForNetworkIdle();
      return response;
    }) as typeof page.reload;

    await use(page);
  },
});

export const expect = baseExpect;

export async function loadBackendFixture<T = unknown>(name: string): Promise<T> {
  const module = await import(`../fixtures/backend/${name}`, { with: { type: 'json' } });
  return module.default as T;
}
