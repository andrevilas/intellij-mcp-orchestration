import '@testing-library/jest-dom/vitest';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { server } from '../mocks/server';

declare global {
  // eslint-disable-next-line no-var
  var __CONSOLE_MCP_FIXTURES__: 'ready' | 'error' | 'disabled' | undefined;
}

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
  globalThis.__CONSOLE_MCP_FIXTURES__ = 'ready';
});

afterEach(() => server.resetHandlers());

afterAll(() => {
  server.close();
  globalThis.__CONSOLE_MCP_FIXTURES__ = 'disabled';
});
