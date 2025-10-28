import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { defineConfig } from 'vitest/config';

const require = createRequire(import.meta.url);
require('../tests/suppress-sass-warnings.cjs');

process.env.SASS_SILENCE_DEPRECATIONS =
  process.env.SASS_SILENCE_DEPRECATIONS ?? 'legacy-js-api';
if (!process.env.CONSOLE_MCP_USE_FIXTURES) {
  process.env.CONSOLE_MCP_USE_FIXTURES = 'auto';
}

const cpuCount = Math.max(1, os.cpus()?.length ?? 1);
const maxWorkers = Math.max(1, Math.min(cpuCount - 1, 6));
const minWorkers = Math.max(1, Math.min(2, maxWorkers));

export default defineConfig({
  test: {
    environment: 'jsdom',
    environmentOptions: {
      jsdom: {
        pretendToBeVisual: true,
      },
    },
    setupFiles: './src/setupTests.ts',
    globals: true,
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/__fixtures__/**',
      '**/__mocks__/**',
      '**/__snapshots__/**',
    ],
    watch: false,
    maxThreads: maxWorkers,
    minThreads: minWorkers,
    testTimeout: 30_000,
    hookTimeout: 15_000,
    isolate: true,
    cacheDir: path.resolve(__dirname, '../.vitest'),
    alias: {
      '#fixtures': path.resolve(__dirname, '../tests/fixtures/backend/data'),
    },
    reporters: process.env.CI ? ['default', 'junit'] : ['default'],
    outputFile: process.env.CI
      ? { junit: path.resolve(__dirname, '../.vitest/junit.xml') }
      : undefined,
  },
  resolve: {
    alias: {
      '#fixtures': path.resolve(__dirname, '../tests/fixtures/backend/data'),
    },
  },
  define: {
    'import.meta.env.VITE_CONSOLE_USE_FIXTURES': JSON.stringify(false),
  },
  esbuild: {
    jsx: 'automatic',
    jsxImportSource: undefined,
  },
});
