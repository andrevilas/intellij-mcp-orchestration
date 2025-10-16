import { describe, expect, it, beforeEach, vi } from 'vitest';
import type { Mock } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import AdminChat from '../pages/AdminChat';
import type {
  AdminPlanSummary,
  ConfigChatResponse,
  ConfigPlanResponse,
  ConfigApplyResponse,
  ConfigOnboardResponse,
} from '../api';
import {
  postConfigChat,
  postConfigPlan,
  postConfigApply,
  postConfigMcpOnboard,
} from '../api';

type ApiModule = typeof import('../api');

vi.mock('../api', async () => {
  const actual = await vi.importActual<ApiModule>('../api');
  return {
    ...actual,
    postConfigChat: vi.fn(),
    postConfigPlan: vi.fn(),
    postConfigApply: vi.fn(),
    postConfigMcpOnboard: vi.fn(),
  } satisfies Partial<ApiModule>;
});

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
  };

  const onboardResponse: ConfigOnboardResponse = {
    status: 'queued',
    message: 'Onboarding iniciado para openai-gpt4o.',
  };

  const postChatMock = postConfigChat as unknown as Mock;
  const postPlanMock = postConfigPlan as unknown as Mock;
  const postApplyMock = postConfigApply as unknown as Mock;
  const postOnboardMock = postConfigMcpOnboard as unknown as Mock;

  beforeEach(() => {
    vi.clearAllMocks();
    postChatMock.mockResolvedValue(chatResponse);
    postPlanMock.mockResolvedValue(planResponse);
    postApplyMock.mockResolvedValueOnce(applyHitlResponse).mockResolvedValueOnce(applySuccessResponse);
    postOnboardMock.mockResolvedValue(onboardResponse);
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

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(applySuccessResponse.message));
    expect(postApplyMock).toHaveBeenNthCalledWith(2, {
      intent: 'confirm',
      threadId: chatResponse.threadId,
      planId: planSummary.id,
      token: applyHitlResponse.request.token,
      note: 'Aprovado manualmente pelo time de risco.',
    });
    expect(screen.getByText('Aplicado')).toBeInTheDocument();

    const providerInput = screen.getByLabelText('ID do servidor');
    await userEvent.type(providerInput, 'openai-gpt4o');
    const commandInput = screen.getByLabelText('Comando (opcional)');
    await userEvent.type(commandInput, './run-mcp --profile production');
    await userEvent.click(screen.getByRole('button', { name: 'Iniciar onboarding' }));

    await waitFor(() => expect(postOnboardMock).toHaveBeenCalledWith({
      intent: 'onboard',
      providerId: 'openai-gpt4o',
      command: './run-mcp --profile production',
    }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(onboardResponse.message));
  });
});
