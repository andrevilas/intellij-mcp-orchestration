import { act } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import App from './App';

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

  beforeEach(() => {
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    vi.spyOn(console, 'error').mockImplementation((message?: unknown, ...optionalParams: unknown[]) => {
      if (typeof message === 'string' && message.includes('not wrapped in act')) {
        return;
      }
      originalConsoleError(message, ...optionalParams);
    });

    fetchMock
      .mockResolvedValueOnce(createFetchResponse({ providers: [provider] }))
      .mockResolvedValueOnce(createFetchResponse({ sessions: [existingSession] }))
      .mockResolvedValueOnce(createFetchResponse({ session: newSession, provider }));
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
    console.error = originalConsoleError;
  });

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

    expect(await screen.findByText(provider.description)).toBeInTheDocument();
    expect(await screen.findByText(existingSession.id)).toBeInTheDocument();

    const provisionButton = screen.getByRole('button', { name: 'Criar sessão de provisionamento' });
    await user.click(provisionButton);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenNthCalledWith(
        3,
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

    const requestBody = JSON.parse(fetchMock.mock.calls[2][1]?.body as string);
    expect(requestBody).toEqual({
      reason: 'Provisionamento disparado pela Console MCP',
      client: 'console-web',
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

    const keyHeading = await screen.findByRole('heading', { level: 2, name: /Produção/ });
    const keyCard = keyHeading.closest('article');
    expect(keyCard).not.toBeNull();

    const scoped = within(keyCard as HTMLElement);
    const testButton = scoped.getByRole('button', { name: 'Testar conectividade' });
    await user.click(testButton);

    expect(testButton).toBeDisabled();

    await waitFor(
      () => {
        expect(scoped.getByText('Ativa')).toBeInTheDocument();
        expect(scoped.getByText(/316 ms/)).toBeInTheDocument();
      },
      { timeout: 2000 },
    );

    expect(testButton).not.toBeDisabled();
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
});
