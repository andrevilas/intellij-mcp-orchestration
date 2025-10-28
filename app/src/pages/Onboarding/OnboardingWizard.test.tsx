import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import OnboardingWizard from './OnboardingWizard';

const mockFetchAgents = vi.fn();
const mockPostConfigMcpOnboard = vi.fn();
const mockPostConfigPlan = vi.fn();
const mockPostConfigApply = vi.fn();
const mockFetchMcpOnboardingStatus = vi.fn();
const mockPostMcpSmokeRun = vi.fn();

vi.mock('../../api', () => ({
  fetchAgents: (...args: unknown[]) => mockFetchAgents(...args),
  postConfigMcpOnboard: (...args: unknown[]) => mockPostConfigMcpOnboard(...args),
  postConfigPlan: (...args: unknown[]) => mockPostConfigPlan(...args),
  postConfigApply: (...args: unknown[]) => mockPostConfigApply(...args),
  fetchMcpOnboardingStatus: (...args: unknown[]) => mockFetchMcpOnboardingStatus(...args),
  postMcpSmokeRun: (...args: unknown[]) => mockPostMcpSmokeRun(...args),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockFetchAgents.mockResolvedValue([]);
  mockPostConfigMcpOnboard.mockResolvedValue({ plan: null, diffs: [], risks: [], message: null, validation: null });
  mockPostConfigPlan.mockResolvedValue({ plan: null, diffs: [], risks: [] });
  mockPostConfigApply.mockResolvedValue({ status: 'applied', message: 'ok', recordId: 'rec-1' });
  mockFetchMcpOnboardingStatus.mockResolvedValue(null);
  mockPostMcpSmokeRun.mockResolvedValue(null);
});

function fillBasicStep() {
  return screen.getByRole('button', { name: 'Avançar para autenticação' });
}

describe('OnboardingWizard validations', () => {
  it('bloqueia avanço quando identificador já está em uso', async () => {
    const user = userEvent.setup();
    mockFetchAgents.mockResolvedValueOnce([
      {
        name: 'existing-agent',
        title: 'Existing Agent',
        version: '1.0.0',
        description: null,
        capabilities: [],
        model: null,
        status: 'healthy',
        lastDeployedAt: null,
        owner: null,
      },
    ]);

    render(<OnboardingWizard />);

    const idInput = screen.getByPlaceholderText('Ex.: openai-gpt4o');
    await user.type(idInput, 'existing-agent');
    await user.tab();

    await waitFor(() => expect(mockFetchAgents).toHaveBeenCalled());
    const duplicateMessages = await screen.findAllByText('Identificador existing-agent já está em uso.');
    expect(duplicateMessages.length).toBeGreaterThan(0);

    const nextButton = fillBasicStep();
    expect(nextButton).toBeDisabled();
    expect(mockFetchAgents).toHaveBeenCalled();
  });

  it('exige teste de conexão antes de prosseguir para validação', async () => {
    const user = userEvent.setup();
    mockFetchAgents.mockResolvedValue([]);
    mockPostConfigMcpOnboard.mockImplementation(async (payload: { intent?: string }) => {
      if (payload.intent === 'validate') {
        return { plan: null, diffs: [], risks: [], message: 'Conexão validada com sucesso.', validation: null };
      }
      return { plan: null, diffs: [], risks: [], message: null, validation: null };
    });

    render(<OnboardingWizard />);

    await user.type(screen.getByPlaceholderText('Ex.: openai-gpt4o'), 'openai-gpt4o');
    await user.type(screen.getByPlaceholderText('Ex.: OpenAI GPT-4o'), 'OpenAI GPT-4o');
    await user.type(screen.getByPlaceholderText('agents/openai-gpt4o'), 'agents/openai-gpt4o');
    await user.type(screen.getByPlaceholderText('wss://mcp.example.com/ws'), 'wss://openai.example.com/ws');
    await user.click(screen.getByPlaceholderText('@squad-mcp'));
    await user.keyboard(' @squad-mcp');
    await screen.findByText('Identificador disponível.');
    await user.click(fillBasicStep());

    await user.click(screen.getByLabelText('API Key'));
    await user.type(screen.getByPlaceholderText('OPENAI_API_KEY'), 'OPENAI_API_KEY');
    await user.type(screen.getByPlaceholderText('production'), 'production');
    await user.type(
      screen.getByPlaceholderText('Ex.: gerar chave no vault e anexar ao secret manager'),
      'Gerar no vault e replicar.',
    );
    await user.click(screen.getByRole('button', { name: 'Avançar para tools' }));

    await user.type(screen.getByPlaceholderText('catalog.search'), 'catalog.search');
    await user.type(screen.getByPlaceholderText('Busca recursos no catálogo interno'), 'Busca recursos homologados.');
    await user.type(screen.getByPlaceholderText('catalog/search.py'), 'catalog/search.py');

    const nextButton = screen.getByRole('button', { name: 'Ir para validação' });
    expect(nextButton).toBeDisabled();
    expect(screen.getByRole('heading', { name: 'Teste a conexão do MCP' })).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Testar conexão' }));

    await screen.findByRole('heading', { name: 'Conexão validada' });
    expect(nextButton).toBeEnabled();
    expect(mockPostConfigMcpOnboard).toHaveBeenCalledWith(expect.objectContaining({ intent: 'validate' }));
  });
});
