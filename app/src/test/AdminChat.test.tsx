import { describe, expect, it, beforeEach, vi } from 'vitest';
import type { Mock } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import AdminChat from '../pages/AdminChat';
import type {
  AdminPlanSummary,
  ConfigChatResponse,
  ConfigPlanResponse,
  ConfigApplyResponse,
  ConfigReloadResponse,
  ConfigOnboardResponse,
  ConfigOnboardRequest,
  McpSmokeRunResponse,
  McpOnboardingStatus,
} from '../api';
import {
  postConfigChat,
  postConfigPlan,
  postConfigApply,
  postConfigReload,
  postPolicyPlanApply,
  fetchNotifications,
  postConfigMcpOnboard,
  postMcpSmokeRun,
  fetchMcpOnboardingStatus,
} from '../api';

type ApiModule = typeof import('../api');

vi.mock('../api', async () => {
  const actual = await vi.importActual<ApiModule>('../api');
  return {
    ...actual,
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

  const applySuccessResponse: ConfigApplyResponse = {
    status: 'applied',
    message: 'Plano aplicado com sucesso.',
    plan: { ...planSummary, status: 'applied', generatedAt: '2025-01-10T10:05:00Z' },
    branch: 'feature/mcp-openai-gpt4o',
    baseBranch: 'main',
    commitSha: 'abc123',
    recordId: 'rec-apply-1',
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
  };

  const smokeResponse: McpSmokeRunResponse = {
    runId: 'smoke-1',
    status: 'running',
    summary: 'Smoke em execução no ambiente production.',
    startedAt: '2025-01-11T09:05:00Z',
    finishedAt: null,
  };

  const trackerStatus: McpOnboardingStatus = {
    recordId: applySuccessResponse.recordId,
    status: 'running',
    branch: applySuccessResponse.branch,
    baseBranch: applySuccessResponse.baseBranch,
    commitSha: applySuccessResponse.commitSha,
    pullRequest: applySuccessResponse.pullRequest,
    updatedAt: '2025-01-11T09:10:00Z',
  };

  const postChatMock = postConfigChat as unknown as Mock;
  const postPlanMock = postConfigPlan as unknown as Mock;
  const postApplyMock = postConfigApply as unknown as Mock;
  const postReloadMock = postConfigReload as unknown as Mock;
  const postPolicyPlanApplyMock = postPolicyPlanApply as unknown as Mock;
  const fetchNotificationsMock = fetchNotifications as unknown as Mock;
  const postOnboardMock = postConfigMcpOnboard as unknown as Mock;
  const postSmokeMock = postMcpSmokeRun as unknown as Mock;
  const fetchStatusMock = fetchMcpOnboardingStatus as unknown as Mock;

  beforeEach(() => {
    vi.clearAllMocks();
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
    postOnboardMock.mockResolvedValue(onboardResponse);
    postSmokeMock.mockResolvedValue(smokeResponse);
    fetchStatusMock.mockResolvedValue(trackerStatus);
  });

  it('permite conversar, gerar plano, aprovar HITL e iniciar onboarding', async () => {
    render(<AdminChat />);

    const textarea = screen.getByLabelText('Mensagem para o copiloto');
    await userEvent.type(textarea, 'Quais guardrails devo atualizar?');
    await userEvent.click(screen.getByRole('button', { name: 'Enviar mensagem' }));

    await waitFor(() =>
      expect(postChatMock).toHaveBeenCalledWith({ intent: 'message', prompt: 'Quais guardrails devo atualizar?', threadId: null }),
    );
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

    const statusBanner = await screen.findByRole('status');
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

    await userEvent.type(screen.getByLabelText('Identificador do agente'), 'openai-gpt4o');
    await userEvent.type(screen.getByLabelText('Nome exibido'), 'OpenAI GPT-4o');
    await userEvent.type(screen.getByLabelText('Repositório Git'), 'agents/openai-gpt4o');
    await userEvent.type(screen.getByLabelText('Owner responsável'), '@squad-mcp');
    await userEvent.type(screen.getByLabelText('Tags (separadas por vírgula)'), 'openai,prod');
    await userEvent.type(screen.getByLabelText('Capacidades (separadas por vírgula)'), 'chat');
    await userEvent.type(screen.getByLabelText('Descrição'), 'Agente com fallback para GPT-4o.');
    await userEvent.click(screen.getByRole('button', { name: 'Avançar para autenticação' }));

    await userEvent.click(screen.getByLabelText('API Key'));
    await userEvent.type(screen.getByLabelText('Nome da credencial'), 'OPENAI_API_KEY');
    await userEvent.type(screen.getByLabelText('Ambiente/namespace'), 'production');
    await userEvent.type(screen.getByLabelText('Instruções para provisionamento'), 'Gerar no vault e replicar.');
    await userEvent.click(screen.getByRole('button', { name: 'Avançar para tools' }));

    await userEvent.type(screen.getByLabelText('Nome da tool 1'), 'catalog.search');
    await userEvent.type(screen.getByLabelText('Descrição da tool 1'), 'Busca recursos homologados.');
    await userEvent.type(screen.getByLabelText('Entry point da tool 1'), 'catalog/search.py');
    await userEvent.click(screen.getByRole('button', { name: 'Ir para validação' }));

    const notesField = screen.getByLabelText('Checklist/observações adicionais');
    await userEvent.type(notesField, 'Checklist final com owners.');
    const gatesField = screen.getByLabelText('Quality gates (separados por vírgula)');
    await userEvent.clear(gatesField);
    await userEvent.type(gatesField, 'operacao,finops,confianca');

    await userEvent.click(screen.getByRole('button', { name: 'Gerar plano de onboarding' }));

    const expectedPayload: ConfigOnboardRequest = {
      agent: {
        id: 'openai-gpt4o',
        name: 'OpenAI GPT-4o',
        repository: 'agents/openai-gpt4o',
        description: 'Agente com fallback para GPT-4o.',
        owner: '@squad-mcp',
        tags: ['openai', 'prod'],
        capabilities: ['chat'],
      },
      authentication: {
        mode: 'api_key',
        secretName: 'OPENAI_API_KEY',
        instructions: 'Gerar no vault e replicar.',
        environment: 'production',
      },
      tools: [
        { name: 'catalog.search', description: 'Busca recursos homologados.', entryPoint: 'catalog/search.py' },
      ],
      validation: {
        runSmokeTests: true,
        qualityGates: ['operacao', 'finops', 'confianca'],
        notes: 'Checklist final com owners.',
      },
    };

    await waitFor(() => expect(postOnboardMock).toHaveBeenCalledWith(expectedPayload));
    await waitFor(() => expect(screen.getByText(onboardResponse.message)).toBeInTheDocument());
    expect(screen.getByText('Criar manifesto')).toBeInTheDocument();
    expect(screen.getByText('Adiciona manifesto inicial para o agente.')).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('Nota para aplicação'), 'Aplicar com acompanhamento do time de plataforma.');
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar e aplicar plano' }));

    await waitFor(() =>
      expect(postPlanMock).toHaveBeenCalledWith({ intent: 'summarize', threadId: onboardPlan.threadId }),
    );
    await waitFor(() =>
      expect(postApplyMock).toHaveBeenLastCalledWith({
        intent: 'apply',
        threadId: onboardPlan.threadId,
        planId: onboardPlan.id,
        note: 'Aplicar com acompanhamento do time de plataforma.',
      }),
    );

    await waitFor(() =>
      expect(screen.getByText(`Registro`)).toBeInTheDocument(),
    );
    expect(screen.getByText(applySuccessResponse.recordId)).toBeInTheDocument();
    expect(screen.getByText(applySuccessResponse.branch as string)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: applySuccessResponse.pullRequest?.title })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Atualizar status' }));
    await waitFor(() => expect(fetchStatusMock).toHaveBeenCalledWith(applySuccessResponse.recordId));
    expect(screen.getByText(/Situação atual:/)).toHaveTextContent('Situação atual: running');

    await userEvent.click(screen.getByRole('button', { name: 'Executar smoke tests' }));
    await waitFor(() =>
      expect(postSmokeMock).toHaveBeenCalledWith({
        recordId: applySuccessResponse.recordId,
        planId: onboardPlan.id,
        providerId: 'openai-gpt4o',
      }),
    );
    expect(screen.getByText(/Smoke em execução/)).toBeInTheDocument();
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
