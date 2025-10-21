import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { visualizer } from 'rollup-plugin-visualizer';
import path from 'node:path';
import net from 'node:net';

type FixtureMode = 'auto' | 'force' | 'off';

const parseBoolean = (value: string | undefined): boolean | null => {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) {
    return true;
  }
  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) {
    return false;
  }
  return null;
};

const resolveFixtureMode = (value: string | undefined): FixtureMode => {
  const parsed = parseBoolean(value);
  if (parsed === true) {
    return 'force';
  }
  if (parsed === false) {
    return 'off';
  }
  return 'auto';
};

const probeTcpPort = async (host: string, port: number): Promise<boolean> => {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port, timeout: 1_500 });

    const dispose = (result: boolean) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(result);
    };

    socket.once('connect', () => dispose(true));
    socket.once('timeout', () => dispose(false));
    socket.once('error', () => dispose(false));
  });
};

const isBackendReachable = async (target: string): Promise<boolean> => {
  try {
    const url = new URL(target);
    const port = url.port ? Number.parseInt(url.port, 10) : url.protocol === 'https:' ? 443 : 80;
    return probeTcpPort(url.hostname, port);
  } catch (error) {
    console.warn('Failed to parse backend URL for availability probe:', target, error);
    return false;
  }
};

const parsePort = (value: string | undefined, fallback: number): number => {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 65_535) {
    console.warn(
      `Ignorando porta inválida "${value}". Usando fallback ${fallback}.`,
    );
    return fallback;
  }

  return parsed;
};

const normalizeBrowserHost = (host: string): string => {
  if (host === '0.0.0.0' || host === '::') {
    return '127.0.0.1';
  }
  return host;
};

const frontendHost = process.env.CONSOLE_MCP_FRONTEND_HOST ?? '127.0.0.1';
const frontendPort = parsePort(process.env.CONSOLE_MCP_FRONTEND_PORT, 5173);

const backendHostRaw = process.env.CONSOLE_MCP_SERVER_HOST ?? '127.0.0.1';
const backendHost = normalizeBrowserHost(backendHostRaw);
const backendPort = parsePort(process.env.CONSOLE_MCP_SERVER_PORT, 8000);

const API_PROXY_TARGET =
  process.env.CONSOLE_MCP_API_PROXY ?? `http://${backendHost}:${backendPort}`;
const AGENTS_PROXY_TARGET =
  process.env.CONSOLE_MCP_AGENTS_PROXY ?? API_PROXY_TARGET;

// https://vitejs.dev/config/
export default defineConfig(async () => {
  const fixtureMode = resolveFixtureMode(process.env.CONSOLE_MCP_USE_FIXTURES);

  const runningVitest = Boolean(process.env.VITEST);

  let useFixtures = false;
  let fixtureReason: string | null = null;

  if (fixtureMode === 'force') {
    useFixtures = true;
    fixtureReason = 'forçado via CONSOLE_MCP_USE_FIXTURES';
  } else if (fixtureMode === 'auto') {
    const reachable = await isBackendReachable(API_PROXY_TARGET);
    if (!reachable) {
      useFixtures = true;
      fixtureReason = `backend indisponível em ${API_PROXY_TARGET}`;
      console.info(
        'Console MCP backend não detectado em %s — habilitando fixtures (modo auto).',
        API_PROXY_TARGET,
      );
    } else {
      console.info(
        'Console MCP backend detectado em %s — mantendo proxy HTTP do Vite.',
        API_PROXY_TARGET,
      );
    }
  }

  if (fixtureMode === 'off') {
    useFixtures = false;
    fixtureReason = null;
  }

  if (runningVitest) {
    if (fixtureMode === 'off') {
      console.warn(
        'Vitest detectado com fixtures desativadas — sobrescrevendo para evitar dependência do backend.',
      );
    }
    useFixtures = true;
    fixtureReason = 'Vitest em execução';
  }

  if (useFixtures) {
    const reasonSuffix = fixtureReason ? ` (${fixtureReason})` : '';
    console.info(`Console MCP frontend está rodando em fixture mode${reasonSuffix}.`);
  } else {
    console.info('Proxying Console MCP API requests to %s', API_PROXY_TARGET);
  }

  const serverConfig: Record<string, unknown> = {
    port: frontendPort,
    host: frontendHost,
    fs: {
      allow: [path.resolve(__dirname, '.'), path.resolve(__dirname, '../tests/fixtures')],
    },
  };

  if (!useFixtures) {
    Object.assign(serverConfig, {
      proxy: {
        '/api': {
          target: API_PROXY_TARGET,
          changeOrigin: true,
        },
        '/agents': {
          target: AGENTS_PROXY_TARGET,
          changeOrigin: true,
        },
      },
    });
  }

  const shouldAnalyze = process.env.ANALYZE_BUNDLE === '1';

  return {
    plugins: [
      react(),
      ...(shouldAnalyze
        ? [
            visualizer({
              filename: path.resolve(__dirname, 'metrics', 'bundle-visualizer.html'),
              template: 'treemap',
              gzipSize: true,
              brotliSize: true,
            }),
          ]
        : []),
    ],
    resolve: {
      alias: {
        '#fixtures': path.resolve(__dirname, '../tests/fixtures/backend'),
      },
    },
    server: serverConfig,
    define: {
      'import.meta.env.VITE_CONSOLE_USE_FIXTURES': JSON.stringify(useFixtures),
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes(`${path.sep}pages${path.sep}Dashboard`)) {
              return 'view-dashboard';
            }
            if (id.includes(`${path.sep}pages${path.sep}Servers`)) {
              return 'view-servers';
            }
            if (id.includes(`${path.sep}pages${path.sep}FinOps`)) {
              return 'view-finops';
            }
            return undefined;
          },
        },
      },
    },
    test: {
      environment: 'jsdom',
      setupFiles: './src/test/setup.ts',
      globals: true,
    },
  };
});
