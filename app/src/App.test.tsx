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

    applyDefaultFetchMock = () => {
      fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString();
        const method = (init?.method ?? 'GET').toUpperCase();

      if (url === '/api/v1/providers' && method === 'GET') {
        return createFetchResponse({ providers: [provider] });
      }
      if (url === '/api/v1/sessions' && method === 'GET') {
        return createFetchResponse({ sessions: [existingSession] });
      }
      if (url === '/api/v1/secrets' && method === 'GET') {
        return createFetchResponse({ secrets: [secretMetadata] });
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
      '/api/v1/providers',
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

    const serverHeading = await screen.findByRole('heading', { level: 2, name: provider.name });
    const serverCard = serverHeading.closest('article');
    expect(serverCard).not.toBeNull();

    const scoped = within(serverCard as HTMLElement);

    const stopButton = await scoped.findByRole('button', { name: 'Parar' });
    await user.click(stopButton);
    expect(stopButton).toBeDisabled();

    await waitFor(
      () => {
        expect(scoped.getByText('Offline')).toBeInTheDocument();
      },
      { timeout: 2000 },
    );

    const startButton = scoped.getByRole('button', { name: 'Iniciar' });
    await user.click(startButton);

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

    expect(testButton).toBeDisabled();

    await waitFor(
      () => {
        expect(scoped.getByText(new RegExp(provider.name))).toBeInTheDocument();
      },
      { timeout: 2000 },
    );

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

    const routingOption = await within(palette).findByRole('option', { name: /Routing/i });

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
      .mockResolvedValueOnce(createFetchResponse({ providers: [provider] }))
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
      .mockResolvedValueOnce(createFetchResponse({ providers: [provider] }))
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
      .mockResolvedValueOnce(createFetchResponse({ providers: [provider] }))
      .mockResolvedValueOnce(createFetchResponse({ sessions: [existingSession] }))
      .mockResolvedValueOnce(createFetchResponse({ secrets: [secretMetadata] }))
      .mockResolvedValueOnce(createFetchResponse({ notifications }))
      .mockResolvedValueOnce(createFetchResponse({ providers: [provider] }))
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
