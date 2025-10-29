#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const argv = process.argv.slice(2);

const passthroughArgs = [];
let requestedMode = null;

const modeAliases = new Map([
  ['fixtures', 'force'],
  ['msw', 'force'],
  ['proxy', 'off'],
  ['backend', 'off'],
  ['auto', 'auto'],
  ['force', 'force'],
  ['off', 'off'],
]);

const env = { ...process.env };

const normalizeHostPort = (value) => {
  if (!value) {
    return {};
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return {};
  }
  if (trimmed.includes('://')) {
    try {
      const url = new URL(trimmed);
      return {
        host: url.hostname,
        port: url.port || undefined,
        origin: url.origin,
      };
    } catch (error) {
      console.warn('[dev] Valor inválido para backend/proxy (%s): %s', value, error.message);
      return {};
    }
  }
  const [hostPart, portPart] = trimmed.split(':');
  if (portPart !== undefined) {
    return {
      host: hostPart || undefined,
      port: portPart || undefined,
    };
  }
  if (/^\d+$/.test(trimmed)) {
    return { port: trimmed };
  }
  return { host: trimmed };
};

const applyBackendTarget = (input) => {
  const { host, port, origin } = normalizeHostPort(input);
  if (host) {
    env.CONSOLE_MCP_SERVER_HOST = host;
  }
  if (port) {
    env.CONSOLE_MCP_SERVER_PORT = port;
  }
  if (origin) {
    env.CONSOLE_MCP_API_PROXY = origin;
    env.CONSOLE_MCP_AGENTS_PROXY = origin;
    return;
  }
  if (host || port) {
    const resolvedHost = env.CONSOLE_MCP_SERVER_HOST || '127.0.0.1';
    const resolvedPort = env.CONSOLE_MCP_SERVER_PORT || '8000';
    env.CONSOLE_MCP_API_PROXY = `http://${resolvedHost}:${resolvedPort}`;
    env.CONSOLE_MCP_AGENTS_PROXY = env.CONSOLE_MCP_API_PROXY;
  }
};

for (const arg of argv) {
  if (arg === '--fixtures' || arg === '--msw') {
    requestedMode = 'force';
    continue;
  }

  if (arg === '--proxy' || arg === '--backend') {
    requestedMode = 'off';
    continue;
  }

  if (arg.startsWith('--proxy=')) {
    const value = arg.split('=')[1];
    requestedMode = 'off';
    applyBackendTarget(value);
    continue;
  }

  if (arg.startsWith('--backend=')) {
    const value = arg.split('=')[1];
    requestedMode = 'off';
    applyBackendTarget(value);
    continue;
  }

  if (arg.startsWith('--fixtures=')) {
    const value = arg.split('=')[1]?.trim().toLowerCase();
    if (value && modeAliases.has(value)) {
      requestedMode = modeAliases.get(value);
      continue;
    }
  }

  if (arg.startsWith('--mode=')) {
    const value = arg.split('=')[1]?.trim().toLowerCase();
    if (value && modeAliases.has(value)) {
      requestedMode = modeAliases.get(value);
      continue;
    }
  }

  passthroughArgs.push(arg);
}

if (requestedMode) {
  env.CONSOLE_MCP_USE_FIXTURES = requestedMode;
  const label = requestedMode === 'off' ? 'modo proxy (backend real)' : requestedMode === 'force' ? 'fixtures MSW' : 'auto';
  console.info(
    '[dev] CONSOLE_MCP_USE_FIXTURES definido via argumento --%s (%s).',
    requestedMode === 'off' ? 'proxy' : requestedMode === 'force' ? 'fixtures' : 'mode',
    label,
  );
} else if (!env.CONSOLE_MCP_USE_FIXTURES) {
  env.CONSOLE_MCP_USE_FIXTURES = 'auto';
  console.info('[dev] CONSOLE_MCP_USE_FIXTURES não informado — usando modo "auto" (fixtures MSW).');
} else {
  console.info('[dev] CONSOLE_MCP_USE_FIXTURES=%s (mantido do ambiente).', env.CONSOLE_MCP_USE_FIXTURES);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const viteBin = path.resolve(__dirname, '../node_modules/vite/bin/vite.js');

const child = spawn(process.execPath, [viteBin, ...passthroughArgs], {
  stdio: 'inherit',
  env,
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
