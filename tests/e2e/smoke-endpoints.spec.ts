import { expect, test } from './fixtures';
import type { Page } from '@playwright/test';

const agentsResponse = {
  agents: [
    {
      name: 'catalog-search',
      title: 'Catalog Search',
      version: '1.2.0',
      description: 'Busca estruturada.',
      capabilities: ['search'],
      model: { provider: 'openai', name: 'o3-mini', parameters: { temperature: 0 } },
      status: 'healthy',
      last_deployed_at: '2025-01-02T10:00:00Z',
      owner: '@catalog',
    },
  ],
};

async function registerBaseRoutes(page: Page) {
  await page.route('**/api/v1/servers', (route) =>
    route.fulfill({ status: 200, body: JSON.stringify({ servers: [] }), contentType: 'application/json' }),
  );
  await page.route('**/api/v1/servers/processes', (route) =>
    route.fulfill({ status: 200, body: JSON.stringify({ processes: [] }), contentType: 'application/json' }),
  );
  await page.route('**/api/v1/sessions', (route) =>
    route.fulfill({ status: 200, body: JSON.stringify({ sessions: [] }), contentType: 'application/json' }),
  );
  await page.route('**/api/v1/secrets', (route) =>
    route.fulfill({ status: 200, body: JSON.stringify({ secrets: [] }), contentType: 'application/json' }),
  );
  await page.route('**/api/v1/telemetry/metrics**', (route) =>
    route.fulfill({ status: 200, body: JSON.stringify({ buckets: [] }), contentType: 'application/json' }),
  );
  await page.route('**/api/v1/telemetry/heatmap**', (route) =>
    route.fulfill({ status: 200, body: JSON.stringify({ heatmap: [] }), contentType: 'application/json' }),
  );
  await page.route('**/api/v1/notifications', (route) =>
    route.fulfill({ status: 200, body: JSON.stringify({ notifications: [] }), contentType: 'application/json' }),
  );
  const compliancePayload = { status: 'pass', items: [] };
  const fulfillCompliance = (route: { fulfill: (options: { status: number; body: string; contentType: string }) => void }) =>
    route.fulfill({ status: 200, body: JSON.stringify(compliancePayload), contentType: 'application/json' });
  await page.route('**/api/v1/policies/compliance', fulfillCompliance);
  await page.route('**/api/v1/policy/compliance', fulfillCompliance);
  await page.route('**/agents/agents', (route) =>
    route.fulfill({ status: 200, body: JSON.stringify(agentsResponse), contentType: 'application/json' }),
  );
}

test('executa smoke endpoints, exibe logs e persiste metadados', async ({ page }) => {
  await registerBaseRoutes(page);

  const firstResponse = {
    endpoints: [
      {
        id: 'public-health',
        name: 'Public API',
        description: 'Verifica status HTTP externo.',
        url: 'https://status.example.com/health',
        last_run: {
          run_id: 'run-1',
          status: 'passed',
          summary: 'Todos os checks passaram.',
          triggered_by: 'alice',
          triggered_at: '2025-01-03T15:00:00Z',
          finished_at: '2025-01-03T15:00:04Z',
          logs: [
            {
              id: 'log-1',
              timestamp: '2025-01-03T15:00:01Z',
              level: 'info',
              message: 'GET /health -> 200',
            },
            {
              id: 'log-2',
              timestamp: '2025-01-03T15:00:04Z',
              level: 'debug',
              message: 'Latência: 120ms',
            },
          ],
        },
      },
      {
        id: 'internal-health',
        name: 'Internal orchestrator',
        description: 'Smoke interno do orchestrator.',
        url: 'https://internal.example.com/health',
        last_run: null,
      },
    ],
  };

  let fetchCount = 0;

  const runResponse = {
    run_id: 'run-100',
    status: 'passed',
    summary: 'Verificação concluída com sucesso.',
    triggered_by: 'svc-smoke',
    triggered_at: '2025-01-10T10:20:00Z',
    finished_at: '2025-01-10T10:20:05Z',
    logs: [
      {
        id: 'log-3',
        timestamp: '2025-01-10T10:20:01Z',
        level: 'info',
        message: 'GET /health -> 200',
      },
      {
        id: 'log-4',
        timestamp: '2025-01-10T10:20:05Z',
        level: 'warning',
        message: 'Latência acima da meta: 220ms',
      },
    ],
  };

  const runRequests: unknown[] = [];

  await page.exposeFunction('recordSmokeEndpointsFetch', () => {
    fetchCount += 1;
  });
  await page.exposeFunction('recordSmokeRunPayload', (payload: unknown) => {
    runRequests.push(payload);
  });

  const storageKey = `__pw_smoke_endpoints_state_${Date.now()}__`;

  await page.addInitScript(
    ({ firstResponse: initFirstResponse, runResponse: initRunResponse, storageKey: key }) => {
      const originalFetch = window.fetch;
      const cloneState = (value) => JSON.parse(JSON.stringify(value));
      const loadState = () => {
        if (typeof window.localStorage !== 'undefined') {
          try {
            const saved = window.localStorage.getItem(key);
            if (saved) {
              return JSON.parse(saved);
            }
          } catch {
            // ignore corrupted storage
          }
        }
        return cloneState(initFirstResponse);
      };

      let state = loadState();
      window.__setSmokeEndpointState = (nextState) => {
        if (nextState && typeof nextState === 'object' && Array.isArray(nextState.endpoints)) {
          state = nextState;
          persistState();
        }
      };
      const persistState = () => {
        if (typeof window.localStorage === 'undefined') {
          return;
        }
        try {
          window.localStorage.setItem(key, JSON.stringify(state));
        } catch {
          // ignore storage quota issues
        }
      };

      window.fetch = async (input, init) => {
        const url = typeof input === 'string' ? input : input.url;
        const method = (init?.method ?? 'GET').toUpperCase();

        if (url.includes('/api/v1/smoke/endpoints/internal-health/run')) {
          try {
            const body = init?.body ?? null;
            let parsed: unknown = null;
            if (typeof body === 'string') {
              parsed = JSON.parse(body);
            }
            await window.recordSmokeRunPayload?.(parsed);
          } catch {
            await window.recordSmokeRunPayload?.(null);
          }
          const match = url.match(/\/smoke\/endpoints\/([^/]+)\/run/);
          const endpointId = match?.[1] ?? 'internal-health';
          const payload = cloneState(initRunResponse);
          state = {
            endpoints: state.endpoints.map((endpoint) =>
              endpoint.id === endpointId ? { ...endpoint, last_run: payload } : endpoint,
            ),
          };
          persistState();
          return new Response(JSON.stringify(initRunResponse), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        if (url.includes('/api/v1/smoke/endpoints') && method === 'GET') {
          await window.recordSmokeEndpointsFetch?.();
          persistState();
          return new Response(JSON.stringify(state), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        return originalFetch(input, init);
      };
    },
    { firstResponse, runResponse, storageKey },
  );

  await page.goto('/');
  await page.getByRole('link', { name: 'Agents' }).click();
  await expect.poll(() => fetchCount).toBeGreaterThan(0);

  const panel = page.locator('.smoke-panel');
  const publicRow = panel.getByTestId('smoke-row-public-health');
  await expect(publicRow).toBeVisible();
  await expect(publicRow).toContainText('Public API');
  await expect(publicRow.locator('.smoke-panel__status')).toHaveText('Aprovado');
  await expect(publicRow.locator('time')).toHaveText('03/01/2025 15:00 UTC');
  await expect(publicRow).toContainText('alice');
  await expect(publicRow.locator('.smoke-panel__logs')).toContainText('GET /health -> 200');
  await expect(publicRow.locator('.smoke-panel__logs')).toContainText('Latência: 120ms');

  const internalRow = panel.getByTestId('smoke-row-internal-health');
  await expect(internalRow.locator('td').nth(1)).toHaveText('—');
  await expect(internalRow.locator('.smoke-panel__logs')).toHaveText('—');

  await internalRow.getByRole('button', { name: 'Executar smoke' }).click();
  await expect(panel.getByRole('status')).toContainText('Smoke run-100');
  await expect(internalRow.locator('.smoke-panel__status')).toHaveText('Aprovado');
  await expect(internalRow.locator('time')).toHaveText('10/01/2025 10:20 UTC');
  await expect(internalRow).toContainText('svc-smoke');
  await expect(internalRow.locator('.smoke-panel__logs')).toContainText('Latência acima da meta');
  expect(runRequests).toHaveLength(1);
  await page.evaluate(
    ({ key, runResponse: response }) => {
      const readState = () => {
        const raw = window.localStorage.getItem(key);
        if (!raw) {
          return { endpoints: [] as Array<Record<string, unknown>> };
        }
        try {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === 'object' && Array.isArray(parsed.endpoints)) {
            return { endpoints: parsed.endpoints as Array<Record<string, unknown>> };
          }
        } catch {
          // ignore malformed storage
        }
        return { endpoints: [] as Array<Record<string, unknown>> };
      };

      const state = readState();
      const updatedEndpoints = [...state.endpoints];
      const index = updatedEndpoints.findIndex((endpoint) => endpoint.id === 'internal-health');
      if (index >= 0) {
        updatedEndpoints[index] = { ...updatedEndpoints[index], last_run: response };
      } else {
        updatedEndpoints.push({
          id: 'internal-health',
          name: 'Internal orchestrator',
          description: 'Smoke interno do orchestrator.',
          url: 'https://internal.example.com/health',
          last_run: response,
        });
      }
      const nextState = { endpoints: updatedEndpoints };
      window.localStorage.setItem(key, JSON.stringify(nextState));
      if (typeof window.__setSmokeEndpointState === 'function') {
        window.__setSmokeEndpointState(nextState);
      }
    },
    { key: storageKey, runResponse },
  );

  const metadata = await page.evaluate(() =>
    window.localStorage.getItem('mcp-smoke-endpoints-metadata'),
  );
  expect(metadata).not.toBeNull();
  const parsed = JSON.parse(metadata ?? '{}');
  expect(parsed).toHaveProperty('internal-health');
  expect(parsed['internal-health']).toMatchObject({ triggeredBy: 'svc-smoke' });
  await page.addInitScript(
    ({ key, value }) => {
      if (typeof value === 'string' && value.length > 0) {
        try {
          window.localStorage.setItem(key, value);
        } catch {
          // ignore storage errors
        }
      }
    },
    { key: 'mcp-smoke-endpoints-metadata', value: metadata ?? '' },
  );

  await page.reload();
  await page.getByRole('link', { name: 'Agents' }).click();
  await expect.poll(() => fetchCount).toBeGreaterThanOrEqual(2);

  const reloadedRow = page.locator('[data-testid="smoke-row-internal-health"]');
  await expect(reloadedRow).toContainText('svc-smoke');
  await expect(reloadedRow.locator('time')).toHaveText('10/01/2025 10:20 UTC');

  expect(fetchCount).toBeGreaterThanOrEqual(2);
  expect(runRequests).toHaveLength(1);
});
