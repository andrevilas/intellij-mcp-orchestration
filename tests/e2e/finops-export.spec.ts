import { expect, test } from './fixtures';

const manifestResponse = {
  policies: { confidence: null },
  routing: {
    default_tier: 'balanced',
    allowed_tiers: ['balanced', 'turbo'],
    fallback_tier: 'economy',
    max_attempts: 2,
    max_iters: 4,
    request_timeout_seconds: 30,
    total_timeout_seconds: 120,
    intents: [],
    rules: [],
  },
  finops: {
    cost_center: 'finops-core',
    budgets: [
      { tier: 'economy', amount: 1200, currency: 'USD', period: 'monthly' },
      { tier: 'balanced', amount: 3400, currency: 'USD', period: 'monthly' },
    ],
    alerts: [
      { threshold: 0.75, channel: 'slack' },
      { threshold: 0.9, channel: 'email' },
    ],
    cache: { ttl_seconds: 600 },
    rate_limit: { requests_per_minute: 180 },
    graceful_degradation: { strategy: 'fallback', message: 'Servindo rotas alternativas' },
  },
  hitl: { enabled: false, checkpoints: [], pending_approvals: 0, updated_at: null },
  runtime: {
    max_iters: 4,
    timeouts: { per_iteration: 30, total: 120 },
    retry: { max_attempts: 2, initial_delay: 1, backoff_factor: 2, max_delay: 4 },
    tracing: { enabled: true, sample_rate: 0.2, exporter: null },
  },
  overrides: null,
  updated_at: '2025-04-01T12:00:00Z',
};

const timeseriesResponse = {
  items: [
    {
      day: '2025-04-01',
      provider_id: 'glm',
      run_count: 8,
      tokens_in: 2400,
      tokens_out: 1200,
      cost_usd: 56.78,
      avg_latency_ms: 820,
      success_count: 8,
    },
  ],
};

test('@finops-export baixa CSV e HTML via backend', async ({ page }) => {
  const exportRequests: string[] = [];

  await page.route('**/api/v1/**', (route) => {
    const url = new URL(route.request().url());
    const pathname = url.pathname.replace('/api/v1', '');

    if (pathname === '/policies/manifest') {
      return route.fulfill({
        status: 200,
        body: JSON.stringify(manifestResponse),
        contentType: 'application/json',
      });
    }

    if (pathname === '/providers') {
      return route.fulfill({
        status: 200,
        body: JSON.stringify({
          providers: [
            {
              id: 'glm',
              name: 'GLM 46',
              command: 'glm46',
              description: 'Modelo GLM 46',
              capabilities: ['chat'],
              tags: ['llm'],
              transport: 'stdio',
              is_available: true,
            },
          ],
        }),
        contentType: 'application/json',
      });
    }

    if (pathname === '/telemetry/timeseries') {
      return route.fulfill({
        status: 200,
        body: JSON.stringify(timeseriesResponse),
        contentType: 'application/json',
      });
    }

    if (pathname === '/telemetry/export') {
      exportRequests.push(route.request().url());
      const format = url.searchParams.get('format');
      if (format === 'csv') {
        return route.fulfill({
          status: 200,
          body: 'data,custo_usd\n2025-04-01,56.78',
          contentType: 'text/csv',
        });
      }
      if (format === 'html') {
        return route.fulfill({
          status: 200,
          body: '<html><body><h1>FinOps Export</h1></body></html>',
          contentType: 'text/html',
        });
      }
      return route.fulfill({ status: 400, body: 'unsupported format' });
    }

    if (
      pathname === '/telemetry/runs' ||
      pathname === '/telemetry/pareto' ||
      pathname === '/telemetry/experiments' ||
      pathname === '/telemetry/lane-costs' ||
      pathname === '/telemetry/marketplace/performance' ||
      pathname === '/telemetry/finops/sprints' ||
      pathname === '/telemetry/finops/pull-requests'
    ) {
      return route.fulfill({
        status: 200,
        body: JSON.stringify({ items: [] }),
        contentType: 'application/json',
      });
    }

    if (
      pathname === '/notifications' ||
      pathname === '/servers' ||
      pathname === '/servers/processes' ||
      pathname === '/sessions' ||
      pathname === '/secrets'
    ) {
      return route.fulfill({
        status: 200,
        body: JSON.stringify({ notifications: [], servers: [], processes: [], sessions: [], secrets: [] }),
        contentType: 'application/json',
      });
    }

    return route.fulfill({ status: 200, body: JSON.stringify({}), contentType: 'application/json' });
  });

  await page.goto('/');
  await page.getByRole('link', { name: 'FinOps' }).click();

  const csvButton = page.getByTestId('finops-export-csv');
  await expect(csvButton).toBeEnabled();

  const csvDownload = page.waitForEvent('download');
  await csvButton.click();
  const csvFile = await csvDownload;
  await expect(csvButton).toBeEnabled();
  expect(csvFile.suggestedFilename()).toMatch(/finops-telemetry-\d{4}-\d{2}-\d{2}\.csv/);

  const htmlButton = page.getByTestId('finops-export-html');
  await expect(htmlButton).toBeEnabled();

  const htmlDownload = page.waitForEvent('download');
  await htmlButton.click();
  const htmlFile = await htmlDownload;
  await expect(htmlButton).toBeEnabled();
  expect(htmlFile.suggestedFilename()).toMatch(/finops-telemetry-\d{4}-\d{2}-\d{2}\.html/);

  expect(exportRequests).toHaveLength(2);
  const [csvUrl, htmlUrl] = exportRequests.map((value) => new URL(value));
  expect(csvUrl.searchParams.get('format')).toBe('csv');
  expect(htmlUrl.searchParams.get('format')).toBe('html');
  expect(csvUrl.searchParams.has('start')).toBe(true);
  expect(csvUrl.searchParams.has('end')).toBe(true);
  expect(csvUrl.searchParams.has('provider_id')).toBe(false);
});
