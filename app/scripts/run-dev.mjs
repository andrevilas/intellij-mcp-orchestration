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

for (const arg of argv) {
  if (arg === '--fixtures' || arg === '--msw') {
    requestedMode = 'force';
    continue;
  }

  if (arg === '--proxy' || arg === '--backend') {
    requestedMode = 'off';
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

const env = { ...process.env };

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
