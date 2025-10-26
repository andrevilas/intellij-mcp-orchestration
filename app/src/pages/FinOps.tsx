import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { createTwoFilesPatch } from 'diff';

import type {
  ProviderSummary,
  TelemetryRouteBreakdownEntry,
  TelemetryRunEntry,
  TelemetryTimeseriesPoint,
  PolicyManifestSnapshot,
  FinOpsBudget,
  FinOpsAlertThreshold,
  PolicyManifestUpdateInput,
  TelemetryExperimentSummaryEntry,
  TelemetryLaneCostEntry,
  MarketplacePerformanceEntry,
} from '../api';
import {
  fetchFinOpsPullRequestReports,
  fetchFinOpsSprintReports,
  fetchTelemetryPareto,
  fetchTelemetryRuns,
  fetchTelemetryTimeseries,
  fetchTelemetryExportDocument,
  fetchTelemetryExperiments,
  fetchTelemetryLaneCosts,
  fetchMarketplacePerformance,
  fetchPolicyManifest,
  patchConfigPoliciesPlan,
  postPolicyPlanApply,
  type BudgetPeriod,
  type HitlEscalationChannel,
  type RoutingTierId,
  type FinOpsPullRequestReportPayload,
  type FinOpsSprintReportPayload,
  type ReportStatus,
  type PolicyPlanResponse,
  type ConfigPlanDiffSummary,
  type ConfigPlanPreview,
  type AdminPlanSummary,
  type AdminPlanPullRequestSummary,
  type PlanExecutionPullRequest,
} from '../api';
import PlanDiffViewer, { type PlanDiffItem } from '../components/PlanDiffViewer';
import ConfirmationModal from '../components/modals/ConfirmationModal';
import type {
  FinOpsMetricAccessor,
  FinOpsTimeseriesDatum,
} from '../components/charts/FinOpsTimeseriesChart';
import PlanSummary from './AdminChat/PlanSummary';
import { useToastNotification } from '../hooks/useToastNotification';
import { describeFixtureRequest } from '../utils/fixtureStatus';
import { FINOPS_TEST_IDS } from './testIds';

import './FinOps.scss';

let finOpsChartsModulePromise:
  | Promise<typeof import('../components/charts/FinOpsTimeseriesChart')>
  | null = null;

const loadFinOpsChartsModule = () => {
  if (!finOpsChartsModulePromise) {
    finOpsChartsModulePromise = import('../components/charts/FinOpsTimeseriesChart');
  }
  return finOpsChartsModulePromise;
};

const FinOpsTimeseriesChart = lazy(async () => {
  const module = await loadFinOpsChartsModule();
  return { default: module.FinOpsTimeseriesChart };
});

export interface FinOpsProps {
  providers: ProviderSummary[];
  isLoading: boolean;
  initialError: string | null;
}

type RangeOption = '7d' | '30d' | '90d';
type MetricOption = 'cost' | 'tokens';

type ProviderSelection = 'all' | string;

type LaneCategory = 'economy' | 'balanced' | 'turbo';

type TimeSeriesPoint = FinOpsTimeseriesDatum;

interface AggregatedMetrics {
  totalCost: number;
  totalTokens: number;
  averageLatency: number;
  costPerMillion: number;
}

interface RouteCostBreakdown {
  id: string;
  providerId: string;
  providerName: string;
  label: string;
  lane: LaneCategory;
  route: string | null;
  costUsd: number;
  tokensMillions: number;
  runs: number;
  successRate: number;
  avgLatencyMs: number;
}

interface ParetoEntry extends RouteCostBreakdown {
  share: number;
  cumulativeShare: number;
}

type RunStatus = 'success' | 'retry' | 'error';

interface RunDrilldownEntry {
  id: string;
  timestamp: string;
  tokensThousands: number;
  costUsd: number;
  latencyMs: number;
  status: RunStatus;
  consumer: string;
}

interface ExperimentView {
  key: string;
  cohort: string | null;
  tag: string | null;
  runCount: number;
  successRate: number;
  errorRate: number;
  avgLatencyMs: number;
  totalCostUsd: number;
  tokensMillions: number;
  mttrMs: number | null;
  recoveryEvents: number;
}

interface LaneCostView {
  lane: LaneCategory;
  runCount: number;
  totalCostUsd: number;
  tokensMillions: number;
  avgLatencyMs: number;
  costShare: number;
  costPerMillion: number;
}

interface MarketplaceRowView {
  id: string;
  name: string;
  origin: string;
  rating: number;
  cost: number;
  runCount: number;
  successRate: number;
  avgLatencyMs: number;
  totalCostUsd: number;
  tokensMillions: number;
  cohorts: string[];
  adoptionScore: number;
}

interface SprintReport {
  id: string;
  name: string;
  periodLabel: string;
  totalCostUsd: number;
  totalTokensMillions: number;
  costDelta: number;
  status: ReportStatus;
  summary: string;
}

interface PullRequestReport {
  id: string;
  title: string;
  owner: string;
  mergedAtLabel: string;
  costImpactUsd: number;
  costDelta: number;
  tokensImpactMillions: number;
  status: ReportStatus;
  summary: string;
}

type FinOpsAlertKind = 'warning' | 'error' | 'info';

interface FinOpsAlert {
  id: string;
  kind: FinOpsAlertKind;
  title: string;
  description: string;
}

type HotspotKind = 'cost' | 'latency' | 'reliability' | 'efficiency';
type HotspotSeverity = 'critical' | 'high' | 'medium';

interface FinOpsHotspot {
  id: string;
  kind: HotspotKind;
  severity: HotspotSeverity;
  title: string;
  summary: string;
  metricLabel: string;
  metricValue: string;
  recommendation: string;
}

const HOTSPOT_KIND_LABEL: Record<HotspotKind, string> = {
  cost: 'Custo',
  latency: 'Latência',
  reliability: 'Confiabilidade',
  efficiency: 'Eficiência',
};

const TIER_LABEL: Record<RoutingTierId, string> = {
  economy: 'Economy',
  balanced: 'Balanced',
  turbo: 'Turbo',
};

const POLICY_MANIFEST_ID = 'manifest';

const GRACEFUL_STRATEGIES = [
  { value: 'fallback', label: 'Fallback automático' },
  { value: 'throttle', label: 'Throttle progressivo' },
  { value: 'static', label: 'Resposta estática' },
  { value: 'none', label: 'Desabilitar degradação' },
] as const;

type GracefulStrategyOption = (typeof GRACEFUL_STRATEGIES)[number]['value'];

type PendingFinOpsPlan = {
  id: string;
  plan: PolicyPlanResponse['plan'];
  planPayload: PolicyPlanResponse['planPayload'];
  patch: string;
  diffs: PlanDiffItem[];
  nextSnapshot: PolicyManifestSnapshot;
};

function generatePlanId(): string {
  const cryptoApi = (globalThis as { crypto?: Crypto }).crypto;
  if (cryptoApi && typeof cryptoApi.randomUUID === 'function') {
    return `finops-plan-${cryptoApi.randomUUID()}`;
  }
  return `finops-plan-${Date.now()}`;
}

function cloneManifest(snapshot: PolicyManifestSnapshot): PolicyManifestSnapshot {
  return JSON.parse(JSON.stringify(snapshot)) as PolicyManifestSnapshot;
}

function formatManifestSnapshot(snapshot: PolicyManifestSnapshot): string {
  return `${JSON.stringify(snapshot, null, 2)}\n`;
}

function applyFinOpsUpdateToSnapshot(
  current: PolicyManifestSnapshot,
  update: PolicyManifestUpdateInput,
): PolicyManifestSnapshot {
  const next = cloneManifest(current);
  if (!update.finops) {
    return next;
  }

  const finops = next.finops;
  if (update.finops.costCenter !== undefined) {
    finops.costCenter = update.finops.costCenter ?? finops.costCenter;
  }
  if (update.finops.budgets) {
    finops.budgets = update.finops.budgets.map((budget) => ({ ...budget }));
  } else if (update.finops.budgets === null) {
    finops.budgets = [];
  }
  if (update.finops.alerts) {
    finops.alerts = update.finops.alerts.map((alert) => ({ ...alert }));
  } else if (update.finops.alerts === null) {
    finops.alerts = [];
  }
  if (update.finops.cache !== undefined) {
    finops.cache = update.finops.cache
      ? { ttlSeconds: update.finops.cache.ttlSeconds ?? null }
      : { ttlSeconds: null };
  }
  if (update.finops.rateLimit !== undefined) {
    finops.rateLimit = update.finops.rateLimit
      ? { requestsPerMinute: update.finops.rateLimit.requestsPerMinute ?? null }
      : { requestsPerMinute: null };
  }
  if (update.finops.gracefulDegradation !== undefined) {
    finops.gracefulDegradation = update.finops.gracefulDegradation
      ? {
          strategy: update.finops.gracefulDegradation.strategy ?? null,
          message: update.finops.gracefulDegradation.message ?? null,
        }
      : { strategy: null, message: null };
  }

  next.updatedAt = new Date().toISOString();
  return next;
}

function mapPlanDiffItems(diffs: ConfigPlanDiffSummary[], manifestPatch: string): PlanDiffItem[] {
  const hasManifestPatch = manifestPatch.trim().length > 0;

  if (!diffs || diffs.length === 0) {
    if (!hasManifestPatch) {
      throw new Error('Plano FinOps não retornou diff para o manifesto.');
    }
    return [
      {
        id: 'finops-manifest',
        title: 'policies/manifest.json',
        summary: 'Atualizar políticas financeiras e limites operacionais',
        diff: manifestPatch,
      },
    ];
  }

  return diffs.map((diff, index) => {
    const isManifestFile = diff.path.endsWith('manifest.json');
    if (isManifestFile && !hasManifestPatch) {
      throw new Error('Plano FinOps não forneceu diff detalhado do manifesto.');
    }

    const diffContent = isManifestFile ? manifestPatch : diff.diff ?? '';
    if (!diffContent.trim()) {
      throw new Error(`Plano FinOps retornou diff vazio para ${diff.path}.`);
    }

    return {
      id: `${diff.path}-${index}`,
      title: diff.path,
      summary: diff.summary,
      diff: diffContent,
    };
  });
}

function mapPreviewPullRequest(preview: ConfigPlanPreview | null): AdminPlanPullRequestSummary | null {
  const pr = preview?.pullRequest;
  if (!pr) {
    return null;
  }
  const identifier = pr.title?.trim() || 'finops-preview-pr';
  return {
    id: identifier,
    number: '',
    title: pr.title,
    url: '',
    state: 'draft',
    reviewStatus: null,
    reviewers: [],
    branch: preview?.branch ?? null,
    ciResults: [],
  };
}

function mapExecutionPullRequest(pr: PlanExecutionPullRequest | null): AdminPlanPullRequestSummary | null {
  if (!pr) {
    return null;
  }
  return {
    id: pr.id,
    number: pr.number,
    title: pr.title,
    url: pr.url,
    state: pr.state,
    reviewStatus: pr.reviewStatus ?? null,
    reviewers: pr.reviewers ?? [],
    branch: pr.branch ?? null,
    ciResults: pr.ciResults ?? [],
  };
}

function buildPlanSummary(
  planId: string,
  plan: PolicyPlanResponse['plan'],
  preview: ConfigPlanPreview | null,
): AdminPlanSummary {
  const generatedAt = new Date().toISOString();
  const steps = plan.steps.map((step, index) => {
    const impact = step.actions
      .map((action) => `${action.type.toUpperCase()} ${action.path}`.trim())
      .join('\n');
    return {
      id: step.id || `finops-step-${index}`,
      title: step.title,
      description: step.description,
      status: 'ready' as const,
      impact: impact.length > 0 ? impact : null,
    };
  });

  return {
    id: planId,
    threadId: 'finops-manifest',
    status: 'ready',
    generatedAt,
    author: 'Console MCP',
    scope: plan.summary || 'Atualizar políticas FinOps',
    steps,
    branch: preview?.branch ?? null,
    baseBranch: preview?.baseBranch ?? null,
    reviewers: [],
    pullRequest: mapPreviewPullRequest(preview),
  };
}

const PERIOD_OPTIONS: Array<{ value: BudgetPeriod; label: string }> = [
  { value: 'daily', label: 'Diário' },
  { value: 'weekly', label: 'Semanal' },
  { value: 'monthly', label: 'Mensal' },
];

const ESCALATION_OPTIONS: Array<{ value: HitlEscalationChannel; label: string }> = [
  { value: 'slack', label: 'Slack' },
  { value: 'email', label: 'E-mail' },
  { value: 'pagerduty', label: 'PagerDuty' },
];

interface BudgetRow extends Omit<FinOpsBudget, 'amount'> {
  amount: string;
}

interface BudgetRowErrors {
  amount?: string;
  currency?: string;
}

interface AlertRow extends Omit<FinOpsAlertThreshold, 'threshold'> {
  threshold: string;
}

interface AlertRowErrors {
  threshold?: string;
}

const HOTSPOT_SEVERITY_LABEL: Record<HotspotSeverity, string> = {
  critical: 'Crítico',
  high: 'Alto',
  medium: 'Médio',
};

const HOTSPOT_SEVERITY_WEIGHT: Record<HotspotSeverity, number> = {
  critical: 3,
  high: 2,
  medium: 1,
};

const COST_SURGE_THRESHOLD = 0.25;
const TOKENS_SURGE_THRESHOLD = 0.25;
const TOKENS_DROP_THRESHOLD = 0.2;
const COST_CONCENTRATION_THRESHOLD = 0.35;
const SUCCESS_RATE_ALERT_THRESHOLD = 0.97;

const RANGE_TO_DAYS: Record<RangeOption, number> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
};

const METRIC_CONFIG: Record<
  MetricOption,
  { label: string; accessor: FinOpsMetricAccessor; formatter: (value: number) => string }
>
  = {
    cost: {
      label: 'Custo (USD)',
      accessor: 'costUsd',
      formatter: (value: number) =>
        new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'USD', maximumFractionDigits: value >= 1000 ? 0 : 2 }).format(value),
    },
    tokens: {
      label: 'Tokens (milhões)',
      accessor: 'tokensMillions',
      formatter: (value: number) => `${value.toFixed(1)} mi`,
    },
  };

const LANE_CONFIG: Record<
  LaneCategory,
  { label: string; costMultiplier: number; tokenMultiplier: number; latencyDivider: number }
> = {
  economy: { label: 'Economy', costMultiplier: 0.82, tokenMultiplier: 1.1, latencyDivider: 0.85 },
  balanced: { label: 'Balanced', costMultiplier: 1, tokenMultiplier: 1, latencyDivider: 1 },
  turbo: { label: 'Turbo', costMultiplier: 1.18, tokenMultiplier: 0.92, latencyDivider: 1.25 },
};

function normalizeDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function combineSeries(seriesCollection: TimeSeriesPoint[][]): TimeSeriesPoint[] {
  if (seriesCollection.length === 0) {
    return [];
  }

  const length = seriesCollection[0].length;
  const combined: TimeSeriesPoint[] = [];

  for (let index = 0; index < length; index += 1) {
    const baseDate = seriesCollection[0][index];
    const aggregate = seriesCollection.reduce(
      (acc, series) => {
        const entry = series[index];
        return {
          costUsd: acc.costUsd + entry.costUsd,
          tokensMillions: acc.tokensMillions + entry.tokensMillions,
          avgLatencyMs: acc.avgLatencyMs + entry.avgLatencyMs,
        };
      },
      { costUsd: 0, tokensMillions: 0, avgLatencyMs: 0 },
    );

    combined.push({
      date: baseDate.date,
      label: baseDate.label,
      costUsd: Number(aggregate.costUsd.toFixed(2)),
      tokensMillions: Number(aggregate.tokensMillions.toFixed(2)),
      avgLatencyMs: Math.round(aggregate.avgLatencyMs / seriesCollection.length),
    });
  }

  return combined;
}

function computeMetrics(series: TimeSeriesPoint[]): AggregatedMetrics {
  if (series.length === 0) {
    return { totalCost: 0, totalTokens: 0, averageLatency: 0, costPerMillion: 0 };
  }

  const totals = series.reduce(
    (acc, point) => {
      return {
        cost: acc.cost + point.costUsd,
        tokens: acc.tokens + point.tokensMillions,
        latency: acc.latency + point.avgLatencyMs,
      };
    },
    { cost: 0, tokens: 0, latency: 0 },
  );

  const totalCost = Number(totals.cost.toFixed(2));
  const totalTokens = Number(totals.tokens.toFixed(2));
  const averageLatency = Math.round(totals.latency / series.length);
  const costPerMillion = totalTokens === 0 ? 0 : Number((totalCost / totalTokens).toFixed(2));

  return { totalCost, totalTokens, averageLatency, costPerMillion };
}

function formatLatency(latencyMs: number): string {
  if (!Number.isFinite(latencyMs) || latencyMs <= 0) {
    return '—';
  }
  if (latencyMs >= 1000) {
    return `${(latencyMs / 1000).toFixed(1)} s`;
  }
  return `${latencyMs} ms`;
}

function formatPercent(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 1 }).format(value);
}

function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(date);
}

function formatDurationMs(value: number | null): string {
  if (value === null || !Number.isFinite(value) || value <= 0) {
    return '—';
  }
  if (value >= 3_600_000) {
    return `${(value / 3_600_000).toFixed(1)} h`;
  }
  if (value >= 60_000) {
    return `${(value / 60_000).toFixed(1)} min`;
  }
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)} s`;
  }
  return `${Math.round(value)} ms`;
}

function formatTokensMillions(value: number): string {
  const normalized = Number.isFinite(value) ? value : 0;
  const digits = normalized >= 10 ? 1 : 2;
  return `${new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(normalized)} mi`;
}

type NumericSeriesKey = 'costUsd' | 'tokensMillions';

function averageSeries(series: TimeSeriesPoint[], key: NumericSeriesKey): number {
  if (series.length === 0) {
    return 0;
  }

  const total = series.reduce((sum, point) => sum + point[key], 0);
  return total / series.length;
}

function formatSignedPercent(value: number): string {
  const formatter = new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 1 });
  const formatted = formatter.format(Math.abs(value));
  return value >= 0 ? `+${formatted}` : `-${formatted}`;
}

function computeWindowBounds(days: number): { start: Date; end: Date } {
  const end = new Date();
  end.setHours(0, 0, 0, 0);
  const start = new Date(end);
  start.setDate(end.getDate() - (days - 1));
  return { start, end };
}

function resolveSeriesStart(
  items: TelemetryTimeseriesPoint[],
  fallbackStart: Date,
  days: number,
): Date {
  const reference = new Date(fallbackStart);
  reference.setUTCHours(0, 0, 0, 0);

  let latestDay: string | null = null;
  for (const item of items) {
    if (!latestDay || item.day > latestDay) {
      latestDay = item.day;
    }
  }

  if (!latestDay) {
    return reference;
  }

  const referenceEnd = new Date(`${latestDay}T00:00:00Z`);
  const start = new Date(referenceEnd);
  start.setUTCDate(referenceEnd.getUTCDate() - (days - 1));
  return start;
}

function buildSeriesFromTelemetry(
  items: TelemetryTimeseriesPoint[],
  start: Date,
  days: number,
): TimeSeriesPoint[] {
  const map = new Map(items.map((item) => [item.day, item]));
  const cursor = resolveSeriesStart(items, start, days);
  const series: TimeSeriesPoint[] = [];

  for (let index = 0; index < days; index += 1) {
    const dayKey = normalizeDate(cursor);
    const entry = map.get(dayKey);
    const cost = entry ? entry.cost_usd : 0;
    const tokens = entry ? entry.tokens_in + entry.tokens_out : 0;
    const latency = entry ? Math.round(entry.avg_latency_ms) : 0;

    series.push({
      date: dayKey,
      label: new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(cursor),
      costUsd: Number(cost.toFixed(2)),
      tokensMillions: Number((tokens / 1_000_000).toFixed(2)),
      avgLatencyMs: latency,
    });

    cursor.setDate(cursor.getDate() + 1);
  }

  return series;
}

function slugifyIdentifier(value: string): string {
  const normalized = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return normalized.length > 0 ? normalized : 'route';
}

function buildRouteIdentifier(providerId: string, routeLabel: string): string {
  const baseProvider = providerId.trim() || 'provider';
  const baseRoute = routeLabel.trim() || 'route';
  return slugifyIdentifier(`${baseProvider}-${baseRoute}`);
}

function buildRouteBreakdownFromTelemetry(
  entries: TelemetryRouteBreakdownEntry[],
): RouteCostBreakdown[] {
  return entries.map((entry) => {
    const tokensTotal = entry.tokens_in + entry.tokens_out;
    const lane = entry.lane as LaneCategory;
    const routeLabel = entry.route ? entry.route : 'default';
    const identifier = buildRouteIdentifier(entry.provider_id ?? 'provider', routeLabel);

    return {
      id: identifier,
      providerId: entry.provider_id,
      providerName: entry.provider_name,
      label: `${entry.provider_name} · ${routeLabel}`,
      lane,
      route: entry.route,
      costUsd: Number(entry.cost_usd.toFixed(2)),
      tokensMillions: Number((tokensTotal / 1_000_000).toFixed(2)),
      runs: entry.run_count,
      successRate: entry.success_rate,
      avgLatencyMs: Math.round(entry.avg_latency_ms),
    };
  });
}

function buildRunsFromTelemetry(entries: TelemetryRunEntry[]): RunDrilldownEntry[] {
  return entries
    .map((entry) => {
      const tokensTotal = entry.tokens_in + entry.tokens_out;
      const status: RunStatus = entry.status === 'success'
        ? 'success'
        : entry.status === 'retry'
          ? 'retry'
          : 'error';
      const metadataConsumer = entry.metadata['consumer'];
      const metadataProject = entry.metadata['project'];
      const consumer =
        typeof metadataConsumer === 'string'
          ? metadataConsumer
          : typeof metadataProject === 'string'
            ? metadataProject
            : '—';

      return {
        id: String(entry.id),
        timestamp: entry.ts,
        tokensThousands: Number((tokensTotal / 1000).toFixed(1)),
        costUsd: Number(entry.cost_usd.toFixed(2)),
        latencyMs: entry.duration_ms,
        status,
        consumer,
      };
    })
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

function formatPeriodLabel(startIso: string, endIso: string): string {
  const formatter = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' });
  const startDate = new Date(startIso);
  const endDate = new Date(endIso);
  return `${formatter.format(startDate)} – ${formatter.format(endDate)}`;
}

function mapSprintReportPayload(payload: FinOpsSprintReportPayload): SprintReport {
  const tokensTotal = payload.total_tokens_in + payload.total_tokens_out;
  return {
    id: payload.id,
    name: payload.name,
    periodLabel: formatPeriodLabel(payload.period_start, payload.period_end),
    totalCostUsd: payload.total_cost_usd,
    totalTokensMillions: Number((tokensTotal / 1_000_000).toFixed(2)),
    costDelta: payload.cost_delta,
    status: payload.status,
    summary: payload.summary,
  };
}

function mapPullRequestReportPayload(payload: FinOpsPullRequestReportPayload): PullRequestReport {
  const mergedAtLabel = payload.merged_at
    ? new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(
        new Date(payload.merged_at),
      )
    : '—';

  return {
    id: payload.id,
    title: payload.title,
    owner: payload.owner || '—',
    mergedAtLabel,
    costImpactUsd: payload.cost_impact_usd,
    costDelta: payload.cost_delta,
    tokensImpactMillions: Number((payload.tokens_impact / 1_000_000).toFixed(2)),
    status: payload.status,
    summary: payload.summary,
  };
}

function computePareto(entries: RouteCostBreakdown[]): ParetoEntry[] {
  if (entries.length === 0) {
    return [];
  }

  const totalCost = entries.reduce((sum, entry) => sum + entry.costUsd, 0);
  let cumulative = 0;

  return entries.map((entry) => {
    const share = totalCost === 0 ? 0 : entry.costUsd / totalCost;
    cumulative += share;

    return {
      ...entry,
      share,
      cumulativeShare: Math.min(1, cumulative),
    };
  });
}

const RUN_STATUS_LABEL: Record<RunStatus, string> = {
  success: 'Sucesso',
  retry: 'Retry',
  error: 'Falha',
};

const REPORT_STATUS_LABEL: Record<ReportStatus, string> = {
  on_track: 'No alvo',
  attention: 'Atenção',
  regression: 'Regressão',
};

function triggerDownloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  console.info('FinOps export download triggered', filename);
}

function triggerDownload(filename: string, mimeType: string, contents: string): void {
  const blob = new Blob([contents], { type: mimeType });
  triggerDownloadBlob(filename, blob);
}

function exportDatasetAsCsv(filename: string, header: string[], rows: string[][]): void {
  const csv = [header.join(','), ...rows.map((row) => row.join(','))].join('\n');
  triggerDownload(filename, 'text/csv;charset=utf-8;', csv);
}

function exportDatasetAsJson(filename: string, payload: unknown): void {
  triggerDownload(filename, 'application/json;charset=utf-8;', JSON.stringify(payload, null, 2));
}

export default function FinOps({ providers, isLoading, initialError }: FinOpsProps) {
  const [selectedRange, setSelectedRange] = useState<RangeOption>('30d');
  const [selectedMetric, setSelectedMetric] = useState<MetricOption>('cost');
  const [selectedProvider, setSelectedProvider] = useState<ProviderSelection>('all');
  const [selectedParetoId, setSelectedParetoId] = useState<string | null>(null);

  const hasProviders = providers.length > 0;

  const [providerSeriesMap, setProviderSeriesMap] = useState<Record<string, TimeSeriesPoint[]>>({});
  const [isTelemetryLoading, setIsTelemetryLoading] = useState(false);
  const telemetryMessages = useMemo(
    () => describeFixtureRequest('telemetria de custo'),
    [],
  );
  const [timeseriesError, setTimeseriesError] = useState<string | null>(null);
  const [isTelemetryExporting, setIsTelemetryExporting] = useState(false);
  const [telemetryExportError, setTelemetryExportError] = useState<string | null>(null);
  const [routeBreakdownEntries, setRouteBreakdownEntries] = useState<RouteCostBreakdown[]>([]);
  const [runEntries, setRunEntries] = useState<RunDrilldownEntry[]>([]);
  const [sprintReports, setSprintReports] = useState<SprintReport[]>([]);
  const [pullRequestReports, setPullRequestReports] = useState<PullRequestReport[]>([]);
  const [sprintReportsError, setSprintReportsError] = useState<string | null>(null);
  const [pullRequestReportsError, setPullRequestReportsError] = useState<string | null>(null);
  const [drilldownError, setDrilldownError] = useState<string | null>(null);
  const [experimentSummaries, setExperimentSummaries] = useState<TelemetryExperimentSummaryEntry[]>([]);
  const [laneCosts, setLaneCosts] = useState<TelemetryLaneCostEntry[]>([]);
  const [marketplacePerformance, setMarketplacePerformance] = useState<MarketplacePerformanceEntry[]>([]);
  const [experimentError, setExperimentError] = useState<string | null>(null);
  const [laneCostError, setLaneCostError] = useState<string | null>(null);
  const [marketplaceError, setMarketplaceError] = useState<string | null>(null);
  const [manifest, setManifest] = useState<PolicyManifestSnapshot | null>(null);
  const [isManifestLoading, setManifestLoading] = useState(false);
  const [manifestError, setManifestError] = useState<string | null>(null);
  const [costCenter, setCostCenter] = useState('');
  const [budgetRows, setBudgetRows] = useState<BudgetRow[]>([]);
  const [budgetErrors, setBudgetErrors] = useState<BudgetRowErrors[]>([]);
  const [alertRows, setAlertRows] = useState<AlertRow[]>([]);
  const [alertErrors, setAlertErrors] = useState<AlertRowErrors[]>([]);
  const [cacheTtl, setCacheTtl] = useState('');
  const [rateLimit, setRateLimit] = useState('');
  const [gracefulStrategy, setGracefulStrategy] = useState<GracefulStrategyOption>('fallback');
  const [gracefulMessage, setGracefulMessage] = useState('');
  const [cacheTtlError, setCacheTtlError] = useState<string | null>(null);
  const [rateLimitError, setRateLimitError] = useState<string | null>(null);
  const [planSummary, setPlanSummary] = useState<AdminPlanSummary | null>(null);
  const [planDiffItems, setPlanDiffItems] = useState<PlanDiffItem[]>([]);
  const [pendingPlan, setPendingPlan] = useState<PendingFinOpsPlan | null>(null);
  const [planStatusMessage, setPlanStatusMessage] = useState<string | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);
  const [isPlanGenerating, setPlanGenerating] = useState(false);
  const [isPlanApplying, setPlanApplying] = useState(false);
  const [planConfirmation, setPlanConfirmation] = useState<{ action: 'apply' | 'discard' } | null>(null);
  const [isPlanConfirming, setPlanConfirming] = useState(false);
  const [costCenterError, setCostCenterError] = useState<string | null>(null);

  const isFormDisabled = isManifestLoading || isPlanGenerating || isPlanApplying;

  useToastNotification(initialError, {
    id: 'finops-initial-error',
    title: 'Falha ao carregar FinOps',
    variant: 'error',
    autoDismiss: false,
  });

  useToastNotification(manifestError, {
    id: 'finops-manifest-error',
    title: 'Manifesto FinOps',
    variant: 'error',
    autoDismiss: false,
  });

  useToastNotification(planError, {
    id: 'finops-plan-error',
    title: 'Plano FinOps',
    variant: 'error',
    autoDismiss: false,
  });

  const planStatusVariant = planStatusMessage
    ? planStatusMessage.toLowerCase().includes('descartado')
      ? 'warning'
      : 'success'
    : 'info';

  useToastNotification(planStatusMessage, {
    id: 'finops-plan-status',
    title: 'Plano FinOps',
    variant: planStatusVariant,
  });

  useToastNotification(timeseriesError, {
    id: 'finops-timeseries-error',
    title: 'Telemetria FinOps',
    variant: 'error',
    autoDismiss: false,
  });

  useToastNotification(telemetryExportError, {
    id: 'finops-export-error',
    title: 'Exportação de telemetria',
    variant: 'error',
    autoDismiss: false,
  });

  useToastNotification(sprintReportsError, {
    id: 'finops-sprint-error',
    title: 'Relatórios de sprint',
    variant: 'warning',
  });

  useToastNotification(pullRequestReportsError, {
    id: 'finops-pr-error',
    title: 'Relatórios de PR',
    variant: 'warning',
  });

  useToastNotification(drilldownError, {
    id: 'finops-drilldown-error',
    title: 'Drill-down de execuções',
    variant: 'warning',
  });

  useToastNotification(experimentError, {
    id: 'finops-experiments-error',
    title: 'Experimentos A/B',
    variant: 'warning',
  });

  useToastNotification(laneCostError, {
    id: 'finops-lane-error',
    title: 'Custos por tier',
    variant: 'warning',
  });

  useToastNotification(marketplaceError, {
    id: 'finops-marketplace-error',
    title: 'Marketplace',
    variant: 'warning',
  });

  const resetPendingPlan = useCallback(() => {
    setPendingPlan(null);
    setPlanDiffItems([]);
    setPlanError(null);
    if (planSummary && planSummary.status !== 'applied') {
      setPlanSummary(null);
    }
  }, [planSummary]);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    setManifestLoading(true);
    setManifestError(null);

    fetchPolicyManifest(controller.signal)
      .then((snapshot) => {
        if (!active) {
          return;
        }
        setManifest(snapshot);
      })
      .catch((error: unknown) => {
        if (!active) {
          return;
        }
        if ((error as { name?: string }).name === 'AbortError') {
          return;
        }
        setManifestError('Não foi possível carregar o manifesto FinOps.');
      })
      .finally(() => {
        if (active) {
          setManifestLoading(false);
        }
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  useEffect(() => {
    if (!manifest) {
      return;
    }

    const finops = manifest.finops;
    setCostCenter(finops.costCenter ?? '');
    setCostCenterError(null);

    const budgets = (finops.budgets ?? []).map<BudgetRow>((budget) => ({
      tier: budget.tier,
      amount: budget.amount.toString(),
      currency: budget.currency,
      period: budget.period,
    }));

    const budgetTemplate: BudgetRow[] =
      budgets.length > 0
        ? budgets
        : (['economy', 'balanced', 'turbo'] as RoutingTierId[]).map((tier) => ({
            tier,
            amount: '',
            currency: 'USD',
            period: 'monthly' as BudgetPeriod,
          }));

    setBudgetRows(budgetTemplate);
    setBudgetErrors(budgetTemplate.map(() => ({}) as BudgetRowErrors));

    const alerts = (finops.alerts ?? []).map<AlertRow>((alert) => ({
      threshold: (alert.threshold * 100).toString(),
      channel: alert.channel,
    }));

    const alertTemplate: AlertRow[] =
      alerts.length > 0 ? alerts : [{ threshold: '75', channel: 'slack' as HitlEscalationChannel }];
    setAlertRows(alertTemplate);
    setAlertErrors(alertTemplate.map(() => ({}) as AlertRowErrors));

    const ttlValue = finops.cache?.ttlSeconds;
    setCacheTtl(ttlValue !== undefined && ttlValue !== null ? String(ttlValue) : '');
    setCacheTtlError(null);

    const rateLimitValue = finops.rateLimit?.requestsPerMinute;
    setRateLimit(rateLimitValue !== undefined && rateLimitValue !== null ? String(rateLimitValue) : '');
    setRateLimitError(null);

    const availableStrategies = new Set(GRACEFUL_STRATEGIES.map((item) => item.value));
    const strategyValue = finops.gracefulDegradation?.strategy ?? 'fallback';
    setGracefulStrategy(
      availableStrategies.has(strategyValue as GracefulStrategyOption)
        ? (strategyValue as GracefulStrategyOption)
        : 'fallback',
    );
    setGracefulMessage(finops.gracefulDegradation?.message ?? '');
    if (!planSummary || planSummary.status !== 'applied') {
      setPlanStatusMessage(null);
    }
    setPlanError(null);
  }, [manifest, planSummary?.status]);

  const handleCostCenterChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      setCostCenter(event.target.value);
      setCostCenterError(null);
      setPlanStatusMessage(null);
      setPlanError(null);
      resetPendingPlan();
    },
    [resetPendingPlan],
  );

  const handleBudgetChange = useCallback(
    (index: number, field: keyof BudgetRow, value: string) => {
      setBudgetRows((current) => {
        const next = current.slice();
        const existing = next[index];
        if (!existing) {
          return current;
        }
        next[index] = { ...existing, [field]: value } as BudgetRow;
        return next;
      });
      setBudgetErrors((current) => {
        const next = current.slice();
        next[index] = { ...(next[index] ?? {}), amount: undefined, currency: undefined };
        return next;
      });
      setPlanStatusMessage(null);
      setPlanError(null);
      resetPendingPlan();
    },
    [resetPendingPlan],
  );

  const handleAddBudget = useCallback(() => {
    setBudgetRows((current) => [
      ...current,
      { tier: 'economy', amount: '', currency: 'USD', period: 'monthly' },
    ]);
    setBudgetErrors((current) => [...current, {}]);
    setPlanStatusMessage(null);
    setPlanError(null);
    resetPendingPlan();
  }, [resetPendingPlan]);

  const handleRemoveBudget = useCallback(
    (index: number) => {
      setBudgetRows((current) => {
        if (current.length <= 1) {
          return current;
        }
        const next = current.slice();
        next.splice(index, 1);
        return next;
      });
      setBudgetErrors((current) => {
        if (current.length <= 1) {
          return current;
        }
        const next = current.slice();
        next.splice(index, 1);
        return next;
      });
      setPlanStatusMessage(null);
      setPlanError(null);
      resetPendingPlan();
    },
    [resetPendingPlan],
  );

  const handleAlertChange = useCallback(
    (index: number, field: keyof AlertRow, value: string) => {
      setAlertRows((current) => {
        const next = current.slice();
        const existing = next[index];
        if (!existing) {
          return current;
        }
        next[index] = { ...existing, [field]: value } as AlertRow;
        return next;
      });
      setAlertErrors((current) => {
        const next = current.slice();
        next[index] = { ...(next[index] ?? {}), threshold: undefined };
        return next;
      });
      setPlanStatusMessage(null);
      setPlanError(null);
      resetPendingPlan();
    },
    [resetPendingPlan],
  );

  const handleAddAlert = useCallback(() => {
    setAlertRows((current) => [...current, { threshold: '80', channel: 'email' }]);
    setAlertErrors((current) => [...current, {}]);
    setPlanStatusMessage(null);
    setPlanError(null);
    resetPendingPlan();
  }, [resetPendingPlan]);

  const handleRemoveAlert = useCallback(
    (index: number) => {
      setAlertRows((current) => {
        if (current.length <= 1) {
          return current;
        }
        const next = current.slice();
        next.splice(index, 1);
        return next;
      });
      setAlertErrors((current) => {
        if (current.length <= 1) {
          return current;
        }
        const next = current.slice();
        next.splice(index, 1);
        return next;
      });
      setPlanStatusMessage(null);
      setPlanError(null);
      resetPendingPlan();
    },
    [resetPendingPlan],
  );

  const handleCacheTtlChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      setCacheTtl(event.target.value);
      setCacheTtlError(null);
      setPlanStatusMessage(null);
      setPlanError(null);
      resetPendingPlan();
    },
    [resetPendingPlan],
  );

  const handleRateLimitChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      setRateLimit(event.target.value);
      setRateLimitError(null);
      setPlanStatusMessage(null);
      setPlanError(null);
      resetPendingPlan();
    },
    [resetPendingPlan],
  );

  const handleGracefulStrategyChange = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => {
      const value = event.target.value as GracefulStrategyOption;
      setGracefulStrategy(value);
      if (value === 'none') {
        setGracefulMessage('');
      }
      setPlanStatusMessage(null);
      setPlanError(null);
      resetPendingPlan();
    },
    [resetPendingPlan],
  );

  const handleGracefulMessageChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      setGracefulMessage(event.target.value);
      setPlanStatusMessage(null);
      setPlanError(null);
      resetPendingPlan();
    },
    [resetPendingPlan],
  );

  const handleFinOpsSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      if (!manifest) {
        setPlanError('Carregue o manifesto atual antes de gerar um plano.');
        return;
      }

      resetPendingPlan();

      let hasErrors = false;
      const trimmedCostCenter = costCenter.trim();
      if (!trimmedCostCenter) {
        setCostCenterError('Informe o cost center responsável.');
        hasErrors = true;
      } else {
        setCostCenterError(null);
      }

      const nextBudgetErrors = budgetRows.map(() => ({} as BudgetRowErrors));
      const normalizedBudgets: FinOpsBudget[] = [];

      budgetRows.forEach((row, index) => {
        const rowErrors: BudgetRowErrors = {};
        const amountValue = Number(row.amount.trim());
        if (!row.amount.trim() || Number.isNaN(amountValue) || amountValue <= 0) {
          rowErrors.amount = 'Defina um valor mensal válido em USD.';
          hasErrors = true;
        }

        const currencyValue = row.currency.trim().toUpperCase();
        if (!currencyValue) {
          rowErrors.currency = 'Informe a moeda (ex.: USD).';
          hasErrors = true;
        }

        nextBudgetErrors[index] = rowErrors;

        if (!rowErrors.amount && !rowErrors.currency) {
          normalizedBudgets.push({
            tier: row.tier,
            amount: Number(amountValue.toFixed(2)),
            currency: currencyValue,
            period: row.period,
          });
        }
      });

      setBudgetErrors(nextBudgetErrors);

      const nextAlertErrors = alertRows.map(() => ({} as AlertRowErrors));
      const normalizedAlerts: FinOpsAlertThreshold[] = [];

      alertRows.forEach((row, index) => {
        const rowErrors: AlertRowErrors = {};
        const thresholdValue = Number(row.threshold.trim());
        if (
          !row.threshold.trim() ||
          Number.isNaN(thresholdValue) ||
          thresholdValue < 0 ||
          thresholdValue > 100
        ) {
          rowErrors.threshold = 'Defina um percentual entre 0 e 100.';
          hasErrors = true;
        }

        nextAlertErrors[index] = rowErrors;

        if (!rowErrors.threshold) {
          normalizedAlerts.push({
            threshold: Number((thresholdValue / 100).toFixed(4)),
            channel: row.channel,
          });
        }
      });

      setAlertErrors(nextAlertErrors);

      const trimmedTtl = cacheTtl.trim();
      let cacheTtlValue: number | null = null;
      if (trimmedTtl) {
        const parsed = Number(trimmedTtl);
        if (Number.isNaN(parsed) || parsed < 0) {
          setCacheTtlError('Defina um TTL de cache válido em segundos.');
          hasErrors = true;
        } else {
          cacheTtlValue = Math.round(parsed);
          setCacheTtlError(null);
        }
      } else {
        setCacheTtlError(null);
      }

      const trimmedRateLimit = rateLimit.trim();
      let rateLimitValue: number | null = null;
      if (trimmedRateLimit) {
        const parsed = Number(trimmedRateLimit);
        if (Number.isNaN(parsed) || parsed <= 0) {
          setRateLimitError('Informe um limite de requisições por minuto válido.');
          hasErrors = true;
        } else {
          rateLimitValue = Math.round(parsed);
          setRateLimitError(null);
        }
      } else {
        setRateLimitError(null);
      }

      if (hasErrors) {
        setPlanStatusMessage(null);
        return;
      }

      const payload: PolicyManifestUpdateInput = {
        finops: {
          costCenter: trimmedCostCenter,
          budgets: normalizedBudgets,
          alerts: normalizedAlerts,
          cache: { ttlSeconds: cacheTtlValue },
          rateLimit: { requestsPerMinute: rateLimitValue },
          gracefulDegradation: {
            strategy: gracefulStrategy === 'none' ? null : gracefulStrategy,
            message: gracefulMessage.trim() || null,
          },
        },
      };

      setPlanGenerating(true);
      setPlanStatusMessage(null);
      setPlanError(null);

      try {
        const planResponse = await patchConfigPoliciesPlan({
          policyId: POLICY_MANIFEST_ID,
          changes: payload,
        });

        const nextSnapshot = applyFinOpsUpdateToSnapshot(manifest, payload);
        const currentManifestString = formatManifestSnapshot(manifest);
        const nextManifestString = formatManifestSnapshot(nextSnapshot);
        const patch = createTwoFilesPatch(
          'policies/manifest.json',
          'policies/manifest.json',
          currentManifestString,
          nextManifestString,
          undefined,
          undefined,
          { context: 3 },
        );

        const diffs = mapPlanDiffItems(planResponse.plan.diffs, patch);
        const planId = generatePlanId();

        setPendingPlan({
          id: planId,
          plan: planResponse.plan,
          planPayload: planResponse.planPayload,
          patch,
          diffs,
          nextSnapshot,
        });
        setPlanDiffItems(diffs);
        setPlanSummary(buildPlanSummary(planId, planResponse.plan, planResponse.preview ?? null));
        setPlanStatusMessage('Plano gerado. Revise as alterações antes de aplicar.');
      } catch (error) {
        console.error('Failed to gerar plano FinOps', error);
        const message =
          error instanceof Error && error.message
            ? error.message
            : 'Falha ao gerar plano FinOps. Tente novamente.';
        setPlanError(message);
        setPlanStatusMessage(null);
        setPendingPlan(null);
        setPlanDiffItems([]);
        if (!planSummary || planSummary.status !== 'applied') {
          setPlanSummary(null);
        }
      } finally {
        setPlanGenerating(false);
      }
    },
    [
      alertRows,
      budgetRows,
      cacheTtl,
      costCenter,
      gracefulMessage,
      gracefulStrategy,
      manifest,
      rateLimit,
      resetPendingPlan,
      planSummary,
    ],
  );

  const executePlanApply = useCallback(async () => {
    if (!pendingPlan) {
      setPlanError('Gere um plano antes de aplicar as mudanças.');
      return;
    }

    setPlanApplying(true);
    setPlanError(null);
    try {
      const response = await postPolicyPlanApply({
        planId: pendingPlan.id,
        plan: pendingPlan.planPayload,
        patch: pendingPlan.patch,
        actor: 'Console MCP',
        actorEmail: 'finops@console.mcp',
        commitMessage: 'chore: atualizar políticas FinOps',
      });

      setManifest(pendingPlan.nextSnapshot);
      setPlanSummary((current) => {
        const base = current ?? buildPlanSummary(pendingPlan.id, pendingPlan.plan, null);
        const pullRequest = mapExecutionPullRequest(response.pullRequest ?? null) ?? base.pullRequest ?? null;
        return {
          ...base,
          status: 'applied',
          branch: response.branch ?? base.branch ?? null,
          baseBranch: response.baseBranch ?? base.baseBranch ?? null,
          pullRequest,
        };
      });
      const details = [response.message];
      if (response.branch) {
        details.push(`Branch: ${response.branch}`);
      }
      if (response.pullRequest?.url) {
        details.push(`PR: ${response.pullRequest.url}`);
      }
      setPlanStatusMessage(details.join(' '));
      setPendingPlan(null);
      setPlanDiffItems(pendingPlan.diffs);
    } catch (error) {
      console.error('Failed to aplicar plano FinOps', error);
      setPlanError('Falha ao aplicar plano FinOps. Tente novamente.');
    } finally {
      setPlanApplying(false);
    }
  }, [pendingPlan]);

  const executePlanReset = useCallback(() => {
    resetPendingPlan();
    setPlanStatusMessage('Plano descartado. Ajuste a política e gere novamente.');
  }, [resetPendingPlan]);

  const requestPlanApply = useCallback(() => {
    if (!pendingPlan) {
      setPlanError('Gere um plano antes de aplicar as mudanças.');
      return;
    }
    setPlanConfirmation({ action: 'apply' });
  }, [pendingPlan]);

  const requestPlanReset = useCallback(() => {
    if (!pendingPlan) {
      setPlanError('Nenhum plano pendente para descartar.');
      return;
    }
    setPlanConfirmation({ action: 'discard' });
  }, [pendingPlan]);

  const closePlanConfirmation = useCallback(() => {
    if (isPlanConfirming || isPlanApplying) {
      return;
    }
    setPlanConfirmation(null);
  }, [isPlanConfirming, isPlanApplying]);

  const confirmPlanAction = useCallback(() => {
    if (!planConfirmation) {
      return;
    }
    if (planConfirmation.action === 'apply') {
      setPlanConfirming(true);
      void executePlanApply().finally(() => {
        setPlanConfirming(false);
        setPlanConfirmation(null);
      });
      return;
    }
    executePlanReset();
    setPlanConfirmation(null);
  }, [planConfirmation, executePlanApply, executePlanReset]);

  const planConfirmationContent = useMemo(() => {
    if (!planConfirmation) {
      return null;
    }
    if (planConfirmation.action === 'apply') {
      return {
        title: 'Aplicar plano FinOps',
        description: 'Aplicará budgets, alertas e limites atualizados no manifesto FinOps.',
        confirmLabel: 'Aplicar plano',
        confirmArmedLabel: 'Aplicar agora',
      } as const;
    }
    return {
      title: 'Descartar plano FinOps',
      description: 'Descartará as alterações geradas e manterá o manifesto atual.',
      confirmLabel: 'Descartar plano',
      confirmArmedLabel: 'Descartar agora',
    } as const;
  }, [planConfirmation]);

  const availableSeries = useMemo(() => {
    const days = RANGE_TO_DAYS[selectedRange];

    if (!hasProviders) {
      return [];
    }

    if (selectedProvider === 'all') {
      const seriesCollection = providers.map((provider) => providerSeriesMap[provider.id] ?? []);
      return combineSeries(seriesCollection.map((series) => series.slice(-days)));
    }

    const series = providerSeriesMap[selectedProvider];
    return series ? series.slice(-days) : [];
  }, [hasProviders, providers, providerSeriesMap, selectedProvider, selectedRange]);

  const handleTelemetryExport = useCallback(
    async (format: 'csv' | 'html') => {
      if (availableSeries.length === 0) {
        return;
      }

      const days = RANGE_TO_DAYS[selectedRange];
      const { start, end } = computeWindowBounds(days);
      const providerId = selectedProvider === 'all' ? undefined : selectedProvider;

      setTelemetryExportError(null);
      setIsTelemetryExporting(true);
      console.info('FinOps export starting', format);

      try {
        const timestamp = new Date().toISOString().slice(0, 10);
        const { blob } = await fetchTelemetryExportDocument(format, {
          start,
          end,
          providerId,
        });
        const extension = format === 'html' ? 'html' : 'csv';
        triggerDownloadBlob(`finops-telemetry-${timestamp}.${extension}`, blob);
      } catch (error) {
        console.error('Failed to export FinOps telemetry', error);
        setTelemetryExportError('Falha ao exportar telemetria FinOps. Tente novamente.');
      } finally {
        setIsTelemetryExporting(false);
      }
    },
    [availableSeries, selectedProvider, selectedRange],
  );

  useEffect(() => {
    if (!hasProviders) {
      setProviderSeriesMap({});
      setTimeseriesError(null);
      return;
    }

    const days = RANGE_TO_DAYS[selectedRange];
    const { start, end } = computeWindowBounds(days);
    const controller = new AbortController();
    let cancelled = false;
    let encounteredError = false;

    setIsTelemetryLoading(true);
    setTimeseriesError(null);

    (async () => {
      const results = await Promise.all(
        providers.map(async (provider) => {
          try {
            const response = await fetchTelemetryTimeseries(
              { start, end, providerId: provider.id },
              controller.signal,
            );
            return [
              provider.id,
              buildSeriesFromTelemetry(response.items, new Date(start), days),
            ] as const;
          } catch (error) {
            if (!cancelled) {
              encounteredError = true;
            }
            return [provider.id, []] as const;
          }
        }),
      );

      if (!cancelled) {
        const nextMap = results.reduce<Record<string, TimeSeriesPoint[]>>((acc, [id, series]) => {
          acc[id] = Array.isArray(series) ? [...series] : [];
          return acc;
        }, {});
        setProviderSeriesMap(nextMap);
        if (encounteredError) {
          setTimeseriesError('Não foi possível carregar todas as séries temporais.');
        }
      }
    })()
      .catch((error) => {
        if (!cancelled) {
          setTimeseriesError(
            error instanceof Error ? error.message : 'Erro ao carregar séries temporais reais.',
          );
          setProviderSeriesMap({});
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsTelemetryLoading(false);
        }
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [hasProviders, providers, selectedRange]);

  useEffect(() => {
    if (!hasProviders) {
      setRouteBreakdownEntries([]);
      setExperimentSummaries([]);
      setLaneCosts([]);
      setMarketplacePerformance([]);
      setExperimentError(null);
      setLaneCostError(null);
      setMarketplaceError(null);
      return;
    }

    const days = RANGE_TO_DAYS[selectedRange];
    const { start, end } = computeWindowBounds(days);
    const controller = new AbortController();
    let cancelled = false;

    const providerFilter = selectedProvider === 'all' ? undefined : selectedProvider;

    fetchTelemetryPareto({ start, end, providerId: providerFilter }, controller.signal)
      .then((response) => {
        if (cancelled) {
          return;
        }

        if (!response.items.length) {
          setRouteBreakdownEntries([]);
          return;
        }

        setRouteBreakdownEntries(buildRouteBreakdownFromTelemetry(response.items));
      })
      .catch(() => {
        if (!cancelled) {
          setRouteBreakdownEntries([]);
          setTimeseriesError((current) => current ?? 'Não foi possível carregar o Pareto de rotas.');
        }
      })
      .finally(() => {
        /* no-op */
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [hasProviders, providers, selectedProvider, selectedRange]);

  useEffect(() => {
    if (!hasProviders) {
      return;
    }

    const days = RANGE_TO_DAYS[selectedRange];
    const { start, end } = computeWindowBounds(days);
    const controller = new AbortController();
    let cancelled = false;
    const providerFilter = selectedProvider === 'all' ? undefined : selectedProvider;

    setExperimentError(null);
    setLaneCostError(null);
    setMarketplaceError(null);

    const experimentsPromise = fetchTelemetryExperiments(
      { start, end, providerId: providerFilter },
      controller.signal,
    ).catch((error) => {
      if (!cancelled) {
        setExperimentSummaries([]);
        const message =
          error instanceof Error ? error.message : 'Não foi possível carregar os experimentos.';
        setExperimentError(message);
      }
      return null;
    });

    const lanePromise = fetchTelemetryLaneCosts(
      { start, end, providerId: providerFilter },
      controller.signal,
    ).catch((error) => {
      if (!cancelled) {
        setLaneCosts([]);
        const message =
          error instanceof Error ? error.message : 'Falha ao carregar o custo por tier.';
        setLaneCostError(message);
      }
      return null;
    });

    const marketplacePromise = fetchMarketplacePerformance(
      { start, end, providerId: providerFilter },
      controller.signal,
    ).catch((error) => {
      if (!cancelled) {
        setMarketplacePerformance([]);
        const message =
          error instanceof Error
            ? error.message
            : 'Não foi possível carregar a performance do marketplace.';
        setMarketplaceError(message);
      }
      return null;
    });

    Promise.all([experimentsPromise, lanePromise, marketplacePromise]).then(
      ([experiments, laneBreakdown, marketplace]) => {
        if (cancelled) {
          return;
        }
        if (experiments) {
          setExperimentSummaries(experiments.items);
        }
        if (laneBreakdown) {
          setLaneCosts(laneBreakdown.items);
        }
        if (marketplace) {
          setMarketplacePerformance(marketplace.items);
        }
      },
    );

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [hasProviders, providers, selectedProvider, selectedRange]);

  const aggregatedMetrics = useMemo(() => computeMetrics(availableSeries), [availableSeries]);

  const metricConfig = METRIC_CONFIG[selectedMetric];
  const timeseriesYAxisFormatter = useCallback(
    (value: number) =>
      selectedMetric === 'cost'
        ? `$${value.toFixed(value >= 1000 ? 0 : 1)}`
        : `${value.toFixed(0)} mi`,
    [selectedMetric],
  );

  const selectedProviderLabel = useMemo(() => {
    if (selectedProvider === 'all') {
      return 'todos os provedores monitorados';
    }

    const provider = providers.find((item) => item.id === selectedProvider);
    return provider ? provider.name : selectedProvider;
  }, [providers, selectedProvider]);

  const breakdownEntries = routeBreakdownEntries;

  const paretoEntries = useMemo(() => computePareto(breakdownEntries), [breakdownEntries]);

  const experimentRows = useMemo<ExperimentView[]>(() => {
    return experimentSummaries
      .map((entry) => {
        const tokensTotal = entry.total_tokens_in + entry.total_tokens_out;
        return {
          key: `${entry.cohort ?? '—'}::${entry.tag ?? '—'}`,
          cohort: entry.cohort,
          tag: entry.tag,
          runCount: entry.run_count,
          successRate: entry.success_rate,
          errorRate: entry.error_rate,
          avgLatencyMs: Math.round(entry.avg_latency_ms),
          totalCostUsd: entry.total_cost_usd,
          tokensMillions: tokensTotal / 1_000_000,
          mttrMs: entry.mttr_ms,
          recoveryEvents: entry.recovery_events,
        } satisfies ExperimentView;
      })
      .sort((a, b) => (b.totalCostUsd - a.totalCostUsd) || b.runCount - a.runCount);
  }, [experimentSummaries]);

  const experimentAggregate = useMemo(() => {
    if (experimentSummaries.length === 0) {
      return {
        totalRuns: 0,
        totalCost: 0,
        totalTokensMillions: 0,
        successRate: 0,
        errorRate: 0,
        averageMttr: null,
        recoveryEvents: 0,
      };
    }

    let totalRuns = 0;
    let totalCost = 0;
    let totalTokens = 0;
    let weightedSuccess = 0;
    let weightedError = 0;
    let mttrAccumulator = 0;
    let mttrCount = 0;
    let recoveryEvents = 0;

    experimentSummaries.forEach((entry) => {
      totalRuns += entry.run_count;
      totalCost += entry.total_cost_usd;
      totalTokens += entry.total_tokens_in + entry.total_tokens_out;
      weightedSuccess += entry.success_rate * entry.run_count;
      weightedError += entry.error_rate * entry.run_count;
      if (entry.mttr_ms !== null && Number.isFinite(entry.mttr_ms)) {
        mttrAccumulator += entry.mttr_ms;
        mttrCount += 1;
      }
      recoveryEvents += entry.recovery_events;
    });

    return {
      totalRuns,
      totalCost,
      totalTokensMillions: totalTokens / 1_000_000,
      successRate: totalRuns > 0 ? weightedSuccess / totalRuns : 0,
      errorRate: totalRuns > 0 ? weightedError / totalRuns : 0,
      averageMttr: mttrCount > 0 ? mttrAccumulator / mttrCount : null,
      recoveryEvents,
    };
  }, [experimentSummaries]);

  const laneOverview = useMemo(() => {
    const totals = laneCosts.reduce(
      (acc, entry) => {
        acc.cost += entry.total_cost_usd;
        acc.tokens += entry.total_tokens_in + entry.total_tokens_out;
        acc.runs += entry.run_count;
        acc.latency += entry.avg_latency_ms * entry.run_count;
        return acc;
      },
      { cost: 0, tokens: 0, runs: 0, latency: 0 },
    );

    const byLane = new Map(laneCosts.map((entry) => [entry.lane as LaneCategory, entry]));

    const rows = (['economy', 'balanced', 'turbo'] as LaneCategory[]).map((lane) => {
      const entry = byLane.get(lane);
      const cost = entry?.total_cost_usd ?? 0;
      const tokens = entry ? entry.total_tokens_in + entry.total_tokens_out : 0;
      const tokensMillions = tokens / 1_000_000;
      const runCount = entry?.run_count ?? 0;
      const costShare = totals.cost > 0 ? cost / totals.cost : 0;
      const costPerMillion = tokensMillions > 0 ? cost / tokensMillions : 0;

      return {
        lane,
        runCount,
        totalCostUsd: cost,
        tokensMillions,
        avgLatencyMs: entry ? Math.round(entry.avg_latency_ms) : 0,
        costShare,
        costPerMillion,
      } satisfies LaneCostView;
    });

    const averageLatencyDenominator = totals.runs > 0 ? totals.runs : 1;

    return {
      rows,
      totals: {
        totalCostUsd: totals.cost,
        totalTokensMillions: totals.tokens / 1_000_000,
        totalRuns: totals.runs,
        averageLatencyMs:
          totals.runs > 0 ? Math.round(totals.latency / averageLatencyDenominator) : 0,
      },
    };
  }, [laneCosts]);

  const marketplaceRows = useMemo<MarketplaceRowView[]>(() => {
    return marketplacePerformance
      .map((entry) => {
        const tokens = entry.total_tokens_in + entry.total_tokens_out;
        return {
          id: entry.entry_id,
          name: entry.name,
          origin: entry.origin,
          rating: entry.rating,
          cost: entry.cost,
          runCount: entry.run_count,
          successRate: entry.success_rate,
          avgLatencyMs: Math.round(entry.avg_latency_ms),
          totalCostUsd: entry.total_cost_usd,
          tokensMillions: tokens / 1_000_000,
          cohorts: entry.cohorts,
          adoptionScore: entry.adoption_score,
        } satisfies MarketplaceRowView;
      })
      .sort((a, b) => (b.adoptionScore - a.adoptionScore) || b.runCount - a.runCount);
  }, [marketplacePerformance]);

  const marketplaceAggregate = useMemo(() => {
    if (marketplacePerformance.length === 0) {
      return {
        totalRuns: 0,
        totalCostUsd: 0,
        totalTokensMillions: 0,
        avgRating: null as number | null,
        avgSuccessRate: 0,
        avgAdoption: 0,
      };
    }

    let totalRuns = 0;
    let totalCost = 0;
    let totalTokens = 0;
    let weightedRating = 0;
    let weightedSuccess = 0;
    let weightedAdoption = 0;

    marketplacePerformance.forEach((entry) => {
      totalRuns += entry.run_count;
      totalCost += entry.total_cost_usd;
      totalTokens += entry.total_tokens_in + entry.total_tokens_out;
      weightedRating += entry.rating * entry.run_count;
      weightedSuccess += entry.success_rate * entry.run_count;
      weightedAdoption += entry.adoption_score * entry.run_count;
    });

    return {
      totalRuns,
      totalCostUsd: totalCost,
      totalTokensMillions: totalTokens / 1_000_000,
      avgRating: totalRuns > 0 ? weightedRating / totalRuns : null,
      avgSuccessRate: totalRuns > 0 ? weightedSuccess / totalRuns : 0,
      avgAdoption: totalRuns > 0 ? weightedAdoption / totalRuns : 0,
    };
  }, [marketplacePerformance]);

  const hasExperimentData = experimentRows.length > 0;
  const hasLaneData = laneCosts.length > 0;
  const hasMarketplaceData = marketplaceRows.length > 0;

  const handleExperimentExport = useCallback(
    (format: 'csv' | 'json') => {
      if (!hasExperimentData) {
        return;
      }

      const timestamp = Date.now();
      const dataset = experimentRows.map((row) => ({
        cohort: row.cohort,
        tag: row.tag,
        run_count: row.runCount,
        success_rate: Number(row.successRate.toFixed(4)),
        error_rate: Number(row.errorRate.toFixed(4)),
        avg_latency_ms: row.avgLatencyMs,
        total_cost_usd: Number(row.totalCostUsd.toFixed(2)),
        tokens_millions: Number(row.tokensMillions.toFixed(3)),
        mttr_ms: row.mttrMs,
        recovery_events: row.recoveryEvents,
      }));

      if (format === 'json') {
        exportDatasetAsJson(`finops-experiments-${timestamp}.json`, dataset);
        return;
      }

      const header = [
        'cohort',
        'tag',
        'run_count',
        'success_rate',
        'error_rate',
        'avg_latency_ms',
        'total_cost_usd',
        'tokens_millions',
        'mttr_ms',
        'recovery_events',
      ];
      const rows = dataset.map((item) => [
        item.cohort ?? '',
        item.tag ?? '',
        item.run_count.toString(),
        item.success_rate.toFixed(4),
        item.error_rate.toFixed(4),
        item.avg_latency_ms.toString(),
        item.total_cost_usd.toFixed(2),
        item.tokens_millions.toFixed(3),
        item.mttr_ms !== null ? item.mttr_ms.toString() : '',
        item.recovery_events.toString(),
      ]);
      exportDatasetAsCsv(`finops-experiments-${timestamp}.csv`, header, rows);
    },
    [experimentRows, hasExperimentData],
  );

  const handleLaneExport = useCallback(
    (format: 'csv' | 'json') => {
      const timestamp = Date.now();
      const dataset = laneOverview.rows.map((row) => ({
        lane: row.lane,
        run_count: row.runCount,
        total_cost_usd: Number(row.totalCostUsd.toFixed(2)),
        tokens_millions: Number(row.tokensMillions.toFixed(3)),
        avg_latency_ms: row.avgLatencyMs,
        cost_share: Number(row.costShare.toFixed(4)),
        cost_per_million_usd: Number(row.costPerMillion.toFixed(2)),
      }));

      if (format === 'json') {
        exportDatasetAsJson(`finops-lane-costs-${timestamp}.json`, dataset);
        return;
      }

      const header = [
        'lane',
        'run_count',
        'total_cost_usd',
        'tokens_millions',
        'avg_latency_ms',
        'cost_share',
        'cost_per_million_usd',
      ];
      const rows = dataset.map((item) => [
        item.lane,
        item.run_count.toString(),
        item.total_cost_usd.toFixed(2),
        item.tokens_millions.toFixed(3),
        item.avg_latency_ms.toString(),
        item.cost_share.toFixed(4),
        item.cost_per_million_usd.toFixed(2),
      ]);
      exportDatasetAsCsv(`finops-lane-costs-${timestamp}.csv`, header, rows);
    },
    [laneOverview.rows],
  );

  const handleMarketplaceExport = useCallback(
    (format: 'csv' | 'json') => {
      if (!hasMarketplaceData) {
        return;
      }

      const timestamp = Date.now();
      const dataset = marketplaceRows.map((row) => ({
        entry_id: row.id,
        name: row.name,
        origin: row.origin,
        rating: Number(row.rating.toFixed(2)),
        unit_cost_usd: Number(row.cost.toFixed(4)),
        run_count: row.runCount,
        success_rate: Number(row.successRate.toFixed(4)),
        avg_latency_ms: row.avgLatencyMs,
        total_cost_usd: Number(row.totalCostUsd.toFixed(2)),
        tokens_millions: Number(row.tokensMillions.toFixed(3)),
        cohorts: row.cohorts,
        adoption_score: Number(row.adoptionScore.toFixed(4)),
      }));

      if (format === 'json') {
        exportDatasetAsJson(`finops-marketplace-${timestamp}.json`, dataset);
        return;
      }

      const header = [
        'entry_id',
        'name',
        'origin',
        'rating',
        'unit_cost_usd',
        'run_count',
        'success_rate',
        'avg_latency_ms',
        'total_cost_usd',
        'tokens_millions',
        'cohorts',
        'adoption_score',
      ];
      const rows = dataset.map((item) => [
        item.entry_id,
        item.name,
        item.origin,
        item.rating.toFixed(2),
        item.unit_cost_usd.toFixed(4),
        item.run_count.toString(),
        item.success_rate.toFixed(4),
        item.avg_latency_ms.toString(),
        item.total_cost_usd.toFixed(2),
        item.tokens_millions.toFixed(3),
        item.cohorts.join('|'),
        item.adoption_score.toFixed(4),
      ]);
      exportDatasetAsCsv(`finops-marketplace-${timestamp}.csv`, header, rows);
    },
    [hasMarketplaceData, marketplaceRows],
  );

  useEffect(() => {
    if (!hasProviders) {
      setSprintReports([]);
      setPullRequestReports([]);
      setSprintReportsError(null);
      setPullRequestReportsError(null);
      return;
    }

    const days = RANGE_TO_DAYS[selectedRange];
    const { start, end } = computeWindowBounds(days);
    const providerFilter = selectedProvider === 'all' ? undefined : selectedProvider;
    const windowDays = selectedRange === '7d' ? 7 : selectedRange === '30d' ? 14 : 21;

    const sprintController = new AbortController();
    const prController = new AbortController();
    let cancelled = false;

    setSprintReportsError(null);
    setPullRequestReportsError(null);

    fetchFinOpsSprintReports(
      { start, end, providerId: providerFilter, windowDays, limit: 4 },
      sprintController.signal,
    )
      .then((items) => {
        if (cancelled) {
          return;
        }
        setSprintReports(items.map(mapSprintReportPayload));
      })
      .catch(() => {
        if (!cancelled) {
          setSprintReports([]);
          setSprintReportsError('Não foi possível carregar relatórios de sprint.');
        }
      });

    fetchFinOpsPullRequestReports(
      { start, end, providerId: providerFilter, windowDays, limit: 4 },
      prController.signal,
    )
      .then((items) => {
        if (cancelled) {
          return;
        }
        setPullRequestReports(items.map(mapPullRequestReportPayload));
      })
      .catch(() => {
        if (!cancelled) {
          setPullRequestReports([]);
          setPullRequestReportsError('Não foi possível carregar relatórios de PR.');
        }
      });

    return () => {
      cancelled = true;
      sprintController.abort();
      prController.abort();
    };
  }, [hasProviders, providers, selectedProvider, selectedRange]);

  const finOpsAlerts = useMemo(() => {
    const alerts: FinOpsAlert[] = [];

    const trailingDays = Math.min(7, availableSeries.length);

    if (trailingDays >= 3) {
      const recentWindow = availableSeries.slice(-trailingDays);
      const previousWindow = availableSeries.slice(0, -trailingDays);
      const minimumPreviousSamples = Math.max(3, Math.floor(trailingDays / 2));
      const hasPreviousWindow = previousWindow.length >= minimumPreviousSamples;

      const recentCostAverage = averageSeries(recentWindow, 'costUsd');
      const previousCostAverage = hasPreviousWindow ? averageSeries(previousWindow, 'costUsd') : 0;

      if (recentCostAverage > 0) {
        if (hasPreviousWindow && previousCostAverage > 0) {
          const costChange = (recentCostAverage - previousCostAverage) / previousCostAverage;

          if (costChange >= COST_SURGE_THRESHOLD) {
            alerts.push({
              id: 'cost-surge',
              kind: 'warning',
              title: 'Escalada de custo diário',
              description: `O custo médio diário dos últimos ${trailingDays} dias está ${formatSignedPercent(costChange)} em relação à janela anterior para ${selectedProviderLabel}.`,
            });
          } else if (costChange <= -COST_SURGE_THRESHOLD) {
            alerts.push({
              id: 'cost-drop',
              kind: 'info',
              title: 'Queda de custo detectada',
              description: `O custo médio diário reduziu ${formatPercent(Math.abs(costChange))} nas últimas ${trailingDays} execuções. Valide se houve otimizações permanentes.`,
            });
          }
        } else {
          alerts.push({
            id: 'cost-surge',
            kind: 'warning',
            title: 'Escalada de custo diário',
            description: `Custos diários passaram a ser registrados para ${selectedProviderLabel} nas últimas ${trailingDays} execuções.`,
          });
        }
      }

      const recentTokensAverage = averageSeries(recentWindow, 'tokensMillions');
      const previousTokensAverage = hasPreviousWindow ? averageSeries(previousWindow, 'tokensMillions') : 0;

      if (recentTokensAverage > 0) {
        if (hasPreviousWindow && previousTokensAverage > 0) {
          const tokensChange = (recentTokensAverage - previousTokensAverage) / previousTokensAverage;

          if (tokensChange <= -TOKENS_DROP_THRESHOLD) {
            alerts.push({
              id: 'tokens-drop',
              kind: 'info',
              title: 'Queda de volume de tokens',
              description: `O volume processado caiu ${formatPercent(Math.abs(tokensChange))} no período recente. Investigue se há rotas ociosas ou caches inválidos.`,
            });
          } else if (tokensChange >= TOKENS_SURGE_THRESHOLD) {
            alerts.push({
              id: 'tokens-surge',
              kind: 'warning',
              title: 'Pico de tokens consumidos',
              description: `O volume de tokens cresceu ${formatSignedPercent(tokensChange)}. Considere validar limites de custo e reaproveitamento de contexto.`,
            });
          }
        } else {
          alerts.push({
            id: 'tokens-surge',
            kind: 'warning',
            title: 'Pico de tokens consumidos',
            description: `Novas execuções consumiram tokens após período sem atividade para ${selectedProviderLabel}.`,
          });
        }
      }
    }

    const topPareto = paretoEntries[0];
    if (topPareto) {
      const severity: FinOpsAlertKind = topPareto.share >= COST_CONCENTRATION_THRESHOLD ? 'warning' : 'info';
      alerts.push({
        id: 'pareto-concentration',
        kind: severity,
        title: 'Custo concentrado em uma rota',
        description: `${topPareto.label} (${topPareto.providerName}) responde por ${formatPercent(topPareto.share)} do gasto observado. Considere alternativas para diluir o risco.`,
      });
    }

    const lowSuccessRoutes = breakdownEntries
      .filter((entry) => entry.successRate <= SUCCESS_RATE_ALERT_THRESHOLD)
      .slice(0, 2);
    if (lowSuccessRoutes.length > 0) {
      const labels = lowSuccessRoutes
        .map((entry) => `${entry.label} (${formatPercent(entry.successRate)})`)
        .join(', ');

      alerts.push({
        id: 'success-rate',
        kind: 'error',
        title: 'Taxa de sucesso abaixo do esperado',
        description: `As rotas ${labels} estão abaixo da meta de ${formatPercent(SUCCESS_RATE_ALERT_THRESHOLD)}. Revise retries, limites e políticas de fallback.`,
      });
    }

    if (alerts.length === 0) {
      alerts.push({
        id: 'steady',
        kind: 'info',
        title: 'Sem alertas críticos',
        description: `Nenhuma anomalia relevante encontrada para ${selectedProviderLabel} no período selecionado.`,
      });
    }

    return alerts;
  }, [availableSeries, breakdownEntries, paretoEntries, selectedProviderLabel]);

  const finOpsHotspots = useMemo(() => {
    if (breakdownEntries.length === 0) {
      return [];
    }

    const days = RANGE_TO_DAYS[selectedRange];
    const totalCost = breakdownEntries.reduce((sum, entry) => sum + entry.costUsd, 0);
    const referenceCostPerMillion = aggregatedMetrics.costPerMillion;
    const costFormatter = METRIC_CONFIG.cost.formatter;

    const hotspots: (FinOpsHotspot & { weight: number; score: number })[] = [];

    const pushHotspot = (hotspot: FinOpsHotspot, score: number) => {
      hotspots.push({ ...hotspot, weight: HOTSPOT_SEVERITY_WEIGHT[hotspot.severity], score });
    };

    breakdownEntries.slice(0, 8).forEach((entry) => {
      const share = totalCost === 0 ? 0 : entry.costUsd / totalCost;

      if (share >= 0.22) {
        const severity: HotspotSeverity = share >= 0.5 ? 'critical' : share >= 0.35 ? 'high' : 'medium';
        pushHotspot(
          {
            id: `cost-${entry.id}`,
            kind: 'cost',
            severity,
            title: 'Rota domina o custo',
            summary: `${entry.label} concentra ${formatPercent(share)} do gasto para ${selectedProviderLabel}.`,
            metricLabel: 'Share de custo',
            metricValue: formatPercent(share),
            recommendation: `Revise limites ou alternativas para reduzir a dependência de ${entry.providerName}.`,
          },
          share,
        );
      }

      if (entry.successRate < 0.93) {
        const severity: HotspotSeverity = entry.successRate < 0.86 ? 'critical' : 'high';
        pushHotspot(
          {
            id: `reliability-${entry.id}`,
            kind: 'reliability',
            severity,
            title: 'Queda na confiabilidade',
            summary: `${entry.label} registrou taxa de sucesso de ${formatPercent(entry.successRate)} nos últimos ${days} dias.`,
            metricLabel: 'Sucesso',
            metricValue: formatPercent(entry.successRate),
            recommendation: 'Investigue falhas recentes e considere failover automático.',
          },
          1 - entry.successRate,
        );
      }

      if (entry.avgLatencyMs > 1500) {
        const severity: HotspotSeverity = entry.avgLatencyMs > 2200 ? 'high' : 'medium';
        pushHotspot(
          {
            id: `latency-${entry.id}`,
            kind: 'latency',
            severity,
            title: 'Latência elevada',
            summary: `${entry.label} mantém latência média de ${formatLatency(entry.avgLatencyMs)} na janela de ${days} dias.`,
            metricLabel: 'Latência média',
            metricValue: formatLatency(entry.avgLatencyMs),
            recommendation: 'Considere rotas turbo ou ajuste de paralelismo.',
          },
          entry.avgLatencyMs,
        );
      }

      if (referenceCostPerMillion > 0 && entry.tokensMillions > 0) {
        const costPerMillion = entry.costUsd / entry.tokensMillions;
        const ratio = costPerMillion / referenceCostPerMillion;

        if (ratio >= 1.2) {
          const severity: HotspotSeverity = ratio >= 1.45 ? 'high' : 'medium';
          pushHotspot(
            {
              id: `efficiency-${entry.id}`,
              kind: 'efficiency',
              severity,
              title: 'Custo por token acima da média',
              summary: `${entry.label} custa ${formatSignedPercent(ratio - 1)} versus a média monitorada.`,
              metricLabel: 'Custo / 1M tokens',
              metricValue: costFormatter(costPerMillion),
              recommendation: 'Avalie otimizações de prompt ou modelos mais econômicos.',
            },
            ratio,
          );
        }
      }
    });

    return hotspots
      .sort((a, b) => {
        if (b.weight !== a.weight) {
          return b.weight - a.weight;
        }
        return b.score - a.score;
      })
      .filter((item, index, array) => array.findIndex((candidate) => candidate.id === item.id) === index)
      .slice(0, 4)
      .map(({ weight, score, ...rest }) => rest);
  }, [
    aggregatedMetrics.costPerMillion,
    breakdownEntries,
    selectedProviderLabel,
    selectedRange,
  ]);

  const totalParetoCost = useMemo(
    () => breakdownEntries.reduce((sum, entry) => sum + entry.costUsd, 0),
    [breakdownEntries],
  );

  useEffect(() => {
    if (paretoEntries.length === 0) {
      setSelectedParetoId(null);
      return;
    }

    setSelectedParetoId((current) => {
      if (!current) {
        return paretoEntries[0]?.id ?? null;
      }
      return paretoEntries.some((entry) => entry.id === current) ? current : paretoEntries[0].id;
    });
  }, [paretoEntries]);

  const selectedParetoEntry = useMemo(
    () => paretoEntries.find((entry) => entry.id === selectedParetoId) ?? null,
    [paretoEntries, selectedParetoId],
  );

  useEffect(() => {
    if (!selectedParetoEntry) {
      setRunEntries([]);
      setDrilldownError(null);
      return;
    }

    const days = RANGE_TO_DAYS[selectedRange];
    const { start, end } = computeWindowBounds(days);
    const controller = new AbortController();
    let cancelled = false;

    setDrilldownError(null);

    fetchTelemetryRuns(
      {
        start,
        end,
        providerId: selectedParetoEntry.providerId,
        route: selectedParetoEntry.route ?? undefined,
        limit: 20,
      },
      controller.signal,
    )
      .then((response) => {
        if (cancelled) {
          return;
        }

        if (!response.items.length) {
          setRunEntries([]);
          return;
        }

        setRunEntries(buildRunsFromTelemetry(response.items));
      })
      .catch(() => {
        if (!cancelled) {
          setRunEntries([]);
          setDrilldownError('Não foi possível carregar o drill-down da rota selecionada.');
        }
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [selectedParetoEntry, selectedRange]);

  const drilldownRuns = runEntries;

  const isFetching = isLoading || (isTelemetryLoading && Object.keys(providerSeriesMap).length === 0);

  if (isFetching) {
    return (
      <section className="finops" aria-busy="true">
        <header className="finops__header">
          <div>
            <p className="finops__eyebrow">FinOps</p>
            <h2>Séries temporais</h2>
          </div>
        </header>
        <p className="finops__state">{telemetryMessages.loading}</p>
      </section>
    );
  }

  if (initialError) {
    return (
      <section className="finops" role="alert">
        <header className="finops__header">
          <div>
            <p className="finops__eyebrow">FinOps</p>
            <h2>Séries temporais</h2>
          </div>
        </header>
        <p className="finops__state">{initialError}</p>
      </section>
    );
  }

  if (!hasProviders) {
    return (
      <section className="finops" role="status">
        <header className="finops__header">
          <div>
            <p className="finops__eyebrow">FinOps</p>
            <h2>Séries temporais</h2>
          </div>
        </header>
        <p className="finops__state">Nenhum provedor disponível para análise.</p>
      </section>
    );
  }

  return (
    <section className="finops">
      <header className="finops__header">
        <div>
          <p className="finops__eyebrow">FinOps</p>
          <h2>Séries temporais &amp; filtros</h2>
          <p className="finops__subtitle">
            Analise custo, volume e latência média por provedor em diferentes janelas de tempo.
          </p>
        </div>
        <div className="finops__filters" aria-label="Filtros de FinOps">
          <div className="finops__filter-group">
            <span className="finops__filter-label">Período</span>
            <div className="finops__segmented">
              {(['7d', '30d', '90d'] as RangeOption[]).map((option) => (
                <button
                  key={option}
                  type="button"
                  className={selectedRange === option ? 'finops__segmented-btn finops__segmented-btn--active' : 'finops__segmented-btn'}
                  onClick={() => setSelectedRange(option)}
                  aria-pressed={selectedRange === option}
                >
                  {option.replace('d', ' dias')}
                </button>
              ))}
            </div>
          </div>
          <label className="finops__filter-group">
            <span className="finops__filter-label">Provedor</span>
            <select
              className="finops__select"
              value={selectedProvider}
              onChange={(event) => setSelectedProvider(event.target.value as ProviderSelection)}
            >
              <option value="all">Todos</option>
              {providers.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.name}
                </option>
              ))}
            </select>
          </label>
          <div className="finops__filter-group">
            <span className="finops__filter-label">Métrica</span>
            <div className="finops__segmented">
              {(['cost', 'tokens'] as MetricOption[]).map((option) => (
                <button
                  key={option}
                  type="button"
                  className={selectedMetric === option ? 'finops__segmented-btn finops__segmented-btn--active' : 'finops__segmented-btn'}
                  onClick={() => setSelectedMetric(option)}
                  aria-pressed={selectedMetric === option}
                >
                  {option === 'cost' ? 'Custo' : 'Tokens'}
                </button>
              ))}
            </div>
          </div>
          <div className="finops__export-group">
            <button
              type="button"
              data-testid={FINOPS_TEST_IDS.exports.csvButton}
              className="finops__export"
              onClick={() => handleTelemetryExport('csv')}
              disabled={isTelemetryExporting || availableSeries.length === 0}
            >
              {isTelemetryExporting ? 'Gerando…' : 'Exportar CSV'}
            </button>
            <button
              type="button"
              data-testid={FINOPS_TEST_IDS.exports.htmlButton}
              className="finops__export"
              onClick={() => handleTelemetryExport('html')}
              disabled={isTelemetryExporting || availableSeries.length === 0}
            >
              {isTelemetryExporting ? 'Gerando…' : 'Exportar HTML'}
            </button>
          </div>
        </div>
      </header>

      <section
        className="finops__policy"
        aria-labelledby="finops-policy-heading"
        data-testid={FINOPS_TEST_IDS.policy.section}
      >
        <header className="finops-policy__header">
          <div>
            <h3 id="finops-policy-heading">Budgets e alertas determinísticos</h3>
            <p>Defina limites por tier e canais de aviso antes de atingir o runtime.</p>
          </div>
          <span className="finops-policy__timestamp">
            Última atualização: {manifest?.updatedAt ? new Date(manifest.updatedAt).toLocaleString('pt-BR') : '—'}
          </span>
        </header>
        {manifestError && <p className="error">{manifestError}</p>}
        {planError && <p className="error">{planError}</p>}
        {planStatusMessage && <p className="status status--inline">{planStatusMessage}</p>}
        <form
          className="finops-policy__form"
          onSubmit={handleFinOpsSubmit}
          data-testid={FINOPS_TEST_IDS.policy.form}
        >
          <div className="finops-policy__grid">
            <label className="form-field">
              <span>Cost center responsável</span>
              <input
                type="text"
                value={costCenter}
                onChange={handleCostCenterChange}
                placeholder="ex.: AI-Guardrails"
                disabled={isFormDisabled}
                aria-invalid={costCenterError ? 'true' : 'false'}
                aria-describedby={costCenterError ? 'finops-costcenter-error' : undefined}
              />
              {costCenterError && (
                <span id="finops-costcenter-error" className="form-field__error">
                  {costCenterError}
                </span>
              )}
            </label>
            <label className="form-field">
              <span>Cache TTL (segundos)</span>
              <input
                type="number"
                min={0}
                value={cacheTtl}
                onChange={handleCacheTtlChange}
                placeholder="ex.: 300"
                disabled={isFormDisabled}
                aria-invalid={cacheTtlError ? 'true' : 'false'}
                aria-describedby={cacheTtlError ? 'finops-cache-ttl-error' : undefined}
              />
              {cacheTtlError && (
                <span id="finops-cache-ttl-error" className="form-field__error">
                  {cacheTtlError}
                </span>
              )}
            </label>
            <label className="form-field">
              <span>Rate limit (req/min)</span>
              <input
                type="number"
                min={1}
                value={rateLimit}
                onChange={handleRateLimitChange}
                placeholder="ex.: 120"
                disabled={isFormDisabled}
                aria-invalid={rateLimitError ? 'true' : 'false'}
                aria-describedby={rateLimitError ? 'finops-ratelimit-error' : undefined}
              />
              {rateLimitError && (
                <span id="finops-ratelimit-error" className="form-field__error">
                  {rateLimitError}
                </span>
              )}
            </label>
            <label className="form-field">
              <span>Estratégia de degradação graciosa</span>
              <select value={gracefulStrategy} onChange={handleGracefulStrategyChange} disabled={isFormDisabled}>
                {GRACEFUL_STRATEGIES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-field">
              <span>Mensagem de degradação</span>
              <input
                type="text"
                value={gracefulMessage}
                onChange={handleGracefulMessageChange}
                placeholder="ex.: Servindo respostas em modo reduzido"
                disabled={isFormDisabled || gracefulStrategy === 'none'}
              />
            </label>
          </div>

          <div
            className="finops-policy__budgets"
            data-testid={FINOPS_TEST_IDS.policy.budgets}
          >
            <div className="finops-policy__section-header">
              <h4>Budgets por tier</h4>
              <p>Controle limites para cada tier roteado. Valores vazios não serão aplicados.</p>
            </div>
            <div className="finops-policy__table" role="group" aria-label="Budgets configurados">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Tier</th>
                    <th scope="col">Valor (USD)</th>
                    <th scope="col">Moeda</th>
                    <th scope="col">Período</th>
                    <th scope="col" aria-label="Ações" />
                  </tr>
                </thead>
                <tbody>
                  {budgetRows.map((row, index) => (
                    <tr key={`budget-${index}`}>
                      <td>
                        <select
                          value={row.tier}
                          onChange={(event) => handleBudgetChange(index, 'tier', event.target.value)}
                          disabled={isFormDisabled}
                        >
                          {(Object.keys(TIER_LABEL) as RoutingTierId[]).map((tier) => (
                            <option key={tier} value={tier}>
                              {TIER_LABEL[tier]}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <div className="finops-policy__field">
                          <input
                            type="number"
                            min={1}
                            step="0.01"
                            value={row.amount}
                            onChange={(event) => handleBudgetChange(index, 'amount', event.target.value)}
                            disabled={isFormDisabled}
                            aria-invalid={budgetErrors[index]?.amount ? 'true' : 'false'}
                            aria-describedby={budgetErrors[index]?.amount ? `budget-amount-${index}` : undefined}
                          />
                          {budgetErrors[index]?.amount && (
                            <span id={`budget-amount-${index}`} className="form-field__error">
                              {budgetErrors[index]?.amount}
                            </span>
                          )}
                        </div>
                      </td>
                      <td>
                        <div className="finops-policy__field">
                          <input
                            type="text"
                            value={row.currency}
                            onChange={(event) => handleBudgetChange(index, 'currency', event.target.value.toUpperCase())}
                            disabled={isFormDisabled}
                            maxLength={6}
                            aria-invalid={budgetErrors[index]?.currency ? 'true' : 'false'}
                            aria-describedby={budgetErrors[index]?.currency ? `budget-currency-${index}` : undefined}
                          />
                          {budgetErrors[index]?.currency && (
                            <span id={`budget-currency-${index}`} className="form-field__error">
                              {budgetErrors[index]?.currency}
                            </span>
                          )}
                        </div>
                      </td>
                      <td>
                        <select
                          value={row.period}
                          onChange={(event) => handleBudgetChange(index, 'period', event.target.value)}
                          disabled={isFormDisabled}
                        >
                          {PERIOD_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="button button--ghost finops-policy__remove"
                          onClick={() => handleRemoveBudget(index)}
                          disabled={isFormDisabled || budgetRows.length <= 1}
                        >
                          Remover
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button
              type="button"
              className="button button--ghost finops-policy__add"
              onClick={handleAddBudget}
              disabled={isFormDisabled}
            >
              Adicionar budget
            </button>
          </div>

          <div className="finops-policy__alerts">
            <div className="finops-policy__section-header">
              <h4>Alertas automáticos</h4>
              <p>Dispare avisos quando o consumo atingir um percentual do budget.</p>
            </div>
            <div
              className="finops-policy__alerts-list"
              data-testid={FINOPS_TEST_IDS.policy.alerts}
            >
              {alertRows.map((row, index) => (
                <div key={`alert-${index}`} className="finops-policy__alert">
                  <label className="form-field">
                    <span>Limiar (% do budget)</span>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={row.threshold}
                      onChange={(event) => handleAlertChange(index, 'threshold', event.target.value)}
                      disabled={isFormDisabled}
                      aria-invalid={alertErrors[index]?.threshold ? 'true' : 'false'}
                      aria-describedby={alertErrors[index]?.threshold ? `alert-threshold-${index}` : undefined}
                    />
                    {alertErrors[index]?.threshold && (
                      <span id={`alert-threshold-${index}`} className="form-field__error">
                        {alertErrors[index]?.threshold}
                      </span>
                    )}
                  </label>
                  <label className="form-field">
                    <span>Canal</span>
                    <select
                      value={row.channel}
                      onChange={(event) => handleAlertChange(index, 'channel', event.target.value)}
                      disabled={isFormDisabled}
                    >
                      {ESCALATION_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    className="button button--ghost finops-policy__remove"
                    onClick={() => handleRemoveAlert(index)}
                    disabled={isFormDisabled || alertRows.length <= 1}
                  >
                    Remover
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              className="button button--ghost finops-policy__add"
              onClick={handleAddAlert}
              disabled={isFormDisabled}
            >
              Adicionar alerta
            </button>
          </div>

          <div className="finops-policy__actions">
            <button
              type="submit"
              className="button button--primary"
              disabled={isManifestLoading || isPlanGenerating}
            >
              {isPlanGenerating ? 'Gerando plano…' : 'Gerar plano FinOps'}
            </button>
          </div>
        </form>
        <section
          className="finops-plan"
          aria-label="Plano FinOps"
          data-testid={FINOPS_TEST_IDS.plan.section}
        >
          <ConfirmationModal
            isOpen={Boolean(planConfirmation)}
            title={planConfirmationContent?.title ?? 'Confirmar ação'}
            description={planConfirmationContent?.description}
            confirmLabel={planConfirmationContent?.confirmLabel ?? 'Confirmar'}
            confirmArmedLabel={planConfirmationContent?.confirmArmedLabel ?? 'Confirmar agora'}
            onConfirm={confirmPlanAction}
            onCancel={closePlanConfirmation}
            isLoading={isPlanConfirming || isPlanApplying}
          />
          <PlanSummary
            plan={planSummary}
            isLoading={isPlanGenerating || isPlanApplying}
            testId={FINOPS_TEST_IDS.plan.summary}
            actions={
              pendingPlan ? (
                <div className="plan-summary__actions">
                  <button
                    type="button"
                    className="button button--ghost"
                    onClick={requestPlanReset}
                    disabled={isPlanGenerating || isPlanApplying || isPlanConfirming}
                  >
                    Descartar plano
                  </button>
                  <button
                    type="button"
                    className="button button--primary"
                    onClick={requestPlanApply}
                    disabled={isPlanGenerating || isPlanApplying || isPlanConfirming}
                  >
                    {isPlanApplying ? 'Aplicando…' : 'Aplicar plano'}
                  </button>
                </div>
              ) : null
            }
          />
          <PlanDiffViewer
            diffs={planDiffItems}
            title="Diffs sugeridos"
            emptyMessage="Gere um plano FinOps para visualizar as alterações propostas."
            testId={FINOPS_TEST_IDS.plan.diffs}
            itemTestIdPrefix={FINOPS_TEST_IDS.plan.diffPrefix}
          />
        </section>
      </section>

      {timeseriesError && (
        <p className="finops__state" role="status">{timeseriesError}</p>
      )}

      <section
        className="finops__alerts"
        aria-label="Alertas de FinOps"
        data-testid={FINOPS_TEST_IDS.alerts.section}
      >
        <header className="finops__alerts-header">
          <div>
            <h3>Alertas básicos</h3>
            <p>Registros determinísticos gerados a partir da telemetria atual.</p>
          </div>
        </header>
        <ul className="finops__alerts-list">
          {finOpsAlerts.map((alert) => (
            <li
              key={alert.id}
              className={`finops__alert finops__alert--${alert.kind}`}
              data-testid={FINOPS_TEST_IDS.alerts.item(alert.id)}
            >
              <strong>{alert.title}</strong>
              <p>{alert.description}</p>
            </li>
          ))}
        </ul>
      </section>

      <section
        className="finops__hotspots"
        aria-label="Hotspots de custo e eficiência"
        data-testid={FINOPS_TEST_IDS.hotspots.section}
      >
        <header className="finops__hotspots-header">
          <div>
            <h3>Hotspots prioritários</h3>
            <p>Focos que combinam concentração de custo, falhas e latência na janela filtrada.</p>
          </div>
        </header>

        {finOpsHotspots.length === 0 ? (
          <p className="finops__state" data-testid={FINOPS_TEST_IDS.hotspots.empty}>
            Nenhum hotspot identificado para os filtros atuais.
          </p>
        ) : (
          <ul className="finops__hotspots-list">
            {finOpsHotspots.map((hotspot) => (
              <li
                key={hotspot.id}
                className={`finops__hotspot finops__hotspot--${hotspot.severity}`}
                role="article"
                aria-label={`${hotspot.title} (${HOTSPOT_SEVERITY_LABEL[hotspot.severity]})`}
                data-testid={FINOPS_TEST_IDS.hotspots.item(hotspot.id)}
              >
                <div className="finops__hotspot-header">
                  <span className={`finops__hotspot-kind finops__hotspot-kind--${hotspot.kind}`}>
                    {HOTSPOT_KIND_LABEL[hotspot.kind]}
                  </span>
                  <span className="finops__hotspot-metric">
                    <strong>{hotspot.metricValue}</strong>
                    <span>{hotspot.metricLabel}</span>
                  </span>
                </div>
                <h4>{hotspot.title}</h4>
                <p>{hotspot.summary}</p>
                <footer className="finops__hotspot-footer">
                  <span
                    className="finops__hotspot-severity"
                    aria-label={`Severidade: ${HOTSPOT_SEVERITY_LABEL[hotspot.severity]}`}
                  >
                    {HOTSPOT_SEVERITY_LABEL[hotspot.severity]}
                  </span>
                  <p>{hotspot.recommendation}</p>
                </footer>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="finops__kpis" role="list">
        <article className="finops__kpi" role="listitem">
          <span className="finops__kpi-label">Custo acumulado</span>
          <strong>{METRIC_CONFIG.cost.formatter(aggregatedMetrics.totalCost)}</strong>
        </article>
        <article className="finops__kpi" role="listitem">
          <span className="finops__kpi-label">Tokens processados</span>
          <strong>{METRIC_CONFIG.tokens.formatter(aggregatedMetrics.totalTokens)}</strong>
        </article>
        <article className="finops__kpi" role="listitem">
          <span className="finops__kpi-label">Custo por 1M tokens</span>
          <strong>{METRIC_CONFIG.cost.formatter(aggregatedMetrics.costPerMillion)}</strong>
        </article>
        <article className="finops__kpi" role="listitem">
          <span className="finops__kpi-label">Latência média</span>
          <strong>{formatLatency(aggregatedMetrics.averageLatency)}</strong>
        </article>
      </div>

      <div className="finops__chart" role="figure" aria-label={`Série temporal de ${metricConfig.label}`}>
        <Suspense
          fallback={
            <p className="finops__state" role="status" aria-live="polite">
              Carregando série temporal…
            </p>
          }
        >
          <FinOpsTimeseriesChart
            availableSeries={availableSeries}
            metricAccessor={metricConfig.accessor}
            metricLabel={metricConfig.label}
            tooltipFormatter={metricConfig.formatter}
            yAxisFormatter={timeseriesYAxisFormatter}
            emptyStateMessage="Sem dados para o filtro selecionado."
          />
        </Suspense>
      </div>

      <section className="finops__table" aria-label="Resumo diário">
        <header className="finops__table-header">
          <h3>Resumo diário</h3>
          <p>As 10 datas mais recentes dentro do filtro selecionado.</p>
        </header>
        <div className="finops__table-scroll">
          <table aria-label="Resumo diário filtrado">
            <thead>
              <tr>
                <th scope="col">Data</th>
                <th scope="col">Custo (USD)</th>
                <th scope="col">Tokens (mi)</th>
                <th scope="col">Latência média</th>
              </tr>
            </thead>
            <tbody>
              {availableSeries
                .slice(-10)
                .reverse()
                .map((point) => (
                  <tr key={point.date}>
                    <th scope="row">{point.date}</th>
                    <td>{METRIC_CONFIG.cost.formatter(point.costUsd)}</td>
                    <td>{point.tokensMillions.toFixed(2)}</td>
                    <td>{formatLatency(point.avgLatencyMs)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="finops__dashboards">
        <section className="finops__insight" aria-label="Resumo de experimentos e cohorts">
          <header className="finops__insight-header">
            <div>
              <h3>Experimentos e cohorts</h3>
              <p>Monitore MTTR, confiabilidade e custo por variação executada na janela.</p>
            </div>
            <div className="finops__insight-actions" role="group" aria-label="Exportar experimentos">
              <button
                type="button"
                className="finops__action"
                onClick={() => handleExperimentExport('csv')}
                disabled={!hasExperimentData}
                aria-label="Exportar experimentos em CSV"
              >
                CSV
              </button>
              <button
                type="button"
                className="finops__action"
                onClick={() => handleExperimentExport('json')}
                disabled={!hasExperimentData}
                aria-label="Exportar experimentos em JSON"
              >
                JSON
              </button>
            </div>
          </header>
          {experimentError ? (
            <p className="finops__state" role="status">
              {experimentError}
            </p>
          ) : !hasExperimentData ? (
            <p className="finops__state">Nenhum experimento registrado para o filtro aplicado.</p>
          ) : (
            <>
              <dl className="finops__insight-metrics">
                <div>
                  <dt>MTTR médio</dt>
                  <dd>{formatDurationMs(experimentAggregate.averageMttr)}</dd>
                </div>
                <div>
                  <dt>Sucesso ponderado</dt>
                  <dd>{formatPercent(experimentAggregate.successRate)}</dd>
                </div>
                <div>
                  <dt>Erro ponderado</dt>
                  <dd>{formatPercent(experimentAggregate.errorRate)}</dd>
                </div>
                <div>
                  <dt>Custo total</dt>
                  <dd>{METRIC_CONFIG.cost.formatter(Number(experimentAggregate.totalCost.toFixed(2)))}</dd>
                </div>
                <div>
                  <dt>Tokens</dt>
                  <dd>{formatTokensMillions(experimentAggregate.totalTokensMillions)}</dd>
                </div>
                <div>
                  <dt>Eventos de recovery</dt>
                  <dd>{experimentAggregate.recoveryEvents}</dd>
                </div>
              </dl>
              <div className="finops__insight-table" role="region" aria-label="Tabela de experimentos e cohorts">
                <table aria-label="Tabela de experimentos e cohorts">
                  <thead>
                    <tr>
                      <th scope="col">Variação</th>
                      <th scope="col">Runs</th>
                      <th scope="col">Sucesso</th>
                      <th scope="col">Erro</th>
                      <th scope="col">MTTR</th>
                      <th scope="col">Recuperações</th>
                      <th scope="col">Custo (USD)</th>
                      <th scope="col">Tokens (mi)</th>
                      <th scope="col">Latência</th>
                    </tr>
                  </thead>
                  <tbody>
                    {experimentRows.map((row) => {
                      const variationLabel =
                        row.cohort && row.tag
                          ? `${row.cohort} · ${row.tag}`
                          : row.cohort ?? row.tag ?? 'Tráfego padrão';
                      const cohortLabel = row.cohort ?? '—';
                      const tagLabel = row.tag ?? '—';
                      return (
                        <tr key={row.key}>
                          <th scope="row">
                            <span>{variationLabel}</span>
                            <span className="finops__insight-subtitle">Cohort: {cohortLabel} · Tag: {tagLabel}</span>
                          </th>
                          <td>{row.runCount}</td>
                          <td>{formatPercent(row.successRate)}</td>
                          <td>{formatPercent(row.errorRate)}</td>
                          <td>{formatDurationMs(row.mttrMs)}</td>
                          <td>{row.recoveryEvents}</td>
                          <td>{METRIC_CONFIG.cost.formatter(Number(row.totalCostUsd.toFixed(2)))}</td>
                          <td>{formatTokensMillions(row.tokensMillions)}</td>
                          <td>{formatLatency(row.avgLatencyMs)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>

        <section className="finops__insight" aria-label="Custo por tier roteado">
          <header className="finops__insight-header">
            <div>
              <h3>Custo por tier</h3>
              <p>Distribuição de custo, volume e latência para economy, balanced e turbo.</p>
            </div>
            <div className="finops__insight-actions" role="group" aria-label="Exportar custos por tier">
              <button
                type="button"
                className="finops__action"
                onClick={() => handleLaneExport('csv')}
                disabled={!hasLaneData}
                aria-label="Exportar custos por tier em CSV"
              >
                CSV
              </button>
              <button
                type="button"
                className="finops__action"
                onClick={() => handleLaneExport('json')}
                disabled={!hasLaneData}
                aria-label="Exportar custos por tier em JSON"
              >
                JSON
              </button>
            </div>
          </header>
          {laneCostError ? (
            <p className="finops__state" role="status">
              {laneCostError}
            </p>
          ) : (
            <>
              <dl className="finops__insight-metrics">
                <div>
                  <dt>Custo total</dt>
                  <dd>{METRIC_CONFIG.cost.formatter(Number(laneOverview.totals.totalCostUsd.toFixed(2)))}</dd>
                </div>
                <div>
                  <dt>Tokens</dt>
                  <dd>{formatTokensMillions(laneOverview.totals.totalTokensMillions)}</dd>
                </div>
                <div>
                  <dt>Runs</dt>
                  <dd>{laneOverview.totals.totalRuns}</dd>
                </div>
                <div>
                  <dt>Latência média</dt>
                  <dd>{formatLatency(laneOverview.totals.averageLatencyMs)}</dd>
                </div>
              </dl>
              <ul className="finops__lane-grid" role="list">
                {laneOverview.rows.map((row) => {
                  const laneConfig = LANE_CONFIG[row.lane];
                  return (
                    <li key={row.lane} className="finops__lane-card" role="listitem">
                      <div className="finops__lane-card-header">
                        <span className={`finops__lane finops__lane--${row.lane}`}>{laneConfig.label}</span>
                        <strong>{METRIC_CONFIG.cost.formatter(Number(row.totalCostUsd.toFixed(2)))}</strong>
                      </div>
                      <div className="finops__lane-progress" aria-hidden="true">
                        <span style={{ width: `${Math.min(100, row.costShare * 100)}%` }} />
                      </div>
                      <dl className="finops__lane-details">
                        <div>
                          <dt>Share de custo</dt>
                          <dd>{formatPercent(row.costShare)}</dd>
                        </div>
                        <div>
                          <dt>Runs</dt>
                          <dd>{row.runCount}</dd>
                        </div>
                        <div>
                          <dt>Tokens</dt>
                          <dd>{formatTokensMillions(row.tokensMillions)}</dd>
                        </div>
                        <div>
                          <dt>Latência</dt>
                          <dd>{formatLatency(row.avgLatencyMs)}</dd>
                        </div>
                        <div>
                          <dt>Custo / 1M tokens</dt>
                          <dd>{METRIC_CONFIG.cost.formatter(Number(row.costPerMillion.toFixed(2)))}</dd>
                        </div>
                      </dl>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </section>

        <section className="finops__insight" aria-label="Performance do marketplace monitorado">
          <header className="finops__insight-header">
            <div>
              <h3>Performance do marketplace</h3>
              <p>Comparativo entre entradas monitoradas com rating, adoção e custo acumulado.</p>
            </div>
            <div className="finops__insight-actions" role="group" aria-label="Exportar marketplace">
              <button
                type="button"
                className="finops__action"
                onClick={() => handleMarketplaceExport('csv')}
                disabled={!hasMarketplaceData}
                aria-label="Exportar marketplace em CSV"
              >
                CSV
              </button>
              <button
                type="button"
                className="finops__action"
                onClick={() => handleMarketplaceExport('json')}
                disabled={!hasMarketplaceData}
                aria-label="Exportar marketplace em JSON"
              >
                JSON
              </button>
            </div>
          </header>
          {marketplaceError ? (
            <p className="finops__state" role="status">
              {marketplaceError}
            </p>
          ) : !hasMarketplaceData ? (
            <p className="finops__state">Sem entradas de marketplace para o filtro selecionado.</p>
          ) : (
            <>
              <dl className="finops__insight-metrics">
                <div>
                  <dt>Custo total</dt>
                  <dd>{METRIC_CONFIG.cost.formatter(Number(marketplaceAggregate.totalCostUsd.toFixed(2)))}</dd>
                </div>
                <div>
                  <dt>Tokens</dt>
                  <dd>{formatTokensMillions(marketplaceAggregate.totalTokensMillions)}</dd>
                </div>
                <div>
                  <dt>Runs</dt>
                  <dd>{marketplaceAggregate.totalRuns}</dd>
                </div>
                <div>
                  <dt>Rating médio</dt>
                  <dd>{
                    marketplaceAggregate.avgRating !== null
                      ? marketplaceAggregate.avgRating.toFixed(1)
                      : '—'
                  }</dd>
                </div>
                <div>
                  <dt>Sucesso ponderado</dt>
                  <dd>{formatPercent(marketplaceAggregate.avgSuccessRate)}</dd>
                </div>
                <div>
                  <dt>Adoção média</dt>
                  <dd>{formatPercent(marketplaceAggregate.avgAdoption)}</dd>
                </div>
              </dl>
              <div className="finops__insight-table" role="region" aria-label="Tabela de marketplace monitorado">
                <table aria-label="Tabela de marketplace monitorado">
                  <thead>
                    <tr>
                      <th scope="col">Entrada</th>
                      <th scope="col">Cohorts</th>
                      <th scope="col">Runs</th>
                      <th scope="col">Rating</th>
                      <th scope="col">Adoção</th>
                      <th scope="col">Sucesso</th>
                      <th scope="col">Latência</th>
                      <th scope="col">Custo unitário</th>
                      <th scope="col">Custo total</th>
                      <th scope="col">Tokens (mi)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {marketplaceRows.map((row) => (
                      <tr key={row.id}>
                        <th scope="row">
                          <span>{row.name}</span>
                          <span className="finops__insight-subtitle">{row.origin}</span>
                        </th>
                        <td>{row.cohorts.length ? row.cohorts.join(', ') : '—'}</td>
                        <td>{row.runCount}</td>
                        <td>{row.rating.toFixed(1)}</td>
                        <td>{formatPercent(row.adoptionScore)}</td>
                        <td>{formatPercent(row.successRate)}</td>
                        <td>{formatLatency(row.avgLatencyMs)}</td>
                        <td>{METRIC_CONFIG.cost.formatter(Number(row.cost.toFixed(2)))}</td>
                        <td>{METRIC_CONFIG.cost.formatter(Number(row.totalCostUsd.toFixed(2)))}</td>
                        <td>{formatTokensMillions(row.tokensMillions)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      </div>

      <section className="finops__reports" aria-label="Relatórios consolidados por sprint e PR">
        <header className="finops__reports-header">
          <div>
            <h3>Relatórios por sprint/PR</h3>
            <p>
              Consolidados determinísticos com base na janela filtrada para facilitar o repasse ao time de FinOps.
            </p>
          </div>
        </header>
        <div className="finops__reports-grid">
          <article className="finops__report-card" aria-label="Sprints recentes">
            <header className="finops__report-card-header">
              <h4>Sprints recentes</h4>
              <span>Visão comparativa de custo e volume</span>
            </header>
            {sprintReportsError ? (
              <p className="finops__state" role="status">{sprintReportsError}</p>
            ) : sprintReports.length === 0 ? (
              <p className="finops__state">
                Gere telemetria suficiente para destravar o comparativo por sprint.
              </p>
            ) : (
              <div className="finops__report-table" role="region" aria-label="Tabela de sprints">
                <table>
                  <thead>
                    <tr>
                      <th scope="col">Sprint</th>
                      <th scope="col">Período</th>
                      <th scope="col">Custo (USD)</th>
                      <th scope="col">Δ custo</th>
                      <th scope="col">Tokens (mi)</th>
                      <th scope="col">Status</th>
                      <th scope="col">Resumo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sprintReports.map((report) => (
                      <tr key={report.id}>
                        <th scope="row">{report.name}</th>
                        <td>{report.periodLabel}</td>
                        <td>{METRIC_CONFIG.cost.formatter(report.totalCostUsd)}</td>
                        <td>{formatSignedPercent(report.costDelta)}</td>
                        <td>{report.totalTokensMillions.toFixed(2)}</td>
                        <td>
                          <span className={`finops__status-badge finops__status-badge--${report.status}`}>
                            <span className="finops__status-dot" aria-hidden="true" />
                            {REPORT_STATUS_LABEL[report.status]}
                          </span>
                        </td>
                        <td>{report.summary}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </article>

          <article className="finops__report-card" aria-label="Pull requests com impacto de custo">
            <header className="finops__report-card-header">
              <h4>PRs monitorados</h4>
              <span>Impacto financeiro estimado</span>
            </header>
            {pullRequestReportsError ? (
              <p className="finops__state" role="status">{pullRequestReportsError}</p>
            ) : pullRequestReports.length === 0 ? (
              <p className="finops__state">Nenhum PR relevante encontrado para os filtros atuais.</p>
            ) : (
              <div className="finops__report-table" role="region" aria-label="Tabela de pull requests">
                <table>
                  <thead>
                    <tr>
                      <th scope="col">PR</th>
                      <th scope="col">Squad</th>
                      <th scope="col">Merge</th>
                      <th scope="col">Impacto (USD)</th>
                      <th scope="col">Δ custo</th>
                      <th scope="col">Tokens (mi)</th>
                      <th scope="col">Status</th>
                      <th scope="col">Resumo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pullRequestReports.map((report) => (
                      <tr key={report.id}>
                        <th scope="row">{report.id}</th>
                        <td>{report.owner}</td>
                        <td>{report.mergedAtLabel}</td>
                        <td>{METRIC_CONFIG.cost.formatter(report.costImpactUsd)}</td>
                        <td>{formatSignedPercent(report.costDelta)}</td>
                        <td>{report.tokensImpactMillions.toFixed(2)}</td>
                        <td>
                          <span className={`finops__status-badge finops__status-badge--${report.status}`}>
                            <span className="finops__status-dot" aria-hidden="true" />
                            {REPORT_STATUS_LABEL[report.status]}
                          </span>
                        </td>
                        <td>{report.summary}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </article>
        </div>
      </section>

      <div className="finops__breakdowns">
        <section className="finops__pareto" aria-label="Pareto de custo por modelo">
          <header className="finops__pareto-header">
            <div>
              <h3>Pareto de custo</h3>
              <p>Identifique rotas que concentram o gasto acumulado na janela atual.</p>
            </div>
            <span className="finops__pareto-total" aria-label="Custo total considerado">
              {METRIC_CONFIG.cost.formatter(totalParetoCost)}
            </span>
          </header>

          {paretoEntries.length === 0 ? (
            <p className="finops__state">Sem rotas suficientes para gerar o Pareto.</p>
          ) : (
            <div className="finops__pareto-list" role="radiogroup" aria-label="Rotas ordenadas por custo">
              {paretoEntries.map((entry) => {
                const laneConfig = LANE_CONFIG[entry.lane];
                return (
                  <button
                    key={entry.id}
                    type="button"
                    role="radio"
                    aria-checked={selectedParetoId === entry.id}
                    className={
                      selectedParetoId === entry.id
                        ? 'finops__pareto-button finops__pareto-button--active'
                        : 'finops__pareto-button'
                    }
                    onClick={() => setSelectedParetoId(entry.id)}
                  >
                    <div className="finops__pareto-top">
                      <div className="finops__pareto-route">
                        <strong>{entry.label}</strong>
                        <span>{entry.providerName}</span>
                      </div>
                      <div className="finops__pareto-metric">
                        <span>{METRIC_CONFIG.cost.formatter(entry.costUsd)}</span>
                        <span>{formatPercent(entry.share)} do total</span>
                      </div>
                    </div>
                    <div className="finops__pareto-track" aria-hidden="true">
                      <span
                        className="finops__pareto-track-fill"
                        style={{ width: `${Math.min(100, entry.share * 100)}%` }}
                      />
                    </div>
                    <div className="finops__pareto-meta">
                      <span className={`finops__lane finops__lane--${entry.lane}`}>{laneConfig.label}</span>
                      <span>{entry.tokensMillions.toFixed(1)} mi tokens</span>
                      <span>{entry.runs} runs</span>
                      <span>{formatPercent(entry.cumulativeShare)} cumulativo</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <section className="finops__drilldown" aria-label="Drill-down da rota selecionada">
          <header className="finops__drilldown-header">
            <div>
              <h3>Drill-down de runs</h3>
              <p>Detalhe determinístico das execuções mais recentes para a rota destacada.</p>
            </div>
          </header>

          {!selectedParetoEntry ? (
            <p className="finops__state">Selecione uma rota na lista ao lado para visualizar os runs.</p>
          ) : (
            <>
              <div className="finops__drilldown-meta">
                <div>
                  <h4>{selectedParetoEntry.label}</h4>
                  <p>{selectedParetoEntry.providerName}</p>
                </div>
                <div className="finops__drilldown-stats">
                  <div className="finops__drilldown-stat">
                    <span>Custo na janela</span>
                    <strong>{METRIC_CONFIG.cost.formatter(selectedParetoEntry.costUsd)}</strong>
                  </div>
                  <div className="finops__drilldown-stat">
                    <span>Tokens</span>
                    <strong>{selectedParetoEntry.tokensMillions.toFixed(2)} mi</strong>
                  </div>
                  <div className="finops__drilldown-stat">
                    <span>Runs</span>
                    <strong>{selectedParetoEntry.runs}</strong>
                  </div>
                  <div className="finops__drilldown-stat">
                    <span>Taxa de sucesso</span>
                    <strong>{formatPercent(selectedParetoEntry.successRate)}</strong>
                  </div>
                </div>
              </div>

              {drilldownError ? (
                <p className="finops__state" role="status">{drilldownError}</p>
              ) : drilldownRuns.length === 0 ? (
                <p className="finops__state">Sem execuções registradas para esta combinação.</p>
              ) : (
                <div className="finops__drilldown-table">
                  <table aria-label="Runs da rota selecionada">
                    <thead>
                      <tr>
                        <th scope="col">Execução</th>
                        <th scope="col">Horário</th>
                        <th scope="col">Tokens (mil)</th>
                        <th scope="col">Custo (USD)</th>
                        <th scope="col">Latência</th>
                        <th scope="col">Status</th>
                        <th scope="col">Projeto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {drilldownRuns.map((run) => (
                        <tr key={run.id}>
                          <th scope="row">{run.id.split('-').pop()}</th>
                          <td>{formatTimestamp(run.timestamp)}</td>
                          <td>{run.tokensThousands.toFixed(1)}</td>
                          <td>{METRIC_CONFIG.cost.formatter(run.costUsd)}</td>
                          <td>{formatLatency(run.latencyMs)}</td>
                          <td>
                            <span className={`finops__status finops__status--${run.status}`}>
                              <span className="finops__status-dot" />
                              {RUN_STATUS_LABEL[run.status]}
                            </span>
                          </td>
                          <td>{run.consumer}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </section>
  );
}
