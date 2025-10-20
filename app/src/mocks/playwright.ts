import { handlers } from './handlers';

export const fixtureHandlers = handlers;

const FIXTURE_READY_FLAG = '__CONSOLE_MCP_FIXTURES__';

interface PageLike {
  waitForFunction(
    pageFunction: (...args: unknown[]) => unknown,
    arg?: unknown,
    options?: { timeout?: number },
  ): Promise<unknown>;
  evaluate<R>(pageFunction: (...args: unknown[]) => R, arg?: unknown): Promise<R>;
}

export async function waitForFixtureWorker(page: PageLike, timeout = 5_000): Promise<void> {
  await page.waitForFunction(
    (flag) => {
      const globalObject = window as typeof window & { [key: string]: string | undefined };
      const status = globalObject[flag];
      return status === 'ready' || status === 'disabled' || status === 'error';
    },
    FIXTURE_READY_FLAG,
    { timeout },
  );

  const status = await page.evaluate(
    (flag) => {
      const globalObject = window as typeof window & { [key: string]: string | undefined };
      return globalObject[flag];
    },
    FIXTURE_READY_FLAG,
  );

  if (status === 'error') {
    throw new Error('Console MCP fixture worker failed to initialize.');
  }
}

export { FIXTURE_READY_FLAG };
