import '@testing-library/jest-dom/vitest';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { resetMockState, server } from './mocks/server';

declare global {
  // eslint-disable-next-line no-var
  var __CONSOLE_MCP_FIXTURES__: 'ready' | 'error' | 'disabled' | undefined;
}

const requestAnimationFrameShim: Window['requestAnimationFrame'] = (callback) => {
  const timeout = setTimeout(() => {
    const timestamp =
      typeof performance !== 'undefined' && typeof performance.now === 'function'
        ? performance.now()
        : Date.now();

    callback(timestamp);
  }, 0);

  return timeout as unknown as number;
};

const cancelAnimationFrameShim: Window['cancelAnimationFrame'] = (handle) => {
  clearTimeout(handle as unknown as ReturnType<typeof setTimeout>);
};

globalThis.requestAnimationFrame ??= requestAnimationFrameShim;
globalThis.cancelAnimationFrame ??= cancelAnimationFrameShim;

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
  globalThis.__CONSOLE_MCP_FIXTURES__ = 'ready';
});

afterEach(() => {
  server.resetHandlers();
  resetMockState();
});

afterAll(() => {
  server.close();
  globalThis.__CONSOLE_MCP_FIXTURES__ = 'disabled';
});
