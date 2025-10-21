import { defineConfig, devices } from '@playwright/test';

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
    },
  },
});
