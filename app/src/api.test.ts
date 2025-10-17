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
  patchConfigPoliciesPlan,
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
  fetchAgents,
  fetchServerCatalog,
  fetchServerProcesses,
  fetchServerProcessLogs,
  runDiagnostics,
  fetchSecrets,
  fetchSessions,
  fetchTelemetryHeatmap,
  fetchTelemetryMetrics,
  fetchTelemetryExperiments,
  fetchTelemetryLaneCosts,
  fetchMarketplacePerformance,
  fetchMarketplaceEntries,
  importMarketplaceEntry,
  postConfigReload,
  simulateRouting,
  readSecret,
  restartServerProcess,
  startServerProcess,
  stopServerProcess,
  testSecret,
  upsertSecret,
  postAgentSmokeRun,
  fetchSmokeEndpoints,
  triggerSmokeEndpoint,
  postPolicyPlanApply,
  fetchSecurityUsers,
  createSecurityUser,
  updateSecurityUser,
  deleteSecurityUser,
  fetchSecurityRoles,
  createSecurityRole,
  updateSecurityRole,
  deleteSecurityRole,
  fetchAuditLogs,
  fetchSecurityApiKeys,
  createSecurityApiKey,
  updateSecurityApiKey,
  rotateSecurityApiKey,
  revokeSecurityApiKey,
  fetchSecurityAuditTrail,
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

  it('fetches the agents catalog from the hub service', async () => {
    fetchSpy.mockResolvedValueOnce(
      mockFetchResponse({
        agents: [
          {
            name: 'catalog-search',
            title: 'Catalog Search',
            version: '1.2.0',
            description: 'Busca estruturada.',
            capabilities: ['search'],
            model: { provider: 'openai', name: 'o3-mini', parameters: { temperature: 0 } },
            status: 'healthy',
            last_deployed_at: '2025-01-02T10:00:00Z',
            owner: '@catalog',
          },
        ],
      }),
    );

    const result = await fetchAgents();

    expect(fetchSpy).toHaveBeenCalledWith(
      '/agents/agents',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
      }),
    );
    expect(result).toEqual([
      {
        name: 'catalog-search',
        title: 'Catalog Search',
        version: '1.2.0',
        description: 'Busca estruturada.',
        capabilities: ['search'],
        model: { provider: 'openai', name: 'o3-mini', parameters: { temperature: 0 } },
        status: 'healthy',
        lastDeployedAt: '2025-01-02T10:00:00Z',
        owner: '@catalog',
      },
    ]);
  });

  it('executa diagnóstico agregando respostas normalizadas', async () => {
    fetchSpy.mockResolvedValueOnce(
      mockFetchResponse({
        timestamp: '2025-01-01T12:00:00Z',
        summary: { total: 3, successes: 3, failures: 0, errors: {} },
        health: { ok: true, status_code: 200, duration_ms: 12.4, data: { status: 'ok' } },
        providers: {
          ok: true,
          status_code: 200,
          duration_ms: 20.1,
          data: { providers: [{ id: 'gemini' }, { id: 'glm46' }] },
        },
        invoke: {
          ok: true,
          status_code: 200,
          duration_ms: 42.8,
          data: { result: { status: 'ok' } },
        },
      }),
    );

    const result = await runDiagnostics({
      agent: 'catalog-search',
      config: { metadata: { surface: 'servers-diagnostics' } },
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/v1/diagnostics/run',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          invoke: {
            agent: 'catalog-search',
            config: { metadata: { surface: 'servers-diagnostics' } },
          },
        }),
      }),
    );

    expect(result.summary.failures).toBe(0);
    expect(result.health.ok).toBe(true);
    expect(result.providers.ok).toBe(true);
    expect(Array.isArray((result.providers.data as { providers: unknown[] }).providers)).toBe(true);
  });

  it('propaga ApiError quando o diagnóstico retorna erro', async () => {
    fetchSpy.mockResolvedValueOnce(
      Promise.resolve({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ detail: 'invoke failed' }),
        text: () => Promise.resolve(''),
      } as unknown as Response),
    );

    await expect(runDiagnostics({ agent: 'catalog-search' })).rejects.toThrow(ApiError);
  });

  it('executes a smoke run using the agents runner endpoint', async () => {
    fetchSpy.mockResolvedValueOnce(
      mockFetchResponse({
        run_id: 'smoke-1',
        status: 'running',
        summary: 'Execução iniciada.',
        report_url: 'https://runner.example/report',
        started_at: '2025-01-02T10:05:00Z',
        finished_at: null,
      }),
    );

    const result = await postAgentSmokeRun('catalog-search');

    expect(fetchSpy).toHaveBeenCalledWith(
      '/agents/catalog-search/smoke',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
      }),
    );
    expect(result).toEqual({
      runId: 'smoke-1',
      status: 'running',
      summary: 'Execução iniciada.',
      reportUrl: 'https://runner.example/report',
      startedAt: '2025-01-02T10:05:00Z',
      finishedAt: null,
    });
  });

  it('fetches smoke endpoints using the console API', async () => {
    fetchSpy.mockResolvedValueOnce(
      mockFetchResponse({
        endpoints: [
          {
            id: 'health-check',
            name: 'Health check',
            description: 'Valida status HTTP.',
            url: 'https://example.com/health',
            last_run: {
              run_id: 'run-42',
              status: 'passed',
              summary: 'OK',
              triggered_by: 'alice',
              triggered_at: '2025-01-03T12:00:00Z',
              finished_at: '2025-01-03T12:00:01Z',
              logs: [
                {
                  id: 'log-1',
                  timestamp: '2025-01-03T12:00:01Z',
                  level: 'info',
                  message: 'GET /health -> 200',
                },
              ],
            },
          },
        ],
      }),
    );

    const result = await fetchSmokeEndpoints();

    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/v1/smoke/endpoints',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
      }),
    );
    expect(result).toEqual([
      {
        id: 'health-check',
        name: 'Health check',
        description: 'Valida status HTTP.',
        url: 'https://example.com/health',
        lastRun: {
          runId: 'run-42',
          status: 'passed',
          summary: 'OK',
          triggeredBy: 'alice',
          triggeredAt: '2025-01-03T12:00:00Z',
          finishedAt: '2025-01-03T12:00:01Z',
          logs: [
            {
              id: 'log-1',
              timestamp: '2025-01-03T12:00:01Z',
              level: 'info',
              message: 'GET /health -> 200',
            },
          ],
        },
      },
    ]);
  });

  it('triggers a smoke endpoint run and maps metadata', async () => {
    fetchSpy.mockResolvedValueOnce(
      mockFetchResponse({
        run_id: 'run-777',
        status: 'running',
        summary: 'Execução em andamento.',
        triggered_by: 'service-account',
        triggered_at: '2025-01-04T09:00:00Z',
        finished_at: null,
        logs: [],
      }),
    );

    const result = await triggerSmokeEndpoint('health-check');

    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/v1/smoke/endpoints/health-check/run',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
      }),
    );
    expect(result).toEqual({
      runId: 'run-777',
      status: 'running',
      summary: 'Execução em andamento.',
      triggeredBy: 'service-account',
      triggeredAt: '2025-01-04T09:00:00Z',
      finishedAt: null,
      logs: [],
    });
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
        intents: [
          {
            intent: 'support.assist',
            description: 'Intent de suporte com requisições complexas',
            tags: ['critical', 'canary'],
            default_tier: 'turbo',
            fallback_provider_id: 'provider-turbo-1',
          },
        ],
        rules: [
          {
            id: 'boost-turbo',
            description: 'Promove turbo quando a intent for crítica',
            intent: 'support.assist',
            matcher: "intent == 'support.assist'",
            target_tier: 'turbo',
            provider_id: 'provider-turbo-1',
            weight: 60,
          },
        ],
      },
      finops: {
        cost_center: 'mlops',
        budgets: [{ tier: 'balanced', amount: 1200, currency: 'USD', period: 'monthly' }],
        alerts: [{ threshold: 0.7, channel: 'slack' }],
        cache: { ttl_seconds: 900 },
        rate_limit: { requests_per_minute: 240 },
        graceful_degradation: { strategy: 'fallback', message: 'fallback turbo' },
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
    expect(snapshot.routing.intents).toEqual([
      {
        intent: 'support.assist',
        description: 'Intent de suporte com requisições complexas',
        tags: ['critical', 'canary'],
        defaultTier: 'turbo',
        fallbackProviderId: 'provider-turbo-1',
      },
    ]);
    expect(snapshot.routing.rules).toEqual([
      {
        id: 'boost-turbo',
        description: 'Promove turbo quando a intent for crítica',
        intent: 'support.assist',
        matcher: "intent == 'support.assist'",
        targetTier: 'turbo',
        providerId: 'provider-turbo-1',
        weight: 60,
      },
    ]);
    expect(snapshot.runtime.tracing.sampleRate).toBe(0.3);
    expect(snapshot.hitl.checkpoints).toHaveLength(1);
    expect(snapshot.finops.cache?.ttlSeconds).toBe(900);
    expect(snapshot.finops.rateLimit?.requestsPerMinute).toBe(240);
    expect(snapshot.finops.gracefulDegradation).toEqual({ strategy: 'fallback', message: 'fallback turbo' });

    fetchSpy.mockResolvedValueOnce(mockFetchResponse(manifestPayload));

    await updatePolicyManifest({
      routing: {
        defaultTier: 'turbo',
        allowedTiers: ['turbo', 'balanced'],
        intents: [
          {
            intent: 'support.assist',
            description: 'Intent de suporte com requisições complexas',
            tags: ['critical', 'canary'],
            defaultTier: 'turbo',
            fallbackProviderId: 'provider-turbo-1',
          },
        ],
        rules: [
          {
            id: 'boost-turbo',
            description: 'Promove turbo quando a intent for crítica',
            intent: 'support.assist',
            matcher: "intent == 'support.assist'",
            targetTier: 'turbo',
            providerId: 'provider-turbo-1',
            weight: 60,
          },
        ],
      },
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
            intents: [
              {
                intent: 'support.assist',
                description: 'Intent de suporte com requisições complexas',
                tags: ['critical', 'canary'],
                default_tier: 'turbo',
                fallback_provider_id: 'provider-turbo-1',
              },
            ],
            rules: [
              {
                id: 'boost-turbo',
                description: 'Promove turbo quando a intent for crítica',
                intent: 'support.assist',
                matcher: "intent == 'support.assist'",
                target_tier: 'turbo',
                provider_id: 'provider-turbo-1',
                weight: 60,
              },
            ],
          },
          runtime: { timeouts: { total: 90 } },
          hitl: { enabled: false },
        }),
      }),
    );
  });

  it('gera plano de políticas com intents e regras de roteamento', async () => {
    const planPayload = {
      intent: 'edit_routing',
      summary: 'Atualizar manifesto de roteamento',
      steps: [
        {
          id: 'update-routing',
          title: 'Atualizar manifesto',
          description: 'Escrever novas intents e regras.',
          depends_on: ['review'],
          actions: [
            {
              type: 'write',
              path: 'policies/manifest.json',
              contents: '{"routing": {}}',
              encoding: 'utf-8',
              overwrite: true,
            },
          ],
        },
      ],
      diffs: [
        {
          path: 'policies/manifest.json',
          summary: 'Atualizar manifesto',
          change_type: 'update',
          diff: 'diff --git a/policies/manifest.json b/policies/manifest.json',
        },
      ],
      risks: [
        { title: 'Erro de sintaxe', impact: 'médio', mitigation: 'Reverter rapidamente' },
      ],
      status: 'pending' as const,
      context: [
        {
          path: 'policies/manifest.json',
          snippet: '"routing": {}',
          score: 0.92,
          title: 'Manifesto atual',
          chunk: 1,
        },
      ],
      approval_rules: ['routing-admins'],
    };

    fetchSpy.mockResolvedValueOnce(mockFetchResponse({ plan: planPayload, preview: null }));

    const response = await patchConfigPoliciesPlan({
      policyId: 'manifest',
      changes: {
        routing: {
          maxIters: 6,
          intents: [
            {
              intent: 'support.assist',
              description: 'Atendimento crítico',
              tags: ['critical'],
              defaultTier: 'turbo',
              fallbackProviderId: 'provider-turbo-1',
            },
          ],
          rules: [
            {
              id: 'force-turbo',
              description: 'Prioriza tier turbo para suporte crítico',
              intent: 'support.assist',
              matcher: "intent == 'support.assist'",
              targetTier: 'turbo',
              providerId: 'provider-turbo-1',
              weight: 80,
            },
          ],
        },
      },
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/v1/config/policies',
      expect.objectContaining({ method: 'PATCH' }),
    );
    const requestInit = fetchSpy.mock.calls[0][1] as RequestInit;
    const body = JSON.parse((requestInit.body ?? '{}') as string);
    expect(body.policy_id).toBe('manifest');
    expect(body.changes.routing).toMatchObject({
      max_iters: 6,
      intents: [
        {
          intent: 'support.assist',
          description: 'Atendimento crítico',
          tags: ['critical'],
          default_tier: 'turbo',
          fallback_provider_id: 'provider-turbo-1',
        },
      ],
      rules: [
        {
          id: 'force-turbo',
          description: 'Prioriza tier turbo para suporte crítico',
          intent: 'support.assist',
          matcher: "intent == 'support.assist'",
          target_tier: 'turbo',
          provider_id: 'provider-turbo-1',
          weight: 80,
        },
      ],
    });
    expect(response.plan.intent).toBe('edit_routing');
    expect(response.plan.diffs[0]).toMatchObject({ path: 'policies/manifest.json', changeType: 'update' });
    expect(response.plan.steps[0].actions[0]).toMatchObject({ path: 'policies/manifest.json', overwrite: true });
    expect(response.plan.context[0]).toMatchObject({ title: 'Manifesto atual', chunk: 1 });
    expect(response.plan.approvalRules).toEqual(['routing-admins']);
  });

  it('gera plano de reload e normaliza patch', async () => {
    const reloadResponse = {
      message: 'Plano gerado para regerar finops.checklist.',
      plan: {
        intent: 'generate_artifact',
        summary: 'Gerar checklist finops',
        steps: [
          {
            id: 'write-artifact',
            title: 'Escrever artefato',
            description: 'Salvar checklist em disco',
            depends_on: [],
            actions: [
              {
                type: 'write_file',
                path: 'generated/cache.md',
                contents: '# Checklist',
                encoding: 'utf-8',
                overwrite: true,
              },
            ],
          },
        ],
        diffs: [
          {
            path: 'generated/cache.md',
            summary: 'Atualizar checklist',
            change_type: 'update',
            diff: '--- a/generated/cache.md\n+++ b/generated/cache.md\n+Conteúdo',
          },
        ],
        risks: [],
        status: 'pending' as const,
        context: [],
        approval_rules: [],
      },
      patch: '--- a/generated/cache.md\n+++ b/generated/cache.md\n+Conteúdo',
    };

    fetchSpy.mockResolvedValueOnce(mockFetchResponse(reloadResponse));

    const response = await postConfigReload({
      artifactType: 'finops.checklist',
      targetPath: 'generated/cache.md',
      parameters: { owner: 'finops' },
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/v1/config/reload',
      expect.objectContaining({ method: 'POST' }),
    );
    const requestInit = fetchSpy.mock.calls[0][1] as RequestInit;
    expect(JSON.parse((requestInit.body ?? '{}') as string)).toEqual({
      artifact_type: 'finops.checklist',
      target_path: 'generated/cache.md',
      parameters: { owner: 'finops' },
    });
    expect(response.message).toBe(reloadResponse.message);
    expect(response.plan.intent).toBe('generate_artifact');
    expect(response.plan.diffs[0]).toMatchObject({
      path: 'generated/cache.md',
      diff: reloadResponse.patch,
    });
    expect(response.planPayload.intent).toBe('generate_artifact');
    expect(response.patch).toBe(reloadResponse.patch);
  });

  it('aplica planos de políticas enviando autor e commit', async () => {
    const planPayload = {
      intent: 'edit_routing',
      summary: 'Atualizar manifesto de roteamento',
      steps: [],
      diffs: [],
      risks: [],
      status: 'pending' as const,
      context: [],
      approval_rules: [],
    };

    const applyResponse = {
      status: 'completed' as const,
      mode: 'branch_pr' as const,
      plan_id: 'plan-routing-1',
      record_id: 'rec-routing-1',
      branch: 'feature/routing',
      base_branch: 'main',
      commit_sha: 'abc123',
      diff: { stat: '1 file changed', patch: 'diff --git' },
      hitl_required: true,
      message: 'Plano aplicado com sucesso.',
      approval_id: null,
      pull_request: {
        provider: 'github',
        id: 'pr-202',
        number: '202',
        url: 'https://github.com/example/pr/202',
        title: 'feat: atualizar roteamento',
        state: 'open',
        head_sha: 'abc123',
        branch: 'feature/routing-pr',
        ci_status: 'success',
        review_status: 'approved',
        merged: false,
        last_synced_at: '2025-01-10T12:00:00Z',
        reviewers: [{ id: 'rev-ana', name: 'Ana Moreira', status: 'approved' }],
        ci_results: [
          {
            name: 'ci/tests',
            status: 'success',
            details_url: 'https://ci.example.com/run/101',
          },
        ],
      },
    };

    fetchSpy.mockResolvedValueOnce(mockFetchResponse(applyResponse));

    const response = await postPolicyPlanApply({
      planId: 'plan-routing-1',
      plan: planPayload,
      patch: 'diff --git',
      mode: 'branch_pr',
      actor: 'Joana Planner',
      actorEmail: 'joana@example.com',
      commitMessage: 'feat: atualizar intents e regras',
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/v1/config/apply',
      expect.objectContaining({ method: 'POST' }),
    );
    const requestInit = fetchSpy.mock.calls[0][1] as RequestInit;
    const body = JSON.parse((requestInit.body ?? '{}') as string);
    expect(body).toMatchObject({
      plan_id: 'plan-routing-1',
      plan: planPayload,
      patch: 'diff --git',
      mode: 'branch_pr',
      actor: 'Joana Planner',
      actor_email: 'joana@example.com',
      commit_message: 'feat: atualizar intents e regras',
    });
    expect(response).toMatchObject({
      status: 'completed',
      mode: 'branch_pr',
      planId: 'plan-routing-1',
      recordId: 'rec-routing-1',
      branch: 'feature/routing',
      baseBranch: 'main',
      commitSha: 'abc123',
      hitlRequired: true,
      message: 'Plano aplicado com sucesso.',
    });
    expect(response.pullRequest).toMatchObject({ number: '202', provider: 'github', merged: false });
    expect(response.pullRequest?.branch).toBe('feature/routing-pr');
    expect(response.pullRequest?.reviewers).toEqual([
      { id: 'rev-ana', name: 'Ana Moreira', status: 'approved' },
    ]);
    expect(response.pullRequest?.ciResults).toEqual([
      { name: 'ci/tests', status: 'success', detailsUrl: 'https://ci.example.com/run/101' },
    ]);
  });

  it('envia intents e regras personalizadas na simulação de roteamento', async () => {
    const simulationResponse = {
      total_cost: 120,
      cost_per_million: 10,
      avg_latency: 820,
      reliability_score: 96.5,
      distribution: [
        {
          route: {
            id: 'route-1',
            provider: {
              id: 'provider-turbo-1',
              name: 'Provider Turbo',
              command: 'run-turbo',
              description: 'Turbo provider',
              tags: ['turbo'],
              capabilities: ['chat'],
              transport: 'http',
            },
            lane: 'turbo',
            cost_per_million: 10,
            latency_p95: 700,
            reliability: 0.98,
            capacity_score: 0.9,
          },
          share: 0.6,
          tokens_millions: 6,
          cost: 60,
        },
      ],
      excluded_route: null,
    };

    fetchSpy.mockResolvedValueOnce(mockFetchResponse(simulationResponse));

    const result = await simulateRouting({
      strategy: 'balanced',
      providerIds: ['provider-turbo-1'],
      failoverProviderId: null,
      volumeMillions: 10,
      intents: [
        {
          intent: 'support.assist',
          description: null,
          tags: ['critical'],
          defaultTier: 'turbo',
          fallbackProviderId: 'provider-turbo-1',
        },
      ],
      rules: [
        {
          id: 'force-turbo',
          description: null,
          intent: 'support.assist',
          matcher: "intent == 'support.assist'",
          targetTier: 'turbo',
          providerId: 'provider-turbo-1',
          weight: 75,
        },
      ],
    });

    expect(result.distribution[0].route.provider.name).toBe('Provider Turbo');
    const requestInit = fetchSpy.mock.calls[0][1] as RequestInit;
    const body = JSON.parse((requestInit.body ?? '{}') as string);
    expect(body.strategy).toBe('balanced');
    expect(body.provider_ids).toEqual(['provider-turbo-1']);
    expect(body.intents).toEqual([
      {
        intent: 'support.assist',
        description: undefined,
        tags: ['critical'],
        default_tier: 'turbo',
        fallback_provider_id: 'provider-turbo-1',
      },
    ]);
    expect(body.custom_rules).toEqual([
      {
        id: 'force-turbo',
        description: undefined,
        intent: 'support.assist',
        matcher: "intent == 'support.assist'",
        target_tier: 'turbo',
        provider_id: 'provider-turbo-1',
        weight: 75,
      },
    ]);
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

  it('requests telemetry experiments with filters', async () => {
    const payload = { items: [] };
    fetchSpy.mockResolvedValueOnce(mockFetchResponse(payload));

    const start = new Date('2024-03-01T00:00:00Z');
    await fetchTelemetryExperiments({ start, lane: 'balanced' });

    expect(fetchSpy).toHaveBeenCalledWith(
      `/api/v1/telemetry/experiments?start=${encodeURIComponent(start.toISOString())}&lane=balanced`,
      expect.objectContaining({
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
      }),
    );
  });

  it('requests telemetry lane costs', async () => {
    const payload = { items: [] };
    fetchSpy.mockResolvedValueOnce(mockFetchResponse(payload));

    await fetchTelemetryLaneCosts({ providerId: 'glm46' });

    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/v1/telemetry/lane-costs?provider_id=glm46',
      expect.objectContaining({
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
      }),
    );
  });

  it('requests marketplace performance metrics', async () => {
    const payload = { items: [] };
    fetchSpy.mockResolvedValueOnce(mockFetchResponse(payload));

    await fetchMarketplacePerformance({ route: 'default' });

    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/v1/telemetry/marketplace/performance?route=default',
      expect.objectContaining({
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
      }),
    );
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

  it('maps security users payloads and normalizes fields', async () => {
    fetchSpy.mockResolvedValueOnce(
      mockFetchResponse({
        users: [
          {
            id: 'user-1',
            name: 'Ana Silva',
            email: 'ana@empresa.com',
            roles: ['role-ops'],
            status: 'active',
            created_at: '2024-03-01T12:00:00Z',
            last_seen_at: '2024-03-05T09:30:00Z',
            mfa_enabled: true,
          },
        ],
      }),
    );

    const users = await fetchSecurityUsers();

    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/v1/security/users',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(users).toEqual([
      {
        id: 'user-1',
        name: 'Ana Silva',
        email: 'ana@empresa.com',
        roles: ['role-ops'],
        status: 'active',
        createdAt: '2024-03-01T12:00:00Z',
        lastSeenAt: '2024-03-05T09:30:00Z',
        mfaEnabled: true,
      },
    ]);
  });

  it('creates security users with MFA flag persisted in the request body', async () => {
    fetchSpy.mockResolvedValueOnce(
      mockFetchResponse({
        id: 'user-2',
        name: 'Bruno',
        email: 'bruno@empresa.com',
        roles: [],
        status: 'invited',
        created_at: '2024-04-01T12:00:00Z',
        last_seen_at: null,
        mfa_enabled: false,
      }),
    );

    await createSecurityUser({
      name: 'Bruno',
      email: 'bruno@empresa.com',
      roles: [],
      status: 'invited',
      mfaEnabled: false,
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/v1/security/users',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          name: 'Bruno',
          email: 'bruno@empresa.com',
          roles: [],
          status: 'invited',
          mfa_enabled: false,
        }),
      }),
    );
  });

  it('rotates API keys and returns the new secret payload', async () => {
    fetchSpy.mockResolvedValueOnce(
      mockFetchResponse({
        key: {
          id: 'key-1',
          name: 'Prod',
          owner: 'observability',
          scopes: ['mcp:invoke'],
          status: 'active',
          created_at: '2024-01-01T00:00:00Z',
          last_used_at: null,
          expires_at: null,
          token_preview: 'prod****',
        },
        secret: 'mcp_prod_secret',
      }),
    );

    const result = await rotateSecurityApiKey('key-1');

    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/v1/security/api-keys/key-1/rotate',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(result.secret).toBe('mcp_prod_secret');
    expect(result.key.tokenPreview).toBe('prod****');
  });

  it('fetches paginated audit logs with filters applied', async () => {
    fetchSpy.mockResolvedValueOnce(
      mockFetchResponse({
        events: [
          {
            id: 'log-1',
            created_at: '2024-04-10T10:00:00Z',
            actor_id: 'user-1',
            actor_name: 'Ana Silva',
            actor_roles: ['approver'],
            action: 'security.users.list',
            resource: '/security/users',
            status: 'success',
            plan_id: null,
            metadata: { count: 2 },
          },
        ],
        page: 1,
        page_size: 25,
        total: 1,
        total_pages: 1,
      }),
    );

    const result = await fetchAuditLogs({
      actor: 'Ana Silva',
      action: 'security.users',
      start: '2024-04-01T00:00:00Z',
      end: '2024-04-30T23:59:59Z',
      page: 1,
      pageSize: 25,
    });

    const [requestUrl, requestInit] = fetchSpy.mock.calls.at(-1)!;
    const parsedUrl = new URL(requestUrl, 'https://example.com');

    expect(parsedUrl.pathname).toBe('/api/v1/audit/logs');
    expect(Object.fromEntries(parsedUrl.searchParams.entries())).toEqual({
      page: '1',
      page_size: '25',
      actor: 'Ana Silva',
      action: 'security.users',
      start: '2024-04-01T00:00:00Z',
      end: '2024-04-30T23:59:59Z',
    });
    expect(requestInit).toEqual(expect.objectContaining({ method: 'GET' }));
    expect(result.events).toEqual([
      {
        id: 'log-1',
        createdAt: '2024-04-10T10:00:00Z',
        actorId: 'user-1',
        actorName: 'Ana Silva',
        actorRoles: ['approver'],
        action: 'security.users.list',
        resource: '/security/users',
        status: 'success',
        planId: null,
        metadata: { count: 2 },
      },
    ]);
    expect(result.total).toBe(1);
    expect(result.totalPages).toBe(1);
  });

  it('fetches audit trail events grouped por recurso', async () => {
    fetchSpy.mockResolvedValueOnce(
      mockFetchResponse({
        events: [
          {
            id: 'audit-1',
            timestamp: '2024-04-10T10:00:00Z',
            actor: 'ana@empresa.com',
            action: 'role.assigned',
            target: 'user-1',
            description: 'Atribuiu papel Operações',
            metadata: { reason: 'onboarding' },
          },
        ],
      }),
    );

    const events = await fetchSecurityAuditTrail('user', 'user-1');

    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/v1/security/audit/user/user-1',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(events).toEqual([
      {
        id: 'audit-1',
        timestamp: '2024-04-10T10:00:00Z',
        actor: 'ana@empresa.com',
        action: 'role.assigned',
        target: 'user-1',
        description: 'Atribuiu papel Operações',
        metadata: { reason: 'onboarding' },
      },
    ]);
  });
});
