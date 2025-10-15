import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

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

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: frontendPort,
    host: frontendHost,
    proxy: {
      '/api': {
        target: API_PROXY_TARGET,
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
