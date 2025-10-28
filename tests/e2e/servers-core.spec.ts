import { expect, test, loadBackendFixture } from './fixtures';
import { SERVERS_TEST_IDS } from '../../app/src/pages/testIds';

test('gerencia servidores MCP usando fixtures locais', async ({ page }) => {
  const [serversFixture, processFixture, healthFixture] = await Promise.all([
    loadBackendFixture<{
      servers: Array<{
        id: string;
        name: string;
      }>;
    }>('servers.json'),
    loadBackendFixture<{
      processes: Array<{
        server_id: string;
        status: string;
      }>;
    }>('server_processes.json'),
    loadBackendFixture<{
      checks: Record<string, Array<{ status: string }>>;
    }>('server_health.json'),
  ]);

  const processStatusByServer = new Map(
    processFixture.processes.map((entry) => [entry.server_id, entry.status]),
  );
  const runningCount = serversFixture.servers.reduce((count, server) => {
    return processStatusByServer.get(server.id) === 'running' ? count + 1 : count;
  }, 0);
  const offlineCount = serversFixture.servers.length - runningCount;

  const healthStatusByServer = new Map(
    Object.entries(healthFixture.checks).map(([serverId, entries]) => [serverId, entries[0]?.status ?? 'unknown']),
  );
  let healthyCount = 0;
  let degradedCount = 0;
  let errorCount = 0;
  let unknownCount = 0;
  for (const server of serversFixture.servers) {
    switch (healthStatusByServer.get(server.id) ?? 'unknown') {
      case 'healthy':
        healthyCount += 1;
        break;
      case 'degraded':
        degradedCount += 1;
        break;
      case 'error':
        errorCount += 1;
        break;
      default:
        unknownCount += 1;
        break;
    }
  }

  await page.goto('/');
  await page.getByRole('link', { name: 'Servidores' }).click();

  const statusSection = page.getByTestId(SERVERS_TEST_IDS.status.section);
  await expect(statusSection.getByTestId(SERVERS_TEST_IDS.status.online)).toHaveText(String(runningCount));
  await expect(statusSection.getByTestId(SERVERS_TEST_IDS.status.offline)).toHaveText(String(offlineCount));
  await expect(statusSection.getByTestId(SERVERS_TEST_IDS.status.total)).toHaveText(
    String(serversFixture.servers.length),
  );

  const healthSection = page.getByTestId(SERVERS_TEST_IDS.health.section);
  await expect(healthSection.getByTestId(SERVERS_TEST_IDS.health.healthy)).toHaveText(String(healthyCount));
  await expect(healthSection.getByTestId(SERVERS_TEST_IDS.health.degraded)).toHaveText(String(degradedCount));
  await expect(healthSection.getByTestId(SERVERS_TEST_IDS.health.error)).toHaveText(String(errorCount));
  await expect(healthSection.getByTestId(SERVERS_TEST_IDS.health.unknown)).toHaveText(String(unknownCount));

  const geminiCard = page.getByTestId(SERVERS_TEST_IDS.card('gemini'));
  await expect(geminiCard.getByRole('heading', { level: 2, name: 'Gemini MCP' })).toBeVisible();
  await expect(geminiCard.getByText('~/.local/bin/gemini-mcp')).toBeVisible();

  const [pingRequest] = await Promise.all([
    page.waitForRequest(
      (request) => request.url().includes('/api/v1/servers/gemini/health/ping') && request.method() === 'POST',
    ),
    page.getByTestId(SERVERS_TEST_IDS.pingButton('gemini')).click(),
  ]);
  expect(pingRequest.method()).toBe('POST');
  await expect(geminiCard.getByText('Ping realizado com sucesso via fixtures.')).toBeVisible();

  await geminiCard.getByRole('button', { name: 'Editar servidor' }).click();
  const editDialog = page.getByRole('dialog', { name: 'Editar servidor MCP' });
  await editDialog.getByLabel('Nome exibido').fill('Gemini MCP · Observabilidade');
  await editDialog.getByLabel('Comando/endpoint').fill('/opt/mcp/gemini');
  await editDialog.getByLabel('Descrição').fill('Servidor MCP supervisionado pela console.');
  await editDialog.getByLabel('Transporte').fill('http');
  await editDialog.getByLabel('Tags (separadas por vírgula)').fill('llm,observabilidade');
  await editDialog.getByLabel('Capacidades (separadas por vírgula)').fill('chat,embeddings');

  const [updateRequest] = await Promise.all([
    page.waitForRequest(
      (request) => request.url().includes('/api/v1/servers/gemini') && request.method() === 'PUT',
    ),
    editDialog.getByRole('button', { name: 'Salvar alterações' }).click(),
  ]);
  const updatePayload = updateRequest.postDataJSON() as {
    name: string;
    command: string;
    description: string;
    tags: string[];
    capabilities: string[];
    transport: string;
  };
  expect(updatePayload).toEqual({
    name: 'Gemini MCP · Observabilidade',
    command: '/opt/mcp/gemini',
    description: 'Servidor MCP supervisionado pela console.',
    tags: ['llm', 'observabilidade'],
    capabilities: ['chat', 'embeddings'],
    transport: 'http',
  });
  await expect(editDialog).toBeHidden();

  await expect(geminiCard.getByRole('heading', { level: 2, name: 'Gemini MCP · Observabilidade' })).toBeVisible();
  await expect(geminiCard.getByText('/opt/mcp/gemini')).toBeVisible();
  await expect(geminiCard.getByText('http')).toBeVisible();

  await geminiCard.getByRole('button', { name: 'Remover servidor' }).click();
  const deleteDialog = page.getByRole('dialog', { name: 'Remover servidor MCP' });
  const [deleteRequest] = await Promise.all([
    page.waitForRequest(
      (request) => request.url().includes('/api/v1/servers/gemini') && request.method() === 'DELETE',
    ),
    deleteDialog.getByRole('button', { name: 'Remover servidor' }).click(),
  ]);
  expect(deleteRequest.method()).toBe('DELETE');
  await expect(page.getByTestId(SERVERS_TEST_IDS.card('gemini'))).toHaveCount(0);

  const runningAfter = runningCount - (processStatusByServer.get('gemini') === 'running' ? 1 : 0);
  const totalAfter = serversFixture.servers.length - 1;
  const offlineAfter = totalAfter - runningAfter;
  const healthyAfter = healthyCount - (healthStatusByServer.get('gemini') === 'healthy' ? 1 : 0);
  const degradedAfter = degradedCount - (healthStatusByServer.get('gemini') === 'degraded' ? 1 : 0);
  const errorAfter = errorCount - (healthStatusByServer.get('gemini') === 'error' ? 1 : 0);
  const unknownAfter = unknownCount - (healthStatusByServer.get('gemini') === 'unknown' ? 1 : 0);

  await expect(statusSection.getByTestId(SERVERS_TEST_IDS.status.online)).toHaveText(String(runningAfter));
  await expect(statusSection.getByTestId(SERVERS_TEST_IDS.status.offline)).toHaveText(String(offlineAfter));
  await expect(statusSection.getByTestId(SERVERS_TEST_IDS.status.total)).toHaveText(String(totalAfter));
  await expect(healthSection.getByTestId(SERVERS_TEST_IDS.health.healthy)).toHaveText(String(healthyAfter));
  await expect(healthSection.getByTestId(SERVERS_TEST_IDS.health.degraded)).toHaveText(String(degradedAfter));
  await expect(healthSection.getByTestId(SERVERS_TEST_IDS.health.error)).toHaveText(String(errorAfter));
  await expect(healthSection.getByTestId(SERVERS_TEST_IDS.health.unknown)).toHaveText(String(unknownAfter));
});
