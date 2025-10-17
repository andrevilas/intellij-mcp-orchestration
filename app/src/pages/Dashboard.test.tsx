import { describe, expect, it, beforeAll } from 'vitest';
import { render, screen, within } from '@testing-library/react';

import type { ProviderSummary } from '../api';
import Dashboard from './Dashboard';

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

  it('renders KPIs and alerts using telemetry metrics', () => {
    render(
      <Dashboard
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
        onProvision={() => {}}
      />,
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
    expect(screen.queryByText('Sem execuções registradas nos últimos 7 dias.')).not.toBeInTheDocument();
    expect(screen.queryByText('Sem custos computados na janela selecionada.')).not.toBeInTheDocument();
    expect(screen.queryByText('Nenhum erro categorizado na janela analisada.')).not.toBeInTheDocument();
  });

  it('shows fallback states when telemetry data is missing', () => {
    render(
      <Dashboard
        providers={[]}
        sessions={[]}
        metrics={null}
        heatmapBuckets={[]}
        isLoading={false}
        initialError={null}
        feedback={null}
        provisioningId={null}
        onProvision={() => {}}
      />,
    );

    expect(screen.getByText(/R\$\s0,00/)).toBeInTheDocument();
    expect(screen.getByText('Nenhum alerta crítico detectado nas últimas 24h.')).toBeInTheDocument();
    expect(screen.getByText('Cadastre provedores para visualizar o uso agregado.')).toBeInTheDocument();
    const insightsRegion = screen.getByRole('region', { name: 'Indicadores complementares de telemetria' });
    expect(within(insightsRegion).getAllByText('Sem dados')).toHaveLength(4);
    expect(screen.getByText('Sem custos computados na janela selecionada.')).toBeInTheDocument();
    expect(
      within(insightsRegion).getAllByText('Nenhum erro categorizado na janela analisada.'),
    ).toHaveLength(2);
  });
});
