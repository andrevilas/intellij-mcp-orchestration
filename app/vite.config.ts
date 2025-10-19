import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

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
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '#fixtures': path.resolve(__dirname, '../tests/fixtures/backend'),
    },
  },
  server: {
    port: frontendPort,
    host: frontendHost,
    fs: {
      allow: [path.resolve(__dirname, '.'), path.resolve(__dirname, '../tests/fixtures')],
    },
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
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    globals: true,
  },
});
