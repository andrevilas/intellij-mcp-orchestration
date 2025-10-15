import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';

import {
  createSession,
  createPolicy,
  updatePolicy,
  deletePolicy,
  fetchPolicies,
  fetchPolicyOverrides,
  createPolicyOverride,
  updatePolicyOverride,
  deletePolicyOverride,
  fetchPolicyDeployments,
  createPolicyDeployment,
  deletePolicyDeployment,
  deleteSecret,
  fetchProviders,
  fetchSecrets,
  fetchSessions,
  fetchTelemetryHeatmap,
  fetchTelemetryMetrics,
  readSecret,
  testSecret,
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

  it('tests stored secrets via POST to /api/v1/secrets/{id}/test', async () => {
    const payload = {
      provider_id: 'gemini',
      status: 'healthy',
      latency_ms: 240,
      tested_at: new Date().toISOString(),
      message: 'Gemini MCP respondeu ao handshake em 240 ms.',
    };

    fetchSpy.mockResolvedValueOnce(mockFetchResponse(payload));

    const result = await testSecret('gemini');

    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/v1/secrets/gemini/test',
      expect.objectContaining({
        method: 'POST',
      }),
    );
    expect(result).toEqual(payload);
  });

  it('lists cost policies and normalizes field names', async () => {
    const payload = {
      policies: [
        {
          id: 'global-spend',
          name: 'Global Spend',
          description: null,
          monthly_spend_limit: 1500,
          currency: 'USD',
          tags: ['finops'],
          created_at: '2025-04-01T12:00:00Z',
          updated_at: '2025-04-02T12:00:00Z',
        },
      ],
    };
    fetchSpy.mockResolvedValueOnce(mockFetchResponse(payload));

    const result = await fetchPolicies();

    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/v1/policies',
      expect.objectContaining({
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
      }),
    );
    expect(result).toEqual([
      {
        id: 'global-spend',
        name: 'Global Spend',
        description: null,
        monthlySpendLimit: 1500,
        currency: 'USD',
        tags: ['finops'],
        createdAt: '2025-04-01T12:00:00Z',
        updatedAt: '2025-04-02T12:00:00Z',
      },
    ]);
  });

  it('creates, updates and deletes cost policies', async () => {
    const createdPayload = {
      id: 'spend-guard',
      name: 'Spend Guard',
      description: 'Monthly cap',
      monthly_spend_limit: 900,
      currency: 'EUR',
      tags: ['ops'],
      created_at: '2025-04-03T00:00:00Z',
      updated_at: '2025-04-03T00:00:00Z',
    };
    fetchSpy.mockResolvedValueOnce(mockFetchResponse(createdPayload));

    const created = await createPolicy({
      id: 'spend-guard',
      name: 'Spend Guard',
      description: 'Monthly cap',
      monthlySpendLimit: 900,
      currency: 'EUR',
      tags: ['ops'],
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/v1/policies',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          id: 'spend-guard',
          name: 'Spend Guard',
          description: 'Monthly cap',
          monthly_spend_limit: 900,
          currency: 'EUR',
          tags: ['ops'],
        }),
      }),
    );
    expect(created.id).toBe('spend-guard');

    const updatedPayload = { ...createdPayload, name: 'Updated Guard', monthly_spend_limit: 950 };
    fetchSpy.mockResolvedValueOnce(mockFetchResponse(updatedPayload));

    const updated = await updatePolicy('spend-guard', {
      name: 'Updated Guard',
      description: 'Monthly cap',
      monthlySpendLimit: 950,
      currency: 'EUR',
      tags: ['ops'],
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/v1/policies/spend-guard',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({
          name: 'Updated Guard',
          description: 'Monthly cap',
          monthly_spend_limit: 950,
          currency: 'EUR',
          tags: ['ops'],
        }),
      }),
    );
    expect(updated.monthlySpendLimit).toBe(950);

    fetchSpy.mockResolvedValueOnce(mockNoContentResponse());

    await deletePolicy('spend-guard');

    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/v1/policies/spend-guard',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('manages policy overrides end-to-end', async () => {
    const overridesPayload = {
      overrides: [
        {
          id: 'route-ops',
          route: 'ops',
          project: 'console',
          template_id: 'balanced',
          max_latency_ms: 1200,
          max_cost_usd: 0.8,
          require_manual_approval: true,
          notes: 'Pilot',
          created_at: '2025-04-01T00:00:00Z',
          updated_at: '2025-04-01T00:00:00Z',
        },
      ],
    };
    fetchSpy.mockResolvedValueOnce(mockFetchResponse(overridesPayload));

    const overrides = await fetchPolicyOverrides();
    expect(overrides[0]).toMatchObject({ templateId: 'balanced', requireManualApproval: true });

    const createdPayload = overridesPayload.overrides[0];
    fetchSpy.mockResolvedValueOnce(mockFetchResponse(createdPayload));

    await createPolicyOverride({
      id: 'route-ops',
      route: 'ops',
      project: 'console',
      templateId: 'balanced',
      maxLatencyMs: 1200,
      maxCostUsd: 0.8,
      requireManualApproval: true,
      notes: 'Pilot',
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/v1/policies/overrides',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          id: 'route-ops',
          route: 'ops',
          project: 'console',
          template_id: 'balanced',
          max_latency_ms: 1200,
          max_cost_usd: 0.8,
          require_manual_approval: true,
          notes: 'Pilot',
        }),
      }),
    );

    fetchSpy.mockResolvedValueOnce(mockFetchResponse({ ...createdPayload, max_latency_ms: 1000 }));

    await updatePolicyOverride('route-ops', {
      route: 'ops',
      project: 'console',
      templateId: 'balanced',
      maxLatencyMs: 1000,
      maxCostUsd: 0.8,
      requireManualApproval: true,
      notes: 'Pilot',
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/v1/policies/overrides/route-ops',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({
          route: 'ops',
          project: 'console',
          template_id: 'balanced',
          max_latency_ms: 1000,
          max_cost_usd: 0.8,
          require_manual_approval: true,
          notes: 'Pilot',
        }),
      }),
    );

    fetchSpy.mockResolvedValueOnce(mockNoContentResponse());
    await deletePolicyOverride('route-ops');
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/v1/policies/overrides/route-ops',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('fetches and mutates policy deployments', async () => {
    const deploymentsPayload = {
      deployments: [
        {
          id: 'deploy-1',
          template_id: 'balanced',
          deployed_at: '2025-04-01T00:00:00Z',
          author: 'Console MCP',
          window: 'GA',
          note: 'Promoção',
          slo_p95_ms: 900,
          budget_usage_pct: 75,
          incidents_count: 1,
          guardrail_score: 70,
          created_at: '2025-04-01T00:00:00Z',
          updated_at: '2025-04-01T00:00:00Z',
        },
      ],
      active_id: 'deploy-1',
    };
    fetchSpy.mockResolvedValueOnce(mockFetchResponse(deploymentsPayload));

    const summary = await fetchPolicyDeployments();
    expect(summary.activeId).toBe('deploy-1');
    expect(summary.deployments[0].guardrailScore).toBe(70);

    const createdPayload = {
      ...deploymentsPayload.deployments[0],
      id: 'deploy-2',
      template_id: 'turbo',
    };
    fetchSpy.mockResolvedValueOnce(mockFetchResponse(createdPayload));

    const created = await createPolicyDeployment({ templateId: 'turbo', author: 'Console MCP' });
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/v1/policies/deployments',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          template_id: 'turbo',
          author: 'Console MCP',
          window: null,
          note: null,
        }),
      }),
    );
    expect(created.templateId).toBe('turbo');

    fetchSpy.mockResolvedValueOnce(mockNoContentResponse());
    await deletePolicyDeployment('deploy-2');
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/v1/policies/deployments/deploy-2',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('propagates API errors when policy creation fails', async () => {
    fetchSpy.mockResolvedValueOnce(
      Promise.resolve({
        ok: false,
        status: 400,
        text: () => Promise.resolve('Invalid payload'),
      } as unknown as Response),
    );

    await expect(
      createPolicy({ id: 'fail', name: 'Fail', monthlySpendLimit: 1, currency: 'USD' }),
    ).rejects.toThrow(/Invalid payload/);
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
