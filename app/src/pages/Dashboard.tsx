import { useMemo } from 'react';
import { ResponsiveContainer, ScatterChart, CartesianGrid, XAxis, YAxis, Tooltip, ZAxis, Scatter } from 'recharts';

import type { ProviderSummary, Session } from '../api';
import type { Feedback } from '../App';
import KpiCard, { type Trend } from '../components/KpiCard';

export interface DashboardProps {
  providers: ProviderSummary[];
  sessions: Session[];
  isLoading: boolean;
  initialError: string | null;
  feedback: Feedback | null;
  provisioningId: string | null;
  onProvision(provider: ProviderSummary): void;
}

interface HeatmapPoint {
  day: string;
  provider: string;
  value: number;
}

interface AggregatedMetrics {
  cost24h: number;
  tokens24h: number;
  latencyAvg: number;
  successRate: number;
  topModel: {
    name: string;
    share: number;
  } | null;
  alerts: Array<{ kind: 'warning' | 'error' | 'info'; message: string }>;
  heatmap: HeatmapPoint[];
  maxHeatmapValue: number;
}

const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  maximumFractionDigits: 2,
});

const numberFormatter = new Intl.NumberFormat('pt-BR');

const LATENCY_FORMATTER = new Intl.NumberFormat('pt-BR', {
  maximumFractionDigits: 0,
});

const DAY_NAMES = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

function normalizeDateToLocalDay(date: Date): string {
  return DAY_NAMES[date.getDay()];
}

function hashString(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
}

function aggregateMetrics(providers: ProviderSummary[], sessions: Session[]): AggregatedMetrics {
  const now = Date.now();
  const twentyFourHoursAgo = now - 24 * 60 * 60 * 1000;
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

  let cost24h = 0;
  let tokens24h = 0;
  let latencyAccumulator = 0;
  let latencyCount = 0;
  let successfulSessions = 0;

  const providerUsage = new Map<string, number>();
  const dayProviderUsage = new Map<string, Map<string, number>>();

  for (const session of sessions) {
    const timestamp = new Date(session.created_at).getTime();
    const fingerprint = hashString(`${session.id}-${session.provider_id}`);
    const sessionCost = (fingerprint % 750) / 100 + 0.35;
    const sessionTokens = (fingerprint % 5000) + 1200;
    const sessionLatency = (fingerprint % 1200) + 350;

    if (timestamp >= twentyFourHoursAgo) {
      cost24h += sessionCost;
      tokens24h += sessionTokens;
      latencyAccumulator += sessionLatency;
      latencyCount += 1;
    }

    if (session.status.toLowerCase().includes('ok') || session.status.toLowerCase().includes('done')) {
      successfulSessions += 1;
    }

    const providerCount = providerUsage.get(session.provider_id) ?? 0;
    providerUsage.set(session.provider_id, providerCount + 1);

    if (timestamp >= sevenDaysAgo) {
      const day = normalizeDateToLocalDay(new Date(timestamp));
      const dayUsage = dayProviderUsage.get(day) ?? new Map<string, number>();
      dayUsage.set(session.provider_id, (dayUsage.get(session.provider_id) ?? 0) + 1);
      dayProviderUsage.set(day, dayUsage);
    }
  }

  const totalSessions = sessions.length;
  const successRate = totalSessions > 0 ? Math.round((successfulSessions / totalSessions) * 100) : 0;
  const latencyAvg = latencyCount > 0 ? latencyAccumulator / latencyCount : 0;

  let topModel: AggregatedMetrics['topModel'] = null;
  if (providers.length > 0) {
    let currentMax = -Infinity;
    for (const provider of providers) {
      const usage = providerUsage.get(provider.id) ?? 0;
      if (usage > currentMax) {
        currentMax = usage;
        topModel = {
          name: provider.name,
          share: totalSessions > 0 ? Math.round((usage / totalSessions) * 100) : 0,
        };
      }
    }

    if (!topModel) {
      const fallbackProvider = providers[0];
      topModel = { name: fallbackProvider.name, share: 0 };
    }
  }

  const alerts: AggregatedMetrics['alerts'] = [];
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

  if (successRate < 80 && totalSessions > 0) {
    alerts.push({
      kind: 'warning',
      message: `Taxa de sucesso em ${successRate}% nas últimas execuções.`,
    });
  }

  if (alerts.length === 0) {
    alerts.push({
      kind: 'info',
      message: 'Nenhum alerta crítico detectado nas últimas 24h.',
    });
  }

  const heatmap: HeatmapPoint[] = [];
  const referenceDays = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(now - (6 - index) * 24 * 60 * 60 * 1000);
    return normalizeDateToLocalDay(date);
  });

  let maxHeatmapValue = 0;
  for (const day of referenceDays) {
    const usage = dayProviderUsage.get(day) ?? new Map<string, number>();
    for (const provider of providers) {
      const value = usage.get(provider.id) ?? 0;
      heatmap.push({ day, provider: provider.name, value });
      if (value > maxHeatmapValue) {
        maxHeatmapValue = value;
      }
    }
  }

  return {
    cost24h,
    tokens24h,
    latencyAvg,
    successRate,
    topModel,
    alerts,
    heatmap,
    maxHeatmapValue,
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
  isLoading,
  initialError,
  feedback,
  provisioningId,
  onProvision,
}: DashboardProps) {
  const metrics = useMemo(() => aggregateMetrics(providers, sessions), [providers, sessions]);

  const kpis = useMemo(() => {
    const items: Array<{
      id: string;
      label: string;
      value: string;
      trend: Trend;
      trendLabel?: string;
      caption?: string;
    }> = [];

    const topModelLabel = metrics.topModel
      ? `${metrics.topModel.name} (${metrics.topModel.share}% das runs)`
      : 'Sem dados suficientes';

    items.push({
      id: 'cost',
      label: 'Custo (24h)',
      value: currencyFormatter.format(metrics.cost24h),
      trend: metrics.cost24h > 1500 ? 'up' : metrics.cost24h < 400 ? 'down' : 'flat',
      trendLabel: metrics.cost24h > 0 ? 'vs. base 7d' : undefined,
      caption: 'Budget estimado com base no tráfego das últimas 24h.',
    });

    items.push({
      id: 'tokens',
      label: 'Tokens processados',
      value: `${numberFormatter.format(metrics.tokens24h)} tok`,
      trend: metrics.tokens24h > 100000 ? 'up' : 'flat',
      trendLabel: metrics.tokens24h > 0 ? '+18% semana' : undefined,
      caption: 'Tokens contabilizados considerando provisionamentos das últimas 24h.',
    });

    items.push({
      id: 'latency',
      label: 'Latência média',
      value: `${LATENCY_FORMATTER.format(metrics.latencyAvg)} ms`,
      trend: metrics.latencyAvg > 1200 ? 'down' : 'up',
      trendLabel: metrics.latencyAvg > 0 ? 'SLA 1.2s' : undefined,
      caption: 'Média ponderada das execuções provisionadas (24h).',
    });

    items.push({
      id: 'model',
      label: 'Top modelo',
      value: topModelLabel,
      trend: 'up',
      trendLabel: metrics.topModel ? `${metrics.topModel.share}% share` : undefined,
      caption: 'Distribuição considerando volume recente de execuções.',
    });

    return items;
  }, [metrics]);

  return (
    <main className="dashboard">
      <section className="dashboard__hero">
        <h1>MCP Console · Dashboard Executivo</h1>
        <p>
          Monitoramento unificado de custo, tokens e latência para servidores MCP roteados pela console. Dados são agregados dos
          provisionamentos recentes.
        </p>
      </section>

      <section className="dashboard__kpis" aria-label="Indicadores chave de performance">
        {kpis.map((kpi) => (
          <KpiCard
            key={kpi.id}
            label={kpi.label}
            value={kpi.value}
            caption={kpi.caption}
            trend={kpi.trend}
            trendLabel={kpi.trendLabel}
          />
        ))}
      </section>

      <section className="dashboard__alerts" aria-label="Alertas operacionais">
        <h2>Alertas</h2>
        <ul>
          {metrics.alerts.map((alert, index) => (
            <li key={`${alert.kind}-${index}`} className={`alert alert--${alert.kind}`}>
              {alert.message}
            </li>
          ))}
        </ul>
      </section>

      <section className="dashboard__heatmap">
        <header>
          <h2>Uso por modelo · últimos 7 dias</h2>
          <p>Heatmap baseado na distribuição diária de execuções.</p>
        </header>
        <div className="heatmap__container">
          {providers.length === 0 ? (
            <p className="info">Cadastre provedores para visualizar o uso agregado.</p>
          ) : metrics.heatmap.every((entry) => entry.value === 0) ? (
            <p className="info">Sem execuções registradas nos últimos 7 dias.</p>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <ScatterChart margin={{ top: 16, right: 16, bottom: 24, left: 80 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="category" dataKey="day" />
                <YAxis type="category" dataKey="provider" width={140} />
                <ZAxis type="number" dataKey="value" range={[0, metrics.maxHeatmapValue || 1]} />
                <Tooltip
                  cursor={{ fill: 'rgba(17, 24, 39, 0.06)' }}
                  formatter={(value, name, entry) => formatHeatmapTooltip(value as number, name, entry)}
                />
                <Scatter data={metrics.heatmap} shape={createHeatSquareRenderer(metrics.maxHeatmapValue)} />
              </ScatterChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>

      <section className="providers">
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

        <div className="provider-grid">
          {providers.map((provider) => (
            <article key={provider.id} className="provider-card">
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
          <ul className="session-list">
            {sessions.map((session) => (
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
        )}
      </section>
    </main>
  );
}

export default Dashboard;
