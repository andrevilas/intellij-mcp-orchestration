import { useEffect, useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import type { ProviderSummary } from '../api';
import { seededMod } from '../utils/hash';

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

const MODEL_VARIANTS = ['Chat', 'Instruct', 'Ops', 'Research', 'Batch', 'Vision', 'Guard'];

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

function buildSeriesForProvider(provider: ProviderSummary, days: number): TimeSeriesPoint[] {
  const seedCost = 40 + seededMod(`${provider.id}-cost`, 25);
  const seedTokens = 55 + seededMod(`${provider.id}-tokens`, 40);
  const seedLatency = 900 + seededMod(`${provider.id}-lat`, 400);

  const today = new Date();
  const series: TimeSeriesPoint[] = [];

  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date(today);
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - offset);

    const mod = seededMod(`${provider.id}-${normalizeDate(date)}`, 20);
    const seasonal = 1 + (seededMod(`${provider.id}-season-${date.getMonth()}`, 15) - 7) / 100;
    const tokens = (seedTokens / 10) * (1 + mod / 50) * seasonal;
    const cost = (seedCost / 10) * (1 + (12 - mod) / 60) * seasonal;
    const latency = seedLatency * (0.9 + mod / 90);

    series.push({
      date: normalizeDate(date),
      label: new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(date),
      costUsd: Number(cost.toFixed(2)),
      tokensMillions: Number(tokens.toFixed(2)),
      avgLatencyMs: Math.round(latency),
    });
  }

  return series;
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

function buildRouteBreakdown(
  providers: ProviderSummary[],
  days: number,
  providerSelection: ProviderSelection,
): RouteCostBreakdown[] {
  const selectedProviders =
    providerSelection === 'all'
      ? providers
      : providers.filter((provider) => provider.id === providerSelection);

  const entries: RouteCostBreakdown[] = [];

  selectedProviders.forEach((provider) => {
    const variantCount = 3 + seededMod(`${provider.id}-variants`, 3);

    for (let index = 0; index < variantCount; index += 1) {
      const lane = (['economy', 'balanced', 'turbo'] as LaneCategory[])[
        seededMod(`${provider.id}-lane-${index}`, 3)
      ];
      const laneConfig = LANE_CONFIG[lane];
      const variantName = MODEL_VARIANTS[seededMod(`${provider.id}-variant-${index}`, MODEL_VARIANTS.length)];
      const providerPrefix = provider.name.split(' ')[0] ?? provider.name;
      const label = `${providerPrefix} ${variantName}`;
      const baseDailyCost = 8 + seededMod(`${provider.id}-base-cost-${index}`, 18);
      const seasonality = 0.85 + seededMod(`${provider.id}-seasonality-${index}`, 30) / 100;
      const costUsd = Number(
        (baseDailyCost * laneConfig.costMultiplier * seasonality * (days / 7)).toFixed(2),
      );
      const baseTokens = 3 + seededMod(`${provider.id}-base-token-${index}`, 9) / 2;
      const tokensMillions = Number(
        (baseTokens * laneConfig.tokenMultiplier * (days / 7)).toFixed(2),
      );
      const runsBase = 50 + seededMod(`${provider.id}-base-run-${index}`, 70);
      const runs = Math.max(12, Math.round((runsBase * days) / 14));
      const successRate = Number(
        (0.9 + seededMod(`${provider.id}-success-${index}`, 8) / 100).toFixed(3),
      );
      const avgLatencySeed = 700 + seededMod(`${provider.id}-lat-${index}`, 600);
      const avgLatencyMs = Math.max(180, Math.round(avgLatencySeed / laneConfig.latencyDivider));

      entries.push({
        id: `${provider.id}-${index}`,
        providerId: provider.id,
        providerName: provider.name,
        label,
        lane,
        costUsd,
        tokensMillions,
        runs,
        successRate,
        avgLatencyMs,
      });
    }
  });

  return entries.sort((a, b) => b.costUsd - a.costUsd);
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

function buildRunDrilldown(entry: RouteCostBreakdown, days: number): RunDrilldownEntry[] {
  const runCount = Math.min(12, Math.max(6, Math.round((entry.runs / days) * 4)));
  const now = new Date();
  const runs: RunDrilldownEntry[] = [];

  for (let index = 0; index < runCount; index += 1) {
    const timestamp = new Date(now);
    const minutesAgo = (index + 1) * (30 + seededMod(`${entry.id}-mins-${index}`, 60));
    timestamp.setMinutes(timestamp.getMinutes() - minutesAgo);

    const statusSeed = seededMod(`${entry.id}-status-${index}`, 100);
    const status: RunStatus = statusSeed > 88 ? 'error' : statusSeed > 72 ? 'retry' : 'success';

    const tokensThousands = Number(
      (
        ((entry.tokensMillions * 1000) / Math.max(1, entry.runs)) *
        (0.75 + seededMod(`${entry.id}-tokens-${index}`, 30) / 50)
      ).toFixed(1),
    );

    const costUsd = Number(
      (
        (entry.costUsd / Math.max(1, entry.runs)) *
        (0.8 + seededMod(`${entry.id}-cost-${index}`, 30) / 50)
      ).toFixed(2),
    );

    const latencyMs = Math.max(
      120,
      Math.round(entry.avgLatencyMs * (0.75 + seededMod(`${entry.id}-latency-${index}`, 40) / 80)),
    );

    runs.push({
      id: `${entry.id}-run-${index}`,
      timestamp: timestamp.toISOString(),
      tokensThousands,
      costUsd,
      latencyMs,
      status,
      consumer: `Projeto ${String.fromCharCode(65 + seededMod(`${entry.id}-consumer-${index}`, 6))}`,
    });
  }

  return runs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

const RUN_STATUS_LABEL: Record<RunStatus, string> = {
  success: 'Sucesso',
  retry: 'Retry',
  error: 'Falha',
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

  const providerSeriesMap = useMemo(() => {
    return providers.reduce<Record<string, TimeSeriesPoint[]>>((acc, provider) => {
      acc[provider.id] = buildSeriesForProvider(provider, 120).slice(-90);
      return acc;
    }, {});
  }, [providers]);

  const availableSeries = useMemo(() => {
    const days = RANGE_TO_DAYS[selectedRange];

    if (!hasProviders) {
      return [];
    }

    if (selectedProvider === 'all') {
      const seriesCollection = providers.map((provider) => providerSeriesMap[provider.id].slice(-days));
      return combineSeries(seriesCollection);
    }

    const series = providerSeriesMap[selectedProvider];
    return series ? series.slice(-days) : [];
  }, [hasProviders, providers, providerSeriesMap, selectedProvider, selectedRange]);

  const aggregatedMetrics = useMemo(() => computeMetrics(availableSeries), [availableSeries]);

  const metricConfig = METRIC_CONFIG[selectedMetric];

  const breakdownEntries = useMemo(() => {
    const days = RANGE_TO_DAYS[selectedRange];
    if (!hasProviders) {
      return [];
    }

    return buildRouteBreakdown(providers, days, selectedProvider);
  }, [hasProviders, providers, selectedProvider, selectedRange]);

  const paretoEntries = useMemo(() => computePareto(breakdownEntries), [breakdownEntries]);

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

  const drilldownRuns = useMemo(
    () => (selectedParetoEntry ? buildRunDrilldown(selectedParetoEntry, RANGE_TO_DAYS[selectedRange]) : []),
    [selectedParetoEntry, selectedRange],
  );

  if (isLoading) {
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

              {drilldownRuns.length === 0 ? (
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
