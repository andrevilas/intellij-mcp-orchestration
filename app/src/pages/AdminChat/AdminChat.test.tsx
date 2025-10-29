import { describe, expect, it, beforeEach, vi } from 'vitest';
import type { Mock } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import AdminChat from './AdminChat';
import type {
  AdminPlanSummary,
  ConfigChatResponse,
  ConfigPlanResponse,
  ConfigApplyPullRequest,
  ConfigApplyResponse,
  ConfigReloadResponse,
  ConfigOnboardResponse,
} from '../../api';
import {
  postConfigChat,
  postConfigPlan,
  postConfigApply,
  postConfigReload,
  postPolicyPlanApply,
  fetchNotifications,
  fetchAgents,
} from '../../api';

type ApiModule = typeof import('../../api');

vi.mock('../../api', async () => {
  const actual = await vi.importActual<ApiModule>('../../api');
  return {
    ...actual,
    fetchAgents: vi.fn(),
    postConfigChat: vi.fn(),
    postConfigPlan: vi.fn(),
    postConfigApply: vi.fn(),
    postConfigReload: vi.fn(),
    postPolicyPlanApply: vi.fn(),
    fetchNotifications: vi.fn(),
    postConfigMcpOnboard: vi.fn(),
    postMcpSmokeRun: vi.fn(),
    fetchMcpOnboardingStatus: vi.fn(),
  } satisfies Partial<ApiModule>;
});

vi.mock('../Onboarding/OnboardingWizard', () => ({
  __esModule: true,
  default: () => <div data-testid="onboarding-wizard">Onboarding Wizard Stub</div>,
}));

vi.setConfig({ testTimeout: 10000 });

describe('AdminChat view', () => {
  const chatResponse: ConfigChatResponse = {
    threadId: 'thread-1',
    messages: [
      { id: 'm1', role: 'user', content: 'Quais guardrails estão ativos?', createdAt: '2025-01-10T10:00:00Z' },
      {
        id: 'm2',
        role: 'assistant',
        content: 'Sugiro habilitar checkpoints HITL para rotas críticas e revisar diffs pendentes.',
        createdAt: '2025-01-10T10:00:05Z',
      },
    ],
  };

  const planSummary: AdminPlanSummary = {
    id: 'plan-1',
    threadId: chatResponse.threadId,
    status: 'ready',
    generatedAt: '2025-01-10T10:01:00Z',
    author: 'Console MCP',
    scope: 'Habilitar checkpoints HITL nas rotas prioritárias',
    steps: [
      {
        id: 'step-1',
        title: 'Atualizar política de checkpoints',
        description: 'Ative checkpoints HITL para as rotas prioritárias com quorum de dois operadores.',
        status: 'ready',
        impact: 'Garante mitigação de riscos críticos.',
      },
    ],
    branch: 'feature/hitl-checkpoints',
    baseBranch: 'main',
    reviewers: [{ id: 'rev-ana', name: 'Ana Moreira', status: 'approved' }],
    pullRequest: {
      id: 'pr-42',
      number: '42',
      title: 'feat: habilitar checkpoints HITL',
      url: 'https://github.com/mcp/console/pull/42',
      state: 'open',
      reviewStatus: 'pending',
      reviewers: [
        { id: 'rev-ana', name: 'Ana Moreira', status: 'approved' },
        { id: 'rev-ravi', name: 'Ravi Singh', status: 'pending' },
      ],
    },
  };

  const planResponse: ConfigPlanResponse = {
    plan: planSummary,
    diffs: [
      {
        id: 'diff-1',
        file: 'routing/checkpoints.yaml',
        summary: 'Ativa checkpoints para rotas prioritárias',
        diff: '+ enable_checkpoints: true\n- enable_checkpoints: false',
      },
    ],
    risks: [
      {
        id: 'risk-1',
        level: 'high',
        title: 'Mudança crítica de roteamento',
        description: 'Necessário aprovar HITL antes de aplicar.',
        mitigation: 'Executar canário em 5% das requisições.',
      },
    ],
  };

  const reloadResponse: ConfigReloadResponse = {
    message: 'Plano gerado para regerar finops.checklist.',
    plan: {
      intent: 'generate_artifact',
      summary: 'Gerar checklist finops',
      steps: [
        {
          id: 'write-artifact',
          title: 'Escrever artefato',
          description: 'Salvar checklist em disco.',
          dependsOn: [],
          actions: [
            {
              type: 'write_file',
              path: 'generated/cache.md',
              contents: '# Checklist',
              encoding: 'utf-8',
              overwrite: true,
            },
          ],
        },
      ],
      diffs: [
        {
          path: 'generated/cache.md',
          summary: 'Atualizar checklist',
          changeType: 'update',
          diff: '--- a/generated/cache.md\n+++ b/generated/cache.md\n+Conteúdo',
        },
      ],
      risks: [],
      status: 'pending',
      context: [],
      approvalRules: [],
    },
    planPayload: {
      intent: 'generate_artifact',
      summary: 'Gerar checklist finops',
      steps: [
        {
          id: 'write-artifact',
          title: 'Escrever artefato',
          description: 'Salvar checklist em disco.',
          depends_on: [],
          actions: [
            {
              type: 'write_file',
              path: 'generated/cache.md',
              contents: '# Checklist',
              encoding: 'utf-8',
              overwrite: true,
            },
          ],
        },
      ],
      diffs: [
        {
          path: 'generated/cache.md',
          summary: 'Atualizar checklist',
          change_type: 'update',
          diff: '--- a/generated/cache.md\n+++ b/generated/cache.md\n+Conteúdo',
        },
      ],
      risks: [],
      status: 'pending',
      context: [],
      approval_rules: [],
    },
    patch: '--- a/generated/cache.md\n+++ b/generated/cache.md\n+Conteúdo',
  };

  const reloadApplyResponse = {
    status: 'completed' as const,
    mode: 'branch_pr' as const,
    planId: 'reload-plan-1',
    recordId: 'rec-reload-1',
    branch: 'chore/reload-artifact',
    baseBranch: 'main',
    commitSha: 'def456',
    diff: { stat: '1 file changed', patch: 'diff --git a/generated/cache.md b/generated/cache.md' },
    hitlRequired: false,
    message: 'Artefato regenerado com sucesso.',
    approvalId: null,
    pullRequest: null,
  };

  const applyHitlResponse: ConfigApplyResponse = {
    status: 'hitl_required',
    request: {
      token: 'token-hitl',
      approver: null,
      message: 'Aprovação humana necessária antes de aplicar.',
    },
  };

  const applySuccessPullRequest: ConfigApplyPullRequest = {
    provider: 'github',
    id: 'pr-42',
    number: '42',
    url: 'https://github.com/prom/demo/pull/42',
    title: 'feat: onboard openai-gpt4o',
    state: 'open',
    headSha: 'abc123',
    branch: 'feature/mcp-openai-gpt4o',
    ciStatus: 'pending',
    reviewStatus: 'pending',
    merged: false,
  };

  const applySuccessResponse: ConfigApplyResponse = {
    status: 'applied',
    message: 'Plano aplicado com sucesso.',
    plan: {
      ...planSummary,
      status: 'applied',
      generatedAt: '2025-01-10T10:05:00Z',
      pullRequest: {
        id: applySuccessPullRequest.id,
        number: applySuccessPullRequest.number,
        title: applySuccessPullRequest.title,
        url: applySuccessPullRequest.url,
        state: applySuccessPullRequest.state,
        reviewStatus: applySuccessPullRequest.reviewStatus,
        branch: applySuccessPullRequest.branch,
      },
    },
    branch: 'feature/mcp-openai-gpt4o',
    baseBranch: 'main',
    commitSha: 'abc123',
    recordId: 'rec-apply-1',
    pullRequest: applySuccessPullRequest,
  };

  const onboardPlan: AdminPlanSummary = {
    id: 'onboard-plan-1',
    threadId: 'thread-onboard',
    status: 'ready',
    generatedAt: '2025-01-11T09:00:00Z',
    author: 'Console MCP',
    scope: 'Onboarding do agente openai-gpt4o',
    steps: [
      {
        id: 'onboard-step-1',
        title: 'Criar manifesto',
        description: 'Gera manifesto MCP com metadata básica.',
        status: 'ready',
      },
      {
        id: 'onboard-step-2',
        title: 'Atualizar registro',
        description: 'Registra agente no catálogo principal.',
        status: 'pending',
      },
    ],
  };

  const onboardValidation: NonNullable<ConfigOnboardResponse['validation']> = {
    endpoint: 'wss://openai.example.com/ws',
    transport: 'websocket',
    tools: [
      { name: 'catalog.search', description: 'Busca recursos homologados.', definition: null },
      { name: 'catalog.metrics', description: null, definition: null },
    ],
    missingTools: ['metrics.ingest'],
    serverInfo: { name: 'demo' },
    capabilities: { tools: true },
  };

  const onboardResponse: ConfigOnboardResponse = {
    plan: onboardPlan,
    diffs: [
      {
        id: 'onboard-diff-1',
        file: 'agents/openai-gpt4o/agent.manifest.json',
        summary: 'Adiciona manifesto inicial para o agente.',
        diff: '{\n  "name": "openai-gpt4o"\n}',
      },
    ],
    risks: [
      {
        id: 'onboard-risk-1',
        level: 'medium',
        title: 'Manifesto sem validação',
        description: 'Executar validação contra schema antes de merge.',
      },
    ],
    message: 'Plano de onboarding preparado para openai-gpt4o.',
    validation: onboardValidation,
  };

  const postChatMock = postConfigChat as unknown as Mock;
  const fetchAgentsMock = fetchAgents as unknown as Mock;
  const postPlanMock = postConfigPlan as unknown as Mock;
  const postApplyMock = postConfigApply as unknown as Mock;
  const postReloadMock = postConfigReload as unknown as Mock;
  const postPolicyPlanApplyMock = postPolicyPlanApply as unknown as Mock;
  const fetchNotificationsMock = fetchNotifications as unknown as Mock;

  beforeEach(() => {
    vi.clearAllMocks();
    fetchAgentsMock.mockResolvedValue([
      {
        name: 'console-admin',
        title: 'Console Admin',
        version: '1.0.0',
        description: 'Agente administrativo configurado para o console MCP.',
        capabilities: ['plans', 'orchestration'],
        model: null,
        status: 'healthy',
        lastDeployedAt: null,
        owner: 'Platform Team',
      },
    ]);
    postChatMock.mockResolvedValue(chatResponse);
    postPlanMock.mockImplementation((payload: unknown) => {
      const typed = payload as { intent: string };
      if (typed.intent === 'summarize') {
        return Promise.resolve({ plan: onboardPlan, diffs: onboardResponse.diffs, risks: onboardResponse.risks });
      }
      return Promise.resolve(planResponse);
    });
    postApplyMock
      .mockResolvedValueOnce(applyHitlResponse)
      .mockResolvedValueOnce(applySuccessResponse)
      .mockResolvedValue(applySuccessResponse);
    postReloadMock.mockResolvedValue(reloadResponse);
    postPolicyPlanApplyMock.mockResolvedValue(reloadApplyResponse);
    fetchNotificationsMock.mockResolvedValue([]);
  });

  it('permite conversar, gerar plano, aprovar HITL e iniciar onboarding', async () => {
    render(<AdminChat />);

    const textarea = screen.getByLabelText('Mensagem para o copiloto');
    await userEvent.type(textarea, 'Quais guardrails devo atualizar?');
    await userEvent.click(screen.getByRole('button', { name: 'Enviar mensagem' }));

    await waitFor(() => expect(postChatMock).toHaveBeenCalled());
    const firstIntent = postChatMock.mock.calls[0][0] as {
      intent: string;
      prompt: string;
      threadId: string | null;
      context?: string;
    };
    expect(firstIntent).toMatchObject({
      intent: 'message',
      prompt: 'Quais guardrails devo atualizar?',
      threadId: null,
    });
    expect(firstIntent.context).toBeDefined();
    const parsedContext = JSON.parse(firstIntent.context as string);
    expect(parsedContext).toMatchObject({ agent: 'console-admin', knowledgeBase: 'platform-docs' });
    expect(typeof parsedContext.instructions).toBe('string');
    expect(parsedContext.instructions).toContain('Console MCP');
    await waitFor(() => expect(screen.getByText(chatResponse.messages[1].content)).toBeInTheDocument());

    const scopeInput = screen.getByLabelText('Escopo do plano');
    await userEvent.clear(scopeInput);
    await userEvent.type(scopeInput, 'Habilitar checkpoints HITL nas rotas prioritárias');
    await userEvent.click(screen.getByRole('button', { name: 'Gerar plano' }));

    await waitFor(() => expect(postPlanMock).toHaveBeenCalledWith({
      intent: 'generate',
      threadId: chatResponse.threadId,
      scope: 'Habilitar checkpoints HITL nas rotas prioritárias',
      refresh: false,
    }));

    await waitFor(() => expect(screen.getByText('Atualizar política de checkpoints')).toBeInTheDocument());
    expect(screen.getByText('Ativa checkpoints para rotas prioritárias')).toBeInTheDocument();
    expect(screen.getByText('Mudança crítica de roteamento')).toBeInTheDocument();

    const noteField = screen.getByLabelText('Nota para aplicação (opcional)');
    await userEvent.type(noteField, 'Validar com FinOps antes de aplicar.');
    await userEvent.click(screen.getByRole('button', { name: 'Aplicar plano' }));

    await waitFor(() => expect(screen.getByText(applyHitlResponse.request.message)).toBeInTheDocument());
    expect(postApplyMock).toHaveBeenNthCalledWith(1, {
      intent: 'apply',
      threadId: chatResponse.threadId,
      planId: planSummary.id,
      note: 'Validar com FinOps antes de aplicar.',
    });

    const approvalNote = await screen.findByLabelText('Nota para aprovação (opcional)');
    await userEvent.clear(approvalNote);
    await userEvent.type(approvalNote, 'Aprovado manualmente pelo time de risco.');
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar aplicação' }));

    const statusCandidates = await screen.findAllByRole('status');
    const statusBanner = statusCandidates.find((element) =>
      element.textContent?.includes(applySuccessResponse.message ?? ''),
    );
    if (!statusBanner) {
      throw new Error('Status banner com mensagem de sucesso não encontrado.');
    }
    expect(statusBanner).toHaveTextContent(applySuccessResponse.message);
    expect(statusBanner).toHaveTextContent(applySuccessResponse.branch as string);
    expect(statusBanner).toHaveTextContent('PR:');
    expect(postApplyMock).toHaveBeenNthCalledWith(2, {
      intent: 'confirm',
      threadId: chatResponse.threadId,
      planId: planSummary.id,
      token: applyHitlResponse.request.token,
      note: 'Aprovado manualmente pelo time de risco.',
    });
    expect(screen.getByText('Aplicado')).toBeInTheDocument();

    const onboardingButton = screen.getAllByRole('button', { name: 'Onboarding assistido MCP' })[0];
    await userEvent.click(onboardingButton);
    await waitFor(() => expect(screen.getByTestId('onboarding-wizard')).toBeInTheDocument());
  });

  it('exibe metadados do branch, do PR e dos revisores no resumo do plano', async () => {
    render(<AdminChat />);

    const messageField = screen.getByLabelText('Mensagem para o copiloto');
    await userEvent.type(messageField, 'Quais guardrails devo atualizar?');
    await userEvent.click(screen.getByRole('button', { name: 'Enviar mensagem' }));
    await waitFor(() => expect(postChatMock).toHaveBeenCalled());

    const scopeInput = screen.getByLabelText('Escopo do plano');
    await userEvent.clear(scopeInput);
    await userEvent.type(scopeInput, 'Habilitar checkpoints HITL nas rotas prioritárias');
    await userEvent.click(screen.getByRole('button', { name: 'Gerar plano' }));

    await waitFor(() => expect(postPlanMock).toHaveBeenCalled());
    await screen.findByText('Atualizar política de checkpoints');

    const planHeading = await screen.findByRole('heading', { name: 'Plano de configuração' });
    const planSection = planHeading.closest('section');
    expect(planSection).not.toBeNull();
    const planWithin = within(planSection as HTMLElement);

    await waitFor(() =>
      expect(planWithin.getByText('feature/hitl-checkpoints', { selector: 'code' })).toBeInTheDocument(),
    );
    expect(planWithin.getByText('main', { selector: 'code' })).toBeInTheDocument();

    const prLink = planWithin.getByRole('link', { name: '#42 — feat: habilitar checkpoints HITL' });
    expect(prLink).toHaveAttribute('href', 'https://github.com/mcp/console/pull/42');

    await waitFor(() => expect(planWithin.getByText('Aberto')).toBeInTheDocument());
    expect(planWithin.getByText('Aguardando revisão')).toBeInTheDocument();
    expect(planWithin.getByText('Ana Moreira')).toBeInTheDocument();
    expect(planWithin.getByText('Aprovado')).toBeInTheDocument();
    expect(planWithin.getByText('Ravi Singh')).toBeInTheDocument();
    expect(planWithin.getByText('Pendente')).toBeInTheDocument();
  });

  it('exibe quickstart com player acessível, link para docs e exemplos clicáveis', async () => {
    const user = userEvent.setup();
    render(<AdminChat />);

    const quickstartRegion = screen.getByRole('region', { name: 'Comece rápido' });
    const quickstartScope = within(quickstartRegion);

    const docsLink = quickstartScope.getByRole('link', { name: 'Abrir documentação' });
    expect(docsLink).toHaveAttribute(
      'href',
      'https://github.com/openai/intellij-mcp-orchestration/blob/main/docs/admin-chat-quickstart.md',
    );

    const demoButton = quickstartScope.getByRole('button', { name: 'Assistir demo' });
    await user.click(demoButton);

    const mediaDialog = await screen.findByRole('dialog', { name: 'Veja o Admin Chat em ação' });
    expect(within(mediaDialog).getByTitle('Walkthrough do Admin Chat')).toBeInTheDocument();
    await user.click(within(mediaDialog).getByRole('button', { name: 'Fechar player' }));

    const exampleButton = quickstartScope.getByRole('button', { name: 'Gerar plano HITL' });
    await user.click(exampleButton);

    expect(screen.getByLabelText('Mensagem para o copiloto')).toHaveValue(
      'Preciso habilitar checkpoints HITL para as rotas críticas com aprovação dupla.',
    );
    expect(screen.getByLabelText('Escopo do plano')).toHaveValue(
      'Habilitar checkpoints HITL nas rotas prioritárias',
    );
  });

  it('gera plano de reload exibindo diff e aplica com atualização de notificações', async () => {
    const user = userEvent.setup();
    const updateNotifications = vi.fn();
    render(<AdminChat onNotificationsUpdate={updateNotifications} />);

    const reloadButtons = screen.getAllByRole('button', { name: 'Regenerar artefato' });
    const finOpsButton = reloadButtons[reloadButtons.length - 1];
    await user.click(finOpsButton);

    const targetInput = await screen.findByLabelText('Caminho de destino');
    await user.clear(targetInput);
    await user.type(targetInput, 'generated/cache.md');

    const parametersTextarea = screen.getByLabelText('Parâmetros (JSON)');
    await user.clear(parametersTextarea);
    fireEvent.change(parametersTextarea, { target: { value: '{"owner":"finops"}' } });
    expect(parametersTextarea).toHaveValue('{"owner":"finops"}');

    const reloadDialog = screen.getByRole('dialog', { name: /Regenerar/ });
    await user.click(within(reloadDialog).getByRole('button', { name: 'Gerar plano' }));

    await waitFor(() => expect(postReloadMock).toHaveBeenCalled());
    expect(postReloadMock).toHaveBeenCalledWith({
      artifactType: 'finops.checklist',
      targetPath: 'generated/cache.md',
      parameters: { owner: 'finops' },
    });

    await screen.findByText('Gerar checklist finops');
    expect(screen.getByText('Alterações propostas')).toBeInTheDocument();
    expect(screen.getByLabelText('Caminho de destino')).toHaveValue('generated/cache.md');

    const actorInput = screen.getByLabelText('Autor da alteração');
    await user.clear(actorInput);
    await user.type(actorInput, 'Ana Operator');

    const emailInput = screen.getByLabelText('E-mail do autor');
    await user.clear(emailInput);
    await user.type(emailInput, 'ana@example.com');

    const commitInput = screen.getByLabelText('Mensagem do commit');
    await user.clear(commitInput);
    await user.type(commitInput, 'chore: atualizar checklist finops');

    await user.click(within(reloadDialog).getByRole('button', { name: 'Aplicar plano' }));

    const confirmationDialog = await screen.findByRole('dialog', { name: 'Aplicar plano · Checklist FinOps' });
    await user.click(within(confirmationDialog).getByRole('button', { name: 'Armar aplicação' }));
    await user.click(within(confirmationDialog).getByRole('button', { name: 'Aplicar agora' }));

    await waitFor(() => expect(postPolicyPlanApplyMock).toHaveBeenCalledTimes(1));
    const applyPayload = postPolicyPlanApplyMock.mock.calls[0][0];
    expect(applyPayload.planId).toMatch(/^reload-/);
    expect(applyPayload.actor).toBe('Ana Operator');
    expect(applyPayload.actorEmail).toBe('ana@example.com');
    expect(applyPayload.patch).toBe(reloadResponse.patch);

    await waitFor(() => expect(fetchNotificationsMock).toHaveBeenCalled());
    expect(updateNotifications).toHaveBeenCalledWith([]);

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByText(/Artefato regenerado com sucesso/)).toBeInTheDocument();
  });
});
