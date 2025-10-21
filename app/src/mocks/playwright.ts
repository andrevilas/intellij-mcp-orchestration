import { handlers } from './handlers';

export const fixtureHandlers = handlers;

const FIXTURE_READY_FLAG = '__CONSOLE_MCP_FIXTURES__';

type FixtureStatus = 'ready' | 'disabled' | 'error';

interface PageLike {
  waitForFunction(
    pageFunction: (...args: unknown[]) => unknown,
    arg?: unknown,
    options?: { timeout?: number },
  ): Promise<unknown>;
  evaluate<R>(pageFunction: (...args: unknown[]) => R, arg?: unknown): Promise<R>;
}

export async function waitForFixtureWorker(page: PageLike, timeout = 10_000): Promise<void> {
  await page.waitForFunction(
    (flag) => {
      const readyFlag = flag as typeof FIXTURE_READY_FLAG;
      const globalObject = window as typeof window & { [FIXTURE_READY_FLAG]?: FixtureStatus };
      const status = globalObject[readyFlag];
      return status === 'ready' || status === 'disabled' || status === 'error';
    },
    FIXTURE_READY_FLAG,
    { timeout },
  );

  const status = await page.evaluate<FixtureStatus | undefined>(
    (flag) => {
      const readyFlag = flag as typeof FIXTURE_READY_FLAG;
      const globalObject = window as typeof window & { [FIXTURE_READY_FLAG]?: FixtureStatus };
      return globalObject[readyFlag];
    },
    FIXTURE_READY_FLAG,
  );

  if (status === 'error') {
    throw new Error('Console MCP fixture worker failed to initialize.');
  }
}

export { FIXTURE_READY_FLAG };
