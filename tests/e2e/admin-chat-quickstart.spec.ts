import { expect, test } from './fixtures';

const serversResponse = {
  servers: [
    {
      id: 'console-admin',
      name: 'Console Admin',
      command: 'console-admin',
      description: 'Servidor principal para fluxos administrativos',
      tags: ['admin'],
      capabilities: ['chat'],
      transport: 'stdio',
      created_at: '2025-01-09T12:00:00Z',
      updated_at: '2025-01-09T12:00:00Z',
    },
  ],
};

const emptySessions = { sessions: [] };
const emptySecrets = { secrets: [] };
const emptyNotifications = { notifications: [] };
const telemetryMetrics = {
  start: '2025-01-09T00:00:00Z',
  end: '2025-01-10T00:00:00Z',
  total_runs: 0,
  total_tokens_in: 0,
  total_tokens_out: 0,
  total_cost_usd: 0,
  avg_latency_ms: 0,
  success_rate: 0,
  providers: [],
  extended: {},
};
const telemetryHeatmap = { buckets: [] };
const complianceSummary = {
  status: 'pass',
  updated_at: '2025-01-10T12:00:00Z',
  items: [],
};

const headers = { status: 200, contentType: 'application/json' } as const;

test('@docs exibe quickstart com player, link para docs e exemplos rápidos', async ({ page }) => {
  await page.route('**/api/v1/servers', (route) =>
    route.fulfill({ ...headers, body: JSON.stringify(serversResponse) }),
  );
  await page.route('**/api/v1/servers/processes', (route) =>
    route.fulfill({ ...headers, body: JSON.stringify({ processes: [] }) }),
  );
  await page.route('**/api/v1/sessions', (route) =>
    route.fulfill({ ...headers, body: JSON.stringify(emptySessions) }),
  );
  await page.route('**/api/v1/secrets', (route) =>
    route.fulfill({ ...headers, body: JSON.stringify(emptySecrets) }),
  );
  await page.route('**/api/v1/notifications', (route) =>
    route.fulfill({ ...headers, body: JSON.stringify(emptyNotifications) }),
  );
  await page.route('**/api/v1/telemetry/metrics**', (route) =>
    route.fulfill({ ...headers, body: JSON.stringify(telemetryMetrics) }),
  );
  await page.route('**/api/v1/telemetry/heatmap**', (route) =>
    route.fulfill({ ...headers, body: JSON.stringify(telemetryHeatmap) }),
  );
  await page.route('**/api/v1/policies/compliance', (route) =>
    route.fulfill({ ...headers, body: JSON.stringify(complianceSummary) }),
  );

  await page.goto('/');

  const navigation = page.getByRole('navigation', { name: 'Navegação principal' });
  await expect(navigation).toBeVisible();
  await navigation.getByRole('link', { name: 'Admin Chat' }).click();
  const adminPanel = page.getByRole('tabpanel', { name: 'Admin Chat' });
  await adminPanel.waitFor();
  await adminPanel.getByRole('region', { name: 'Comece rápido' }).waitFor({ state: 'visible' });

  const quickstartRegion = adminPanel.getByRole('region', { name: 'Comece rápido' });
  await expect(quickstartRegion).toBeVisible();

  const demoButton = quickstartRegion.getByRole('button', { name: 'Assistir demo' });
  await demoButton.click();

  const mediaDialog = page.getByRole('dialog', { name: 'Veja o Admin Chat em ação' });
  await expect(mediaDialog).toBeVisible();
  await expect(
    mediaDialog.frameLocator("iframe[title='Walkthrough do Admin Chat']").locator('body'),
  ).toBeVisible();
  await mediaDialog.getByRole('button', { name: 'Fechar player' }).click();
  await expect(mediaDialog).toBeHidden();

  await expect(quickstartRegion.getByRole('link', { name: 'Abrir documentação' })).toHaveAttribute(
    'href',
    'https://github.com/openai/intellij-mcp-orchestration/blob/main/docs/admin-chat-quickstart.md',
  );

  const exampleButton = quickstartRegion.getByRole('button', { name: 'Gerar plano HITL' });
  await exampleButton.click();
  await expect(page.getByLabel('Mensagem para o copiloto')).toHaveValue(
    'Preciso habilitar checkpoints HITL para as rotas críticas com aprovação dupla.',
  );
});
