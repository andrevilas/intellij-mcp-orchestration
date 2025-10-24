#!/usr/bin/env node
import { spawn, execFile as execFileCallback } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import { promisify } from 'node:util';
import {
  computeExecutablePath,
  detectBrowserPlatform,
  install,
} from '@puppeteer/browsers';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, '..');
const cacheDir = path.resolve(appRoot, '.cache', 'chrome');
const chromeBuild = process.env.LHCI_CHROME_BUILD ?? 'stable';
const execFile = promisify(execFileCallback);
const shouldUseSudo = process.platform !== 'win32' && typeof process.getuid === 'function' && process.getuid() !== 0;

async function pathExists(candidate) {
  if (!candidate) {
    return false;
  }
  try {
    await fs.access(candidate);
    return true;
  } catch {
    return false;
  }
}

async function findExecutable(command) {
  try {
    const { stdout } = await execFile('which', [command]);
    const resolved = stdout.trim();
    if (resolved && (await pathExists(resolved))) {
      return resolved;
    }
  } catch {
    // Ignore lookup errors and continue with other candidates.
  }
  return null;
}

async function validateChromeExecutable(executablePath) {
  try {
    await execFile(executablePath, ['--version']);
    return true;
  } catch {
    return false;
  }
}

async function locateSystemChrome() {
  const commandCandidates = [
    'google-chrome-stable',
    'google-chrome',
    'chromium',
    'chromium-browser',
    'chromium-headless',
  ];

  for (const command of commandCandidates) {
    const resolved = await findExecutable(command);
    if (resolved && (await validateChromeExecutable(resolved))) {
      return resolved;
    }
  }

  const pathCandidates = [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/snap/bin/chromium',
  ];

  for (const candidate of pathCandidates) {
    if ((await pathExists(candidate)) && (await validateChromeExecutable(candidate))) {
      return candidate;
    }
  }

  return null;
}

function isForbiddenDownloadError(error) {
  if (!(error instanceof Error)) {
    return false;
  }
  return /status code\s*403/i.test(error.message) || /403/.test(String(error.cause ?? ''));
}

async function installChromeWithPuppeteer() {
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

  return computeExecutablePath({
    browser: 'chrome',
    cacheDir,
    platform,
    buildId: chromeBuild,
  });
}

let didUpdateApt = false;

async function ensureAptPackages(packages) {
  const aptGetPath = '/usr/bin/apt-get';
  if (!(await pathExists(aptGetPath))) {
    return false;
  }

  const env = {
    ...process.env,
    DEBIAN_FRONTEND: 'noninteractive',
  };

  if (!didUpdateApt) {
    try {
      await runCommand(aptGetPath, ['update'], { env, useSudo: true });
      didUpdateApt = true;
    } catch (error) {
      console.warn('[lighthouse:ci] Falha ao executar "apt-get update":', error instanceof Error ? error.message : error);
    }
  }

  if (packages.length === 0) {
    return true;
  }

  try {
    await runCommand(aptGetPath, ['install', '-y', ...packages], { env, useSudo: true });
    return true;
  } catch (error) {
    console.warn('[lighthouse:ci] Falha ao instalar dependências via apt-get:', error instanceof Error ? error.message : error);
    return false;
  }
}

async function installSystemChrome() {
  const aptGetPath = '/usr/bin/apt-get';
  if (!(await pathExists(aptGetPath))) {
    return null;
  }

  const env = {
    ...process.env,
    DEBIAN_FRONTEND: 'noninteractive',
  };

  await ensureAptPackages([]);

  const packageCandidates = ['chromium', 'chromium-browser'];
  for (const pkg of packageCandidates) {
    try {
      await runCommand(aptGetPath, ['install', '-y', pkg], { env, useSudo: true });
      const resolved = await locateSystemChrome();
      if (resolved) {
        return resolved;
      }
    } catch (error) {
      console.warn(
        `[lighthouse:ci] Falha ao instalar pacote ${pkg} via apt-get:`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  return locateSystemChrome();
}

async function downloadFile(url, destination) {
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await runCommand('curl', ['-fL', '--retry', '3', '--retry-delay', '1', '--output', destination, url], {
    env: process.env,
  });
}

async function createChromeWrapper(executablePath, persistentFlags = []) {
  if (process.platform === 'win32') {
    return executablePath;
  }

  const wrapperPath = path.resolve(cacheDir, 'chrome-with-flags.sh');
  const flags = ['--no-sandbox', ...persistentFlags].filter((flag, index, source) => source.indexOf(flag) === index);
  const script = [
    '#!/usr/bin/env bash',
    'set -euo pipefail',
    `exec "${executablePath}" ${flags.join(' ')} "$@"`,
    '',
  ].join('\n');

  await fs.mkdir(path.dirname(wrapperPath), { recursive: true });
  await fs.writeFile(wrapperPath, script, { mode: 0o755 });

  return wrapperPath;
}

async function installChromeFromDeb() {
  const architectureMap = {
    x64: 'amd64',
    arm64: 'arm64',
  };
  const debArch = architectureMap[process.arch];
  if (!debArch) {
    console.warn(`[lighthouse:ci] Download .deb não suportado para arquitetura ${process.arch}.`);
    return null;
  }

  const debName = `google-chrome-stable_current_${debArch}.deb`;
  const downloadUrl = `https://dl.google.com/linux/direct/${debName}`;
  const destination = path.resolve(cacheDir, debName);

  try {
    console.warn(`[lighthouse:ci] Baixando Chrome estável diretamente de ${downloadUrl}...`);
    await downloadFile(downloadUrl, destination);
  } catch (error) {
    console.warn('[lighthouse:ci] Falha ao baixar pacote .deb do Chrome:', error instanceof Error ? error.message : error);
    return null;
  }

  const env = { ...process.env, DEBIAN_FRONTEND: 'noninteractive' };

  const chromeDependencies = [
    'fonts-liberation',
    'libasound2',
    'libatk-bridge2.0-0',
    'libatk1.0-0',
    'libatspi2.0-0',
    'libcups2',
    'libgbm1',
    'libgtk-3-0',
    'libvulkan1',
    'libxcomposite1',
    'libxdamage1',
    'libxfixes3',
    'libxkbcommon0',
    'libxrandr2',
    'xdg-utils',
  ];

  await ensureAptPackages(chromeDependencies);

  try {
    await runCommand('dpkg', ['-i', destination], { env: process.env, useSudo: true });
  } catch (error) {
    console.warn('[lighthouse:ci] dpkg sinalizou dependências ausentes ao instalar Chrome. Tentando resolver automaticamente...');
    try {
      const installedDeps = await ensureAptPackages(chromeDependencies);
      if (!installedDeps) {
        await runCommand('/usr/bin/apt-get', ['install', '-f', '-y'], { env, useSudo: true });
      }
      await runCommand('dpkg', ['-i', destination], { env: process.env, useSudo: true });
    } catch (resolveError) {
      console.error(
        '[lighthouse:ci] Falha ao instalar dependências do Chrome via apt-get:',
        resolveError instanceof Error ? resolveError.message : resolveError,
      );
      return null;
    }
  }

  return locateSystemChrome();
}

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

  const systemChrome = await locateSystemChrome();
  if (systemChrome) {
    return systemChrome;
  }

  try {
    return await installChromeWithPuppeteer();
  } catch (error) {
    if (isForbiddenDownloadError(error)) {
      console.warn('[lighthouse:ci] Download do Chrome bloqueado (HTTP 403). Tentando instalar via apt-get...');
      const debChrome = await installChromeFromDeb();
      if (debChrome) {
        return debChrome;
      }
      console.warn('[lighthouse:ci] Instalação via pacote .deb falhou. Tentando apt-get como último recurso...');
      const fallbackChrome = await installSystemChrome();
      if (fallbackChrome) {
        return fallbackChrome;
      }
      console.error('[lighthouse:ci] Instalação automatizada falhou. Defina LHCI_CHROME_PATH manualmente.');
    }
    throw error;
  }
}

async function ensureBuildArtifacts() {
  if (process.env.LHCI_SKIP_BUILD === 'true') {
    return;
  }

  const pnpmBin = process.env.npm_execpath ?? 'pnpm';
  await runCommand(pnpmBin, ['run', 'build'], { env: process.env });
}

function runCommand(command, args, options = {}) {
  const { env = process.env, cwd = appRoot, useSudo = false } = options;
  const needsElevation = useSudo && shouldUseSudo;
  const resolvedCommand = needsElevation ? 'sudo' : command;
  const resolvedArgs = needsElevation ? [command, ...args] : args;
  return new Promise((resolve, reject) => {
    const child = spawn(resolvedCommand, resolvedArgs, {
      cwd,
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
  const resolvedChromePath = await ensureChrome();
  const chromePath = await createChromeWrapper(resolvedChromePath, ['--disable-dev-shm-usage']);
  await ensureBuildArtifacts();

  const lhciBin = process.platform === 'win32'
    ? path.resolve(appRoot, 'node_modules', '.bin', 'lhci.cmd')
    : path.resolve(appRoot, 'node_modules', '.bin', 'lhci');

  const chromeFlags = process.env.LHCI_CHROME_FLAGS ?? '--headless=new';

  const env = {
    ...process.env,
    CHROME_PATH: chromePath,
    LHCI_CHROME_PATH: chromePath,
    LHCI_CHROME_FLAGS: chromeFlags,
  };

  const chromeFlagsArg = `--chrome-flags=${JSON.stringify(chromeFlags)}`;

  await runCommand(lhciBin, ['autorun', '--config=./lhci.config.cjs', chromeFlagsArg], { env });
}

main().catch((error) => {
  console.error('[lighthouse:ci] Falha ao executar Lighthouse CI:', error);
  process.exit(1);
});
