#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const runCommand = (command, args) => {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.error) {
    throw result.error;
  }
  return result.status ?? 0;
};

const ensureParser = () => {
  try {
    require.resolve('@typescript-eslint/parser');
  } catch {
    console.info('Installing frontend lint dependencies via "pnpm --dir app install"...');
    const status = runCommand('pnpm', ['--dir', 'app', 'install']);
    if (status !== 0) {
      process.exit(status);
    }
  }
};

ensureParser();

const lintStatus = runCommand('pnpm', ['--dir', 'app', 'lint']);
process.exit(lintStatus);
