import { Suspense, lazy, useCallback, useEffect, useId, useMemo, useState } from 'react';

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
import {
  LATENCY_FORMATTER,
  currencyFormatter,
  numberFormatter,
  percentFormatter,
} from './dashboard/formatters';
import { DASHBOARD_TEST_IDS } from './testIds';

import './Dashboard.scss';

let dashboardVisualSectionsPromise:
  | Promise<typeof import('./dashboard/visual-sections')>
  | null = null;

const loadDashboardVisualSections = () => {
  if (!dashboardVisualSectionsPromise) {
    dashboardVisualSectionsPromise = import('./dashboard/visual-sections');
  }
  return dashboardVisualSectionsPromise;
};

const DashboardInsightVisuals = lazy(async () => {
  const module = await loadDashboardVisualSections();
  return { default: module.DashboardInsightVisuals };
});

const DashboardHeatmap = lazy(async () => {
  const module = await loadDashboardVisualSections();
  return { default: module.DashboardHeatmap };
});

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

export interface HeatmapPoint {
  day: string;
  provider: string;
  value: number;
}

export interface DerivedDashboardData {
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

const DAY_NAMES = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

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
      <section className="dashboard__hero" data-testid={DASHBOARD_TEST_IDS.hero}>
        <h1>Promenade Agent Hub · Dashboard Executivo</h1>
        <p>
          Monitoramento unificado de custo, tokens e latência para servidores MCP roteados pela console. Dados são agregados dos
          provisionamentos recentes.
        </p>
      </section>

      <section
        className="dashboard__compliance"
        aria-label="Checklist de conformidade"
        data-testid={DASHBOARD_TEST_IDS.compliance}
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
        data-testid={DASHBOARD_TEST_IDS.sections.kpis}
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
        data-testid={DASHBOARD_TEST_IDS.sections.insights}
      >
        <div
          className="dashboard__insight-cards"
          data-testid={DASHBOARD_TEST_IDS.insightCards}
        >
          {insightCards.map((card) => (
            <article
              key={card.id}
              className="insight-card"
              data-testid={DASHBOARD_TEST_IDS.insightCard(card.id)}
            >
              <header>
                <h3>{card.title}</h3>
              </header>
              <p className="insight-card__value">{card.value}</p>
              <p className="insight-card__caption">{card.caption}</p>
            </article>
          ))}
        </div>
        <Suspense
          fallback={
            <div className="dashboard__insight-visuals">
              <p className="info" role="status" aria-live="polite">
                Carregando visualizações…
              </p>
            </div>
          }
        >
          <DashboardInsightVisuals
            derived={derived}
            costChartTitleId={costChartTitleId}
            costChartDescriptionId={costChartDescriptionId}
            errorChartTitleId={errorChartTitleId}
            errorChartDescriptionId={errorChartDescriptionId}
          />
        </Suspense>
      </section>

      <section
        className="dashboard__alerts"
        aria-label="Alertas operacionais"
        data-testid={DASHBOARD_TEST_IDS.sections.alerts}
      >
        <h2>Alertas</h2>
        <ul>
          {derived.alerts.map((alert, index) => (
            <li
              key={`${alert.kind}-${index}`}
              className={`alert alert--${alert.kind}`}
              data-testid={DASHBOARD_TEST_IDS.alert(index)}
            >
              {alert.message}
            </li>
          ))}
        </ul>
      </section>

      <Suspense
        fallback={
          <section className="dashboard__heatmap" data-testid={DASHBOARD_TEST_IDS.sections.heatmap}>
            <header>
              <h2>Uso por modelo · últimos 7 dias</h2>
              <p>Heatmap baseado na distribuição diária de execuções.</p>
            </header>
            <div className="heatmap__container">
              <p className="info" role="status" aria-live="polite">
                Carregando mapa de calor…
              </p>
            </div>
          </section>
        }
      >
        <DashboardHeatmap derived={derived} />
      </Suspense>

      <section className="providers" data-testid={DASHBOARD_TEST_IDS.sections.providers}>
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

        <div className="provider-grid" data-testid={DASHBOARD_TEST_IDS.providerGrid}>
          {providers.map((provider) => (
            <article
              key={provider.id}
              className="provider-card"
              data-testid={DASHBOARD_TEST_IDS.providerCard(provider.id)}
            >
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
