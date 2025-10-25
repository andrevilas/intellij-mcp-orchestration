import { expect, test } from './fixtures';
import type { Page } from '@playwright/test';

function createOnboardingFixtures() {
  const chatResponse = {
    threadId: 'thread-seed',
    messages: [],
  } as const;

  const planResponse = {
    plan: {
      id: 'chat-plan',
      threadId: 'thread-seed',
      status: 'ready',
      generatedAt: '2025-01-10T10:00:00Z',
      author: 'Console MCP',
      scope: 'Escopo placeholder',
      steps: [],
    },
    diffs: [],
    risks: [],
  } as const;

  const onboardingPlan = {
    id: 'onboard-plan',
    threadId: 'thread-onboard',
    status: 'ready',
    generatedAt: '2025-01-11T09:00:00Z',
    author: 'Console MCP',
    scope: 'Onboarding do agente openai-gpt4o',
    steps: [
      {
        id: 'step-1',
        title: 'Criar manifesto',
        description: 'Gera manifesto MCP com metadata básica.',
        status: 'ready',
      },
    ],
  } as const;

  const onboardingResponse = {
    plan: onboardingPlan,
    diffs: [
      {
        id: 'diff-1',
        file: 'agents/openai-gpt4o/agent.manifest.json',
        summary: 'Adiciona manifesto inicial.',
        diff: '{\n  "name": "openai-gpt4o"\n}',
      },
    ],
    risks: [],
    message: 'Plano de onboarding preparado para openai-gpt4o.',
    validation: {
      endpoint: 'wss://openai.example.com/ws',
      transport: 'websocket',
      tools: [
        { name: 'catalog.search', description: 'Busca recursos homologados.', definition: null },
        { name: 'catalog.metrics', description: null, definition: null },
      ],
      missingTools: ['metrics.ingest'],
      serverInfo: { name: 'demo' },
      capabilities: { tools: true },
    },
  } as const;

  const validationResponse = {
    validation: onboardingResponse.validation,
  } as const;

  const applyResponse = {
    status: 'applied',
    message: 'Plano aplicado com sucesso.',
    branch: 'feature/mcp-openai-gpt4o',
    baseBranch: 'main',
    commitSha: 'abc123',
    recordId: 'rec-apply-onboard',
    pullRequest: {
      provider: 'github',
      id: 'pr-42',
      number: '42',
      url: 'https://github.com/prom/demo/pull/42',
      title: 'feat: onboard openai-gpt4o',
      state: 'open',
      headSha: 'abc123',
      ciStatus: 'pending',
      reviewStatus: 'pending',
      merged: false,
    },
    plan: onboardingPlan,
  } as const;

  const smokeResponse = {
    runId: 'smoke-1',
    status: 'running',
    summary: 'Smoke em execução no ambiente production.',
    startedAt: '2025-01-11T09:05:00Z',
    finishedAt: null,
  } as const;

  const statusResponse = {
    recordId: applyResponse.recordId,
    status: 'running',
    branch: applyResponse.branch,
    baseBranch: applyResponse.baseBranch,
    commitSha: applyResponse.commitSha,
    pullRequest: applyResponse.pullRequest,
    updatedAt: '2025-01-11T09:10:00Z',
  } as const;

  return {
    chatResponse,
    planResponse,
    onboardingResponse,
    validationResponse,
    applyResponse,
    smokeResponse,
    statusResponse,
  };
}

type OnboardingFixtures = ReturnType<typeof createOnboardingFixtures>;

async function registerOnboardingRoutes(
  page: Page,
  fixtures: OnboardingFixtures,
  onboardPayloads: unknown[] = [],
): Promise<void> {
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
  await page.route('**/api/v1/telemetry/metrics', (route) =>
    route.fulfill({ status: 200, body: JSON.stringify({ buckets: [] }), contentType: 'application/json' }),
  );
  await page.route('**/api/v1/telemetry/heatmap', (route) =>
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

  await page.route('**/api/v1/config/chat', (route) =>
    route.fulfill({ status: 200, body: JSON.stringify(fixtures.chatResponse), contentType: 'application/json' }),
  );

  await page.route('**/api/v1/config/plan', (route) => {
    const body = route.request().postDataJSON();
    if (body.intent === 'summarize') {
      return route.fulfill({
        status: 200,
        body: JSON.stringify({
          plan: fixtures.onboardingResponse.plan,
          diffs: fixtures.onboardingResponse.diffs,
          risks: fixtures.onboardingResponse.risks,
        }),
        contentType: 'application/json',
      });
    }
    return route.fulfill({ status: 200, body: JSON.stringify(fixtures.planResponse), contentType: 'application/json' });
  });

  await page.route('**/api/v1/config/mcp/onboard', (route) => {
    const payload = route.request().postDataJSON();
    onboardPayloads.push(payload);
    if (payload.intent === 'validate') {
      return route.fulfill({ status: 200, body: JSON.stringify(fixtures.validationResponse), contentType: 'application/json' });
    }
    return route.fulfill({ status: 200, body: JSON.stringify(fixtures.onboardingResponse), contentType: 'application/json' });
  });

  await page.route('**/api/v1/config/apply', (route) =>
    route.fulfill({ status: 200, body: JSON.stringify(fixtures.applyResponse), contentType: 'application/json' }),
  );

  await page.route('**/api/v1/config/mcp/smoke', (route) =>
    route.fulfill({ status: 200, body: JSON.stringify(fixtures.smokeResponse), contentType: 'application/json' }),
  );

  await page.route('**/api/v1/config/mcp/onboard/status**', (route) =>
    route.fulfill({ status: 200, body: JSON.stringify(fixtures.statusResponse), contentType: 'application/json' }),
  );
}

test('@onboarding-validation completes MCP onboarding wizard end-to-end', async ({ page }) => {
  const fixtures = createOnboardingFixtures();
  const onboardPayloads: unknown[] = [];
  await registerOnboardingRoutes(page, fixtures, onboardPayloads);

  await page.goto('/');
  await page.getByRole('button', { name: 'Admin Chat' }).click();

  const basicNextButton = page.getByRole('button', { name: 'Avançar para autenticação' });
  await expect(basicNextButton).toBeDisabled();
  await expect(page.getByRole('heading', { name: 'Complete os dados obrigatórios' })).toBeVisible();

  await page.getByLabel('Identificador do agente').fill('openai-gpt4o');
  await page.getByLabel('Nome exibido').fill('OpenAI GPT-4o');
  await page.getByLabel('Repositório Git').fill('agents/openai-gpt4o');
  await page.getByLabel('Endpoint MCP (ws/wss)').fill('wss://openai.example.com/ws');
  await page.getByLabel('Owner responsável').fill('@squad-mcp');
  await page.getByLabel('Tags (separadas por vírgula)').fill('openai,prod');
  await page.getByLabel('Capacidades (separadas por vírgula)').fill('chat');
  await page.getByLabel('Descrição').fill('Agente com fallback para GPT-4o.');
  await expect(basicNextButton).toBeEnabled();
  await expect(page.getByRole('heading', { name: 'Complete os dados obrigatórios' })).toHaveCount(0);
  await basicNextButton.click();

  await page.getByLabel('API Key').check();
  const authNextButton = page.getByRole('button', { name: 'Avançar para tools' });
  await expect(authNextButton).toBeDisabled();
  await expect(page.getByRole('heading', { name: 'Credencial obrigatória' })).toBeVisible();
  await page.getByLabel('Nome da credencial').fill('OPENAI_API_KEY');
  await page.getByLabel('Ambiente/namespace').fill('production');
  await page.getByLabel('Instruções para provisionamento').fill('Gerar no vault e replicar.');
  await expect(authNextButton).toBeEnabled();
  await expect(page.getByRole('heading', { name: 'Credencial obrigatória' })).toHaveCount(0);
  await authNextButton.click();

  await page.getByLabel('Nome da tool 1').fill('catalog.search');
  await page.getByLabel('Descrição da tool 1').fill('Busca recursos homologados.');
  await page.getByLabel('Entry point da tool 1').fill('catalog/search.py');
  const toolsNextButton = page.getByRole('button', { name: 'Ir para validação' });
  await expect(toolsNextButton).toBeDisabled();
  await expect(page.getByRole('heading', { name: 'Finalize as tools obrigatórias' })).toBeVisible();
  await page.getByRole('button', { name: 'Testar conexão' }).click();
  await expect.poll(() => onboardPayloads.length).toBe(1);
  await expect(toolsNextButton).toBeEnabled();
  await expect(page.getByRole('heading', { name: 'Finalize as tools obrigatórias' })).toHaveCount(0);
  await toolsNextButton.click();

  const wizardPanel = page.locator('.mcp-wizard__panel');

  await wizardPanel.getByLabel('Checklist/observações adicionais').fill('Checklist final com owners.');
  const qualityField = wizardPanel.getByLabel('Quality gates (separados por vírgula)');
  await qualityField.fill('operacao,finops,confianca');

  await page.getByRole('button', { name: 'Gerar plano de onboarding' }).click();
  await expect(page.getByText(fixtures.onboardingResponse.message)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Resultado da validação' })).toBeVisible();
  await expect(page.getByText(fixtures.onboardingResponse.validation.endpoint)).toBeVisible();
  await expect(page.getByText(fixtures.onboardingResponse.validation.transport)).toBeVisible();
  await expect(page.getByText(/catalog\.search/)).toBeVisible();
  await expect(page.getByText('metrics.ingest')).toBeVisible();
  await expect(page.getByText('Criar manifesto')).toBeVisible();
  await expect(page.getByText('Adiciona manifesto inicial.')).toBeVisible();

  await wizardPanel.getByLabel('Nota para aplicação').fill('Aplicar com acompanhamento do time de plataforma.');
  await page.getByRole('button', { name: 'Confirmar e aplicar plano' }).click();

  await expect(page.getByText(fixtures.applyResponse.recordId)).toBeVisible();
  await expect(page.getByText(fixtures.applyResponse.branch!)).toBeVisible();
  await expect(page.getByRole('link', { name: fixtures.applyResponse.pullRequest!.title })).toBeVisible();

  await page.getByRole('button', { name: 'Atualizar status' }).click();
  await expect(page.getByText('Situação atual: running')).toBeVisible();

  await page.getByRole('button', { name: 'Executar smoke tests' }).click();
  await expect(page.getByText(/Smoke em execução/)).toBeVisible();

  expect(onboardPayloads).toHaveLength(2);
  expect(onboardPayloads[0]).toMatchObject({
    intent: 'validate',
    endpoint: 'wss://openai.example.com/ws',
  });
  expect(onboardPayloads[1]).toMatchObject({
    intent: 'plan',
    endpoint: 'wss://openai.example.com/ws',
    agent: {
      id: 'openai-gpt4o',
      name: 'OpenAI GPT-4o',
      repository: 'agents/openai-gpt4o',
      owner: '@squad-mcp',
      tags: ['openai', 'prod'],
      capabilities: ['chat'],
    },
    authentication: {
      mode: 'api_key',
      secretName: 'OPENAI_API_KEY',
      environment: 'production',
    },
    tools: [
      { name: 'catalog.search', description: 'Busca recursos homologados.', entryPoint: 'catalog/search.py' },
    ],
    validation: {
      qualityGates: ['operacao', 'finops', 'confianca'],
      notes: 'Checklist final com owners.',
    },
  });
});

test('@onboarding-accessibility validates keyboard flow and aria feedback', async ({ page }) => {
  const fixtures = createOnboardingFixtures();
  await registerOnboardingRoutes(page, fixtures);

  await page.goto('/');
  await page.getByRole('button', { name: 'Admin Chat' }).click();

  const idInput = page.getByLabel('Identificador do agente');
  await idInput.click();
  await expect(idInput).toBeFocused();

  await page.keyboard.press('Tab');
  const displayInput = page.getByLabel('Nome exibido');
  await expect(displayInput).toBeFocused();

  await page.keyboard.press('Shift+Tab');
  await expect(idInput).toBeFocused();

  const repoInput = page.getByLabel('Repositório Git');
  const endpointInput = page.getByLabel('Endpoint MCP (ws/wss)');

  await expect(page.getByRole('heading', { name: 'Complete os dados obrigatórios' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Avançar para autenticação' })).toBeDisabled();

  await idInput.fill('openai-gpt4o');
  await repoInput.fill('agents/openai-gpt4o');
  await endpointInput.fill('ftp://example');
  await endpointInput.blur();

  await expect(page.getByRole('alert', { name: 'Revise os campos destacados.' })).toBeVisible();
  await expect(endpointInput).toHaveAttribute('aria-invalid', 'true');
  await expect(endpointInput).toHaveClass(/is-invalid/);

  await endpointInput.fill('wss://openai.example.com/ws');
  await endpointInput.blur();

  await expect(endpointInput).toHaveAttribute('aria-invalid', 'false');
  await expect(page.getByRole('button', { name: 'Avançar para autenticação' })).toBeEnabled();
  await expect(page.getByRole('heading', { name: 'Complete os dados obrigatórios' })).toHaveCount(0);
});
