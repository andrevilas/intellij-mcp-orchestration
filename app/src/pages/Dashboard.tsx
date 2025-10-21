import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  ScatterChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ZAxis,
  Scatter,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  Legend,
} from 'recharts';

import type {
  PolicyComplianceSummary,
  ProviderSummary,
  Session,
  TelemetryHeatmapBucket,
  TelemetryMetrics,
} from '../api';
import type { Feedback } from '../App';
import KpiCard, { type Trend } from '../components/KpiCard';
import Pagination from '../components/navigation/Pagination';
import { useToastNotification } from '../hooks/useToastNotification';

export interface DashboardProps {
  providers: ProviderSummary[];
  sessions: Session[];
  metrics: TelemetryMetrics | null;
  heatmapBuckets: TelemetryHeatmapBucket[];
  isLoading: boolean;
  initialError: string | null;
  feedback: Feedback | null;
  provisioningId: string | null;
  compliance?: PolicyComplianceSummary | null;
  onProvision(provider: ProviderSummary): void;
}

const SESSION_PAGE_SIZE = 6;

interface HeatmapPoint {
  day: string;
  provider: string;
  value: number;
}

interface DerivedDashboardData {
  cost24h: number;
  tokensTotal: number;
  latencyAvg: number;
  successRatePercent: number;
  topModel: {
    name: string;
    share: number;
  } | null;
  alerts: Array<{ kind: 'warning' | 'error' | 'info'; message: string }>;
  heatmap: HeatmapPoint[];
  maxHeatmapValue: number;
  heatmapProviderCount: number;
  cacheHitRatePercent: number | null;
  cachedTokens: number | null;
  latencyP95: number | null;
  latencyP99: number | null;
  errorRatePercent: number | null;
  costBreakdown: Array<{ label: string; cost: number; percent: number }>;
  totalCostBreakdown: number;
  errorBreakdown: Array<{ category: string; count: number; percent: number }>;
  totalErrorCount: number;
}

const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  maximumFractionDigits: 2,
});

const numberFormatter = new Intl.NumberFormat('pt-BR');

const percentFormatter = new Intl.NumberFormat('pt-BR', {
  maximumFractionDigits: 1,
  minimumFractionDigits: 0,
});

const LATENCY_FORMATTER = new Intl.NumberFormat('pt-BR', {
  maximumFractionDigits: 0,
});

const DAY_NAMES = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

const INSIGHT_COLORS = ['#2563eb', '#0ea5e9', '#22c55e', '#f97316', '#a855f7', '#06b6d4', '#f43f5e'];

function normalizeDateToLocalDay(date: Date): string {
  return DAY_NAMES[date.getDay()];
}

function deriveDashboardData(
  providers: ProviderSummary[] = [],
  metrics: TelemetryMetrics | null,
  heatmapBuckets: TelemetryHeatmapBucket[] = [],
): DerivedDashboardData {
  const providerLabelMap = new Map<string, string>();
  for (const provider of providers) {
    providerLabelMap.set(provider.id, provider.name);
  }
  for (const bucket of heatmapBuckets) {
    if (!providerLabelMap.has(bucket.provider_id)) {
      providerLabelMap.set(bucket.provider_id, bucket.provider_id);
    }
  }

  const totalRuns = metrics?.total_runs ?? 0;
  const cost24h = metrics?.total_cost_usd ?? 0;
  const tokensTotal = (metrics?.total_tokens_in ?? 0) + (metrics?.total_tokens_out ?? 0);
  const latencyAvg = metrics?.avg_latency_ms ?? 0;
  const successRatePercent = metrics ? Math.round((metrics.success_rate ?? 0) * 100) : 0;

  const providerRunCounts = new Map<string, number>();
  for (const entry of metrics?.providers ?? []) {
    providerRunCounts.set(entry.provider_id, entry.run_count ?? 0);
  }

  let topModel: DerivedDashboardData['topModel'] = null;
  let currentMax = -Infinity;
  for (const [providerId, runCount] of providerRunCounts) {
    if (runCount > currentMax) {
      currentMax = runCount;
      topModel = {
        name: providerLabelMap.get(providerId) ?? providerId,
        share: totalRuns > 0 ? Math.round((runCount / totalRuns) * 100) : 0,
      };
    }
  }

  if (!topModel && providers.length > 0) {
    const fallbackProvider = providers[0];
    topModel = { name: fallbackProvider.name, share: 0 };
  }

  const alerts: DerivedDashboardData['alerts'] = [];
  const offlineProviders = providers.filter((provider) => provider.is_available === false);
  if (offlineProviders.length > 0) {
    alerts.push({
      kind: 'error',
      message: `${offlineProviders.length} provedor(es) indisponível(is): ${offlineProviders.map((p) => p.name).join(', ')}`,
    });
  }

  if (latencyAvg > 1500) {
    alerts.push({
      kind: 'warning',
      message: 'Latência média das últimas 24h acima de 1.5s. Avalie throttling ou roteamento.',
    });
  }

  if (totalRuns > 0 && successRatePercent < 80) {
    alerts.push({
      kind: 'warning',
      message: `Taxa de sucesso em ${successRatePercent}% nas últimas execuções.`,
    });
  }

  if (alerts.length === 0) {
    alerts.push({
      kind: 'info',
      message: 'Nenhum alerta crítico detectado nas últimas 24h.',
    });
  }

  const bucketMap = new Map<string, number>();
  for (const bucket of heatmapBuckets) {
    bucketMap.set(`${bucket.day}|${bucket.provider_id}`, bucket.run_count);
  }

  const heatmapProviders = Array.from(providerLabelMap.entries()).map(([id, name]) => ({ id, name }));

  let lastDayKey: string | null = null;
  for (const bucket of heatmapBuckets) {
    if (!lastDayKey || bucket.day > lastDayKey) {
      lastDayKey = bucket.day;
    }
  }

  const referenceEnd = lastDayKey ? new Date(`${lastDayKey}T12:00:00Z`) : new Date();
  const referenceDays = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(referenceEnd.getTime() - (6 - index) * 24 * 60 * 60 * 1000);
    const isoDay = date.toISOString().slice(0, 10);
    const label = normalizeDateToLocalDay(new Date(`${isoDay}T00:00:00Z`));
    return { isoDay, label };
  });

  const heatmap: HeatmapPoint[] = [];
  let maxHeatmapValue = 0;
  for (const { isoDay, label } of referenceDays) {
    for (const provider of heatmapProviders) {
      const value = bucketMap.get(`${isoDay}|${provider.id}`) ?? 0;
      heatmap.push({ day: label, provider: provider.name, value });
      if (value > maxHeatmapValue) {
        maxHeatmapValue = value;
      }
    }
  }

  const extended = metrics?.extended ?? null;
  const cacheHitRatePercent =
    typeof extended?.cache_hit_rate === 'number'
      ? Math.round(extended.cache_hit_rate * 1000) / 10
      : null;
  const cachedTokens =
    typeof extended?.cached_tokens === 'number' ? Math.max(extended.cached_tokens, 0) : null;
  const latencyP95 =
    typeof extended?.latency_p95_ms === 'number' ? Math.max(extended.latency_p95_ms, 0) : null;
  const latencyP99 =
    typeof extended?.latency_p99_ms === 'number' ? Math.max(extended.latency_p99_ms, 0) : null;
  const errorRatePercent =
    typeof extended?.error_rate === 'number'
      ? Math.max(0, Math.round(extended.error_rate * 1000) / 10)
      : null;

  const rawCostBreakdown = Array.isArray(extended?.cost_breakdown)
    ? extended?.cost_breakdown ?? []
    : [];
  const costBreakdownBase = rawCostBreakdown
    .map((entry) => ({
      label: entry.label ?? entry.lane ?? entry.provider_id ?? 'Outros',
      cost:
        typeof entry.cost_usd === 'number' && Number.isFinite(entry.cost_usd)
          ? Math.max(entry.cost_usd, 0)
          : 0,
    }))
    .filter((entry) => entry.cost > 0)
    .sort((a, b) => b.cost - a.cost);
  const totalCostBreakdown = costBreakdownBase.reduce((sum, entry) => sum + entry.cost, 0);
  const costBreakdown = costBreakdownBase.map((entry) => ({
    ...entry,
    percent: totalCostBreakdown > 0 ? Math.round((entry.cost / totalCostBreakdown) * 1000) / 10 : 0,
  }));

  const rawErrorBreakdown = Array.isArray(extended?.error_breakdown)
    ? extended?.error_breakdown ?? []
    : [];
  const errorBreakdownBase = rawErrorBreakdown
    .map((entry) => ({
      category: entry.category ?? 'Desconhecido',
      count:
        typeof entry.count === 'number' && Number.isFinite(entry.count)
          ? Math.max(Math.floor(entry.count), 0)
          : 0,
    }))
    .filter((entry) => entry.count > 0)
    .sort((a, b) => b.count - a.count);
  const totalErrorCount = errorBreakdownBase.reduce((sum, entry) => sum + entry.count, 0);
  const errorBreakdown = errorBreakdownBase.map((entry) => ({
    ...entry,
    percent: totalErrorCount > 0 ? Math.round((entry.count / totalErrorCount) * 1000) / 10 : 0,
  }));

  return {
    cost24h: cost24h,
    tokensTotal,
    latencyAvg,
    successRatePercent,
    topModel,
    alerts,
    heatmap,
    maxHeatmapValue,
    heatmapProviderCount: heatmapProviders.length,
    cacheHitRatePercent,
    cachedTokens,
    latencyP95,
    latencyP99,
    errorRatePercent,
    costBreakdown,
    totalCostBreakdown,
    errorBreakdown,
    totalErrorCount,
  };
}

function formatHeatmapTooltip(value: number, _name: string | number, entry?: { payload?: HeatmapPoint }): string {
  const payload = entry?.payload;
  if (!payload) {
    return `${value} execução(ões)`;
  }
  return `${payload.provider} — ${payload.day}: ${value} execução(ões)`;
}

function getHeatmapColor(value: number, max: number): string {
  if (max === 0) {
    return 'var(--heatmap-neutral)';
  }
  const intensity = value / max;
  if (intensity === 0) {
    return 'var(--heatmap-neutral)';
  }
  const start = { r: 24, g: 90, b: 157 };
  const end = { r: 122, g: 216, b: 162 };
  const r = Math.round(start.r + (end.r - start.r) * intensity);
  const g = Math.round(start.g + (end.g - start.g) * intensity);
  const b = Math.round(start.b + (end.b - start.b) * intensity);
  return `rgb(${r}, ${g}, ${b})`;
}

function formatCostTooltip(value: number, name: string | number): [string, string] {
  const label = typeof name === 'string' ? name : String(name);
  return [currencyFormatter.format(value), label];
}

function formatErrorTooltip(value: number, name: string | number): [string, string] {
  const label = typeof name === 'string' ? name : String(name);
  return [`${numberFormatter.format(value)} falha(s)`, label];
}

function createHeatSquareRenderer(max: number) {
  return (props: unknown) => {
    const { cx, cy, payload } = props as { cx?: number; cy?: number; payload?: HeatmapPoint };
    if (typeof cx !== 'number' || typeof cy !== 'number' || !payload) {
      return <g />;
    }
    const size = 36;
    const x = cx - size / 2;
    const y = cy - size / 2;
    return <rect x={x} y={y} width={size} height={size} rx={8} fill={getHeatmapColor(payload.value, max)} />;
  };
}

export function Dashboard({
  providers,
  sessions,
  metrics,
  heatmapBuckets,
  isLoading,
  initialError,
  feedback,
  provisioningId,
  compliance,
  onProvision,
}: DashboardProps) {
  const [currentSessionPage, setCurrentSessionPage] = useState(1);
  const derived = useMemo(
    () => deriveDashboardData(providers, metrics, heatmapBuckets),
    [providers, metrics, heatmapBuckets],
  );

  useToastNotification(initialError, {
    id: 'dashboard-initial-error',
    title: 'Falha ao carregar dashboard',
    variant: 'error',
    autoDismiss: false,
  });

  const feedbackTitle = feedback?.kind === 'error' ? 'Provisionamento falhou' : 'Provisionamento concluído';
  const feedbackVariant = feedback?.kind === 'error' ? 'error' : 'success';
  const feedbackAutoDismiss = feedback?.kind === 'error' ? false : undefined;

  useToastNotification(feedback?.text ?? null, {
    id: 'dashboard-feedback',
    title: feedback ? feedbackTitle : 'Provisionamento',
    variant: feedback ? feedbackVariant : 'info',
    autoDismiss: feedbackAutoDismiss,
  });

  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(sessions.length / SESSION_PAGE_SIZE));
    if (currentSessionPage > totalPages) {
      setCurrentSessionPage(totalPages);
    }
  }, [sessions, currentSessionPage]);

  const sessionPageCount = useMemo(
    () => Math.max(1, Math.ceil(sessions.length / SESSION_PAGE_SIZE)),
    [sessions.length],
  );

  const paginatedSessions = useMemo(() => {
    if (sessions.length === 0) {
      return [];
    }
    const startIndex = (currentSessionPage - 1) * SESSION_PAGE_SIZE;
    return sessions.slice(startIndex, startIndex + SESSION_PAGE_SIZE);
  }, [sessions, currentSessionPage]);

  const sessionRange = useMemo(() => {
    if (sessions.length === 0) {
      return { start: 0, end: 0 };
    }
    const start = (currentSessionPage - 1) * SESSION_PAGE_SIZE + 1;
    const end = Math.min(currentSessionPage * SESSION_PAGE_SIZE, sessions.length);
    return { start, end };
  }, [sessions, currentSessionPage]);

  const handleSessionPageChange = useCallback((page: number) => {
    setCurrentSessionPage(page);
  }, []);

  const complianceState = useMemo(() => {
    if (!compliance) {
      return null;
    }
    const requiredItems = compliance.items.filter((item) => item.required);
    const missingRequired = requiredItems.filter((item) => !item.configured || !item.active).length;
    let label = 'Em conformidade';
    if (compliance.status === 'warning') {
      label = 'Atenção';
    } else if (compliance.status === 'fail') {
      label = 'Ajustes obrigatórios';
    }
    return {
      status: compliance.status,
      label,
      missingRequired,
      totalRequired: requiredItems.length,
      items: compliance.items,
    };
  }, [compliance]);

  const kpis = useMemo(() => {
    const items: Array<{
      id: string;
      label: string;
      value: string;
      trend: Trend;
      trendLabel?: string;
      caption?: string;
    }> = [];

    const topModelLabel = derived.topModel
      ? `${derived.topModel.name} (${derived.topModel.share}% das runs)`
      : 'Sem dados suficientes';

    items.push({
      id: 'cost',
      label: 'Custo (24h)',
      value: currencyFormatter.format(derived.cost24h),
      trend: derived.cost24h > 1500 ? 'up' : derived.cost24h < 400 ? 'down' : 'flat',
      trendLabel: derived.cost24h > 0 ? 'vs. base 7d' : undefined,
      caption: 'Budget estimado com base no tráfego das últimas 24h.',
    });

    items.push({
      id: 'tokens',
      label: 'Tokens processados',
      value: `${numberFormatter.format(derived.tokensTotal)} tok`,
      trend: derived.tokensTotal > 100000 ? 'up' : 'flat',
      trendLabel: derived.tokensTotal > 0 ? '+18% semana' : undefined,
      caption: 'Tokens contabilizados considerando provisionamentos das últimas 24h.',
    });

    items.push({
      id: 'latency',
      label: 'Latência média',
      value: `${LATENCY_FORMATTER.format(derived.latencyAvg)} ms`,
      trend: derived.latencyAvg > 1200 ? 'down' : 'up',
      trendLabel: derived.latencyAvg > 0 ? 'SLA 1.2s' : undefined,
      caption: 'Média ponderada das execuções provisionadas (24h).',
    });

    items.push({
      id: 'model',
      label: 'Top modelo',
      value: topModelLabel,
      trend: 'up',
      trendLabel: derived.topModel ? `${derived.topModel.share}% share` : undefined,
      caption: 'Distribuição considerando volume recente de execuções.',
    });

    return items;
  }, [derived]);

  const insightCards = useMemo(() => {
    const cards: Array<{ id: string; title: string; value: string; caption: string }> = [];

    const cacheHitLabel =
      derived.cacheHitRatePercent !== null
        ? `${percentFormatter.format(derived.cacheHitRatePercent)}%`
        : 'Sem dados';
    const cachedTokensLabel =
      derived.cachedTokens !== null
        ? `${numberFormatter.format(derived.cachedTokens)} tok`
        : 'Sem dados';

    const cacheShare =
      derived.cachedTokens !== null && derived.tokensTotal > 0
        ? `${percentFormatter.format((derived.cachedTokens / derived.tokensTotal) * 100)}%`
        : null;

    cards.push({
      id: 'cache-hit',
      title: 'Taxa de acertos em cache',
      value: cacheHitLabel,
      caption:
        derived.cachedTokens !== null
          ? `${numberFormatter.format(derived.cachedTokens)} tokens servidos via cache nas últimas 24h.`
          : 'Ainda não houve medições de uso de cache nesta janela.',
    });

    cards.push({
      id: 'cache-volume',
      title: 'Tokens via cache',
      value: cachedTokensLabel,
      caption:
        cacheShare !== null
          ? `Equivale a ${cacheShare} do volume total processado.`
          : 'Aguardando novas execuções para estimar a participação do cache.',
    });

    cards.push({
      id: 'latency-p95',
      title: 'Latência P95',
      value:
        derived.latencyP95 !== null
          ? `${LATENCY_FORMATTER.format(derived.latencyP95)} ms`
          : 'Sem dados',
      caption:
        derived.latencyP99 !== null
          ? `P99 registrado em ${LATENCY_FORMATTER.format(derived.latencyP99)} ms.`
          : 'Nenhuma medição P99 disponível nesta janela.',
    });

    cards.push({
      id: 'error-rate',
      title: 'Taxa de erro',
      value:
        derived.errorRatePercent !== null
          ? `${percentFormatter.format(derived.errorRatePercent)}%`
          : 'Sem dados',
      caption:
        derived.totalErrorCount > 0
          ? `${numberFormatter.format(derived.totalErrorCount)} falhas categorizadas nas últimas execuções.`
          : 'Nenhum erro categorizado na janela analisada.',
    });

    return cards;
  }, [derived]);

  const costChartTitleId = useId();
  const costChartDescriptionId = useId();
  const errorChartTitleId = useId();
  const errorChartDescriptionId = useId();

  return (
    <main className="dashboard">
      <section className="dashboard__hero" data-testid="dashboard-hero">
        <h1>Promenade Agent Hub · Dashboard Executivo</h1>
        <p>
          Monitoramento unificado de custo, tokens e latência para servidores MCP roteados pela console. Dados são agregados dos
          provisionamentos recentes.
        </p>
      </section>

      <section
        className="dashboard__compliance"
        aria-label="Checklist de conformidade"
        data-testid="dashboard-compliance"
      >
        <header>
          <h2>Checklist de conformidade</h2>
          <span
            className={`compliance-status compliance-status--${complianceState ? complianceState.status : 'unknown'}`}
          >
            {complianceState ? complianceState.label : 'Sem dados'}
          </span>
        </header>
        {complianceState ? (
          <>
            <p className="dashboard__compliance-summary">
              {complianceState.missingRequired === 0
                ? 'Todas as políticas obrigatórias estão ativas.'
                : `${complianceState.missingRequired} de ${complianceState.totalRequired} políticas obrigatórias precisam de atenção.`}
            </p>
            <ul className="compliance-list">
              {complianceState.items.map((item) => {
                const status = item.active
                  ? 'active'
                  : item.configured
                    ? 'configured'
                    : item.required
                      ? 'missing'
                      : 'optional';
                const description =
                  item.description ??
                  (item.active
                    ? 'Ativo e monitorado.'
                    : item.configured
                      ? 'Configurado, aguardando ativação.'
                      : item.required
                        ? 'Obrigatório — configure antes do próximo rollout.'
                        : 'Opcional, configure quando necessário.');
                return (
                  <li key={item.id} className={`compliance-item compliance-item--${status}`}>
                    <span className="compliance-item__indicator" aria-hidden="true" />
                    <div>
                      <strong>{item.label}</strong>
                      <p>{description}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        ) : (
          <p className="info">Checklist indisponível no momento.</p>
        )}
      </section>

      <section
        className="dashboard__kpis"
        aria-label="Indicadores chave de performance"
        data-testid="dashboard-kpis"
      >
        {kpis.map((kpi) => (
          <KpiCard
            key={kpi.id}
            label={kpi.label}
            value={kpi.value}
            caption={kpi.caption}
            trend={kpi.trend}
            trendLabel={kpi.trendLabel}
            testId={`dashboard-kpi-${kpi.id}`}
          />
        ))}
      </section>

      <section
        className="dashboard__insights"
        aria-label="Indicadores complementares de telemetria"
        data-testid="dashboard-insights"
      >
        <div className="dashboard__insight-cards" data-testid="dashboard-insight-cards">
          {insightCards.map((card) => (
            <article key={card.id} className="insight-card" data-testid={`dashboard-insight-${card.id}`}>
              <header>
                <h3>{card.title}</h3>
              </header>
              <p className="insight-card__value">{card.value}</p>
              <p className="insight-card__caption">{card.caption}</p>
            </article>
          ))}
        </div>
        <div className="dashboard__insight-visuals">
          <figure
            className="insight-chart"
            aria-labelledby={costChartTitleId}
            aria-describedby={costChartDescriptionId}
            data-testid="dashboard-cost-breakdown"
          >
            <div className="insight-chart__header">
              <h3 id={costChartTitleId}>Distribuição de custo por rota</h3>
              <p>Participação relativa por lane/rota nas últimas 24h.</p>
            </div>
            <div
              className="insight-chart__canvas"
              role="img"
              aria-labelledby={`${costChartTitleId} ${costChartDescriptionId}`}
            >
              {derived.costBreakdown.length > 0 ? (
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Tooltip formatter={(value, name) => formatCostTooltip(value as number, name)} />
                    <Pie
                      data={derived.costBreakdown}
                      dataKey="cost"
                      nameKey="label"
                      innerRadius={60}
                      outerRadius={110}
                      paddingAngle={4}
                    >
                      {derived.costBreakdown.map((entry, index) => (
                        <Cell key={entry.label} fill={INSIGHT_COLORS[index % INSIGHT_COLORS.length]} />
                      ))}
                    </Pie>
                    <Legend
                      formatter={(value: string) => {
                        const entry = derived.costBreakdown.find((item) => item.label === value);
                        const percent = entry ? percentFormatter.format(entry.percent) : undefined;
                        return percent ? `${value} — ${percent}%` : value;
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <p className="info">Sem custos computados na janela selecionada.</p>
              )}
            </div>
            <figcaption id={costChartDescriptionId} className="visually-hidden">
              {derived.costBreakdown.length > 0
                ? `Distribuição percentual de custo entre ${derived.costBreakdown.length} rota(s).`
                : 'Sem dados de custo disponíveis para calcular a distribuição.'}
            </figcaption>
          </figure>
          <figure
            className="insight-chart"
            aria-labelledby={errorChartTitleId}
            aria-describedby={errorChartDescriptionId}
            data-testid="dashboard-error-breakdown"
          >
            <div className="insight-chart__header">
              <h3 id={errorChartTitleId}>Ocorrências de erro por categoria</h3>
              <p>Principais motivos de falha registrados.</p>
            </div>
            <div
              className="insight-chart__canvas"
              role="img"
              aria-labelledby={`${errorChartTitleId} ${errorChartDescriptionId}`}
            >
              {derived.errorBreakdown.length > 0 ? (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={derived.errorBreakdown} margin={{ top: 8, right: 16, left: 0, bottom: 16 }}>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" />
                    <XAxis dataKey="category" />
                    <YAxis allowDecimals={false} />
                    <Tooltip formatter={(value, name) => formatErrorTooltip(value as number, name)} />
                    <Bar dataKey="count" name="Falhas" radius={[8, 8, 0, 0]} fill="#f97316" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="info">Nenhum erro categorizado na janela analisada.</p>
              )}
            </div>
            <figcaption id={errorChartDescriptionId} className="visually-hidden">
              {derived.errorBreakdown.length > 0
                ? `Total de ${numberFormatter.format(derived.totalErrorCount)} falhas distribuídas em ${derived.errorBreakdown.length} categoria(s).`
                : 'Sem dados categorizados de falhas disponíveis.'}
            </figcaption>
          </figure>
        </div>
      </section>

      <section
        className="dashboard__alerts"
        aria-label="Alertas operacionais"
        data-testid="dashboard-alerts"
      >
        <h2>Alertas</h2>
        <ul>
          {derived.alerts.map((alert, index) => (
            <li
              key={`${alert.kind}-${index}`}
              className={`alert alert--${alert.kind}`}
              data-testid={`dashboard-alert-${index}`}
            >
              {alert.message}
            </li>
          ))}
        </ul>
      </section>

      <section className="dashboard__heatmap" data-testid="dashboard-heatmap">
        <header>
          <h2>Uso por modelo · últimos 7 dias</h2>
          <p>Heatmap baseado na distribuição diária de execuções.</p>
        </header>
        <div className="heatmap__container">
          {derived.heatmapProviderCount === 0 ? (
            <p className="info">Cadastre provedores para visualizar o uso agregado.</p>
          ) : derived.heatmap.every((entry) => entry.value === 0) ? (
            <p className="info">Sem execuções registradas nos últimos 7 dias.</p>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <ScatterChart margin={{ top: 16, right: 16, bottom: 24, left: 80 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="category" dataKey="day" />
                <YAxis type="category" dataKey="provider" width={140} />
                <ZAxis type="number" dataKey="value" range={[0, derived.maxHeatmapValue || 1]} />
                <Tooltip
                  cursor={{ fill: 'rgba(17, 24, 39, 0.06)' }}
                  formatter={(value, name, entry) => formatHeatmapTooltip(value as number, name, entry)}
                />
                <Scatter data={derived.heatmap} shape={createHeatSquareRenderer(derived.maxHeatmapValue)} />
              </ScatterChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>

      <section className="providers" data-testid="dashboard-providers">
        <header className="section-header">
          <div>
            <h2>Provedores registrados</h2>
            <p>Lista carregada do manifesto versionado em {"config/console-mcp/servers.example.json"}.</p>
          </div>
        </header>

        {isLoading && <p className="info">Carregando provedores…</p>}
        {initialError && <p className="error">{initialError}</p>}

        {!isLoading && !initialError && providers.length === 0 && (
          <p className="info">Nenhum provedor configurado ainda. Ajuste o manifesto e recarregue.</p>
        )}

        <div className="provider-grid" data-testid="dashboard-provider-grid">
          {providers.map((provider) => (
            <article key={provider.id} className="provider-card" data-testid={`dashboard-provider-${provider.id}`}>
              <header>
                <div>
                  <h3>{provider.name}</h3>
                  <p className="provider-description">{provider.description || 'Sem descrição fornecida.'}</p>
                </div>
                <span className={`availability ${provider.is_available ? 'online' : 'offline'}`}>
                  {provider.is_available ? 'Disponível' : 'Indisponível'}
                </span>
              </header>

              <dl className="provider-meta">
                <div>
                  <dt>Identificador</dt>
                  <dd>{provider.id}</dd>
                </div>
                <div>
                  <dt>Comando</dt>
                  <dd>
                    <code>{provider.command}</code>
                  </dd>
                </div>
                <div>
                  <dt>Transporte</dt>
                  <dd>{provider.transport}</dd>
                </div>
              </dl>

              <div className="badges">
                {provider.capabilities.map((capability) => (
                  <span key={capability} className="badge capability">
                    {capability}
                  </span>
                ))}
                {provider.tags.map((tag) => (
                  <span key={tag} className="badge tag">
                    #{tag}
                  </span>
                ))}
              </div>

              <button
                className="provision-button"
                onClick={() => onProvision(provider)}
                disabled={provisioningId === provider.id}
              >
                {provisioningId === provider.id ? 'Provisionando…' : 'Criar sessão de provisionamento'}
              </button>
            </article>
          ))}
        </div>
      </section>

      {feedback && <div className={`feedback ${feedback.kind}`}>{feedback.text}</div>}

      <section className="sessions">
        <header className="section-header">
          <div>
            <h2>Histórico recente de sessões</h2>
            <p>Dados retornados pelo endpoint `/api/v1/sessions`.</p>
          </div>
        </header>

        {sessions.length === 0 && <p className="info">Ainda não há sessões registradas nesta execução.</p>}

        {sessions.length > 0 && (
          <>
            <ul className="session-list">
              {paginatedSessions.map((session) => (
                <li key={session.id} className="session-item">
                  <div className="session-header">
                    <span className="session-id">{session.id}</span>
                    <span className="session-status">{session.status}</span>
                  </div>
                  <div className="session-meta">
                    <span>
                      Provedor: <strong>{session.provider_id}</strong>
                    </span>
                    <span>
                      Criado em: {new Date(session.created_at).toLocaleString()}
                    </span>
                    {session.reason && <span>Motivo: {session.reason}</span>}
                    {session.client && <span>Cliente: {session.client}</span>}
                  </div>
                </li>
              ))}
            </ul>
            <div className="session-pagination">
              <span className="session-pagination__summary" role="status" aria-live="polite">
                Mostrando {sessionRange.start}–{sessionRange.end} de {sessions.length} sessões
              </span>
              <Pagination
                currentPage={currentSessionPage}
                pageCount={sessionPageCount}
                onPageChange={handleSessionPageChange}
                ariaLabel="Paginação do histórico de sessões"
              />
            </div>
          </>
        )}
      </section>
    </main>
  );
}

export default Dashboard;
