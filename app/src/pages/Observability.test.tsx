import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../api', async () => {
  const actual = await vi.importActual<typeof import('../api')>('../api');
  return {
    ...actual,
    fetchObservabilityPreferences: vi.fn(),
    updateObservabilityPreferences: vi.fn(),
  };
});

import {
  fetchObservabilityPreferences,
  updateObservabilityPreferences,
  type ObservabilityPreferences,
  type ProviderSummary,
  type TelemetryMetrics,
} from '../api';
import Observability from './Observability';

function defineResizeObserver() {
  class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  beforeAll(() => {
    (globalThis as unknown as { ResizeObserver: typeof ResizeObserverMock }).ResizeObserver = ResizeObserverMock;
  });
}

defineResizeObserver();

describe('Observability page', () => {
  const providers: ProviderSummary[] = [
    {
      id: 'glm',
      name: 'GLM 46',
      description: 'Modelo GLM 46',
      command: 'glm46',
      capabilities: ['chat'],
      tags: ['llm'],
      transport: 'stdio',
      is_available: true,
    },
    {
      id: 'gemini',
      name: 'Gemini MCP',
      description: 'Gemini',
      command: 'gemini',
      capabilities: ['chat'],
      tags: ['llm'],
      transport: 'stdio',
      is_available: false,
    },
  ];

  const metrics: TelemetryMetrics = {
    start: '2024-03-07T12:00:00.000Z',
    end: '2024-03-08T12:00:00.000Z',
    total_runs: 8,
    total_tokens_in: 1800,
    total_tokens_out: 900,
    total_cost_usd: 24.68,
    avg_latency_ms: 780,
    success_rate: 0.85,
    providers: [
      {
        provider_id: 'glm',
        run_count: 5,
        tokens_in: 1200,
        tokens_out: 600,
        cost_usd: 14.2,
        avg_latency_ms: 740,
        success_rate: 0.9,
      },
      {
        provider_id: 'gemini',
        run_count: 3,
        tokens_in: 600,
        tokens_out: 300,
        cost_usd: 10.48,
        avg_latency_ms: 840,
        success_rate: 0.76,
      },
    ],
    extended: {
      cache_hit_rate: 0.64,
      cached_tokens: 650,
      latency_p95_ms: 930,
      latency_p99_ms: 1180,
      error_rate: 0.12,
      cost_breakdown: [
        { label: 'Balanced', cost_usd: 14.2 },
        { label: 'Turbo', cost_usd: 10.48 },
      ],
      error_breakdown: [
        { category: 'Timeout', count: 3 },
        { category: 'Quota', count: 1 },
      ],
    },
  };

  const preferences: ObservabilityPreferences = {
    tracing: { provider: 'langsmith', project: 'Observability' },
    metrics: { provider: 'otlp', endpoint: 'https://collector.exemplo.com/v1/traces' },
    evals: null,
    updatedAt: '2024-03-08T12:00:00.000Z',
    audit: { actorId: 'user-123', actorName: 'Observability Admin', actorRoles: ['approver'] },
  };

  beforeEach(() => {
    vi.mocked(fetchObservabilityPreferences).mockResolvedValue(preferences);
    vi.mocked(updateObservabilityPreferences).mockResolvedValue(preferences);
    vi.mocked(fetchObservabilityPreferences).mockClear();
    vi.mocked(updateObservabilityPreferences).mockClear();
  });

  it('renderiza KPIs e gráficos com métricas consolidadas', async () => {
    render(<Observability providers={providers} metrics={metrics} isLoading={false} initialError={null} />);

    await waitFor(() => expect(fetchObservabilityPreferences).toHaveBeenCalled());
    expect(screen.getByRole('heading', { name: 'Observabilidade unificada' })).toBeInTheDocument();
    expect(screen.getByText('Latência P95')).toBeInTheDocument();
    expect(screen.getByText('930 ms')).toBeInTheDocument();
    expect(screen.getByText('Taxa de erro')).toBeInTheDocument();
    expect(screen.getByText('12%')).toBeInTheDocument();
    expect(screen.getByText(/R\$\s24,68/)).toBeInTheDocument();
    expect(screen.getByText('64%')).toBeInTheDocument();

    const planHeading = screen.getByRole('heading', { name: 'Plano de configuração' });
    const planSection = planHeading.closest('section');
    expect(planSection).not.toBeNull();
    if (planSection) {
      const scoped = within(planSection);
      expect(scoped.getByText('LangSmith ativo para tracing.')).toBeInTheDocument();
      expect(scoped.getByText(/Projeto: Observability/)).toBeInTheDocument();
      expect(scoped.getByText('OTLP collector ativo para métricas.')).toBeInTheDocument();
      expect(
        scoped.getByText(/Endpoint: https:\/\/collector\.exemplo\.com\/v1\/traces/),
      ).toBeInTheDocument();
      expect(scoped.getByText('Evals desativado.')).toBeInTheDocument();
      expect(scoped.getByText(/Nenhum provider configurado\./)).toBeInTheDocument();
    }

    expect(await screen.findByLabelText('Latência média por provedor')).toBeInTheDocument();
    expect(await screen.findByLabelText('Distribuição de sucesso por provedor')).toBeInTheDocument();
  });

  it('permite alternar para a aba de tracing e exibe tabela agregada', async () => {
    const user = userEvent.setup();
    render(<Observability providers={providers} metrics={metrics} isLoading={false} initialError={null} />);

    await waitFor(() => expect(fetchObservabilityPreferences).toHaveBeenCalled());

    await user.click(screen.getByRole('tab', { name: /Tracing/ }));

    const table = await screen.findByRole('table', {
      name: 'Visão agregada dos spans executados nas últimas 24h',
    });
    expect(within(table).getByText('GLM 46')).toBeInTheDocument();
    expect(within(table).getByText('Gemini MCP')).toBeInTheDocument();
    expect(within(table).getByText('5')).toBeInTheDocument();
    expect(within(table).getByText('3')).toBeInTheDocument();
    expect(within(table).getByText('90%')).toBeInTheDocument();
  });

  it('dispara evals usando presets e sinaliza conclusão', async () => {
    const user = userEvent.setup();

    render(<Observability providers={providers} metrics={metrics} isLoading={false} initialError={null} />);

    await waitFor(() => expect(fetchObservabilityPreferences).toHaveBeenCalled());

    await user.click(screen.getByRole('tab', { name: /Evals/ }));
    const triggerButton = screen.getByRole('button', { name: 'Disparar eval agora' });
    await user.click(triggerButton);

    expect(triggerButton).toBeDisabled();

    await screen.findByText(
      'Eval “Latência P95 vs baseline” concluída para GLM 46. Nenhuma regressão detectada.',
      undefined,
      { timeout: 3000 },
    );
  });

  it('exibe orientações quando não há providers ou métricas carregadas', async () => {
    render(<Observability providers={[]} metrics={null} isLoading={false} initialError={null} />);

    await waitFor(() => expect(fetchObservabilityPreferences).toHaveBeenCalled());

    expect(
      screen.getByText(
        'Nenhum provider configurado. Cadastre chaves em “Chaves” ou importe do marketplace para iniciar o monitoramento.',
      ),
    ).toBeInTheDocument();
    expect(await screen.findByText('Sem execuções registradas na janela selecionada.')).toBeInTheDocument();
    expect(
      await screen.findByText('Cadastre provedores e gere tráfego para visualizar distribuição.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Configure presets específicos ou use a seleção automática para validar regressões antes de promover providers para produção.',
      ),
    ).toBeInTheDocument();
  });
});
