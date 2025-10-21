#!/usr/bin/env node
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import {
  computeExecutablePath,
  detectBrowserPlatform,
  install,
} from '@puppeteer/browsers';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, '..');
const cacheDir = path.resolve(appRoot, '.cache', 'chrome');
const chromeBuild = process.env.LHCI_CHROME_BUILD ?? 'stable';

async function ensureChrome() {
  const existingPath = process.env.LHCI_CHROME_PATH ?? process.env.CHROME_PATH;
  if (existingPath) {
    try {
      await fs.access(existingPath);
      return existingPath;
    } catch {
      // Ignore and fallback to auto-installation below.
    }
  }

  const platform = detectBrowserPlatform();
  if (!platform) {
    throw new Error('Chrome headless não é suportado nesta plataforma.');
  }

  await install({
    browser: 'chrome',
    cacheDir,
    platform,
    buildId: chromeBuild,
  });

  const executablePath = computeExecutablePath({
    browser: 'chrome',
    cacheDir,
    platform,
    buildId: chromeBuild,
  });

  return executablePath;
}

function runCommand(command, args, env) {
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

    child.on('error', (error) => {
      reject(error);
    });
  });
}

async function main() {
  const chromePath = await ensureChrome();

  const lhciBin = process.platform === 'win32'
    ? path.resolve(appRoot, 'node_modules', '.bin', 'lhci.cmd')
    : path.resolve(appRoot, 'node_modules', '.bin', 'lhci');

  const env = {
    ...process.env,
    CHROME_PATH: chromePath,
    LHCI_CHROME_PATH: chromePath,
  };

  await runCommand(lhciBin, ['autorun', '--config=./lhci.config.cjs'], env);
}

main().catch((error) => {
  console.error('[lighthouse:ci] Falha ao executar Lighthouse CI:', error);
  process.exit(1);
});
