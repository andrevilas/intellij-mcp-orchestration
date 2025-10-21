#!/usr/bin/env node
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, '..');

function run(command, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: appRoot,
      stdio: 'inherit',
      env,
    });

    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Processo ${command} encerrou com código ${code ?? 'desconhecido'}`));
      }
    });

    child.on('error', (error) => reject(error));
  });
}

async function main() {
  const baseEnv = { ...process.env };

  await run('pnpm', ['run', 'build'], {
    ...baseEnv,
    ANALYZE_BUNDLE: '1',
  });

  await run('pnpm', ['run', 'report:bundle'], baseEnv);

  const publishScript = path.resolve(__dirname, 'publish-performance-artifacts.mjs');
  await run(process.execPath, [publishScript], baseEnv);
}

main().catch((error) => {
  console.error('[build:bundle-report] Falha ao gerar relatórios de bundle:', error);
  process.exit(1);
});
