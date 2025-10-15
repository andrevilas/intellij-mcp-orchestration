#!/usr/bin/env node
import { spawn } from 'node:child_process';

const parsePort = (value, fallback) => {
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

const normalizeHost = (host) => {
  if (host === '0.0.0.0' || host === '::') {
    return '127.0.0.1';
  }
  return host;
};

const frontendHost = process.env.CONSOLE_MCP_FRONTEND_HOST ?? '127.0.0.1';
const frontendPort = parsePort(process.env.CONSOLE_MCP_FRONTEND_PORT, 5173);
const devServerUrl =
  process.env.VITE_DEV_SERVER_URL ??
  `http://${normalizeHost(frontendHost)}:${frontendPort}`;

console.log(
  `[desktop] Abrindo Electron com VITE_DEV_SERVER_URL=${devServerUrl}.`,
);

const child = spawn('electron', ['.'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    VITE_DEV_SERVER_URL: devServerUrl,
  },
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});

child.on('error', (error) => {
  console.error('[desktop] Falha ao iniciar o Electron:', error);
  process.exit(1);
});
