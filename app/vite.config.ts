import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
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

  let useFixtures = fixtureMode === 'force';

  if (fixtureMode === 'auto') {
    const reachable = await isBackendReachable(API_PROXY_TARGET);
    if (!reachable) {
      console.info('Console MCP backend not detected — enabling local fixtures.');
      useFixtures = true;
    }
  }

  if (fixtureMode === 'off') {
    useFixtures = false;
  }

  if (useFixtures) {
    console.info('Console MCP frontend is running in fixture mode.');
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

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '#fixtures': path.resolve(__dirname, '../tests/fixtures/backend'),
      },
    },
    server: serverConfig,
    define: {
      'import.meta.env.VITE_CONSOLE_USE_FIXTURES': JSON.stringify(useFixtures),
    },
    test: {
      environment: 'jsdom',
      setupFiles: './src/test/setup.ts',
      globals: true,
    },
  };
});
