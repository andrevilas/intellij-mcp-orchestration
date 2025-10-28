import { expect, test, loadBackendFixture } from './fixtures';
import type { Page } from '@playwright/test';


async function registerBaseRoutes(
  page: Page,
  serversResponse?: { servers: Array<Record<string, unknown>> },
  agentsResponse?: { agents: unknown[] },
) {
  const [serversData, agentsData] = await Promise.all([
    serversResponse ?? loadBackendFixture<{ servers: Array<Record<string, unknown>> }>('servers.json'),
    agentsResponse ?? loadBackendFixture<{ agents: unknown[] }>('agents.json'),
  ]);

  await page.route('**/api/v1/servers', (route) =>
    route.fulfill({ status: 200, body: JSON.stringify(serversData), contentType: 'application/json' }),
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
  await page.route('**/api/v1/smoke/endpoints', (route) =>
    route.fulfill({ status: 200, body: JSON.stringify({ endpoints: [] }), contentType: 'application/json' }),
  );
  await page.route('**/agents/agents', (route) =>
    route.fulfill({ status: 200, body: JSON.stringify(agentsData), contentType: 'application/json' }),
  );
}

test.describe('@agent-create', () => {
  test('cria novo agent governado e aplica plano', async ({ page }) => {
    const [serversResponse, agentsResponse] = await Promise.all([
      loadBackendFixture<{ servers: Array<Record<string, unknown>> }>('servers.json'),
      loadBackendFixture<{ agents: unknown[] }>('agents.json'),
    ]);

    await registerBaseRoutes(page, serversResponse, agentsResponse);

    const expectedCommitMessage = 'feat: adicionar agent sentinel-watcher';

    await page.goto('/');
    await page.getByRole('link', { name: 'Agents' }).click();
    await page.getByRole('button', { name: '+ Novo agent' }).click();

    const wizard = page.locator('.agent-wizard');
    await expect(wizard).toBeVisible();

    await wizard.getByRole('textbox', { name: 'Identificador do agent' }).fill('sentinel-watcher');
    await wizard
      .getByRole('textbox', { name: 'Manifesto base (JSON)' })
      .fill('{"title":"Sentinel Watcher","capabilities":["monitoring"],"tools":[]}');

    const serverLabel = serversResponse.servers[0]?.name ?? 'Gemini MCP';
    await wizard.getByRole('checkbox', { name: new RegExp(serverLabel, 'i') }).check();

    await wizard.getByRole('button', { name: 'Gerar plano governado' }).click();

    await expect(wizard.getByText('Plano gerado. Revise as alterações antes de aplicar.')).toBeVisible();
    await expect(
      wizard.locator('.diff-viewer__item-file').filter({ hasText: 'agents-hub/app/agents/sentinel-watcher/agent.yaml' }),
    ).toBeVisible();
    await expect(wizard.getByText('Riscos identificados')).toBeVisible();
    await expect(wizard.getByLabel('Mensagem do commit')).toHaveValue(expectedCommitMessage);

    await wizard.getByRole('button', { name: 'Aplicar plano' }).click();
    const confirmButton = page.getByRole('button', { name: 'Armar aplicação' });
    await confirmButton.click();
    await page.getByRole('button', { name: 'Aplicar agora' }).click();

    await expect(wizard.getByText(/Plano .* aplicado .* via fixtures\./)).toBeVisible();
    await expect(wizard.getByText(/Branch: chore\/finops-plan-fixtures/)).toBeVisible();
    await expect(wizard.getByRole('link', { name: /Abrir pull request/i })).toHaveAttribute(
      'href',
      'https://github.com/example/console-mcp/pull/42',
    );

    await page.keyboard.press('Escape');
    await expect(wizard).toBeHidden();
  });

  test('exibe validações do wizard governado', async ({ page }) => {
    await registerBaseRoutes(page);

    await page.goto('/');
    await page.getByRole('link', { name: 'Agents' }).click();
    await page.getByRole('button', { name: '+ Novo agent' }).click();

    const wizard = page.locator('.agent-wizard');
    await expect(wizard).toBeVisible();

    await wizard.getByRole('button', { name: 'Gerar plano governado' }).click();
    await expect(wizard.getByText('Informe o identificador do agent.').first()).toBeVisible();

    await wizard.getByRole('textbox', { name: 'Identificador do agent' }).fill('sentinel-watcher');
    await wizard.getByRole('textbox', { name: 'Manifesto base (JSON)' }).fill('{');
    await wizard.getByRole('button', { name: 'Gerar plano governado' }).click();
    await expect(wizard.getByText('Manifesto base inválido. Forneça JSON válido.').first()).toBeVisible();

    await wizard
      .getByRole('textbox', { name: 'Manifesto base (JSON)' })
      .fill('{"name":"sentinel-watcher"}');
    await wizard.getByRole('button', { name: 'Gerar plano governado' }).click();
    await expect(wizard.getByText('Selecione pelo menos um servidor MCP.').first()).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(wizard).toBeHidden();
  });

  test('fecha wizard governado com tecla Escape e restaura foco', async ({ page }) => {
    await registerBaseRoutes(page);

    await page.goto('/');
    await page.getByRole('link', { name: 'Agents' }).click();

    const createButton = page.getByRole('button', { name: '+ Novo agent' });
    await createButton.click();

    const wizard = page.locator('.agent-wizard');
    await expect(wizard).toBeVisible();

    await page.keyboard.press('Escape');

    await expect(wizard).toBeHidden();
    await expect(createButton).toBeFocused();
  });
});
