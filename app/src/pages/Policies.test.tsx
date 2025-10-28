import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import Policies from './Policies';
import type {
  PolicyDeployment,
  PolicyRolloutOverview,
  PolicyTemplate,
  ProviderSummary,
} from '../api';
import {
  fetchPolicyTemplates,
  fetchPolicyDeployments,
  createPolicyDeployment,
  deletePolicyDeployment,
} from '../api';
import { ToastProvider } from '../components/feedback/ToastProvider';
import { ThemeProvider } from '../theme/ThemeContext';

type ApiModule = typeof import('../api');

vi.mock('../api', async () => {
  const actual = await vi.importActual<ApiModule>('../api');
  return {
    ...actual,
    fetchPolicyTemplates: vi.fn(),
    fetchPolicyDeployments: vi.fn(),
    createPolicyDeployment: vi.fn(),
    deletePolicyDeployment: vi.fn(),
  } satisfies Partial<ApiModule>;
});

describe('Policies page integration with policy APIs', () => {
  const providers: ProviderSummary[] = [
    {
      id: 'glm',
      name: 'GLM 46',
      command: 'glm46',
      description: 'Modelo GLM 46',
      capabilities: ['chat'],
      tags: ['llm'],
      transport: 'stdio',
      is_available: true,
    },
  ];

  const templates: PolicyTemplate[] = [
    {
      id: 'economy',
      name: 'Economia',
      tagline: 'FinOps primeiro',
      description:
        'Prioriza custo absoluto e direciona a maior parte do tráfego para modelos econômicos com fallback gradual.',
      priceDelta: '-22% vs. baseline',
      latencyTarget: 'até 4.0 s P95',
      guardrailLevel: 'Nível 2 · Moderado',
      features: [
        'Roteia 70% das requisições para modelos Economy e Lite',
        'Fallback manual para turbos em incidentes de SLA',
        'Throttling progressivo por projeto e custo acumulado',
      ],
    },
    {
      id: 'balanced',
      name: 'Equilíbrio',
      tagline: 'Balanceamento inteligente',
      description:
        'Combina custo/latência com seleção automática do melhor modelo por rota de negócio, incluindo failover automático.',
      priceDelta: '-12% vs. baseline',
      latencyTarget: 'até 2.5 s P95',
      guardrailLevel: 'Nível 3 · Avançado',
      features: [
        'Roteamento adaptativo por capacidade e disponibilidade',
        'Failover automático com circuito aberto em 30s',
        'Políticas de custo dinâmicas por equipe/projeto',
      ],
    },
    {
      id: 'turbo',
      name: 'Turbo',
      tagline: 'Velocidade máxima',
      description:
        'Entrega a menor latência possível e mantém modelos premium sempre quentes, com alertas agressivos de custo.',
      priceDelta: '+18% vs. baseline',
      latencyTarget: 'até 900 ms P95',
      guardrailLevel: 'Nível 4 · Crítico',
      features: [
        'Pré-aquecimento de modelos turbo em múltiplas regiões',
        'Orçamento observável com limites hora a hora',
        'Expansão automática de capacidade sob demanda',
      ],
    },
  ];

  const initialDeployment: PolicyDeployment = {
    id: 'deploy-balanced-20250415',
    templateId: 'balanced',
    deployedAt: '2025-04-15T09:30:00+00:00',
    author: 'Console MCP',
    window: 'GA progressivo',
    note: 'Promoção Q2 liberada para toda a frota.',
    sloP95Ms: 985,
    budgetUsagePct: 80,
    incidentsCount: 0,
    guardrailScore: 70,
    createdAt: '2025-04-15T09:30:00+00:00',
    updatedAt: '2025-04-15T09:30:00+00:00',
  };

  const fetchTemplatesMock = fetchPolicyTemplates as unknown as Mock;
  const fetchDeploymentsMock = fetchPolicyDeployments as unknown as Mock;
  const createDeploymentMock = createPolicyDeployment as unknown as Mock;
  const deleteDeploymentMock = deletePolicyDeployment as unknown as Mock;

  const rollout: PolicyRolloutOverview = {
    generatedAt: '2025-04-20T12:00:00+00:00',
    plans: [
      {
        templateId: 'balanced',
        generatedAt: '2025-04-15T09:30:00+00:00',
        allocations: [
          {
            segment: {
              id: 'canary',
              name: 'Canário',
              description: 'Rotas críticas monitoradas em tempo real com dashboards dedicados.',
            },
            coverage: 20,
            providers,
          },
          {
            segment: {
              id: 'general',
              name: 'GA',
              description: 'Workloads padrão com fallback automático e monitoramento de custos.',
            },
            coverage: 60,
            providers: [],
          },
          {
            segment: {
              id: 'fallback',
              name: 'Fallback',
              description: 'Rotas sensíveis com janela de rollback dedicada e dupla validação.',
            },
            coverage: 20,
            providers: [],
          },
        ],
      },
      {
        templateId: 'turbo',
        generatedAt: '2025-04-20T12:00:00+00:00',
        allocations: [
          {
            segment: {
              id: 'canary',
              name: 'Canário',
              description: 'Rotas críticas monitoradas em tempo real com dashboards dedicados.',
            },
            coverage: 50,
            providers,
          },
        ],
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    fetchTemplatesMock.mockResolvedValue({ templates, rollout });
    fetchDeploymentsMock.mockResolvedValue({
      deployments: [initialDeployment],
      activeId: initialDeployment.id,
    });
    createDeploymentMock.mockResolvedValue({
      id: 'deploy-turbo-20250420',
      templateId: 'turbo',
      deployedAt: '2025-04-20T12:00:00+00:00',
      author: 'Console MCP',
      window: 'Rollout monitorado',
      note: 'Rollout manual: Turbo.',
      sloP95Ms: 569,
      budgetUsagePct: 74,
      incidentsCount: 2,
      guardrailScore: 72,
      createdAt: '2025-04-20T12:00:00+00:00',
      updatedAt: '2025-04-20T12:00:00+00:00',
    } satisfies PolicyDeployment);
    deleteDeploymentMock.mockResolvedValue(undefined);
  });

  it('renders deployments and allows applying and rolling back templates', async () => {
    render(
      <ThemeProvider>
        <ToastProvider>
          <Policies providers={providers} isLoading={false} initialError={null} />
        </ToastProvider>
      </ThemeProvider>,
    );

    await waitFor(() => expect(screen.getByRole('heading', { level: 2, name: 'Equilíbrio' })).toBeInTheDocument());
    expect(screen.getByText('Promoção Q2 liberada para toda a frota.')).toBeInTheDocument();
    await waitFor(() => {
      const timestamps = screen.getAllByText(/Última atualização:/);
      expect(timestamps.length).toBeGreaterThan(0);
    });

    await userEvent.click(screen.getByLabelText('Template Turbo'));
    await userEvent.click(screen.getByRole('button', { name: 'Aplicar template' }));

    const applyDialog = await screen.findByRole('dialog', { name: 'Aplicar template · Turbo' });
    const applyConfirm = within(applyDialog).getByRole('button', { name: 'Aplicar template' });
    await userEvent.click(applyConfirm);
    const applyArmed = within(applyDialog).getByRole('button', { name: 'Aplicar agora' });
    await userEvent.click(applyArmed);

    await waitFor(() => expect(createDeploymentMock).toHaveBeenCalled());
    expect(createDeploymentMock).toHaveBeenCalledWith({
      templateId: 'turbo',
      author: 'Console MCP',
      window: 'Rollout monitorado',
      note: 'Rollout manual: Turbo.',
    });

    await waitFor(() =>
      expect(screen.getAllByText('Turbo ativado para toda a frota.').length).toBeGreaterThan(0),
    );

    await userEvent.click(screen.getByRole('button', { name: 'Rollback imediato' }));

    const rollbackDialog = await screen.findByRole('dialog', { name: 'Rollback imediato · Equilíbrio' });
    const rollbackConfirm = within(rollbackDialog).getByRole('button', { name: 'Confirmar rollback' });
    await userEvent.click(rollbackConfirm);
    const rollbackArmed = within(rollbackDialog).getByRole('button', { name: 'Rollback agora' });
    await userEvent.click(rollbackArmed);

    await waitFor(() => expect(deleteDeploymentMock).toHaveBeenCalledWith('deploy-turbo-20250420'));
    await waitFor(() =>
      expect(screen.getAllByText('Rollback concluído para Equilíbrio.').length).toBeGreaterThan(0),
    );
  });

  it('exibe erro quando não é possível carregar o histórico', async () => {
    fetchDeploymentsMock.mockRejectedValue(new Error('boom'));
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <ThemeProvider>
        <ToastProvider>
          <Policies providers={providers} isLoading={false} initialError={null} />
        </ToastProvider>
      </ThemeProvider>,
    );

    await waitFor(() => expect(screen.getByText('Templates opinativos')).toBeInTheDocument());
    await waitFor(() =>
      expect(screen.getByText('Não foi possível carregar o histórico de deploys.')).toBeInTheDocument(),
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Failed to load policy deployments',
      expect.objectContaining({ message: 'boom' }),
    );
    consoleErrorSpy.mockRestore();
  });
});
