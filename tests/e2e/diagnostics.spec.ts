import { expect, test } from './fixtures';
import type { Page } from '@playwright/test';

async function registerBaseRoutes(page: Page) {
  await page.route('**/api/v1/servers', (route) =>
    route.fulfill({
      status: 200,
      body: JSON.stringify({
        servers: [
          {
            id: 'gemini',
            name: 'Gemini MCP',
            command: 'mcp-gemini',
            description: 'Integração oficial com Gemini.',
            tags: ['catalog'],
            capabilities: ['chat'],
            transport: 'stdio',
            created_at: '2025-01-01T12:00:00Z',
            updated_at: '2025-01-02T12:00:00Z',
          },
        ],
      }),
      contentType: 'application/json',
    }),
  );

  await page.route('**/api/v1/servers/processes', (route) =>
    route.fulfill({
      status: 200,
      body: JSON.stringify({ processes: [] }),
      contentType: 'application/json',
    }),
  );

  await page.route('**/api/v1/servers/*/process/logs**', (route) =>
    route.fulfill({
      status: 200,
      body: JSON.stringify({ logs: [], cursor: null }),
      contentType: 'application/json',
    }),
  );

  await page.route('**/api/v1/servers/*/health', (route) =>
    route.fulfill({
      status: 200,
      body: JSON.stringify({ checks: [] }),
      contentType: 'application/json',
    }),
  );

  await page.route('**/api/v1/providers', (route) =>
    route.fulfill({
      status: 200,
      body: JSON.stringify({
        providers: [
          {
            id: 'gemini',
            name: 'Gemini MCP',
            command: 'mcp-gemini',
            description: 'Integração oficial com Gemini.',
            tags: ['catalog'],
            capabilities: ['chat'],
            transport: 'stdio',
            is_available: true,
          },
        ],
      }),
      contentType: 'application/json',
    }),
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

  await page.route('**/api/v1/smoke/endpoints', (route) =>
    route.fulfill({ status: 200, body: JSON.stringify({ endpoints: [] }), contentType: 'application/json' }),
  );

  await page.route('**/agents/agents', (route) =>
    route.fulfill({ status: 200, body: JSON.stringify({ agents: [] }), contentType: 'application/json' }),
  );
}

const diagnosticsPayload = {
  timestamp: '2025-01-02T12:00:00Z',
  summary: { total: 3, successes: 3, failures: 0, errors: {} },
  health: { ok: true, status_code: 200, duration_ms: 10.5, data: { status: 'ok' } },
  providers: {
    ok: true,
    status_code: 200,
    duration_ms: 18.2,
    data: { providers: [{ id: 'gemini' }, { id: 'glm46' }] },
  },
  invoke: {
    ok: true,
    status_code: 200,
    duration_ms: 42.1,
    data: { result: { status: 'ok' } },
  },
};

test('executa diagnóstico agregando health, providers e invoke', async ({ page }) => {
  await registerBaseRoutes(page);

  const captured: unknown[] = [];
  await page.route('**/api/v1/diagnostics/run', (route) => {
    captured.push(route.request().postDataJSON());
    route.fulfill({
      status: 200,
      body: JSON.stringify(diagnosticsPayload),
      contentType: 'application/json',
    });
  });

  await page.goto('/');
  await page.getByRole('link', { name: 'Servidores' }).click();

  const section = page.locator('.servers__diagnostics');
  await expect(section).toBeVisible();

  await section.getByRole('textbox', { name: 'Agent para invoke' }).fill('catalog-search');
  await section.getByRole('button', { name: 'Executar diagnóstico' }).click();

  await expect(section.getByText('Todas as verificações passaram.')).toBeVisible();
  await expect(section.getByText('Backend respondeu com sucesso.')).toBeVisible();
  await expect(section.getByText(/Catálogo de providers carregado/)).toBeVisible();
  await expect(section.getByText('Invoke concluído sem erros.')).toBeVisible();

  expect(captured).toHaveLength(1);
  const payload = captured[0] as { invoke?: { agent?: string } };
  expect(payload.invoke?.agent).toBe('catalog-search');
});
