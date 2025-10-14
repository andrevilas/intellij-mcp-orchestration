import { act } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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
});
