import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import type {
  ProviderSummary,
  TelemetryRouteBreakdownEntry,
  TelemetryRunEntry,
  TelemetryTimeseriesPoint,
  PolicyManifestSnapshot,
  FinOpsBudget,
  FinOpsAlertThreshold,
  PolicyManifestUpdateInput,
} from '../api';
import {
  fetchFinOpsPullRequestReports,
  fetchFinOpsSprintReports,
  fetchTelemetryPareto,
  fetchTelemetryRuns,
  fetchTelemetryTimeseries,
  fetchPolicyManifest,
  updatePolicyManifest,
  type BudgetPeriod,
  type HitlEscalationChannel,
  type RoutingTierId,
  type FinOpsPullRequestReportPayload,
  type FinOpsSprintReportPayload,
  type ReportStatus,
} from '../api';

export interface FinOpsProps {
  providers: ProviderSummary[];
  isLoading: boolean;
  initialError: string | null;
}

type RangeOption = '7d' | '30d' | '90d';
type MetricOption = 'cost' | 'tokens';

type ProviderSelection = 'all' | string;

type LaneCategory = 'economy' | 'balanced' | 'turbo';

interface TimeSeriesPoint {
  date: string;
  label: string;
  costUsd: number;
  tokensMillions: number;
  avgLatencyMs: number;
}

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

interface AlertRow extends FinOpsAlertThreshold {
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

const RANGE_TO_DAYS: Record<RangeOption, number> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
};

const METRIC_CONFIG: Record<MetricOption, { label: string; accessor: keyof TimeSeriesPoint; formatter: (value: number) => string }>
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

function buildSeriesFromTelemetry(
  items: TelemetryTimeseriesPoint[],
  start: Date,
  days: number,
): TimeSeriesPoint[] {
  const map = new Map(items.map((item) => [item.day, item]));
  const cursor = new Date(start);
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

function buildRouteBreakdownFromTelemetry(
  entries: TelemetryRouteBreakdownEntry[],
): RouteCostBreakdown[] {
  return entries.map((entry) => {
    const tokensTotal = entry.tokens_in + entry.tokens_out;
    const lane = entry.lane as LaneCategory;
    const routeLabel = entry.route ? entry.route : 'default';

    return {
      id: entry.id,
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

function exportCsv(data: TimeSeriesPoint[]): void {
  const header = ['data', 'custo_usd', 'tokens_milhoes', 'latencia_ms'];
  const rows = data.map((point) =>
    [point.date, point.costUsd.toFixed(2), point.tokensMillions.toFixed(2), point.avgLatencyMs.toString()].join(','),
  );
  const csv = [header.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `finops-${Date.now()}.csv`);
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function FinOps({ providers, isLoading, initialError }: FinOpsProps) {
  const [selectedRange, setSelectedRange] = useState<RangeOption>('30d');
  const [selectedMetric, setSelectedMetric] = useState<MetricOption>('cost');
  const [selectedProvider, setSelectedProvider] = useState<ProviderSelection>('all');
  const [selectedParetoId, setSelectedParetoId] = useState<string | null>(null);

  const hasProviders = providers.length > 0;

  const [providerSeriesMap, setProviderSeriesMap] = useState<Record<string, TimeSeriesPoint[]>>({});
  const [isTelemetryLoading, setIsTelemetryLoading] = useState(false);
  const [timeseriesError, setTimeseriesError] = useState<string | null>(null);
  const [routeBreakdownEntries, setRouteBreakdownEntries] = useState<RouteCostBreakdown[]>([]);
  const [runEntries, setRunEntries] = useState<RunDrilldownEntry[]>([]);
  const [sprintReports, setSprintReports] = useState<SprintReport[]>([]);
  const [pullRequestReports, setPullRequestReports] = useState<PullRequestReport[]>([]);
  const [sprintReportsError, setSprintReportsError] = useState<string | null>(null);
  const [pullRequestReportsError, setPullRequestReportsError] = useState<string | null>(null);
  const [drilldownError, setDrilldownError] = useState<string | null>(null);
  const [manifest, setManifest] = useState<PolicyManifestSnapshot | null>(null);
  const [isManifestLoading, setManifestLoading] = useState(false);
  const [manifestError, setManifestError] = useState<string | null>(null);
  const [costCenter, setCostCenter] = useState('');
  const [budgetRows, setBudgetRows] = useState<BudgetRow[]>([]);
  const [budgetErrors, setBudgetErrors] = useState<BudgetRowErrors[]>([]);
  const [alertRows, setAlertRows] = useState<AlertRow[]>([]);
  const [alertErrors, setAlertErrors] = useState<AlertRowErrors[]>([]);
  const [finOpsMessage, setFinOpsMessage] = useState<string | null>(null);
  const [isFinOpsSaving, setFinOpsSaving] = useState(false);
  const [costCenterError, setCostCenterError] = useState<string | null>(null);

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

    const budgetTemplate =
      budgets.length > 0
        ? budgets
        : (['economy', 'balanced', 'turbo'] as RoutingTierId[]).map((tier) => ({
            tier,
            amount: '',
            currency: 'USD',
            period: 'monthly',
          }));

    setBudgetRows(budgetTemplate);
    setBudgetErrors(budgetTemplate.map(() => ({}) as BudgetRowErrors));

    const alerts = (finops.alerts ?? []).map<AlertRow>((alert) => ({
      threshold: (alert.threshold * 100).toString(),
      channel: alert.channel,
    }));

    const alertTemplate = alerts.length > 0 ? alerts : [{ threshold: '75', channel: 'slack' }];
    setAlertRows(alertTemplate);
    setAlertErrors(alertTemplate.map(() => ({}) as AlertRowErrors));
  }, [manifest]);

  const handleCostCenterChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setCostCenter(event.target.value);
    setCostCenterError(null);
    setFinOpsMessage(null);
  }, []);

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
      setFinOpsMessage(null);
    },
    [],
  );

  const handleAddBudget = useCallback(() => {
    setBudgetRows((current) => [
      ...current,
      { tier: 'economy', amount: '', currency: 'USD', period: 'monthly' },
    ]);
    setBudgetErrors((current) => [...current, {}]);
  }, []);

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
    },
    [],
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
      setFinOpsMessage(null);
    },
    [],
  );

  const handleAddAlert = useCallback(() => {
    setAlertRows((current) => [...current, { threshold: '80', channel: 'email' }]);
    setAlertErrors((current) => [...current, {}]);
  }, []);

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
    },
    [],
  );

  const handleFinOpsSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();

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

      if (hasErrors) {
        setFinOpsMessage(null);
        return;
      }

      const payload: PolicyManifestUpdateInput = {
        finops: {
          costCenter: trimmedCostCenter,
          budgets: normalizedBudgets,
          alerts: normalizedAlerts,
        },
      };

      setIsFinOpsSaving(true);
      setFinOpsMessage(null);

      updatePolicyManifest(payload)
        .then(() => {
          setFinOpsMessage('Política financeira atualizada com sucesso.');
          setManifest((current) => {
            if (!current || !payload.finops) {
              return current;
            }
            return {
              ...current,
              finops: {
                ...current.finops,
                costCenter: payload.finops.costCenter ?? current.finops.costCenter,
                budgets: payload.finops.budgets ?? current.finops.budgets,
                alerts: payload.finops.alerts ?? current.finops.alerts,
              },
              updatedAt: new Date().toISOString(),
            };
          });
        })
        .catch(() => {
          setFinOpsMessage('Falha ao salvar budgets e alertas. Tente novamente.');
        })
        .finally(() => {
          setIsFinOpsSaving(false);
        });
    },
    [alertRows, budgetRows, costCenter],
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
          acc[id] = series;
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

  const aggregatedMetrics = useMemo(() => computeMetrics(availableSeries), [availableSeries]);

  const metricConfig = METRIC_CONFIG[selectedMetric];

  const selectedProviderLabel = useMemo(() => {
    if (selectedProvider === 'all') {
      return 'todos os provedores monitorados';
    }

    const provider = providers.find((item) => item.id === selectedProvider);
    return provider ? provider.name : selectedProvider;
  }, [providers, selectedProvider]);

  const breakdownEntries = routeBreakdownEntries;

  const paretoEntries = useMemo(() => computePareto(breakdownEntries), [breakdownEntries]);

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

      if (previousWindow.length >= Math.max(3, Math.floor(trailingDays / 2))) {
        const recentCostAverage = averageSeries(recentWindow, 'costUsd');
        const previousCostAverage = averageSeries(previousWindow, 'costUsd');

        if (previousCostAverage > 0) {
          const costChange = (recentCostAverage - previousCostAverage) / previousCostAverage;

          if (costChange >= 0.25) {
            alerts.push({
              id: 'cost-surge',
              kind: 'warning',
              title: 'Escalada de custo diário',
              description: `O custo médio diário dos últimos ${trailingDays} dias está ${formatSignedPercent(costChange)} em relação à janela anterior para ${selectedProviderLabel}.`,
            });
          } else if (costChange <= -0.25) {
            alerts.push({
              id: 'cost-drop',
              kind: 'info',
              title: 'Queda de custo detectada',
              description: `O custo médio diário reduziu ${formatPercent(Math.abs(costChange))} nas últimas ${trailingDays} execuções. Valide se houve otimizações permanentes.`,
            });
          }
        }

        const recentTokensAverage = averageSeries(recentWindow, 'tokensMillions');
        const previousTokensAverage = averageSeries(previousWindow, 'tokensMillions');

        if (previousTokensAverage > 0) {
          const tokensChange = (recentTokensAverage - previousTokensAverage) / previousTokensAverage;

          if (tokensChange <= -0.2) {
            alerts.push({
              id: 'tokens-drop',
              kind: 'info',
              title: 'Queda de volume de tokens',
              description: `O volume processado caiu ${formatPercent(Math.abs(tokensChange))} no período recente. Investigue se há rotas ociosas ou caches inválidos.`,
            });
          } else if (tokensChange >= 0.25) {
            alerts.push({
              id: 'tokens-surge',
              kind: 'warning',
              title: 'Pico de tokens consumidos',
              description: `O volume de tokens cresceu ${formatSignedPercent(tokensChange)}. Considere validar limites de custo e reaproveitamento de contexto.`,
            });
          }
        }
      }
    }

    const topPareto = paretoEntries[0];
    if (topPareto && topPareto.share >= 0.45) {
      alerts.push({
        id: 'pareto-concentration',
        kind: 'warning',
        title: 'Custo concentrado em uma rota',
        description: `${topPareto.label} (${topPareto.providerName}) responde por ${formatPercent(topPareto.share)} do gasto observado. Considere alternativas para diluir o risco.`,
      });
    }

    const lowSuccessRoutes = breakdownEntries.filter((entry) => entry.successRate <= 0.9).slice(0, 2);
    if (lowSuccessRoutes.length > 0) {
      const labels = lowSuccessRoutes
        .map((entry) => `${entry.label} (${formatPercent(entry.successRate)})`)
        .join(', ');

      alerts.push({
        id: 'success-rate',
        kind: 'error',
        title: 'Taxa de sucesso abaixo do esperado',
        description: `As rotas ${labels} estão abaixo de 90% de sucesso. Revise retries, limites e políticas de fallback.`,
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
        <p className="finops__state">Carregando telemetria de custo…</p>
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
          <button
            type="button"
            className="finops__export"
            onClick={() => exportCsv(availableSeries)}
            disabled={availableSeries.length === 0}
          >
            Exportar CSV
          </button>
        </div>
      </header>

      <section className="finops__policy" aria-labelledby="finops-policy-heading">
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
        {finOpsMessage && <p className="status status--inline">{finOpsMessage}</p>}
        <form className="finops-policy__form" onSubmit={handleFinOpsSubmit}>
          <div className="finops-policy__grid">
            <label className="form-field">
              <span>Cost center responsável</span>
              <input
                type="text"
                value={costCenter}
                onChange={handleCostCenterChange}
                placeholder="ex.: AI-Guardrails"
                disabled={isManifestLoading || isFinOpsSaving}
                aria-invalid={costCenterError ? 'true' : 'false'}
                aria-describedby={costCenterError ? 'finops-costcenter-error' : undefined}
              />
              {costCenterError && (
                <span id="finops-costcenter-error" className="form-field__error">
                  {costCenterError}
                </span>
              )}
            </label>
          </div>

          <div className="finops-policy__budgets">
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
                          disabled={isFinOpsSaving}
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
                            disabled={isFinOpsSaving}
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
                            disabled={isFinOpsSaving}
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
                          disabled={isFinOpsSaving}
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
                          disabled={isFinOpsSaving || budgetRows.length <= 1}
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
              disabled={isFinOpsSaving}
            >
              Adicionar budget
            </button>
          </div>

          <div className="finops-policy__alerts">
            <div className="finops-policy__section-header">
              <h4>Alertas automáticos</h4>
              <p>Dispare avisos quando o consumo atingir um percentual do budget.</p>
            </div>
            <div className="finops-policy__alerts-list">
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
                      disabled={isFinOpsSaving}
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
                      disabled={isFinOpsSaving}
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
                    disabled={isFinOpsSaving || alertRows.length <= 1}
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
              disabled={isFinOpsSaving}
            >
              Adicionar alerta
            </button>
          </div>

          <div className="finops-policy__actions">
            <button
              type="submit"
              className="button button--primary"
              disabled={isManifestLoading || isFinOpsSaving}
            >
              {isFinOpsSaving ? 'Salvando…' : 'Salvar política FinOps'}
            </button>
          </div>
        </form>
      </section>

      {timeseriesError && (
        <p className="finops__state" role="status">{timeseriesError}</p>
      )}

      <section className="finops__alerts" aria-label="Alertas de FinOps">
        <header className="finops__alerts-header">
          <div>
            <h3>Alertas básicos</h3>
            <p>Registros determinísticos gerados a partir da telemetria atual.</p>
          </div>
        </header>
        <ul className="finops__alerts-list">
          {finOpsAlerts.map((alert) => (
            <li key={alert.id} className={`finops__alert finops__alert--${alert.kind}`}>
              <strong>{alert.title}</strong>
              <p>{alert.description}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="finops__hotspots" aria-label="Hotspots de custo e eficiência">
        <header className="finops__hotspots-header">
          <div>
            <h3>Hotspots prioritários</h3>
            <p>Focos que combinam concentração de custo, falhas e latência na janela filtrada.</p>
          </div>
        </header>

        {finOpsHotspots.length === 0 ? (
          <p className="finops__state">Nenhum hotspot identificado para os filtros atuais.</p>
        ) : (
          <ul className="finops__hotspots-list">
            {finOpsHotspots.map((hotspot) => (
              <li
                key={hotspot.id}
                className={`finops__hotspot finops__hotspot--${hotspot.severity}`}
                role="article"
                aria-label={`${hotspot.title} (${HOTSPOT_SEVERITY_LABEL[hotspot.severity]})`}
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
        {availableSeries.length === 0 ? (
          <p className="finops__state">Sem dados para o filtro selecionado.</p>
        ) : (
          <ResponsiveContainer width="100%" height={320}>
            <AreaChart data={availableSeries} margin={{ top: 16, right: 16, left: 0, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" className="finops__chart-grid" />
              <XAxis dataKey="label" className="finops__chart-axis" interval="preserveStartEnd" />
              <YAxis
                className="finops__chart-axis"
                tickFormatter={(value: number) =>
                  selectedMetric === 'cost' ? `$${value.toFixed(value >= 1000 ? 0 : 1)}` : `${value.toFixed(0)} mi`
                }
                width={80}
              />
              <Tooltip
                formatter={(value: number) => metricConfig.formatter(value)}
                labelFormatter={(label: string) => label}
                contentStyle={{ background: 'var(--surface-elevated)', borderRadius: '12px', border: '1px solid var(--border-strong)' }}
              />
              <Area
                type="monotone"
                dataKey={metricConfig.accessor}
                name={metricConfig.label}
                stroke="var(--accent-primary)"
                fill="var(--accent-primary-transparent)"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
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
