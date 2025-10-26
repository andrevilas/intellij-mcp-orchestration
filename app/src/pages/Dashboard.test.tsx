import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';

import {
  fetchPolicyCompliance,
  fetchProviders,
  fetchSessions,
  fetchTelemetryHeatmap,
  fetchTelemetryMetrics,
  type ProviderSummary,
  type PolicyComplianceSummary,
} from '../api';
import Dashboard, { DashboardView } from './Dashboard';
import { ThemeProvider } from '../theme/ThemeContext';
import { ToastProvider } from '../components/feedback/ToastProvider';
import { DASHBOARD_TEST_IDS } from './testIds';

vi.mock('../api', async () => {
  const actual = await vi.importActual<typeof import('../api')>('../api');
  return {
    ...actual,
    fetchProviders: vi.fn(),
    fetchSessions: vi.fn(),
    fetchTelemetryMetrics: vi.fn(),
    fetchTelemetryHeatmap: vi.fn(),
    fetchPolicyCompliance: vi.fn(),
  };
});

describe('Dashboard data loader', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.mocked(fetchProviders).mockReset();
    vi.mocked(fetchSessions).mockReset();
    vi.mocked(fetchTelemetryMetrics).mockReset();
    vi.mocked(fetchTelemetryHeatmap).mockReset();
    vi.mocked(fetchPolicyCompliance).mockReset();
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('carrega dados de fixtures quando nenhum prop é fornecido', async () => {
    const providerFixtures: ProviderSummary[] = [
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
    const sessionFixtures = [
      {
        id: 'sess-1',
        provider_id: 'glm',
        created_at: '2024-04-01T10:00:00.000Z',
        status: 'success',
        reason: 'Provisionamento manual',
        client: 'console-web',
      },
    ];
    const metricsFixture = {
      start: '2024-04-01T00:00:00.000Z',
      end: '2024-04-02T00:00:00.000Z',
      total_runs: 1,
      total_tokens_in: 100,
      total_tokens_out: 50,
      total_cost_usd: 12.5,
      avg_latency_ms: 620,
      success_rate: 0.9,
      providers: [
        {
          provider_id: 'glm',
          run_count: 1,
          tokens_in: 100,
          tokens_out: 50,
          cost_usd: 12.5,
          avg_latency_ms: 620,
          success_rate: 0.9,
        },
      ],
      extended: {
        cache_hit_rate: 0.5,
        cached_tokens: 30,
        latency_p95_ms: 700,
        latency_p99_ms: 950,
        error_rate: 0.1,
        cost_breakdown: [{ label: 'Default', cost_usd: 12.5 }],
        error_breakdown: [{ category: 'Timeout', count: 1 }],
      },
    } as const;
    const heatmapFixture = [{ day: '2024-04-01', provider_id: 'glm', run_count: 1 }];
    const complianceFixture = {
      status: 'pass',
      updatedAt: '2024-04-02T00:00:00.000Z',
      items: [
        { id: 'logging', label: 'Logging habilitado', required: true, configured: true, active: true },
      ],
    };

    vi.mocked(fetchProviders).mockResolvedValue(providerFixtures);
    vi.mocked(fetchSessions).mockResolvedValue(sessionFixtures);
    vi.mocked(fetchTelemetryMetrics).mockResolvedValue(metricsFixture as any);
    vi.mocked(fetchTelemetryHeatmap).mockResolvedValue(heatmapFixture);
    vi.mocked(fetchPolicyCompliance).mockResolvedValue(complianceFixture as any);

    render(
      <ThemeProvider>
        <ToastProvider>
          <Dashboard feedback={null} provisioningId={null} />
        </ToastProvider>
      </ThemeProvider>,
    );

    await waitFor(() => expect(fetchProviders).toHaveBeenCalled());
    expect(await screen.findByText('GLM 46')).toBeInTheDocument();
    expect(screen.getByText('Provisionamento manual')).toBeInTheDocument();
    expect(screen.getByText(/R\$\s*12,50/)).toBeInTheDocument();
    expect(screen.getByText('Logging habilitado')).toBeInTheDocument();
  });

  it('exibe mensagens de erro quando o carregamento falha', async () => {
    const failure = new Error('Falha geral');
    vi.mocked(fetchProviders).mockRejectedValue(failure);
    vi.mocked(fetchSessions).mockRejectedValue(failure);
    vi.mocked(fetchTelemetryMetrics).mockRejectedValue(failure);
    vi.mocked(fetchTelemetryHeatmap).mockRejectedValue(failure);
    vi.mocked(fetchPolicyCompliance).mockRejectedValue(failure);

    render(
      <ThemeProvider>
        <ToastProvider>
          <Dashboard feedback={null} provisioningId={null} />
        </ToastProvider>
      </ThemeProvider>,
    );

    const errorStatus = await screen.findAllByText('Falha geral');
    expect(errorStatus.length).toBeGreaterThan(0);
  });
});

defineResizeObserver();

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

describe('Dashboard telemetry overview', () => {
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
    {
      id: 'gemini',
      name: 'Gemini MCP',
      command: 'gemini',
      description: 'Gemini',
      capabilities: ['chat'],
      tags: ['llm'],
      transport: 'stdio',
      is_available: false,
    },
  ];

  it('renders KPIs and alerts using telemetry metrics', async () => {
    const compliance: PolicyComplianceSummary = {
      status: 'pass',
      updatedAt: '2024-03-08T12:00:00.000Z',
      items: [
        { id: 'logging', label: 'Logging habilitado', required: true, configured: true, active: true },
      ],
    };

    render(
      <ThemeProvider>
        <ToastProvider>
          <DashboardView
            providers={providers}
            sessions={[]}
            metrics={{
              start: '2024-03-07T12:00:00.000Z',
              end: '2024-03-08T12:00:00.000Z',
              total_runs: 5,
              total_tokens_in: 900,
              total_tokens_out: 600,
              total_cost_usd: 12.34,
              avg_latency_ms: 850,
              success_rate: 0.6,
              providers: [
                {
                  provider_id: 'glm',
                  run_count: 3,
                  tokens_in: 500,
                  tokens_out: 300,
                  cost_usd: 8,
                  avg_latency_ms: 780,
                  success_rate: 0.8,
                },
                {
                  provider_id: 'gemini',
                  run_count: 2,
                  tokens_in: 400,
                  tokens_out: 300,
                  cost_usd: 4.34,
                  avg_latency_ms: 920,
                  success_rate: 0.5,
                },
              ],
              extended: {
                cache_hit_rate: 0.64,
                cached_tokens: 650,
                latency_p95_ms: 930,
                latency_p99_ms: 1180,
                error_rate: 0.12,
                cost_breakdown: [
                  { label: 'Balanced', cost_usd: 7.2 },
                  { label: 'Turbo', cost_usd: 5.14 },
                ],
                error_breakdown: [
                  { category: 'Timeout', count: 3 },
                  { category: 'Quota', count: 1 },
                ],
              },
            }}
            heatmapBuckets={[
              { day: '2024-03-06', provider_id: 'glm', run_count: 2 },
              { day: '2024-03-07', provider_id: 'gemini', run_count: 1 },
            ]}
            isLoading={false}
            initialError={null}
            feedback={null}
            provisioningId={null}
            compliance={compliance}
            onProvision={() => {}}
          />
        </ToastProvider>
      </ThemeProvider>,
    );

    expect(screen.getByText(/R\$\s*12,34/)).toBeInTheDocument();
    expect(screen.getByText(/1\.500\s*tok/)).toBeInTheDocument();
    expect(screen.getByText(/850\s*ms/)).toBeInTheDocument();
    expect(screen.getByText('GLM 46 (60% das runs)')).toBeInTheDocument();
    expect(screen.getByText('1 provedor(es) indisponível(is): Gemini MCP')).toBeInTheDocument();
    expect(screen.getByText('Taxa de sucesso em 60% nas últimas execuções.')).toBeInTheDocument();
    expect(screen.getByText('Taxa de acertos em cache')).toBeInTheDocument();
    expect(screen.getByText('64%')).toBeInTheDocument();
    expect(screen.getByText('650 tok')).toBeInTheDocument();
    expect(screen.getByText('Latência P95')).toBeInTheDocument();
    expect(screen.getByText('930 ms')).toBeInTheDocument();
    expect(screen.getByText('Taxa de erro')).toBeInTheDocument();
    expect(screen.getByText('12%')).toBeInTheDocument();

    await screen.findByTestId(DASHBOARD_TEST_IDS.costBreakdown);
    await screen.findByTestId(DASHBOARD_TEST_IDS.errorBreakdown);
    await screen.findByTestId(DASHBOARD_TEST_IDS.sections.heatmap);

    expect(screen.queryByText('Sem execuções registradas nos últimos 7 dias.')).not.toBeInTheDocument();
    expect(screen.queryByText('Sem custos computados na janela selecionada.')).not.toBeInTheDocument();
    expect(screen.queryByText('Nenhum erro categorizado na janela analisada.')).not.toBeInTheDocument();
  });

  it('shows fallback states when telemetry data is missing', async () => {
    render(
      <ThemeProvider>
        <ToastProvider>
          <DashboardView
            providers={[]}
            sessions={[]}
            metrics={null}
            heatmapBuckets={[]}
            isLoading={false}
            initialError={null}
            feedback={null}
            provisioningId={null}
            compliance={null}
            onProvision={() => {}}
          />
        </ToastProvider>
      </ThemeProvider>,
    );

    expect(screen.getAllByText('Nenhum indicador disponível no momento.')[0]).toBeInTheDocument();
    expect(screen.getByText('Nenhum alerta crítico detectado nas últimas 24h.')).toBeInTheDocument();
    expect(screen.getByText('Cadastre provedores para visualizar o uso agregado.')).toBeInTheDocument();

    const insightCards = screen.getByTestId(DASHBOARD_TEST_IDS.insightCards);
    expect(insightCards).toHaveAttribute('data-status', 'empty');
    expect(within(insightCards).getByText('Nenhum indicador disponível no momento.')).toBeInTheDocument();

    expect(screen.queryByTestId(DASHBOARD_TEST_IDS.costBreakdown)).toBeNull();
    expect(screen.queryByTestId(DASHBOARD_TEST_IDS.errorBreakdown)).toBeNull();

    const sessionsSection = screen.getByTestId(DASHBOARD_TEST_IDS.sections.sessions);
    expect(
      within(sessionsSection).getByText('Ainda não há sessões registradas nesta execução.'),
    ).toBeInTheDocument();
    expect(
      within(sessionsSection).getAllByText(
        'Provisionamentos aparecerão aqui assim que novas execuções forem registradas.',
      ).length,
    ).toBeGreaterThan(0);
  });

  it('renders skeleton placeholders while bootstrapping data', () => {
    render(
      <ThemeProvider>
        <ToastProvider>
          <DashboardView
            providers={[]}
            sessions={[]}
            metrics={null}
            heatmapBuckets={[]}
            isLoading
            initialError={null}
            feedback={null}
            provisioningId={null}
            compliance={null}
            onProvision={() => {}}
          />
        </ToastProvider>
      </ThemeProvider>,
    );

    const costCard = screen.getByTestId('dashboard-kpi-cost');
    expect(costCard).toHaveAttribute('data-status', 'skeleton');
    expect(costCard.querySelector('.kpi-card__skeleton-group')).not.toBeNull();

    const sessionsSection = screen.getByTestId(DASHBOARD_TEST_IDS.sections.sessions);
    expect(sessionsSection.querySelector('.resource-table__skeleton-row')).not.toBeNull();
  });

  it('propagates bootstrap errors to KPI cards and sessions', () => {
    render(
      <ThemeProvider>
        <ToastProvider>
          <DashboardView
            providers={[]}
            sessions={[]}
            metrics={null}
            heatmapBuckets={[]}
            isLoading={false}
            initialError="Falha ao sincronizar dados"
            feedback={null}
            provisioningId={null}
            compliance={null}
            onProvision={() => {}}
          />
        </ToastProvider>
      </ThemeProvider>,
    );

    expect(screen.getByTestId('dashboard-kpi-cost')).toHaveAttribute('data-status', 'error');
    const sessionsSection = screen.getByTestId(DASHBOARD_TEST_IDS.sections.sessions);
    expect(sessionsSection.querySelector('[data-status="error"]')).not.toBeNull();
    expect(screen.getAllByText('Falha ao sincronizar dados').length).toBeGreaterThan(1);
  });
});
