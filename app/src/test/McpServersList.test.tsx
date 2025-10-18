import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import McpServersList from '../pages/AdminChat/McpServersList';
import {
  applyConfigMcpUpdate,
  fetchServerCatalog,
  planConfigMcpUpdate,
  type ConfigMcpUpdateApplyResponse,
  type McpServer,
} from '../api';

type ApiModule = typeof import('../api');

vi.mock('../api', async () => {
  const actual = await vi.importActual<ApiModule>('../api');
  return {
    ...actual,
    fetchServerCatalog: vi.fn(),
    planConfigMcpUpdate: vi.fn(),
    applyConfigMcpUpdate: vi.fn(),
  } satisfies Partial<ApiModule>;
});

const catalogMock = fetchServerCatalog as unknown as Mock;
const planMock = planConfigMcpUpdate as unknown as Mock;
const applyMock = applyConfigMcpUpdate as unknown as Mock;

const baseServer: McpServer = {
  id: 'server-1',
  name: 'Gemini MCP',
  command: './run-mcp --profile production',
  description: 'Servidor MCP de faturamento',
  tags: ['finops'],
  capabilities: ['metrics'],
  transport: 'stdio',
  createdAt: '2025-01-10T10:00:00Z',
  updatedAt: '2025-01-10T10:00:00Z',
};

const planResponse = {
  planId: 'plan-1',
  summary: 'Atualizar manifesto do servidor MCP',
  message: 'Plano gerado para revisar manifesto e descrição.',
  diffs: [
    {
      id: 'diff-1',
      title: 'agents/gemini/agent.yaml',
      summary: 'Atualiza owner e tags do manifesto',
      diff: '--- a/agent.yaml\n+++ b/agent.yaml\n+owner: platform-team',
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  catalogMock.mockResolvedValue([baseServer]);
  planMock.mockResolvedValue(planResponse);
});

describe('McpServersList', () => {
  it('gera plano e aplica atualização após confirmação', async () => {
    const applyResponse: ConfigMcpUpdateApplyResponse = {
      status: 'applied',
      message: 'Atualização enviada com sucesso.',
      audit: {
        recordId: 'rec-1',
        branch: 'feature/mcp-update',
        pullRequest: {
          provider: 'github',
          id: 'pr-101',
          number: '101',
          url: 'https://github.com/mcp/console/pull/101',
          title: 'Atualizar manifesto Gemini MCP',
          state: 'open',
          headSha: 'abc123',
          branch: 'feature/mcp-update',
          merged: false,
        },
      },
      errors: [],
    };
    applyMock.mockResolvedValue(applyResponse);

    render(<McpServersList />);

    await screen.findByRole('heading', { name: 'Servidores MCP assistidos' });
    const serverCard = await screen.findByRole('article', { name: /Gemini MCP/i });
    const descriptionInput = within(serverCard).getByLabelText('Descrição');
    await userEvent.clear(descriptionInput);
    await userEvent.type(descriptionInput, 'Servidor MCP com auditoria contínua');

    await userEvent.click(within(serverCard).getByRole('button', { name: 'Gerar plano' }));

    const modal = await screen.findByRole('dialog', { name: /Revisar plano/ });
    expect(within(modal).getByText('Atualiza owner e tags do manifesto')).toBeInTheDocument();

    const actorInput = within(modal).getByLabelText('Autor da alteração');
    await userEvent.clear(actorInput);
    await userEvent.type(actorInput, 'Joana MCP');
    const emailInput = within(modal).getByLabelText('E-mail do autor');
    await userEvent.clear(emailInput);
    await userEvent.type(emailInput, 'joana@example.com');
    const commitInput = within(modal).getByLabelText('Mensagem do commit');
    await userEvent.clear(commitInput);
    await userEvent.type(commitInput, 'chore: atualizar manifesto gemini mcp');
    const noteInput = within(modal).getByLabelText('Nota adicional (opcional)');
    await userEvent.type(noteInput, 'Sincronizar owners com FinOps');

    await userEvent.click(within(modal).getByRole('button', { name: 'Aplicar atualização' }));

    await waitFor(() => {
      expect(applyMock).toHaveBeenCalledTimes(1);
    });

    const planCall = planMock.mock.calls[0][0] as { serverId: string; changes: Record<string, unknown> };
    expect(planCall.serverId).toBe('server-1');
    expect(planCall.changes.description).toBe('Servidor MCP com auditoria contínua');

    const applyCall = applyMock.mock.calls[0][0] as Record<string, unknown>;
    expect(applyCall.planId).toBe('plan-1');
    expect(applyCall.serverId).toBe('server-1');
    expect(applyCall.actor).toBe('Joana MCP');
    expect(applyCall.actorEmail).toBe('joana@example.com');
    expect(applyCall.commitMessage).toBe('chore: atualizar manifesto gemini mcp');
    expect(applyCall.note).toBe('Sincronizar owners com FinOps');

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    const resultMessage = await within(serverCard).findByText(/Atualização enviada com sucesso/);
    expect(resultMessage).toHaveTextContent('Registro: rec-1');
    expect(resultMessage).toHaveTextContent('Branch: feature/mcp-update');
    expect(resultMessage).toHaveTextContent('PR: https://github.com/mcp/console/pull/101');
  });

  it('permite cancelar plano sem aplicar', async () => {
    render(<McpServersList />);

    const serverCard = await screen.findByRole('article', { name: /Gemini MCP/i });
    const nameInput = within(serverCard).getByLabelText('Nome do servidor');
    await userEvent.type(nameInput, ' · atualizado');

    await userEvent.click(within(serverCard).getByRole('button', { name: 'Gerar plano' }));
    const modal = await screen.findByRole('dialog', { name: /Revisar plano/ });
    await userEvent.click(within(modal).getByRole('button', { name: 'Cancelar' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(applyMock).not.toHaveBeenCalled();
  });

  it('mantém o plano aberto e mostra erro quando o apply falha', async () => {
    const failureResponse: ConfigMcpUpdateApplyResponse = {
      status: 'failed',
      message: 'Validação falhou. Ajuste o manifesto antes de aplicar.',
      audit: null,
      errors: ['Manifesto inválido'],
    };
    applyMock.mockResolvedValue(failureResponse);

    render(<McpServersList />);

    const serverCard = await screen.findByRole('article', { name: /Gemini MCP/i });
    const tagsInput = within(serverCard).getByLabelText('Tags (separadas por vírgula)');
    await userEvent.clear(tagsInput);
    await userEvent.type(tagsInput, 'finops, audit');

    await userEvent.click(within(serverCard).getByRole('button', { name: 'Gerar plano' }));
    const modal = await screen.findByRole('dialog', { name: /Revisar plano/ });

    await userEvent.click(within(modal).getByRole('button', { name: 'Aplicar atualização' }));

    await waitFor(() => {
      expect(applyMock).toHaveBeenCalledTimes(1);
    });

    expect(await within(modal).findByText(/Validação falhou/)).toBeInTheDocument();
    const alerts = screen.getAllByRole('alert').map((element) => element.textContent ?? '');
    expect(alerts.join(' ')).toContain('Validação falhou. Ajuste o manifesto antes de aplicar.');
    expect(screen.getByRole('dialog', { name: /Revisar plano/ })).toBeInTheDocument();

    const resultMessage = within(serverCard).queryByText(/Registro:/);
    expect(resultMessage).toBeNull();
  });
});
