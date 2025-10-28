import '@testing-library/jest-dom/vitest';
import { afterAll, afterEach, beforeAll, beforeEach, expect, vi } from 'vitest';

type VitestExpect = typeof expect;
type VitestVi = typeof vi;
import { resetMockState, server } from './mocks/server';
import { beginOpenHandleSnapshot, consumeOpenHandleLeaks, finalizeOpenHandleSnapshot } from './testing/openHandleTracker';

const originalConsoleError = console.error.bind(console);
console.error = (...args: unknown[]) => {
  const first = args[0];
  if (typeof first === 'string' && first.includes('WebSocket server error: Port is already in use')) {
    return;
  }
  if (first instanceof Error && first.message.includes('WebSocket server error: Port is already in use')) {
    return;
  }
  originalConsoleError(...args);
};

declare global {
  // eslint-disable-next-line no-var
  var __CONSOLE_MCP_FIXTURES__: 'ready' | 'error' | 'disabled' | undefined;
  // Vitest exposes globals quando `globals: true`, porém os registramos explicitamente
  // para evitar flutuações em ambientes que não carregam o runtime padrão (ex.: Playwright).
  // eslint-disable-next-line no-var
  var vi: VitestVi;
  // eslint-disable-next-line no-var
  var expect: VitestExpect;
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
globalThis.vi ??= vi;
globalThis.expect ??= expect;

if (typeof URL.createObjectURL !== 'function') {
  (URL as unknown as { createObjectURL: (blob: Blob) => string }).createObjectURL = () => 'blob:mock-url';
}
if (typeof URL.revokeObjectURL !== 'function') {
  (URL as unknown as { revokeObjectURL: (url: string) => void }).revokeObjectURL = () => {};
}

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
  globalThis.__CONSOLE_MCP_FIXTURES__ = 'ready';
});

beforeEach((context) => {
  beginOpenHandleSnapshot(context);
});

afterEach((context) => {
  finalizeOpenHandleSnapshot(context);
  server.resetHandlers();
  resetMockState();
});

afterAll(() => {
  server.close();
  globalThis.__CONSOLE_MCP_FIXTURES__ = 'disabled';
  const leaks = consumeOpenHandleLeaks();
  if (leaks.length > 0) {
    const diagnostics = leaks
      .map((leak) => `${leak.testName}: ${leak.handles.join(', ')}`)
      .join('\n');
    throw new Error(
      `Foram detectados handles abertos após a execução de ${leaks.length} teste(s):\n${diagnostics}`,
    );
  }
});
