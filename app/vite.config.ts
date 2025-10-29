import path from 'node:path';
import { createRequire } from 'node:module';
import { createLogger, defineConfig, mergeConfig } from 'vite';
import react from '@vitejs/plugin-react';
import cssnano from 'cssnano';
import { visualizer } from 'rollup-plugin-visualizer';

const require = createRequire(import.meta.url);
require('../tests/suppress-sass-warnings.cjs');

if (!process.env.SASS_SILENCE_DEPRECATIONS) {
  process.env.SASS_SILENCE_DEPRECATIONS = 'all';
}

if (!process.env.SASS_SUPPRESS_DEPRECATIONS) {
  process.env.SASS_SUPPRESS_DEPRECATIONS = '1';
}

const isCI = process.env.CI === 'true';
const analyzeBundle = process.env.ANALYZE_BUNDLE === '1';

type FixturePreference = 'auto' | 'force' | 'off';

const coerceFixturePreference = (): FixturePreference => {
  const raw = (process.env.CONSOLE_MCP_USE_FIXTURES ?? 'auto').trim().toLowerCase();
  if (raw === 'off' || raw === '0' || raw === 'false' || raw === 'backend' || raw === 'proxy') {
    return 'off';
  }
  if (raw === 'force' || raw === 'fixtures' || raw === 'msw' || raw === 'on' || raw === '1' || raw === 'true') {
    return 'force';
  }
  return 'auto';
};

const isTestEnvironment =
  process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST_WORKER_ID) || Boolean(process.env.VITEST);

const fixturePreference = coerceFixturePreference();
const shouldEnableFixtures = isTestEnvironment || fixturePreference !== 'off';

const resolveDevServerPort = (): number | undefined => {
  const rawPort = process.env.CONSOLE_MCP_FRONTEND_PORT?.trim();
  if (!rawPort) {
    return undefined;
  }
  const parsed = Number(rawPort);
  if (Number.isNaN(parsed)) {
    console.warn('[vite] CONSOLE_MCP_FRONTEND_PORT inválido (%s) — usando porta padrão.', rawPort);
    return undefined;
  }
  return parsed;
};

const serverHost = process.env.CONSOLE_MCP_FRONTEND_HOST?.trim();
const serverPort = resolveDevServerPort();

const resolveProxyTarget = (envVar: string, fallback: string): string => {
  const value = process.env[envVar]?.trim();
  if (value && value.length > 0) {
    return value;
  }
  return fallback;
};

const defaultProxyHost = process.env.CONSOLE_MCP_SERVER_HOST?.trim() || '127.0.0.1';
const defaultProxyPort = process.env.CONSOLE_MCP_SERVER_PORT?.trim() || '8000';
const apiProxyTarget = resolveProxyTarget(
  'CONSOLE_MCP_API_PROXY',
  `http://${defaultProxyHost}:${defaultProxyPort}`,
);
const agentsProxyTarget = resolveProxyTarget('CONSOLE_MCP_AGENTS_PROXY', apiProxyTarget);

const serverConfig = {
  ...(serverHost ? { host: serverHost } : {}),
  ...(serverPort !== undefined ? { port: serverPort, strictPort: true } : {}),
  ...(!shouldEnableFixtures
    ? {
        proxy: {
          '/api': {
            target: apiProxyTarget,
            changeOrigin: true,
          },
          '/agents': {
            target: agentsProxyTarget,
            changeOrigin: true,
          },
        },
      }
    : {}),
};

if (shouldEnableFixtures) {
  const modeLabel = isTestEnvironment ? 'test runner' : fixturePreference === 'force' ? 'fixtures (force)' : 'fixtures (auto)';
  console.info('[vite] Inicializando em modo %s — backend real não será acessado.', modeLabel);
} else {
  console.info('[vite] Proxy HTTP habilitado — encaminhando /api e /agents para %s.', apiProxyTarget);
}

const viteLogger = createLogger();

const filteredLogger = {
  ...viteLogger,
  warn(msg, options) {
    if (typeof msg === 'string' && msg.includes('legacy-js-api')) {
      return;
    }
    viteLogger.warn(msg, options);
  },
  info(msg, options) {
    if (typeof msg === 'string' && msg.includes('legacy-js-api')) {
      return;
    }
    viteLogger.info(msg, options);
  },
};

const baseConfig = defineConfig({
  plugins: [react()],
  customLogger: filteredLogger,
  server: serverConfig,
  resolve: {
    alias: {
      '#fixtures': path.resolve(__dirname, '../tests/fixtures/backend/data'),
    },
  },
  define: {
    'import.meta.env.VITE_CONSOLE_USE_FIXTURES': JSON.stringify(shouldEnableFixtures),
  },
  css: {
    postcss: {
      plugins: [
        ...(process.env.NODE_ENV === 'production'
          ? [
              cssnano({
                preset: [
                  'default',
                  { discardComments: { removeAll: true } },
                ],
              }),
            ]
          : []),
      ],
    },
  },
  build: {
    sourcemap: !isCI,
  },
});

export default mergeConfig(baseConfig, {
  test: undefined,
  plugins: [
    ...(analyzeBundle
      ? [
          visualizer({
            filename: path.resolve(__dirname, 'metrics/bundle-visualizer.html'),
            template: 'treemap',
            gzipSize: true,
            brotliSize: true,
          }),
        ]
      : []),
  ],
});
