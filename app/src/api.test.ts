import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';

import {
  createSession,
  deleteSecret,
  fetchProviders,
  fetchSecrets,
  fetchSessions,
  fetchTelemetryHeatmap,
  fetchTelemetryMetrics,
  readSecret,
  upsertSecret,
} from './api';

function mockFetchResponse<T>(payload: T): Promise<Response> {
  return Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve(payload),
  } as unknown as Response);
}

function mockNoContentResponse(status = 204): Promise<Response> {
  return Promise.resolve({
    ok: true,
    status,
    json: () => Promise.resolve(undefined),
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

  it('requests secret metadata from /api/v1/secrets', async () => {
    const secrets = [
      { provider_id: 'gemini', has_secret: true, updated_at: new Date().toISOString() },
    ];
    fetchSpy.mockResolvedValueOnce(mockFetchResponse({ secrets }));

    const result = await fetchSecrets();

    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/v1/secrets',
      expect.objectContaining({
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
      }),
    );
    expect(result).toEqual(secrets);
  });

  it('reads a secret value from /api/v1/secrets/{id}', async () => {
    const payload = {
      provider_id: 'gemini',
      value: 'sk-live-123',
      updated_at: new Date().toISOString(),
    };
    fetchSpy.mockResolvedValueOnce(mockFetchResponse(payload));

    const result = await readSecret('gemini');

    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/v1/secrets/gemini',
      expect.objectContaining({
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
      }),
    );
    expect(result).toEqual(payload);
  });

  it('upserts secrets via PUT to /api/v1/secrets/{id}', async () => {
    const payload = {
      provider_id: 'gemini',
      value: 'sk-live-123',
      updated_at: new Date().toISOString(),
    };
    fetchSpy.mockResolvedValueOnce(mockFetchResponse(payload));

    const result = await upsertSecret('gemini', 'sk-live-123');

    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/v1/secrets/gemini',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ value: 'sk-live-123' }),
      }),
    );
    expect(result).toEqual(payload);
  });

  it('deletes secrets via DELETE to /api/v1/secrets/{id}', async () => {
    fetchSpy.mockResolvedValueOnce(mockNoContentResponse());

    await deleteSecret('gemini');

    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/v1/secrets/gemini',
      expect.objectContaining({
        method: 'DELETE',
      }),
    );
  });

  it('requests telemetry metrics with optional filters', async () => {
    const payload = {
      start: '2024-03-01T00:00:00.000Z',
      end: '2024-03-02T00:00:00.000Z',
      total_runs: 3,
      total_tokens_in: 900,
      total_tokens_out: 450,
      total_cost_usd: 4.2,
      avg_latency_ms: 850,
      success_rate: 0.75,
      providers: [],
    };

    fetchSpy.mockResolvedValueOnce(mockFetchResponse(payload));

    const start = new Date('2024-03-01T00:00:00Z');
    const result = await fetchTelemetryMetrics({ start, providerId: 'gemini' });

    expect(fetchSpy).toHaveBeenCalledWith(
      `/api/v1/telemetry/metrics?start=${encodeURIComponent(start.toISOString())}&provider_id=gemini`,
      expect.objectContaining({
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
      }),
    );
    expect(result).toEqual(payload);
  });

  it('requests telemetry heatmap aggregates', async () => {
    const payload = {
      buckets: [
        { day: '2024-03-01', provider_id: 'glm', run_count: 2 },
        { day: '2024-03-02', provider_id: 'gemini', run_count: 1 },
      ],
    };

    fetchSpy.mockResolvedValueOnce(mockFetchResponse(payload));

    const end = '2024-03-02T00:00:00Z';
    const result = await fetchTelemetryHeatmap({ end });

    expect(fetchSpy).toHaveBeenCalledWith(
      `/api/v1/telemetry/heatmap?end=${encodeURIComponent(end)}`,
      expect.objectContaining({
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
      }),
    );
    expect(result).toEqual(payload.buckets);
  });
});
