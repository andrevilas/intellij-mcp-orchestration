import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import FinOps from './FinOps';
import type {
  ProviderSummary,
  PolicyManifestSnapshot,
  PolicyManifestUpdateInput,
  PolicyPlanResponse,
  ConfigPlanDiffSummary,
  TelemetryTimeseriesPoint,
  TelemetryRouteBreakdownEntry,
} from '../api';
import {
  fetchPolicyManifest,
  fetchTelemetryTimeseries,
  fetchTelemetryRuns,
  fetchTelemetryPareto,
  fetchTelemetryExperiments,
  fetchTelemetryLaneCosts,
  fetchMarketplacePerformance,
  fetchFinOpsSprintReports,
  fetchFinOpsPullRequestReports,
  patchConfigPoliciesPlan,
  postPolicyPlanApply,
} from '../api';
import { ThemeProvider } from '../theme/ThemeContext';
import { ToastProvider } from '../components/feedback/ToastProvider';

type ApiModule = typeof import('../api');

declare global {
  // eslint-disable-next-line no-var
  var crypto: Crypto;
  // eslint-disable-next-line no-var
  var ResizeObserver: typeof ResizeObserver;
}

class ResizeObserverMock {
  observe() {
    /* noop */
  }
  unobserve() {
    /* noop */
  }
  disconnect() {
    /* noop */
  }
}

Object.defineProperty(globalThis, 'ResizeObserver', {
  configurable: true,
  writable: true,
  value: ResizeObserverMock,
});

vi.mock('../api', async () => {
  const actual = await vi.importActual<ApiModule>('../api');
  return {
    ...actual,
    fetchPolicyManifest: vi.fn(),
    fetchTelemetryTimeseries: vi.fn(),
    fetchTelemetryRuns: vi.fn(),
    fetchTelemetryPareto: vi.fn(),
    fetchTelemetryExperiments: vi.fn(),
    fetchTelemetryLaneCosts: vi.fn(),
    fetchMarketplacePerformance: vi.fn(),
    fetchFinOpsSprintReports: vi.fn(),
    fetchFinOpsPullRequestReports: vi.fn(),
    patchConfigPoliciesPlan: vi.fn(),
    postPolicyPlanApply: vi.fn(),
  } satisfies Partial<ApiModule>;
});

describe('FinOps page planning workflow', () => {
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
  ];

  const fetchManifestMock = fetchPolicyManifest as unknown as Mock;
  const patchPlanMock = patchConfigPoliciesPlan as unknown as Mock;
  const applyPlanMock = postPolicyPlanApply as unknown as Mock;
  const fetchTelemetryTimeseriesMock = fetchTelemetryTimeseries as unknown as Mock;
  const fetchTelemetryRunsMock = fetchTelemetryRuns as unknown as Mock;
  const fetchTelemetryParetoMock = fetchTelemetryPareto as unknown as Mock;
  const fetchTelemetryExperimentsMock = fetchTelemetryExperiments as unknown as Mock;
  const fetchTelemetryLaneCostsMock = fetchTelemetryLaneCosts as unknown as Mock;
  const fetchMarketplacePerformanceMock = fetchMarketplacePerformance as unknown as Mock;
  const fetchFinOpsSprintReportsMock = fetchFinOpsSprintReports as unknown as Mock;
  const fetchFinOpsPullRequestReportsMock = fetchFinOpsPullRequestReports as unknown as Mock;

  function isoDayFromOffset(offset: number): string {
    const base = new Date();
    base.setHours(0, 0, 0, 0);
    base.setDate(base.getDate() - offset);
    return base.toISOString().slice(0, 10);
  }

  function buildTimeseriesFixture(): TelemetryTimeseriesPoint[] {
    return Array.from({ length: 10 }, (_, index) => {
      const offset = 9 - index;
      const isBaselineWindow = offset >= 7;
      const costUsd = isBaselineWindow ? 110 : 240;
      const tokensIn = isBaselineWindow ? 550_000 : 900_000;
      const tokensOut = isBaselineWindow ? 450_000 : 900_000;
      return {
        day: isoDayFromOffset(offset),
        provider_id: 'glm',
        run_count: 12,
        tokens_in: tokensIn,
        tokens_out: tokensOut,
        cost_usd: costUsd,
        avg_latency_ms: isBaselineWindow ? 980 : 2100,
        success_count: isBaselineWindow ? 11 : 9,
      } satisfies TelemetryTimeseriesPoint;
    });
  }

  function buildParetoFixture(providers: ProviderSummary[]): TelemetryRouteBreakdownEntry[] {
    const provider = providers[0];
    return [
      {
        id: `${provider.id}-default`,
        provider_id: provider.id,
        provider_name: provider.name,
        route: null,
        lane: 'balanced',
        run_count: 420,
        tokens_in: 3_200_000,
        tokens_out: 3_000_000,
        cost_usd: 1200,
        avg_latency_ms: 2450,
        success_rate: 0.82,
      },
      {
        id: `${provider.id}-fallback`,
        provider_id: provider.id,
        provider_name: provider.name,
        route: 'fallback',
        lane: 'turbo',
        run_count: 180,
        tokens_in: 1_000_000,
        tokens_out: 800_000,
        cost_usd: 500,
        avg_latency_ms: 1820,
        success_rate: 0.88,
      },
      {
        id: `${provider.id}-cache`,
        provider_id: provider.id,
        provider_name: provider.name,
        route: 'cache',
        lane: 'economy',
        run_count: 90,
        tokens_in: 600_000,
        tokens_out: 400_000,
        cost_usd: 300,
        avg_latency_ms: 910,
        success_rate: 0.97,
      },
    ];
  }

  beforeEach(() => {
    vi.clearAllMocks();
    fetchTelemetryTimeseriesMock.mockResolvedValue({ items: buildTimeseriesFixture() });
    fetchTelemetryRunsMock.mockResolvedValue({ items: [] });
    fetchTelemetryParetoMock.mockResolvedValue({ items: buildParetoFixture(providers) });
    fetchTelemetryExperimentsMock.mockResolvedValue({ items: [] });
    fetchTelemetryLaneCostsMock.mockResolvedValue({ items: [] });
    fetchMarketplacePerformanceMock.mockResolvedValue({ items: [] });
    fetchFinOpsSprintReportsMock.mockResolvedValue([]);
    fetchFinOpsPullRequestReportsMock.mockResolvedValue([]);

    const snapshot: PolicyManifestSnapshot = {
      policies: { confidence: null },
      routing: {
        defaultTier: 'balanced',
        allowedTiers: ['balanced', 'turbo'],
        fallbackTier: 'economy',
        maxAttempts: 2,
        maxIters: 4,
        requestTimeoutSeconds: 30,
        totalTimeoutSeconds: 120,
        intents: [],
        rules: [],
      },
      finops: {
        costCenter: 'finops-core',
        budgets: [
          { tier: 'economy', amount: 1200, currency: 'USD', period: 'monthly', adaptive: null },
          { tier: 'balanced', amount: 3400, currency: 'USD', period: 'monthly', adaptive: null },
        ],
        alerts: [
          { threshold: 0.75, channel: 'slack' },
          { threshold: 0.9, channel: 'email' },
        ],
        abHistory: [],
        cache: { ttlSeconds: 600 },
        rateLimit: { requestsPerMinute: 180 },
        gracefulDegradation: { strategy: 'fallback', message: 'Servindo rotas alternativas' },
      },
      hitl: {
        enabled: false,
        checkpoints: [],
        pendingApprovals: 0,
        lastUpdated: null,
      },
      runtime: {
        maxIters: 4,
        timeouts: { perIteration: 30, total: 120 },
        retry: { maxAttempts: 2, initialDelay: 1, backoffFactor: 2, maxDelay: 4 },
        tracing: { enabled: true, sampleRate: 0.2, exporter: null },
      },
      overrides: null,
      updatedAt: '2025-04-01T12:00:00Z',
    };

    fetchManifestMock.mockResolvedValue(snapshot);

    const planDiffs: ConfigPlanDiffSummary[] = [
      { path: 'policies/manifest.json', summary: 'Atualizar manifesto FinOps', changeType: 'update', diff: '---' },
    ];
    const planResponse: PolicyPlanResponse = {
      plan: {
        intent: 'edit_finops',
        summary: 'Atualizar políticas FinOps',
        steps: [
          {
            id: 'update-finops',
            title: 'Atualizar budgets e alertas',
            description: 'Escrever ajustes no manifesto.',
            dependsOn: [],
            actions: [
              {
                type: 'write',
                path: 'policies/manifest.json',
                contents: '{"finops": {}}',
                encoding: 'utf-8',
                overwrite: true,
              },
            ],
          },
        ],
        diffs: planDiffs,
        risks: [],
        status: 'pending',
        context: [],
        approvalRules: [],
      },
      planPayload: { intent: 'edit_finops', summary: 'Atualizar políticas FinOps', status: 'pending' },
      preview: {
        branch: 'chore/finops-plan',
        baseBranch: 'main',
        commitMessage: 'chore: atualizar finops',
        pullRequest: { provider: 'github', title: 'Atualizar políticas FinOps' },
      },
      previewPayload: null,
    };

    patchPlanMock.mockResolvedValue(planResponse);

    applyPlanMock.mockResolvedValue({
      status: 'completed',
      mode: 'branch_pr',
      planId: 'finops-plan-test',
      recordId: 'rec-1',
      branch: 'chore/finops-plan',
      baseBranch: 'main',
      commitSha: 'abc123',
      diff: { stat: '1 file changed', patch: 'diff --git a/policies/manifest.json b/policies/manifest.json' },
      hitlRequired: false,
      message: 'Plano aplicado com sucesso.',
      pullRequest: {
        provider: 'github',
        id: 'pr-99',
        number: '99',
        url: 'https://github.com/mcp/finops/pull/99',
        title: 'chore: atualizar finops',
        state: 'open',
        headSha: 'abc123',
        branch: 'chore/finops-plan',
        ciStatus: 'success',
        reviewStatus: 'approved',
        merged: false,
        reviewers: [],
        ciResults: [],
      },
    });

    Object.defineProperty(globalThis, 'crypto', {
      value: { randomUUID: () => 'finops-plan-test' },
      configurable: true,
    });
  });

  afterEach(() => {
    // @ts-expect-error override cleanup for tests
    delete globalThis.crypto;
  });

  it('gera e aplica plano FinOps com TTL e rate limit', async () => {
    render(
      <ThemeProvider>
        <ToastProvider>
          <FinOps providers={providers} isLoading={false} initialError={null} />
        </ToastProvider>
      </ThemeProvider>,
    );

    await waitFor(() => expect(fetchManifestMock).toHaveBeenCalled());
    await waitFor(() => expect(fetchTelemetryTimeseriesMock).toHaveBeenCalled());

    await waitFor(() =>
      expect(screen.getByTestId('finops-alert-cost-surge')).toBeInTheDocument(),
    );

    expect(screen.getByText('Escalada de custo diário')).toBeInTheDocument();
    expect(screen.getByText('Pico de tokens consumidos')).toBeInTheDocument();
    expect(screen.getByText('Custo concentrado em uma rota')).toBeInTheDocument();
    expect(screen.getByText('Taxa de sucesso abaixo do esperado')).toBeInTheDocument();

    const hotspots = screen.getByTestId('finops-hotspots');
    expect(within(hotspots).getByTestId('finops-hotspot-cost-glm-default')).toBeInTheDocument();
    expect(within(hotspots).getByText('Rota domina o custo')).toBeInTheDocument();
    expect(within(hotspots).getByText('Queda na confiabilidade')).toBeInTheDocument();
    expect(within(hotspots).getByText('Latência elevada')).toBeInTheDocument();
    expect(within(hotspots).getByText('Custo por token acima da média')).toBeInTheDocument();

    const generateButton = await screen.findByRole('button', { name: 'Gerar plano FinOps' });
    await userEvent.click(generateButton);

    await waitFor(() => expect(patchPlanMock).toHaveBeenCalled());

    const request = patchPlanMock.mock.calls[0][0] as {
      changes: PolicyManifestUpdateInput;
    };
    expect(request.changes.finops?.cache?.ttlSeconds).toBe(600);
    expect(request.changes.finops?.rateLimit?.requestsPerMinute).toBe(180);
    expect(request.changes.finops?.gracefulDegradation?.strategy).toBe('fallback');
    expect(request.changes.finops?.alerts).toHaveLength(2);

    await waitFor(() =>
      expect(screen.getAllByText('Atualizar políticas FinOps').length).toBeGreaterThanOrEqual(1),
    );
    expect(screen.getByText('policies/manifest.json')).toBeInTheDocument();

    const applyButton = screen.getByRole('button', { name: 'Aplicar plano' });
    await userEvent.click(applyButton);

    await waitFor(() => expect(applyPlanMock).toHaveBeenCalled());
    const policyHeading = screen.getByRole('heading', { name: 'Budgets e alertas determinísticos' });
    const policySection = policyHeading.closest('section');
    expect(policySection).not.toBeNull();
    if (policySection) {
      expect(within(policySection).getByText(/Plano aplicado com sucesso/)).toBeInTheDocument();
    }
    expect(screen.getByText('Aplicado')).toBeInTheDocument();
  });
});
