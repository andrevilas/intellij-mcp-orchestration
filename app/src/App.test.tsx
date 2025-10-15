import { act } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import App, { NOTIFICATION_READ_STATE_KEY } from './App';

function createFetchResponse<T>(payload: T): Promise<Response> {
  return Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve(payload),
  } as unknown as Response);
}

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

describe('App provider orchestration flow', () => {
  const originalFetch = globalThis.fetch;
  const originalConsoleError = console.error;
  let fetchMock: Mock;
  let applyDefaultFetchMock: () => void;
  let defaultFetchImplementation: ((input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) | null;

  beforeAll(() => {
    (globalThis as unknown as { ResizeObserver: typeof ResizeObserverMock }).ResizeObserver = ResizeObserverMock;
  });

  const provider = {
    id: 'gemini',
    name: 'Gemini MCP',
    description: 'Teste',
    command: '~/.local/bin/gemini',
    capabilities: ['chat'],
    tags: ['llm'],
    transport: 'stdio',
    is_available: true,
  };

  const serverRecord = {
    id: provider.id,
    name: provider.name,
    command: provider.command,
    description: provider.description,
    tags: provider.tags,
    capabilities: provider.capabilities,
    transport: provider.transport,
    created_at: '2024-06-01T09:55:00.000Z',
    updated_at: '2024-06-01T09:55:00.000Z',
  };

  const existingSession = {
    id: 'session-existing',
    provider_id: provider.id,
    created_at: '2024-01-01T00:00:00.000Z',
    status: 'pending',
    reason: null,
    client: null,
  };

  const newSession = {
    id: 'session-new',
    provider_id: provider.id,
    created_at: '2024-01-02T00:00:00.000Z',
    status: 'pending',
    reason: 'Provisionamento disparado pela Console MCP',
    client: 'console-web',
  };

  const secretMetadata = {
    provider_id: provider.id,
    has_secret: true,
    updated_at: null,
  };

  const notifications = [
    {
      id: 'platform-release',
      severity: 'info' as const,
      title: 'Release 2024.09.1 publicado',
      message:
        'Novos alertas em tempo real e central de notificações disponíveis na console MCP.',
      timestamp: '2024-01-02T03:00:00.000Z',
      category: 'platform' as const,
      tags: ['Release', 'DX'],
    },
  ];

  beforeEach(() => {
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    vi.spyOn(console, 'error').mockImplementation((message?: unknown, ...optionalParams: unknown[]) => {
      if (typeof message === 'string' && message.includes('not wrapped in act')) {
        return;
      }
      originalConsoleError(message, ...optionalParams);
    });

    const metricsPayload = {
      start: '2024-03-07T12:00:00.000Z',
      end: '2024-03-08T12:00:00.000Z',
      total_runs: 3,
      total_tokens_in: 900,
      total_tokens_out: 450,
      total_cost_usd: 12.34,
      avg_latency_ms: 850,
      success_rate: 0.66,
      providers: [
        {
          provider_id: provider.id,
          run_count: 2,
          tokens_in: 600,
          tokens_out: 300,
          cost_usd: 8.5,
          avg_latency_ms: 800,
          success_rate: 0.75,
        },
      ],
    };

    const heatmapPayload = {
      buckets: [
        { day: '2024-03-06', provider_id: provider.id, run_count: 1 },
        { day: '2024-03-07', provider_id: provider.id, run_count: 1 },
      ],
    };

    const timeseriesPayload = {
      items: [
        {
          day: '2024-03-06',
          provider_id: provider.id,
          run_count: 2,
          tokens_in: 1600,
          tokens_out: 800,
          cost_usd: 1.8,
          avg_latency_ms: 910,
          success_count: 1,
        },
        {
          day: '2024-03-07',
          provider_id: provider.id,
          run_count: 1,
          tokens_in: 900,
          tokens_out: 400,
          cost_usd: 0.95,
          avg_latency_ms: 870,
          success_count: 1,
        },
      ],
      next_cursor: null,
    };

    const paretoPayload = {
      items: [
        {
          id: `${provider.id}:default`,
          provider_id: provider.id,
          provider_name: provider.name,
          route: 'default',
          lane: 'balanced',
          run_count: 3,
          tokens_in: 2600,
          tokens_out: 1200,
          cost_usd: 2.75,
          avg_latency_ms: 900,
          success_rate: 0.66,
        },
        {
          id: `${provider.id}:fallback`,
          provider_id: provider.id,
          provider_name: provider.name,
          route: 'fallback',
          lane: 'turbo',
          run_count: 2,
          tokens_in: 1400,
          tokens_out: 700,
          cost_usd: 1.6,
          avg_latency_ms: 780,
          success_rate: 0.5,
        },
      ],
      next_cursor: null,
    };

    const runsPayload = {
      items: [
        {
          id: 1,
          provider_id: provider.id,
          provider_name: provider.name,
          route: 'default',
          lane: 'balanced',
          ts: '2024-03-07T12:30:00.000Z',
          tokens_in: 800,
          tokens_out: 300,
          duration_ms: 840,
          status: 'success',
          cost_usd: 0.9,
          metadata: { consumer: 'squad-a' },
        },
        {
          id: 2,
          provider_id: provider.id,
          provider_name: provider.name,
          route: 'default',
          lane: 'balanced',
          ts: '2024-03-07T11:50:00.000Z',
          tokens_in: 600,
          tokens_out: 200,
          duration_ms: 920,
          status: 'retry',
          cost_usd: 0.7,
          metadata: { project: 'beta' },
        },
      ],
      next_cursor: null,
    };

    const templateMetrics = {
      economy: { slo: 857, budget: 66, incidents: 2, guard: 78 },
      balanced: { slo: 985, budget: 80, incidents: 0, guard: 70 },
      turbo: { slo: 569, budget: 74, incidents: 2, guard: 72 },
    } as const;

    const policyTemplatesPayload = {
      templates: [
        {
          id: 'economy',
          name: 'Economia',
          tagline: 'FinOps primeiro',
          description:
            'Prioriza custo absoluto e direciona a maior parte do tráfego para modelos econômicos com fallback gradual.',
          price_delta: '-22% vs. baseline',
          latency_target: 'até 4.0 s P95',
          guardrail_level: 'Nível 2 · Moderado',
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
          price_delta: '-12% vs. baseline',
          latency_target: 'até 2.5 s P95',
          guardrail_level: 'Nível 3 · Avançado',
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
          price_delta: '+18% vs. baseline',
          latency_target: 'até 900 ms P95',
          guardrail_level: 'Nível 4 · Crítico',
          features: [
            'Pré-aquecimento de modelos turbo em múltiplas regiões',
            'Orçamento observável com limites hora a hora',
            'Expansão automática de capacidade sob demanda',
          ],
        },
      ],
      rollout: {
        generatedAt: '2025-04-15T09:30:00+00:00',
        plans: [
          {
            templateId: 'economy',
            generatedAt: '2025-02-01T12:00:00+00:00',
            allocations: [
              {
                segment: {
                  id: 'canary',
                  name: 'Canário',
                  description: 'Rotas críticas monitoradas em tempo real com dashboards dedicados.',
                },
                coverage: 25,
                providers: [provider],
              },
              {
                segment: {
                  id: 'general',
                  name: 'GA',
                  description: 'Workloads padrão com fallback automático e monitoramento de custos.',
                },
                coverage: 55,
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
            templateId: 'balanced',
            generatedAt: '2025-04-15T09:30:00+00:00',
            allocations: [
              {
                segment: {
                  id: 'canary',
                  name: 'Canário',
                  description: 'Rotas críticas monitoradas em tempo real com dashboards dedicados.',
                },
                coverage: 12,
                providers: [provider],
              },
              {
                segment: {
                  id: 'general',
                  name: 'GA',
                  description: 'Workloads padrão com fallback automático e monitoramento de custos.',
                },
                coverage: 62,
                providers: [],
              },
              {
                segment: {
                  id: 'fallback',
                  name: 'Fallback',
                  description: 'Rotas sensíveis com janela de rollback dedicada e dupla validação.',
                },
                coverage: 26,
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
                coverage: 40,
                providers: [provider],
              },
              {
                segment: {
                  id: 'general',
                  name: 'GA',
                  description: 'Workloads padrão com fallback automático e monitoramento de custos.',
                },
                coverage: 40,
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
        ],
      },
    };

    let deploymentsState = [
      {
        id: 'deploy-economy-20250201',
        template_id: 'economy',
        deployed_at: '2025-02-01T12:00:00+00:00',
        author: 'FinOps Squad',
        window: 'Canário 5% → 20%',
        note: 'Piloto para squads orientados a custo.',
        slo_p95_ms: templateMetrics.economy.slo,
        budget_usage_pct: templateMetrics.economy.budget,
        incidents_count: templateMetrics.economy.incidents,
        guardrail_score: templateMetrics.economy.guard,
        created_at: '2025-02-01T12:00:00+00:00',
        updated_at: '2025-02-01T12:00:00+00:00',
      },
      {
        id: 'deploy-balanced-20250415',
        template_id: 'balanced',
        deployed_at: '2025-04-15T09:30:00+00:00',
        author: 'Console MCP',
        window: 'GA progressivo',
        note: 'Promoção Q2 liberada para toda a frota.',
        slo_p95_ms: templateMetrics.balanced.slo,
        budget_usage_pct: templateMetrics.balanced.budget,
        incidents_count: templateMetrics.balanced.incidents,
        guardrail_score: templateMetrics.balanced.guard,
        created_at: '2025-04-15T09:30:00+00:00',
        updated_at: '2025-04-15T09:30:00+00:00',
      },
    ];

    let deploymentCounter = 0;

    const processBaseTime = new Date('2024-06-01T10:00:00Z').getTime();
    let processLogCounter = 1;
    let processLogs = [
      {
        id: processLogCounter,
        timestamp: new Date(processBaseTime).toISOString(),
        level: 'info' as const,
        message: 'Processo iniciado pelo supervisor (PID 321).',
      },
    ];
    let processStatus: 'running' | 'stopped' | 'error' = 'running';
    let processPid: number | null = 321;
    let processStartedAt: string | null = processLogs[0].timestamp;
    let processStoppedAt: string | null = null;
    let processReturnCode: number | null = null;
    let processLastError: string | null = null;

    function appendProcessLog(message: string, level: 'info' | 'error' = 'info') {
      processLogCounter += 1;
      const timestamp = new Date(processBaseTime + processLogCounter * 1000).toISOString();
      processLogs = [...processLogs, { id: processLogCounter, timestamp, level, message }];
    }

    function buildProcessSnapshot() {
      return {
        server_id: provider.id,
        status: processStatus,
        command: provider.command,
        pid: processPid,
        started_at: processStartedAt,
        stopped_at: processStoppedAt,
        return_code: processReturnCode,
        last_error: processLastError,
        logs: processLogs.slice(-10).map((log) => ({
          id: log.id.toString(),
          timestamp: log.timestamp,
          level: log.level,
          message: log.message,
        })),
        cursor: processLogs.length ? processLogCounter.toString() : null,
      };
    }

    applyDefaultFetchMock = () => {
      processLogCounter = 1;
      processLogs = [
        {
          id: processLogCounter,
          timestamp: new Date(processBaseTime).toISOString(),
          level: 'info',
          message: 'Processo iniciado pelo supervisor (PID 321).',
        },
      ];
      processStatus = 'running';
      processPid = 321;
      processStartedAt = processLogs[0].timestamp;
      processStoppedAt = null;
      processReturnCode = null;
      processLastError = null;

      fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString();
        const method = (init?.method ?? 'GET').toUpperCase();

      if (url === '/api/v1/servers' && method === 'GET') {
        return createFetchResponse({ servers: [serverRecord] });
      }
      if (url === '/api/v1/servers/processes' && method === 'GET') {
        return createFetchResponse({ processes: [buildProcessSnapshot()] });
      }
      if (url.startsWith(`/api/v1/servers/${provider.id}/process/logs`) && method === 'GET') {
        const cursorParam = new URL(url, 'http://localhost').searchParams.get('cursor');
        const cursorValue = cursorParam ? Number(cursorParam) : null;
        const newLogs = processLogs.filter((log) => (cursorValue ?? 0) < log.id);
        const nextCursor = newLogs.length ? newLogs[newLogs.length - 1].id.toString() : cursorParam ?? (cursorValue?.toString() ?? null);
        return createFetchResponse({
          logs: newLogs.map((log) => ({
            id: log.id.toString(),
            timestamp: log.timestamp,
            level: log.level,
            message: log.message,
          })),
          cursor: nextCursor,
        });
      }
      if (url === `/api/v1/servers/${provider.id}/process/start` && method === 'POST') {
        processStatus = 'running';
        processPid = 987;
        processStartedAt = new Date(processBaseTime + processLogCounter * 1000 + 500).toISOString();
        processStoppedAt = null;
        processReturnCode = null;
        processLastError = null;
        appendProcessLog('Processo iniciado com PID 987.');
        return createFetchResponse({ process: buildProcessSnapshot() });
      }
      if (url === `/api/v1/servers/${provider.id}/process/stop` && method === 'POST') {
        processStatus = 'stopped';
        processPid = null;
        processStoppedAt = new Date(processBaseTime + processLogCounter * 1000 + 500).toISOString();
        processReturnCode = 0;
        processLastError = null;
        appendProcessLog('Processo encerrado com código 0.');
        return createFetchResponse({ process: buildProcessSnapshot() });
      }
      if (url === `/api/v1/servers/${provider.id}/process/restart` && method === 'POST') {
        processStatus = 'running';
        processPid = 654;
        processStartedAt = new Date(processBaseTime + processLogCounter * 1000 + 500).toISOString();
        processStoppedAt = null;
        processReturnCode = null;
        processLastError = null;
        appendProcessLog('Reinício solicitado pelo operador.');
        appendProcessLog('Processo reiniciado com PID 654.');
        return createFetchResponse({ process: buildProcessSnapshot() });
      }

      if (url === '/api/v1/providers' && method === 'GET') {
        return createFetchResponse({ providers: [provider] });
      }
      if (url === '/api/v1/sessions' && method === 'GET') {
        return createFetchResponse({ sessions: [existingSession] });
      }
      if (url === '/api/v1/secrets' && method === 'GET') {
        return createFetchResponse({ secrets: [secretMetadata] });
      }
      if (url === `/api/v1/secrets/${provider.id}/test` && method === 'POST') {
        return createFetchResponse({
          provider_id: provider.id,
          status: 'healthy',
          latency_ms: 268,
          tested_at: '2024-06-01T12:00:00.000Z',
          message: `${provider.name} respondeu ao handshake em 268 ms.`,
        });
      }
      if (url === '/agents/catalog-search/invoke' && method === 'POST') {
        const body = init?.body ? JSON.parse(init.body.toString()) : {};
        const query = body?.input?.query ?? '';
        if (!query) {
          return createFetchResponse({ result: { items: [] } });
        }
        return createFetchResponse({
          result: {
            items: [
              {
                sku: 'SKU-ROUTING-01',
                name: 'Routing Playbook',
                description: `Sugestões para “${query}”`,
                category: 'Playbooks',
                tags: ['agente', 'routing'],
              },
            ],
          },
        });
      }
      if (url === '/api/v1/notifications' && method === 'GET') {
        return createFetchResponse({ notifications });
      }
      if (url === `/api/v1/providers/${provider.id}/sessions` && method === 'POST') {
        return createFetchResponse({ session: newSession, provider });
      }
      if (url.startsWith('/api/v1/telemetry/metrics')) {
        return createFetchResponse(metricsPayload);
      }
      if (url.startsWith('/api/v1/telemetry/heatmap')) {
        return createFetchResponse(heatmapPayload);
      }
      if (url.startsWith('/api/v1/telemetry/timeseries')) {
        return createFetchResponse(timeseriesPayload);
      }
      if (url.startsWith('/api/v1/telemetry/pareto')) {
        return createFetchResponse(paretoPayload);
      }
      if (url.startsWith('/api/v1/telemetry/runs')) {
        return createFetchResponse(runsPayload);
      }
      if (url === '/api/v1/policies/templates' && method === 'GET') {
        return createFetchResponse(policyTemplatesPayload);
      }
      if (url === '/api/v1/routing/simulate' && method === 'POST') {
        const body = init?.body ? JSON.parse(init.body.toString()) : {};
        const commonRoute = {
          id: provider.id,
          provider,
          lane: 'balanced',
          cost_per_million: 20,
          latency_p95: 940,
          reliability: 95,
          capacity_score: 80,
        };
        const baseResponse = {
          total_cost: 210,
          cost_per_million: 17.5,
          avg_latency: 880,
          reliability_score: 95.3,
          distribution: [
            {
              route: commonRoute,
              share: 0.7,
              tokens_millions: 8.4,
              cost: 168,
            },
          ],
          excluded_route: null,
        };
        if (body.failover_provider_id) {
          return createFetchResponse({
            ...baseResponse,
            distribution: [],
            excluded_route: commonRoute,
          });
        }
        return createFetchResponse({
          ...baseResponse,
          excluded_route: null,
        });
      }
      if (url === '/api/v1/policies/deployments' && method === 'GET') {
        const active = deploymentsState.length ? deploymentsState[deploymentsState.length - 1].id : null;
        return createFetchResponse({ deployments: deploymentsState, active_id: active });
      }
      if (url === '/api/v1/policies/deployments' && method === 'POST') {
        const body = init?.body ? JSON.parse(init.body.toString()) : {};
        const templateId: keyof typeof templateMetrics = body.template_id ?? 'economy';
        const metrics = templateMetrics[templateId] ?? templateMetrics.economy;
        deploymentCounter += 1;
        const timestamp = `2025-04-20T12:00:${deploymentCounter.toString().padStart(2, '0')}+00:00`;
        const newDeployment = {
          id: `deploy-${templateId}-test-${deploymentCounter}`,
          template_id: templateId,
          deployed_at: timestamp,
          author: body.author ?? 'Console MCP',
          window: body.window ?? null,
          note: body.note ?? null,
          slo_p95_ms: metrics.slo,
          budget_usage_pct: metrics.budget,
          incidents_count: metrics.incidents,
          guardrail_score: metrics.guard,
          created_at: timestamp,
          updated_at: timestamp,
        };
        deploymentsState = [...deploymentsState, newDeployment];
        return createFetchResponse(newDeployment);
      }
      if (url.startsWith('/api/v1/policies/deployments/') && method === 'DELETE') {
        const deploymentId = url.split('/').pop();
        deploymentsState = deploymentsState.filter((deployment) => deployment.id !== deploymentId);
        return Promise.resolve({
          ok: true,
          status: 204,
          json: () => Promise.resolve(undefined),
        } as Response);
      }

      if (method === 'DELETE') {
        return Promise.resolve({
          ok: true,
          status: 204,
          json: () => Promise.resolve(undefined),
        } as Response);
        }

        return createFetchResponse({});
      });
      defaultFetchImplementation = fetchMock.getMockImplementation();
    };

    applyDefaultFetchMock();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
    console.error = originalConsoleError;
    window.localStorage.clear();
  });

  function resetFetchMock(): void {
    fetchMock.mockReset();
    applyDefaultFetchMock();
  }

  it('lists providers and provisions a session on demand', async () => {
    const user = userEvent.setup();
    await act(async () => {
      render(<App />);
      await Promise.resolve();
    });

    await screen.findByRole('heading', { name: provider.name });
    await waitFor(() => {
      expect(screen.queryByText('Carregando provedores…')).not.toBeInTheDocument();
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      '/api/v1/servers',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/v1/sessions',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      '/api/v1/secrets',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      '/api/v1/notifications',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    const metricsCall = fetchMock.mock.calls[4];
    expect(metricsCall?.[1]).toEqual(expect.objectContaining({ signal: expect.any(AbortSignal) }));
    const metricsUrl = new URL(metricsCall?.[0] as string, 'http://localhost');
    expect(metricsUrl.pathname).toBe('/api/v1/telemetry/metrics');
    expect(metricsUrl.searchParams.has('start')).toBe(true);

    const heatmapCall = fetchMock.mock.calls[5];
    expect(heatmapCall?.[1]).toEqual(expect.objectContaining({ signal: expect.any(AbortSignal) }));
    const heatmapUrl = new URL(heatmapCall?.[0] as string, 'http://localhost');
    expect(heatmapUrl.pathname).toBe('/api/v1/telemetry/heatmap');
    expect(heatmapUrl.searchParams.has('start')).toBe(true);
    expect(heatmapUrl.searchParams.has('end')).toBe(true);

    expect(await screen.findByText(provider.description)).toBeInTheDocument();
    expect(await screen.findByText(existingSession.id)).toBeInTheDocument();

    const provisionButton = screen.getByRole('button', { name: 'Criar sessão de provisionamento' });
    await user.click(provisionButton);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenNthCalledWith(
        7,
        `/api/v1/providers/${provider.id}/sessions`,
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            reason: 'Provisionamento disparado pela Console MCP',
            client: 'console-web',
          }),
        }),
      );
    });

    expect(await screen.findByText(`Sessão ${newSession.id} criada para ${provider.name}.`)).toBeInTheDocument();
    expect(screen.getByText(newSession.id)).toBeInTheDocument();

    const requestBody = JSON.parse(fetchMock.mock.calls[6][1]?.body as string);
    expect(requestBody).toEqual({
      reason: 'Provisionamento disparado pela Console MCP',
      client: 'console-web',
    });
  });

  it('supports keyboard-first flows with skip link and arrow navigation', async () => {
    const user = userEvent.setup();

    await act(async () => {
      render(<App />);
      await Promise.resolve();
    });

    const skipLink = await screen.findByRole('link', { name: 'Ir para o conteúdo principal' });

    await user.tab();
    expect(skipLink).toHaveFocus();

    await user.keyboard('{Enter}');

    const mainRegion = document.getElementById('main-content');
    if (!(mainRegion instanceof HTMLElement)) {
      throw new Error('Main content region not found');
    }
    await waitFor(() => expect(mainRegion).toHaveFocus());

    const nav = screen.getByRole('navigation', { name: 'Navegação principal' });
    const navButtons = within(nav).getAllByRole('button');

    (navButtons[0] as HTMLButtonElement).focus();
    expect(navButtons[0]).toHaveFocus();

    await user.keyboard('{ArrowRight}');
    expect(navButtons[1]).toHaveFocus();
    await screen.findByRole('heading', { name: /Servidores MCP/i });

    await user.keyboard('{ArrowLeft}');
    expect(navButtons[0]).toHaveFocus();
    await waitFor(() => {
      expect(navButtons[0]).toHaveAttribute('aria-current', 'page');
      expect(navButtons[1]).not.toHaveAttribute('aria-current', 'page');
      expect(screen.queryByRole('heading', { name: /Servidores MCP/i })).not.toBeInTheDocument();
    });
  });

  it('allows controlling servers from the servers view', async () => {
    const user = userEvent.setup();

    await act(async () => {
      render(<App />);
      await Promise.resolve();
    });

    await screen.findByRole('heading', { level: 3, name: provider.name });
    const serversTab = screen.getByRole('button', { name: 'Servidores' });
    await user.click(serversTab);

    await screen.findByRole('heading', { name: /Servidores MCP/i });
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/v1/servers/processes',
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });

    const serverHeading = await screen.findByRole('heading', { level: 2, name: provider.name });
    const serverCard = serverHeading.closest('article');
    expect(serverCard).not.toBeNull();

    const scoped = within(serverCard as HTMLElement);

    const stopButton = await scoped.findByRole('button', { name: 'Parar' });
    await user.click(stopButton);
    expect(stopButton).toBeDisabled();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        `/api/v1/servers/${provider.id}/process/stop`,
        expect.objectContaining({ method: 'POST' }),
      );
    });

    await waitFor(
      () => {
        expect(scoped.getByText('Offline')).toBeInTheDocument();
      },
      { timeout: 2000 },
    );

    const startButton = scoped.getByRole('button', { name: 'Iniciar' });
    await user.click(startButton);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        `/api/v1/servers/${provider.id}/process/start`,
        expect.objectContaining({ method: 'POST' }),
      );
    });

    await waitFor(
      () => {
        expect(scoped.getByText('Online')).toBeInTheDocument();
      },
      { timeout: 2000 },
    );
  });

  it('executes connectivity checks from the keys view', async () => {
    const user = userEvent.setup();

    await act(async () => {
      render(<App />);
      await Promise.resolve();
    });

    await screen.findByRole('heading', { level: 3, name: provider.name });
    const keysTab = screen.getByRole('button', { name: 'Chaves' });
    await user.click(keysTab);

    await screen.findByRole('heading', { name: /Chaves MCP/i });

    const keyHeading = await screen.findByRole('heading', { level: 2, name: provider.name });
    const keyCard = keyHeading.closest('article');
    expect(keyCard).not.toBeNull();

    const scoped = within(keyCard as HTMLElement);
    const testButton = scoped.getByRole('button', { name: 'Testar conectividade' });
    await user.click(testButton);

    await waitFor(
      () => {
        expect(
          scoped.getByText(`${provider.name} respondeu ao handshake em 268 ms.`),
        ).toBeInTheDocument();
      },
      { timeout: 2000 },
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        `/api/v1/secrets/${provider.id}/test`,
        expect.objectContaining({ method: 'POST' }),
      );
    });

    await waitFor(
      () => {
        expect(testButton).not.toBeDisabled();
      },
      { timeout: 2000 },
    );
  });

  it('permite explorar cenários de routing e simular falhas', async () => {
    const user = userEvent.setup();

    await act(async () => {
      render(<App />);
      await Promise.resolve();
    });

    await screen.findByRole('heading', { level: 3, name: provider.name });
    const routingTab = screen.getByRole('button', { name: 'Routing' });
    await user.click(routingTab);

    await screen.findByRole('heading', { name: /Simulador “what-if” de roteamento/i });

    const focusBadge = await screen.findByTestId('routing-focus');
    expect(focusBadge).toHaveTextContent('Redução de custo');

    const latencyOption = screen.getByRole('radio', { name: /Latência prioritária/i });
    await user.click(latencyOption);

    await waitFor(() => {
      expect(screen.getByTestId('routing-focus')).toHaveTextContent('Resposta em milissegundos');
    });

    const failoverSelect = screen.getByLabelText('Falha simulada');
    await user.selectOptions(failoverSelect, provider.name);

    await screen.findByText('Tráfego realocado após falha');
    await screen.findByText('Nenhuma rota disponível para o cenário escolhido.');
  });

  it('apresenta filtros de FinOps e exporta CSV da série temporal', async () => {
    const user = userEvent.setup();

    await act(async () => {
      render(<App />);
      await Promise.resolve();
    });

    await screen.findByRole('heading', { level: 3, name: provider.name });
    const finopsTab = screen.getByRole('button', { name: 'FinOps' });
    await user.click(finopsTab);

    await screen.findByRole('heading', { name: /Séries temporais/i });

    const exportButton = await screen.findByRole('button', { name: 'Exportar CSV' });
    expect(exportButton).toBeEnabled();

    const providerSelect = screen.getByLabelText('Provedor');
    await user.selectOptions(providerSelect, provider.id);

    const periodButton = screen.getByRole('button', { name: '7 dias' });
    await user.click(periodButton);

    const metricButton = screen.getByRole('button', { name: 'Tokens' });
    await user.click(metricButton);

    const summaryTable = await screen.findByRole('table', { name: /Resumo diário filtrado/i });
    expect(summaryTable).toBeInTheDocument();

    const paretoGroup = await screen.findByRole('radiogroup', { name: /Rotas ordenadas por custo/i });
    const paretoOptions = within(paretoGroup).getAllByRole('radio');
    expect(paretoOptions.length).toBeGreaterThan(1);

    const secondOption = paretoOptions[1];
    await user.click(secondOption);
    expect(secondOption).toHaveAttribute('aria-checked', 'true');

    const runsTable = await screen.findByRole('table', { name: /Runs da rota selecionada/i });
    expect(within(runsTable).getAllByRole('row').length).toBeGreaterThan(1);

    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;

    if (typeof URL.createObjectURL !== 'function') {
      (URL as unknown as { createObjectURL: (blob: Blob) => string }).createObjectURL = () => 'blob:mock';
    }

    if (typeof URL.revokeObjectURL !== 'function') {
      (URL as unknown as { revokeObjectURL: (url: string) => void }).revokeObjectURL = () => {};
    }

    const createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:finops');
    const revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const anchorClickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    try {
      await user.click(exportButton);

      expect(createObjectURLSpy).toHaveBeenCalled();
      expect(anchorClickSpy).toHaveBeenCalled();
    } finally {
      anchorClickSpy.mockRestore();
      createObjectURLSpy.mockRestore();
      revokeObjectURLSpy.mockRestore();
      if (originalCreateObjectURL) {
        (URL as unknown as { createObjectURL: typeof originalCreateObjectURL }).createObjectURL = originalCreateObjectURL;
      } else {
        delete (URL as unknown as { createObjectURL?: typeof originalCreateObjectURL }).createObjectURL;
      }
      if (originalRevokeObjectURL) {
        (URL as unknown as { revokeObjectURL: typeof originalRevokeObjectURL }).revokeObjectURL = originalRevokeObjectURL;
      } else {
        delete (URL as unknown as { revokeObjectURL?: typeof originalRevokeObjectURL }).revokeObjectURL;
      }
    }
  });

  it('permite alternar superfícies pelo command palette', async () => {
    const user = userEvent.setup();

    await act(async () => {
      render(<App />);
      await Promise.resolve();
    });

    await screen.findByRole('heading', { level: 3, name: provider.name });

    const paletteButton = screen.getByRole('button', { name: /Command palette/i });
    expect(paletteButton).toHaveAttribute('aria-expanded', 'false');

    await user.click(paletteButton);

    const palette = await screen.findByRole('dialog', { name: 'Ações rápidas' });
    expect(paletteButton).toHaveAttribute('aria-expanded', 'true');
    const searchbox = within(palette).getByRole('searchbox', { name: 'Buscar comando' });

    await user.type(searchbox, 'Routing');

    const routingOptions = await within(palette).findAllByRole('option', { name: /Routing/i });
    const routingOption =
      routingOptions.find((option) => within(option).queryByText(/^Routing$/i)) ?? routingOptions[0];

    await user.click(routingOption);

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Ações rápidas' })).not.toBeInTheDocument();
      expect(paletteButton).toHaveAttribute('aria-expanded', 'false');
    });

    await screen.findByRole('heading', { name: /Simulador “what-if” de roteamento/i });
  });

  it('exibe a central de notificações e permite triagem rápida', async () => {
    const user = userEvent.setup();

    await act(async () => {
      render(<App />);
      await Promise.resolve();
    });

    await screen.findByRole('heading', { level: 3, name: provider.name });

    const notificationsButton = await screen.findByRole('button', {
      name: /Abrir central de notificações/i,
    });
    expect(notificationsButton).toHaveAttribute('aria-expanded', 'false');

    await user.click(notificationsButton);

    const notificationCenter = await screen.findByRole('dialog', {
      name: 'Status operacionais e FinOps',
    });

    expect(notificationsButton).toHaveAttribute('aria-expanded', 'true');

    const notificationList = within(notificationCenter).getByRole('list', {
      name: 'Lista de notificações',
    });
    const allNotifications = within(notificationList).getAllByRole('listitem');
    expect(allNotifications.length).toBeGreaterThan(1);
    const totalBefore = allNotifications.length;

    const firstNotification = allNotifications[0];
    const firstTitle = within(firstNotification).getByRole('heading', { level: 3 }).textContent ?? '';
    const toggleButton = within(firstNotification).getByRole('button', { name: 'Marcar como lida' });
    await user.click(toggleButton);
    await waitFor(() => {
      expect(toggleButton).toHaveTextContent('Marcar como não lida');
    });

    const unreadFilter = within(notificationCenter).getByRole('radio', { name: /Não lidas/ });
    await user.click(unreadFilter);

    const unreadNotifications = within(notificationList).getAllByRole('listitem');
    expect(unreadNotifications.length).toBeLessThan(totalBefore);
    unreadNotifications.forEach((notification) => {
      expect(within(notification).queryByRole('heading', { level: 3, name: firstTitle })).toBeNull();
    });

    const markAllButton = within(notificationCenter).getByRole('button', { name: 'Limpar' });
    await user.click(markAllButton);
    await waitFor(() => {
      expect(markAllButton).toBeDisabled();
    });

    await within(notificationList).findByText('Nenhuma notificação encontrada para o filtro selecionado.');

    const summary = within(notificationCenter).getByText(/Nenhuma notificação pendente/i);
    expect(summary).toBeInTheDocument();

    await waitFor(() => {
      expect(notificationsButton).toHaveAccessibleName(/sem pendências/i);
    });

    const closeButton = within(notificationCenter).getByRole('button', { name: 'Fechar' });
    await user.click(closeButton);

    await waitFor(() => {
      expect(notificationsButton).toHaveAttribute('aria-expanded', 'false');
    });
    await waitFor(() => {
      expect(notificationsButton).toHaveFocus();
    });
  });

  it('permite aplicar templates de política e executar rollback', async () => {
    const user = userEvent.setup();

    await act(async () => {
      render(<App />);
      await Promise.resolve();
    });

    await screen.findByRole('heading', { level: 3, name: provider.name });
    const policiesTab = screen.getByRole('button', { name: 'Políticas' });
    await user.click(policiesTab);

    await screen.findByRole('heading', { name: /Políticas MCP/i });
    expect(screen.getByRole('heading', { level: 2, name: 'Equilíbrio' })).toBeInTheDocument();

    const turboOption = screen.getByRole('radio', { name: 'Template Turbo' });
    await user.click(turboOption);

    const applyButton = screen.getByRole('button', { name: 'Aplicar template' });
    await user.click(applyButton);

    await screen.findByText('Turbo ativado para toda a frota.');
    await screen.findByRole('heading', { level: 2, name: 'Turbo' });

    const rollbackButton = screen.getByRole('button', { name: 'Rollback imediato' });
    expect(rollbackButton).not.toBeDisabled();
    await user.click(rollbackButton);

    await screen.findByText('Rollback concluído para Equilíbrio.');
    await screen.findByRole('heading', { level: 2, name: 'Equilíbrio' });
  });

  it('carrega notificações remotas durante o bootstrap', async () => {
    const user = userEvent.setup();

    await act(async () => {
      render(<App />);
      await Promise.resolve();
    });

    const notificationButton = await screen.findByRole('button', {
      name: /Abrir central de notificações/i,
    });
    await user.click(notificationButton);

    await screen.findByText('Release 2024.09.1 publicado');
    await screen.findByText(
      'Novos alertas em tempo real e central de notificações disponíveis na console MCP.',
    );
  });

  it('apresenta fallback quando a API de notificações falha', async () => {
    const user = userEvent.setup();
    resetFetchMock();
    fetchMock
      .mockResolvedValueOnce(createFetchResponse({ servers: [serverRecord] }))
      .mockResolvedValueOnce(createFetchResponse({ sessions: [existingSession] }))
      .mockResolvedValueOnce(createFetchResponse({ secrets: [secretMetadata] }))
      .mockRejectedValueOnce(new Error('offline'));

    await act(async () => {
      render(<App />);
      await Promise.resolve();
    });

    const notificationButton = await screen.findByRole('button', {
      name: /Abrir central de notificações/i,
    });
    await user.click(notificationButton);

    await screen.findByText('Nenhum evento recente');
    expect(console.error).toHaveBeenCalledWith(
      'Falha ao carregar notificações remotas',
      expect.any(Error),
    );
  });

  it('usa fallback quando a API retorna lista vazia', async () => {
    const user = userEvent.setup();
    resetFetchMock();
    fetchMock
      .mockResolvedValueOnce(createFetchResponse({ servers: [serverRecord] }))
      .mockResolvedValueOnce(createFetchResponse({ sessions: [existingSession] }))
      .mockResolvedValueOnce(createFetchResponse({ secrets: [secretMetadata] }))
      .mockResolvedValueOnce(createFetchResponse({ notifications: [] }));

    await act(async () => {
      render(<App />);
      await Promise.resolve();
    });

    const notificationButton = await screen.findByRole('button', {
      name: /Abrir central de notificações/i,
    });
    await user.click(notificationButton);

    await screen.findByText('Nenhum evento recente');
    const storedState = window.localStorage.getItem(NOTIFICATION_READ_STATE_KEY);
    expect(storedState).toContain('platform-placeholder');
  });

  it('persists notification read state across reloads', async () => {
    const user = userEvent.setup();

    resetFetchMock();
    fetchMock
      .mockResolvedValueOnce(createFetchResponse({ servers: [serverRecord] }))
      .mockResolvedValueOnce(createFetchResponse({ sessions: [existingSession] }))
      .mockResolvedValueOnce(createFetchResponse({ secrets: [secretMetadata] }))
      .mockResolvedValueOnce(createFetchResponse({ notifications }));

    let firstRender: ReturnType<typeof render> | undefined;
    await act(async () => {
      firstRender = render(<App />);
      await Promise.resolve();
    });

    if (!firstRender) {
      throw new Error('Failed to render component');
    }

    const notificationButton = await screen.findByRole('button', {
      name: /Abrir central de notificações/i,
    });
    await user.click(notificationButton);

    const markAllButton = await screen.findByRole('button', { name: 'Limpar' });
    await user.click(markAllButton);

    await waitFor(() => expect(markAllButton).toBeDisabled());

    const storedState = window.localStorage.getItem(NOTIFICATION_READ_STATE_KEY);
    expect(storedState).not.toBeNull();
    const parsedState = JSON.parse(storedState!);
    expect(Object.values(parsedState).some((value) => value === true)).toBe(true);

    firstRender.unmount();

    await act(async () => {
      render(<App />);
      await Promise.resolve();
    });

    const notificationButtonAfterReload = await screen.findByRole('button', {
      name: /Abrir central de notificações/i,
    });
    await user.click(notificationButtonAfterReload);

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Limpar' })).toBeDisabled(),
    );

    const toggleButtons = await screen.findAllByRole('button', {
      name: 'Marcar como não lida',
    });
    expect(toggleButtons.length).toBeGreaterThan(0);
  });
});
