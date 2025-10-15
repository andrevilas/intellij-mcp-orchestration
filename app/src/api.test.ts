import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';

import { createSession, fetchProviders, fetchSessions } from './api';

function mockFetchResponse<T>(payload: T): Promise<Response> {
  return Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve(payload),
  } as unknown as Response);
}

describe('api client', () => {
  let fetchSpy: Mock;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('requests the provider list from /api/v1/providers', async () => {
    const providers = [
      {
        id: 'gemini',
        name: 'Gemini MCP',
        command: 'gemini',
        tags: [],
        capabilities: [],
        transport: 'stdio',
        is_available: true,
      },
    ];
    fetchSpy.mockResolvedValueOnce(mockFetchResponse({ providers }));

    const result = await fetchProviders();

    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/v1/providers',
      expect.objectContaining({
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
      }),
    );
    expect(result).toEqual(providers);
  });

  it('requests sessions from /api/v1/sessions', async () => {
    const sessions = [
      {
        id: 'session-1',
        provider_id: 'gemini',
        created_at: new Date().toISOString(),
        status: 'pending',
      },
    ];
    fetchSpy.mockResolvedValueOnce(mockFetchResponse({ sessions }));

    const result = await fetchSessions();

    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/v1/sessions',
      expect.objectContaining({
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
      }),
    );
    expect(result).toEqual(sessions);
  });

  it('creates provisioning sessions via POST to /api/v1/providers/{id}/sessions', async () => {
    const providerId = 'gemini';
    const payload = {
      session: {
        id: 'session-2',
        provider_id: providerId,
        created_at: new Date().toISOString(),
        status: 'pending',
      },
      provider: {
        id: providerId,
        name: 'Gemini MCP',
        command: 'gemini',
        tags: [],
        capabilities: [],
        transport: 'stdio',
        is_available: true,
      },
    };

    fetchSpy.mockResolvedValueOnce(mockFetchResponse(payload));

    const result = await createSession(providerId, { reason: 'Test', client: 'vitest' });

    expect(fetchSpy).toHaveBeenCalledWith(
      `/api/v1/providers/${providerId}/sessions`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ reason: 'Test', client: 'vitest' }),
      }),
    );
    expect(result).toEqual(payload);
  });
});
