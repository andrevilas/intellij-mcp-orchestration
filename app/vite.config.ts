import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { visualizer } from 'rollup-plugin-visualizer';
import path from 'node:path';
import net from 'node:net';

const HTTP_PROBE_TIMEOUT_MS = 1_500;
const HTTP_PROBE_PATH = '/api/v1/healthz';

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

interface BackendProbeResult {
  reachable: boolean;
  reason: string | null;
}

const probeBackend = async (target: string): Promise<BackendProbeResult> => {
  try {
    const baseUrl = new URL(target);
    const port = baseUrl.port
      ? Number.parseInt(baseUrl.port, 10)
      : baseUrl.protocol === 'https:'
        ? 443
        : 80;

    const tcpReachable = await probeTcpPort(baseUrl.hostname, port);
    if (!tcpReachable) {
      return {
        reachable: false,
        reason: `falha na sonda TCP para ${baseUrl.hostname}:${port}`,
      };
    }

    const healthUrl = new URL(HTTP_PROBE_PATH, baseUrl);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), HTTP_PROBE_TIMEOUT_MS);

    try {
      const response = await fetch(healthUrl, {
        method: 'GET',
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!response.ok) {
        return {
          reachable: false,
          reason: `resposta HTTP ${response.status} ao consultar ${healthUrl.pathname}`,
        };
      }

      return { reachable: true, reason: null };
    } catch (error) {
      clearTimeout(timeout);
      const cause = error instanceof Error ? error.message : String(error);
      return {
        reachable: false,
        reason: `falha HTTP ao consultar ${healthUrl.pathname}: ${cause}`,
      };
    }
  } catch (error) {
    return {
      reachable: false,
      reason: `URL inválida para probe (${target}): ${error instanceof Error ? error.message : String(error)}`,
    };
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

const viewManualChunks = [
  { segments: ['pages', 'Dashboard'], chunk: 'view-dashboard' },
  { segments: ['pages', 'Observability'], chunk: 'view-observability' },
  { segments: ['pages', 'Servers'], chunk: 'view-servers' },
  { segments: ['pages', 'Agents'], chunk: 'view-agents' },
  { segments: ['pages', 'Keys'], chunk: 'view-keys' },
  { segments: ['pages', 'Security'], chunk: 'view-security' },
  { segments: ['pages', 'Policies'], chunk: 'view-policies' },
  { segments: ['pages', 'Routing'], chunk: 'view-routing' },
  { segments: ['pages', 'Flows'], chunk: 'view-flows' },
  { segments: ['pages', 'FinOps'], chunk: 'view-finops' },
  { segments: ['pages', 'Marketplace'], chunk: 'view-marketplace' },
  { segments: ['pages', 'AdminChat'], chunk: 'view-admin-chat' },
  { segments: ['components', 'UiKitShowcase'], chunk: 'view-ui-kit' },
];

const vendorManualChunks = [
  { moduleName: 'recharts', chunk: 'vendor-recharts' },
  { moduleName: 'reactflow', chunk: 'vendor-reactflow' },
];

const matchesPathSegments = (id: string, segments: string[]): boolean => {
  const posixPath = segments.join('/');
  const windowsPath = segments.join('\\');
  return id.includes(`/${posixPath}`) || id.includes(`\\${windowsPath}`);
};

const normalizeId = (id: string): string => id.replace(/\\/g, '/');

const matchesVendorModule = (id: string, moduleName: string): boolean => {
  const normalized = normalizeId(id);
  return (
    normalized.includes(`/node_modules/${moduleName}/`) ||
    normalized.includes(`/node_modules/.pnpm/${moduleName}@`)
  );
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
  } else {
    const probe = await probeBackend(API_PROXY_TARGET);
    if (!probe.reachable) {
      useFixtures = true;
      fixtureReason = probe.reason
        ? `backend indisponível em ${API_PROXY_TARGET} — ${probe.reason}`
        : `backend indisponível em ${API_PROXY_TARGET}`;
      const overrideLabel = fixtureMode === 'off' ? ' (modo off sobrescrito)' : '';
      console.warn(
        'Console MCP backend não detectado em %s — habilitando fixtures%s.',
        API_PROXY_TARGET,
        overrideLabel,
      );
      if (probe.reason) {
        console.warn('Motivo detectado para indisponibilidade do backend: %s.', probe.reason);
      }
    } else if (fixtureMode === 'auto') {
      console.info(
        'Console MCP backend detectado em %s — mantendo proxy HTTP do Vite.',
        API_PROXY_TARGET,
      );
    }
  }

  if (runningVitest) {
    if (!useFixtures && fixtureMode === 'off') {
      console.warn(
        'Vitest detectado com fixtures desativadas — sobrescrevendo para evitar dependência do backend.',
      );
    }
    useFixtures = true;
    fixtureReason = 'Vitest em execução';
  }

  if (useFixtures) {
    const reasonSuffix = fixtureReason ? ` (${fixtureReason})` : '';
    console.info(`Console MCP frontend está rodando em modo fixtures${reasonSuffix}.`);
  } else {
    console.info('Console MCP frontend operando em modo proxy. Destino: %s', API_PROXY_TARGET);
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
            for (const { moduleName, chunk } of vendorManualChunks) {
              if (matchesVendorModule(id, moduleName)) {
                return chunk;
              }
            }

            for (const { segments, chunk } of viewManualChunks) {
              if (matchesPathSegments(id, segments)) {
                return chunk;
              }
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
