import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../api', async () => {
  const actual = await vi.importActual<typeof import('../api')>('../api');
  return {
    ...actual,
    fetchProviders: vi.fn(),
    fetchTelemetryMetrics: vi.fn(),
    fetchObservabilityPreferences: vi.fn(),
    updateObservabilityPreferences: vi.fn(),
  };
});

import {
  fetchProviders,
  fetchTelemetryMetrics,
  fetchObservabilityPreferences,
  updateObservabilityPreferences,
  type ObservabilityPreferences,
  type ProviderSummary,
  type TelemetryMetrics,
} from '../api';
import Observability, { ObservabilityView } from './Observability';
import { ThemeProvider } from '../theme/ThemeContext';
import { ToastProvider } from '../components/feedback/ToastProvider';

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
    render(<ObservabilityView providers={providers} metrics={metrics} isLoading={false} initialError={null} />);

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

    expect(await screen.findByText('Latência média por provedor')).toBeInTheDocument();
    expect(await screen.findByText('Distribuição de sucesso por provedor')).toBeInTheDocument();
  });

  it('permite alternar para a aba de tracing e exibe tabela agregada', async () => {
    const user = userEvent.setup();
    render(<ObservabilityView providers={providers} metrics={metrics} isLoading={false} initialError={null} />);

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

    render(<ObservabilityView providers={providers} metrics={metrics} isLoading={false} initialError={null} />);

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
    render(<ObservabilityView providers={[]} metrics={null} isLoading={false} initialError={null} />);

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

describe('Observability data loader', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.mocked(fetchProviders).mockReset();
    vi.mocked(fetchTelemetryMetrics).mockReset();
    vi.mocked(fetchObservabilityPreferences).mockReset();
    vi.mocked(updateObservabilityPreferences).mockReset();
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('carrega dados automaticamente via serviços de fixtures', async () => {
    const user = userEvent.setup();
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
    ];
    const metrics: TelemetryMetrics = {
      start: '2024-04-01T00:00:00.000Z',
      end: '2024-04-02T00:00:00.000Z',
      total_runs: 2,
      total_tokens_in: 200,
      total_tokens_out: 120,
      total_cost_usd: 32.5,
      avg_latency_ms: 540,
      success_rate: 0.85,
      providers: [
        {
          provider_id: 'glm',
          run_count: 2,
          tokens_in: 200,
          tokens_out: 120,
          cost_usd: 32.5,
          avg_latency_ms: 540,
          success_rate: 0.85,
        },
      ],
      extended: {
        cache_hit_rate: 0.6,
        cached_tokens: 80,
        latency_p95_ms: 680,
        latency_p99_ms: 900,
        error_rate: 0.08,
        cost_breakdown: [{ label: 'Default', cost_usd: 32.5 }],
        error_breakdown: [{ category: 'Timeout', count: 1 }],
      },
    };

    const preferenceFixture: ObservabilityPreferences = {
      tracing: { provider: 'langsmith', project: 'Observability', endpoint: null, dataset: null, headers: null },
      metrics: {
        provider: 'otlp',
        endpoint: 'https://collector.example.com/v1/metrics',
        project: 'Metrics',
        dataset: null,
        headers: null,
      },
      evals: null,
      updatedAt: '2024-04-02T00:00:00.000Z',
      audit: { actorId: 'user-123', actorName: 'Observability Admin', actorRoles: ['approver'] },
    };

    vi.mocked(fetchProviders).mockResolvedValue(providers);
    vi.mocked(fetchTelemetryMetrics).mockResolvedValue(metrics);
    vi.mocked(fetchObservabilityPreferences).mockResolvedValue(preferenceFixture);
    vi.mocked(updateObservabilityPreferences).mockResolvedValue(preferenceFixture);

    render(
      <ThemeProvider>
        <ToastProvider>
          <Observability />
        </ToastProvider>
      </ThemeProvider>,
    );

    await waitFor(() => expect(fetchProviders).toHaveBeenCalled());
    await waitFor(() => expect(fetchTelemetryMetrics).toHaveBeenCalled());

    const metricsPanel = await screen.findByRole('tabpanel', { name: /Métricas/ });
    expect(within(metricsPanel).getByText('Latência P95')).toBeInTheDocument();

    const costLabel = within(metricsPanel).getByText('Custo total');
    const costCard = costLabel.closest('article');
    expect(costCard).not.toBeNull();
    if (costCard) {
      expect(within(costCard).getByText(/32,5/)).toBeInTheDocument();
    }

    await user.click(screen.getByRole('tab', { name: /Tracing/ }));
    const tracingTable = await screen.findByRole('table', {
      name: 'Visão agregada dos spans executados nas últimas 24h',
    });
    expect(within(tracingTable).getByRole('rowheader', { name: 'GLM 46' })).toBeInTheDocument();

    const planHeading = await screen.findByRole('heading', { name: 'Plano de configuração' });
    const planSection = planHeading.closest('section');
    expect(planSection).not.toBeNull();
    if (planSection) {
      const scoped = within(planSection);
      expect(scoped.getByText('LangSmith ativo para tracing.')).toBeInTheDocument();
      expect(
        scoped.getByText(/Endpoint: https:\/\/collector\.example\.com\/v1\/metrics/),
      ).toBeInTheDocument();
    }
  });

  it('exibe erro amigável quando carregamento falha', async () => {
    const failure = new Error('Erro deliberado');
    vi.mocked(fetchProviders).mockRejectedValue(failure);
    vi.mocked(fetchTelemetryMetrics).mockRejectedValue(failure);
    vi.mocked(fetchObservabilityPreferences).mockRejectedValue(failure);

    render(
      <ThemeProvider>
        <ToastProvider>
          <Observability />
        </ToastProvider>
      </ThemeProvider>,
    );

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Erro deliberado');
  });
});
