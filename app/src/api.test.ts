import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';

import {
  ApiError,
  createSession,
  createPolicy,
  updatePolicy,
  deletePolicy,
  fetchPolicies,
  fetchPolicyOverrides,
  fetchPolicyManifest,
  updatePolicyManifest,
  createPolicyOverride,
  updatePolicyOverride,
  deletePolicyOverride,
  fetchHitlQueue,
  resolveHitlRequest,
  fetchPolicyDeployments,
  createPolicyDeployment,
  deletePolicyDeployment,
  fetchPolicyCompliance,
  deleteSecret,
  fetchFinOpsPullRequestReports,
  fetchFinOpsSprintReports,
  fetchProviders,
  fetchServerCatalog,
  fetchServerProcesses,
  fetchServerProcessLogs,
  fetchSecrets,
  fetchSessions,
  fetchTelemetryHeatmap,
  fetchTelemetryMetrics,
  fetchMarketplaceEntries,
  importMarketplaceEntry,
  readSecret,
  restartServerProcess,
  startServerProcess,
  stopServerProcess,
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

  it('requests the server catalog when fetching providers', async () => {
    const servers = [
      {
        id: 'gemini',
        name: 'Gemini MCP',
        command: 'gemini',
        description: 'Provider test',
        tags: ['search'],
        capabilities: ['chat'],
        transport: 'stdio',
        created_at: '2024-05-01T12:00:00Z',
        updated_at: '2024-05-02T12:00:00Z',
      },
    ];
    fetchSpy.mockResolvedValueOnce(mockFetchResponse({ servers }));

    const result = await fetchProviders();

    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/v1/servers',
      expect.objectContaining({
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
      }),
    );
    expect(result).toEqual([
      {
        id: 'gemini',
        name: 'Gemini MCP',
        command: 'gemini',
        description: 'Provider test',
        tags: ['search'],
        capabilities: ['chat'],
        transport: 'stdio',
        is_available: true,
      },
    ]);
  });

  it('fetches server processes and mutates lifecycle actions', async () => {
    const processPayload = {
      server_id: 'gemini',
      status: 'running' as const,
      command: 'gemini',
      pid: 123,
      started_at: '2024-05-01T12:00:00Z',
      stopped_at: null,
      return_code: null,
      last_error: null,
      logs: [
        { id: '1', timestamp: '2024-05-01T12:00:00Z', level: 'info' as const, message: 'Start requested' },
      ],
      cursor: '1',
    };
    fetchSpy
      .mockResolvedValueOnce(mockFetchResponse({ processes: [processPayload] }))
      .mockResolvedValueOnce(mockFetchResponse({ process: processPayload }))
      .mockResolvedValueOnce(mockFetchResponse({ process: { ...processPayload, status: 'stopped', pid: null } }))
      .mockResolvedValueOnce(mockFetchResponse({ process: processPayload }));

    const processes = await fetchServerProcesses();
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/v1/servers/processes',
      expect.any(Object),
    );
    expect(processes[0]).toMatchObject({
      serverId: 'gemini',
      status: 'running',
      logs: [expect.objectContaining({ message: 'Start requested' })],
      cursor: '1',
    });

    const startResult = await startServerProcess('gemini');
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/v1/servers/gemini/process/start',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(startResult.status).toBe('running');

    const stopResult = await stopServerProcess('gemini');
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/v1/servers/gemini/process/stop',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(stopResult.status).toBe('stopped');

    await restartServerProcess('gemini');
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/v1/servers/gemini/process/restart',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('fetches incremental process logs with cursor fallback', async () => {
    fetchSpy
      .mockResolvedValueOnce(
        mockFetchResponse({
          logs: [
            { id: '3', timestamp: '2024-05-01T12:00:02Z', level: 'info', message: 'Process started' },
          ],
          cursor: '3',
        }),
      )
      .mockResolvedValueOnce(mockFetchResponse({ logs: [], cursor: null }));

    const first = await fetchServerProcessLogs('gemini', '2');
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/v1/servers/gemini/process/logs?cursor=2',
      expect.any(Object),
    );
    expect(first).toEqual({
      logs: [
        {
          id: '3',
          timestamp: '2024-05-01T12:00:02Z',
          level: 'info',
          message: 'Process started',
        },
      ],
      cursor: '3',
    });

    const second = await fetchServerProcessLogs('gemini', first.cursor);
    expect(second).toEqual({ logs: [], cursor: first.cursor });
  });

  it('exposes status information when the API returns an error', async () => {
    fetchSpy.mockResolvedValueOnce(
      Promise.resolve({
        ok: false,
        status: 409,
        text: () => Promise.resolve('conflict'),
      } as unknown as Response),
    );

    let captured: ApiError | null = null;
    await expect(
      fetchServerCatalog().catch((err) => {
        captured = err as ApiError;
        throw err;
      }),
    ).rejects.toBeInstanceOf(ApiError);
    expect(captured).not.toBeNull();
    expect(captured?.status).toBe(409);
    expect(captured?.body).toBe('conflict');
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

    const result = await createSession(providerId, {
      reason: 'Test',
      client: 'vitest',
      overrides: {
        runtime: { maxIters: 4, timeouts: { total: 120 }, retry: { maxAttempts: 3 } },
        finops: { costCenter: 'lab' },
      },
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      `/api/v1/providers/${providerId}/sessions`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          reason: 'Test',
          client: 'vitest',
          overrides: {
            runtime: {
              max_iters: 4,
              timeouts: { total: 120 },
              retry: { max_attempts: 3 },
            },
            finops: { cost_center: 'lab' },
          },
        }),
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
          overrides: {
            routing: { max_iters: 2, request_timeout_seconds: 45 },
            runtime: {
              timeouts: { total: 90 },
              retry: { max_attempts: 3 },
            },
            hitl: {
              checkpoints: [
                { name: 'ops-approval', description: 'Ops review', required: true, escalation_channel: 'slack' },
              ],
            },
            tracing: { enabled: true, sample_rate: 0.2, exporter: 'otlp' },
          },
        },
      ],
    };
    fetchSpy.mockResolvedValueOnce(mockFetchResponse(overridesPayload));

    const overrides = await fetchPolicyOverrides();
    expect(overrides[0]).toMatchObject({
      templateId: 'balanced',
      requireManualApproval: true,
      overrides: expect.objectContaining({
        routing: expect.objectContaining({ maxIters: 2, requestTimeoutSeconds: 45 }),
        runtime: expect.objectContaining({ timeouts: { total: 90, perIteration: null } }),
        hitl: expect.objectContaining({ checkpoints: expect.arrayContaining([expect.objectContaining({ name: 'ops-approval' })]) }),
        tracing: expect.objectContaining({ enabled: true, sampleRate: 0.2 }),
      }),
    });

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
      overrides: {
        routing: { maxIters: 2 },
        runtime: { timeouts: { total: 90 } },
      },
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
          overrides: {
            routing: { max_iters: 2 },
            runtime: { timeouts: { total: 90 } },
          },
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
      overrides: {
        runtime: { timeouts: { total: 75 } },
      },
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
          overrides: { runtime: { timeouts: { total: 75 } } },
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

  it('fetches and updates policy manifest snapshots', async () => {
    const manifestPayload = {
      policies: { confidence: { approval: 0.9, rejection: 0.4 } },
      routing: {
        max_iters: 5,
        max_attempts: 4,
        request_timeout_seconds: 45,
        total_timeout_seconds: 180,
        default_tier: 'balanced',
        allowed_tiers: ['balanced', 'turbo'],
        fallback_tier: 'turbo',
      },
      finops: {
        cost_center: 'mlops',
        budgets: [{ tier: 'balanced', amount: 1200, currency: 'USD', period: 'monthly' }],
        alerts: [{ threshold: 0.7, channel: 'slack' }],
      },
      hitl: {
        enabled: true,
        pending_approvals: 2,
        updated_at: '2025-04-02T00:00:00Z',
        checkpoints: [
          { name: 'ops', description: 'Ops review', required: true, escalation_channel: 'pagerduty' },
        ],
      },
      runtime: {
        max_iters: 6,
        timeouts: { per_iteration: 40, total: 200 },
        retry: { max_attempts: 3, initial_delay: 1, backoff_factor: 2, max_delay: 6 },
        tracing: { enabled: true, sample_rate: 0.3, exporter: 'otlp' },
      },
      overrides: { runtime: { max_iters: 7 } },
      updated_at: '2025-04-02T00:00:00Z',
    };

    fetchSpy.mockResolvedValueOnce(mockFetchResponse(manifestPayload));

    const snapshot = await fetchPolicyManifest();
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/v1/policies/manifest',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(snapshot.routing.defaultTier).toBe('balanced');
    expect(snapshot.runtime.tracing.sampleRate).toBe(0.3);
    expect(snapshot.hitl.checkpoints).toHaveLength(1);

    fetchSpy.mockResolvedValueOnce(mockFetchResponse(manifestPayload));

    await updatePolicyManifest({
      routing: { defaultTier: 'turbo', allowedTiers: ['turbo', 'balanced'] },
      runtime: { timeouts: { total: 90 } },
      hitl: { enabled: false },
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/v1/policies/manifest',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({
          routing: {
            default_tier: 'turbo',
            allowed_tiers: ['turbo', 'balanced'],
          },
          runtime: { timeouts: { total: 90 } },
          hitl: { enabled: false },
        }),
      }),
    );
  });

  it('manages HITL queues and resolutions', async () => {
    const queuePayload = {
      pending: [
        {
          id: 'req-1',
          agent: 'planner',
          route: 'ops',
          checkpoint: 'ops-review',
          submitted_at: '2025-04-02T10:00:00Z',
          status: 'pending' as const,
          confidence: 0.55,
          metadata: { reason: 'Low confidence' },
        },
      ],
      resolved: [],
      updated_at: '2025-04-02T10:05:00Z',
    };

    fetchSpy.mockResolvedValueOnce(mockFetchResponse(queuePayload));

    const queue = await fetchHitlQueue();
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/v1/policies/hitl/queue',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(queue.pending[0].confidence).toBeCloseTo(0.55);

    const resolutionPayload = {
      id: 'req-1',
      agent: 'planner',
      route: 'ops',
      checkpoint: 'ops-review',
      submitted_at: '2025-04-02T10:00:00Z',
      status: 'approved' as const,
    };
    fetchSpy.mockResolvedValueOnce(mockFetchResponse(resolutionPayload));

    await resolveHitlRequest('req-1', { resolution: 'approved', note: 'Proceed' });
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/v1/policies/hitl/queue/req-1',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ resolution: 'approved', note: 'Proceed' }),
      }),
    );
  });

  it('fetches policy compliance summaries', async () => {
    const compliancePayload = {
      status: 'warning' as const,
      updated_at: '2025-04-02T00:00:00Z',
      items: [
        { id: 'finops-budget', label: 'Budget mensal', required: true, configured: true, active: false },
        { id: 'hitl-checkpoint', label: 'Checkpoint crítico', required: true, configured: false, active: false },
      ],
    };

    fetchSpy.mockResolvedValueOnce(mockFetchResponse(compliancePayload));

    const summary = await fetchPolicyCompliance();
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/v1/policies/compliance',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(summary.status).toBe('warning');
    expect(summary.items[1].configured).toBe(false);
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

  it('fetches FinOps sprint reports with normalized filters', async () => {
    const payload = {
      items: [
        {
          id: 'sprint-2024-12-01',
          name: 'Sprint 2024-12',
          period_start: '2024-03-01',
          period_end: '2024-03-14',
          total_cost_usd: 42.5,
          total_tokens_in: 120000,
          total_tokens_out: 80000,
          avg_latency_ms: 850,
          success_rate: 0.92,
          cost_delta: 0.1,
          status: 'attention',
          summary: 'Alta de 10% no custo versus sprint anterior.',
        },
      ],
    };

    fetchSpy.mockResolvedValueOnce(mockFetchResponse(payload));

    const start = new Date('2024-03-01T00:00:00Z');
    const end = '2024-03-14T00:00:00Z';

    const result = await fetchFinOpsSprintReports({
      start,
      end,
      providerId: 'gemini',
      windowDays: 14,
      limit: 6,
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      `/api/v1/telemetry/finops/sprints?start=${encodeURIComponent(start.toISOString())}&end=${encodeURIComponent(end)}&provider_id=gemini&window_days=14&limit=6`,
      expect.objectContaining({
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
      }),
    );
    expect(result).toEqual(payload.items);
  });

  it('fetches FinOps pull request reports for a provider', async () => {
    const payload = {
      items: [
        {
          id: 'gemini:default',
          provider_id: 'gemini',
          provider_name: 'Gemini',
          route: 'default',
          lane: 'balanced',
          title: 'Ajustes de custo',
          owner: 'squad-a',
          merged_at: '2024-03-05T12:00:00Z',
          cost_impact_usd: 12.5,
          cost_delta: -0.12,
          tokens_impact: 40000,
          status: 'on_track',
          summary: 'Redução de custo após ajustes de prompt.',
        },
      ],
    };

    fetchSpy.mockResolvedValueOnce(mockFetchResponse(payload));

    const response = await fetchFinOpsPullRequestReports({
      providerId: 'gemini',
      windowDays: 7,
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/v1/telemetry/finops/pull-requests?provider_id=gemini&window_days=7',
      expect.objectContaining({
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
      }),
    );
    expect(response).toEqual(payload.items);
  });

  it('fetches marketplace entries with normalized fields', async () => {
    const payload = {
      entries: [
        {
          id: 'marketplace-help-desk',
          name: 'Help Desk Coach',
          slug: 'help-desk-coach',
          summary: 'Triagem assistida',
          description: 'Equilibra SLAs com fallback humano.',
          origin: 'community',
          rating: 4.8,
          cost: 0.03,
          tags: ['suporte'],
          capabilities: ['triage'],
          repository_url: 'https://github.com/example/help-desk',
          package_path: 'config/marketplace/help-desk',
          manifest_filename: 'agent.yaml',
          entrypoint_filename: 'agent.py',
          target_repository: 'agents-hub',
          signature: 'sig',
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-02T00:00:00Z',
        },
      ],
    };

    fetchSpy.mockResolvedValueOnce(mockFetchResponse(payload));

    const entries = await fetchMarketplaceEntries();
    expect(fetchSpy).toHaveBeenCalledWith('/api/v1/marketplace', expect.objectContaining({ method: 'GET' }));
    expect(entries).toHaveLength(1);
    const entry = entries[0];
    expect(entry.repositoryUrl).toBe('https://github.com/example/help-desk');
    expect(entry.packagePath).toBe('config/marketplace/help-desk');
    expect(entry.entrypointFilename).toBe('agent.py');
    expect(entry.createdAt).toBe('2025-01-01T00:00:00Z');
    expect(entry.updatedAt).toBe('2025-01-02T00:00:00Z');
  });

  it('imports a marketplace entry verifying plan mapping', async () => {
    const payload = {
      entry: {
        id: 'marketplace-help-desk',
        name: 'Help Desk Coach',
        slug: 'help-desk-coach',
        summary: 'Triagem assistida',
        description: null,
        origin: 'community',
        rating: 4.9,
        cost: 0.02,
        tags: [],
        capabilities: ['triage'],
        repository_url: null,
        package_path: 'config/marketplace/help-desk',
        manifest_filename: 'agent.yaml',
        entrypoint_filename: 'agent.py',
        target_repository: 'agents-hub',
        signature: 'sig',
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-02T00:00:00Z',
      },
      plan: {
        intent: 'add_agent',
        summary: 'Adicionar agente',
        steps: [
          {
            id: 'discover',
            title: 'Descobrir servidor',
            description: 'Executar handshake',
            depends_on: ['bootstrap'],
            actions: [
              {
                type: 'write_file',
                path: 'agent.yaml',
                contents: 'name: help-desk',
                encoding: 'utf-8',
                overwrite: true,
              },
            ],
          },
        ],
        diffs: [
          { path: 'agent.yaml', summary: 'Criar manifesto', change_type: 'create' },
        ],
        risks: [
          { title: 'Dependências', impact: 'medium', mitigation: 'Revisar requisitos' },
        ],
        status: 'pending',
        context: [
          { path: 'docs/guide.md', snippet: 'Referência', score: 0.9, title: 'Guia', chunk: 1 },
        ],
        approval_rules: ['planner'],
      },
      manifest: 'name: help-desk',
      agent_code: 'print("hello")',
    };

    fetchSpy.mockResolvedValueOnce(mockFetchResponse(payload));

    const response = await importMarketplaceEntry('marketplace-help-desk');
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/v1/marketplace/marketplace-help-desk/import',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(response.entry.slug).toBe('help-desk-coach');
    expect(response.plan.steps[0].dependsOn).toEqual(['bootstrap']);
    expect(response.plan.diffs[0].changeType).toBe('create');
    expect(response.plan.context[0].title).toBe('Guia');
    expect(response.agentCode).toBe('print("hello")');
  });
});
