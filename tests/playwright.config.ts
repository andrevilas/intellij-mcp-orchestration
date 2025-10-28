import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig, devices } from '@playwright/test';

const workspaceRoot = resolve(dirname(fileURLToPath(new URL('.', import.meta.url))));
const require = createRequire(import.meta.url);
const sassSilencerPath = resolve(workspaceRoot, 'suppress-sass-warnings.cjs');
require(sassSilencerPath);

function appendNodeRequire(nodeOptions: string | undefined, modulePath: string): string {
  const flag = `--require=${modulePath}`;
  if (!nodeOptions) {
    return flag;
  }

  if (nodeOptions.includes(flag)) {
    return nodeOptions;
  }

  return `${nodeOptions} ${flag}`;
}

const nodeOptionsWithSilencer = appendNodeRequire(process.env.NODE_OPTIONS, sassSilencerPath);
process.env.NODE_OPTIONS = nodeOptionsWithSilencer;

if (!process.env.SASS_SILENCE_DEPRECATIONS) {
  process.env.SASS_SILENCE_DEPRECATIONS = 'all';
}

if (!process.env.SASS_SUPPRESS_DEPRECATIONS) {
  process.env.SASS_SUPPRESS_DEPRECATIONS = '1';
}

function shouldInstallPlaywrightDeps(): boolean {
  const preference = process.env.PLAYWRIGHT_INSTALL_DEPS;
  if (typeof preference === 'string') {
    const normalized = preference.trim().toLowerCase();
    if (['0', 'false', 'no', 'off', 'skip'].includes(normalized)) {
      return false;
    }
    if (['1', 'true', 'yes', 'on', 'auto', 'deps'].includes(normalized)) {
      return true;
    }
  }
  return Boolean(process.env.CI);
}

if (shouldInstallPlaywrightDeps()) {
  try {
    execFileSync('pnpm', ['exec', 'playwright', 'install-deps'], {
      cwd: workspaceRoot,
      stdio: 'inherit',
    });
  } catch (error) {
    console.warn('Falha ao executar "playwright install-deps" automaticamente.', error);
  }
}

const traceSetting = process.env.PLAYWRIGHT_TRACE as
  | 'on'
  | 'retain-on-failure'
  | 'on-first-retry'
  | 'off'
  | undefined;

const videoSetting = process.env.PLAYWRIGHT_VIDEO as
  | 'on'
  | 'off'
  | 'retain-on-failure'
  | 'retry-with-video'
  | undefined;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  reporter: 'list',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:4173',
    trace: traceSetting ?? 'on-first-retry',
    video: videoSetting ?? 'off',
    headless: true,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'pnpm --dir ../app exec vite --host 0.0.0.0 --port 4173',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
    env: {
      CONSOLE_MCP_USE_FIXTURES: 'force',
      SASS_SILENCE_DEPRECATIONS: 'all',
      SASS_SUPPRESS_DEPRECATIONS: '1',
      NODE_OPTIONS: nodeOptionsWithSilencer,
    },
  },
});
