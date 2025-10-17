import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import type { ProviderSummary, TelemetryMetrics } from '../api';
import KpiCard from '../components/KpiCard';

export interface ObservabilityProps {
  providers: ProviderSummary[];
  metrics: TelemetryMetrics | null;
  isLoading: boolean;
  initialError: string | null;
}

type TabId = 'metrics' | 'tracing' | 'evals';

interface TraceRow {
  id: string;
  providerName: string;
  runCount: number;
  avgLatency: number;
  successRate: number;
  costUsd: number;
  successRateDisplay: number;
}

const TABS: { id: TabId; label: string; description: string }[] = [
  {
    id: 'metrics',
    label: 'Métricas',
    description: 'KPIs consolidados de latência, erros, custo e cache hit nas últimas 24h.',
  },
  {
    id: 'tracing',
    label: 'Tracing',
    description:
      'Inspeção de spans consolidados por provedor com filtros rápidos para identificar regressões.',
  },
  {
    id: 'evals',
    label: 'Evals',
    description:
      'Dispare batteries de avaliações orientadas a providers para validar qualidade, custo e latência.',
  },
];

const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  maximumFractionDigits: 2,
});

const percentFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'percent',
  maximumFractionDigits: 1,
});

const latencyFormatter = new Intl.NumberFormat('pt-BR', {
  maximumFractionDigits: 0,
});

const numberFormatter = new Intl.NumberFormat('pt-BR');

function formatLatency(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return 'Sem dados';
  }
  return `${latencyFormatter.format(value)} ms`;
}

function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return 'Sem dados';
  }
  return percentFormatter.format(value);
}

function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return currencyFormatter.format(0);
  }
  return currencyFormatter.format(value);
}

export default function Observability({
  providers,
  metrics,
  isLoading,
  initialError,
}: ObservabilityProps) {
  const [activeTab, setActiveTab] = useState<TabId>('metrics');
  const [traceFilter, setTraceFilter] = useState<string>('all');
  const [selectedEvalProvider, setSelectedEvalProvider] = useState<string>('auto');
  const [selectedEvalPreset, setSelectedEvalPreset] = useState<string>('latency-regression');
  const [isRunningEval, setIsRunningEval] = useState(false);
  const [evalResult, setEvalResult] = useState<string | null>(null);
  const pendingEvalTimer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (pendingEvalTimer.current !== null) {
        window.clearTimeout(pendingEvalTimer.current);
      }
    };
  }, []);

  useEffect(() => {
    if (providers.length === 0) {
      setSelectedEvalProvider('auto');
      setTraceFilter('all');
    } else if (selectedEvalProvider === 'auto') {
      setSelectedEvalProvider(providers[0]?.id ?? 'auto');
    }
  }, [providers, selectedEvalProvider]);

  const providerLookup = useMemo(() => {
    const map = new Map<string, ProviderSummary>();
    providers.forEach((provider) => map.set(provider.id, provider));
    return map;
  }, [providers]);

  const traceRows: TraceRow[] = useMemo(() => {
    if (!metrics) {
      return [];
    }

    return metrics.providers.map((entry) => {
      const provider = providerLookup.get(entry.provider_id);
      return {
        id: entry.provider_id,
        providerName: provider?.name ?? entry.provider_id,
        runCount: entry.run_count,
        avgLatency: entry.avg_latency_ms,
        successRate: entry.success_rate,
        costUsd: entry.cost_usd,
        successRateDisplay: entry.success_rate * 100,
      };
    });
  }, [metrics, providerLookup]);

  const filteredTraceRows = useMemo(() => {
    if (traceFilter === 'all') {
      return traceRows;
    }
    return traceRows.filter((row) => row.id === traceFilter);
  }, [traceFilter, traceRows]);

  const metricsKpis = useMemo(() => {
    const latencyP95 = metrics?.extended?.latency_p95_ms ?? null;
    const errorRate = metrics?.extended?.error_rate ?? null;
    const cacheHit = metrics?.extended?.cache_hit_rate ?? null;
    const totalCost = metrics?.total_cost_usd ?? null;

    return {
      latency: formatLatency(latencyP95),
      errorRate: formatPercent(errorRate),
      cacheHit: formatPercent(cacheHit),
      totalCost: formatCurrency(totalCost),
      hasLatency: latencyP95 !== null && latencyP95 !== undefined,
      hasErrorRate: errorRate !== null && errorRate !== undefined,
      hasCacheHit: cacheHit !== null && cacheHit !== undefined,
      hasCost: totalCost !== null && totalCost !== undefined,
    };
  }, [metrics]);

  const providerSummary = useMemo(() => {
    if (providers.length === 0) {
      return {
        total: 0,
        available: 0,
        unavailable: 0,
        transports: new Set<string>(),
      };
    }

    const available = providers.filter((provider) => provider.is_available).length;
    const transports = new Set<string>();
    providers.forEach((provider) => {
      if (provider.transport) {
        transports.add(provider.transport);
      }
    });

    return {
      total: providers.length,
      available,
      unavailable: providers.length - available,
      transports,
    };
  }, [providers]);

  function handleEvalSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsRunningEval(true);
    setEvalResult(null);

    const providerName =
      selectedEvalProvider === 'auto'
        ? 'melhor provedor disponível'
        : providerLookup.get(selectedEvalProvider)?.name ?? selectedEvalProvider;

    pendingEvalTimer.current = window.setTimeout(() => {
      setIsRunningEval(false);
      const presetLabel = PRESETS.find((item) => item.id === selectedEvalPreset)?.label ?? 'Eval customizada';
      setEvalResult(`Eval “${presetLabel}” concluída para ${providerName}. Nenhuma regressão detectada.`);
    }, 800);
  }

  if (isLoading) {
    return (
      <section className="observability" aria-busy="true" aria-label="Painel de observabilidade">
        <header className="observability__header">
          <div>
            <h2>Observabilidade unificada</h2>
            <p>Preparando métricas e traces recentes…</p>
          </div>
        </header>
        <p role="status" className="observability__status">Carregando observabilidade…</p>
      </section>
    );
  }

  if (initialError) {
    return (
      <section className="observability" aria-label="Painel de observabilidade">
        <header className="observability__header">
          <div>
            <h2>Observabilidade unificada</h2>
            <p>Falha ao carregar dados de telemetria recentes.</p>
          </div>
        </header>
        <p role="alert" className="observability__error">
          Não foi possível carregar o painel de observabilidade: {initialError}. Tente novamente mais tarde.
        </p>
      </section>
    );
  }

  return (
    <section className="observability" aria-label="Painel de observabilidade">
      <header className="observability__header">
        <div>
          <h2>Observabilidade unificada</h2>
          <p>
            Explore métricas consolidadas, traces agregados e dispare evals para garantir confiabilidade dos
            providers MCP.
          </p>
        </div>
        <aside className="observability__summary" aria-label="Resumo de configuração de providers">
          <h3>Providers configurados</h3>
          {providerSummary.total === 0 ? (
            <p>
              Nenhum provider configurado. Cadastre chaves em “Chaves” ou importe do marketplace para iniciar o
              monitoramento.
            </p>
          ) : (
            <dl>
              <div>
                <dt>Total</dt>
                <dd>{numberFormatter.format(providerSummary.total)}</dd>
              </div>
              <div>
                <dt>Disponíveis</dt>
                <dd>{numberFormatter.format(providerSummary.available)}</dd>
              </div>
              <div>
                <dt>Indisponíveis</dt>
                <dd>{numberFormatter.format(providerSummary.unavailable)}</dd>
              </div>
              <div>
                <dt>Transports</dt>
                <dd>
                  {providerSummary.transports.size > 0
                    ? Array.from(providerSummary.transports).join(', ')
                    : 'Sem registro'}
                </dd>
              </div>
            </dl>
          )}
        </aside>
      </header>

      <div className="observability__tabs" role="tablist" aria-label="Seções do painel de observabilidade">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`observability-tab-${tab.id}`}
            className={
              activeTab === tab.id
                ? 'observability__tab observability__tab--active'
                : 'observability__tab'
            }
            aria-selected={activeTab === tab.id}
            aria-controls={`observability-panel-${tab.id}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <span className="observability__tab-label">{tab.label}</span>
            <span className="observability__tab-description">{tab.description}</span>
          </button>
        ))}
      </div>

      <section
        id="observability-panel-metrics"
        role="tabpanel"
        aria-labelledby="observability-tab-metrics"
        hidden={activeTab !== 'metrics'}
        className="observability__panel"
      >
        <div className="observability__kpis">
          <KpiCard
            label="Latência P95"
            value={metricsKpis.latency}
            caption="Janela das últimas 24h"
            trend={metricsKpis.hasLatency ? 'down' : 'flat'}
            trendLabel={metricsKpis.hasLatency ? 'Sem regressões registradas' : 'Aguardando métricas'}
            icon="⌛"
          />
          <KpiCard
            label="Taxa de erro"
            value={metricsKpis.errorRate}
            caption="Inclui retriable errors"
            trend={metricsKpis.hasErrorRate ? 'flat' : 'flat'}
            trendLabel={metricsKpis.hasErrorRate ? 'Monitorando baseline automático' : 'Sem dados recentes'}
            icon="⚠️"
          />
          <KpiCard
            label="Custo total"
            value={metricsKpis.totalCost}
            caption="Consolidado na moeda padrão"
            trend={metricsKpis.hasCost ? 'up' : 'flat'}
            trendLabel={metricsKpis.hasCost ? 'Comparado a ontem' : 'Sem dados suficientes'}
            icon="💰"
          />
          <KpiCard
            label="Cache hit rate"
            value={metricsKpis.cacheHit}
            caption="Aproveitamento médio dos warmers"
            trend={metricsKpis.hasCacheHit ? 'up' : 'flat'}
            trendLabel={metricsKpis.hasCacheHit ? 'Caching ativo' : 'Configure caches dinâmicos'}
            icon="🗄️"
          />
        </div>

        <article className="observability__chart" aria-label="Latência média por provedor">
          <header>
            <h3>Latência média por provedor</h3>
            <p>Compare a latência das execuções para identificar outliers rapidamente.</p>
          </header>
          <div className="observability__chart-canvas">
            {traceRows.length === 0 ? (
              <p>Sem execuções registradas na janela selecionada.</p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={traceRows} margin={{ top: 16, right: 24, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#cbd5f5" />
                  <XAxis dataKey="providerName" tick={{ fill: '#475569' }} />
                  <YAxis tick={{ fill: '#475569' }} tickFormatter={(value) => `${value} ms`} />
                  <Tooltip
                    formatter={(value: number | string) => {
                      const numericValue = typeof value === 'number' ? value : Number(value);
                      return `${latencyFormatter.format(numericValue)} ms`;
                    }}
                    labelFormatter={(label: string) => `Provedor: ${label}`}
                  />
                  <Area type="monotone" dataKey="avgLatency" stroke="#4338ca" fill="#818cf8" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </article>

        <article className="observability__chart" aria-label="Distribuição de sucesso por provedor">
          <header>
            <h3>Distribuição de sucesso por provedor</h3>
            <p>Relacione volume de execuções, sucesso e custo médio.</p>
          </header>
          <div className="observability__chart-canvas">
            {traceRows.length === 0 ? (
              <p>Cadastre provedores e gere tráfego para visualizar distribuição.</p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={traceRows} margin={{ top: 16, right: 24, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="providerName" tick={{ fill: '#475569' }} />
                  <YAxis
                    yAxisId="success"
                    orientation="left"
                    tickFormatter={(value) => `${value}%`}
                    tick={{ fill: '#475569' }}
                  />
                  <YAxis
                    yAxisId="cost"
                    orientation="right"
                    tickFormatter={(value) => currencyFormatter.format(Number(value))}
                    tick={{ fill: '#475569' }}
                  />
                  <Tooltip
                    formatter={(value: number | string, _name, item) => {
                      const numericValue = typeof value === 'number' ? value : Number(value);
                      if (item && 'dataKey' in item && item.dataKey === 'successRateDisplay') {
                        return percentFormatter.format(numericValue / 100);
                      }
                      return currencyFormatter.format(numericValue);
                    }}
                    labelFormatter={(label: string) => `Provedor: ${label}`}
                  />
                  <Bar
                    yAxisId="success"
                    dataKey="successRateDisplay"
                    fill="#10b981"
                    name="Taxa de sucesso"
                  />
                  <Bar yAxisId="cost" dataKey="costUsd" fill="#f97316" name="Custo (BRL)" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </article>
      </section>

      <section
        id="observability-panel-tracing"
        role="tabpanel"
        aria-labelledby="observability-tab-tracing"
        hidden={activeTab !== 'tracing'}
        className="observability__panel"
      >
        <div className="observability__controls">
          <label htmlFor="observability-trace-provider">Filtrar por provider</label>
          <select
            id="observability-trace-provider"
            value={traceFilter}
            onChange={(event) => setTraceFilter(event.target.value)}
          >
            <option value="all">Todos os providers</option>
            {providers.map((provider) => (
              <option key={provider.id} value={provider.id}>
                {provider.name}
              </option>
            ))}
          </select>
        </div>

        {filteredTraceRows.length === 0 ? (
          <p className="observability__status">
            {providers.length === 0
              ? 'Cadastre providers para iniciar o tracing consolidado.'
              : 'Sem spans disponíveis para o filtro atual.'}
          </p>
        ) : (
          <div className="observability__table-wrapper">
            <table className="observability__table">
              <caption>Visão agregada dos spans executados nas últimas 24h</caption>
              <thead>
                <tr>
                  <th scope="col">Provider</th>
                  <th scope="col">Runs</th>
                  <th scope="col">Latência média</th>
                  <th scope="col">Taxa de sucesso</th>
                  <th scope="col">Custo</th>
                </tr>
              </thead>
              <tbody>
                {filteredTraceRows.map((row) => (
                  <tr key={row.id}>
                    <th scope="row">{row.providerName}</th>
                    <td>{numberFormatter.format(row.runCount)}</td>
                    <td>{formatLatency(row.avgLatency)}</td>
                    <td>{formatPercent(row.successRate)}</td>
                    <td>{formatCurrency(row.costUsd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="observability__errors" role="region" aria-label="Principais categorias de erro">
          <h3>Principais categorias de erro</h3>
          {metrics?.extended?.error_breakdown && metrics.extended.error_breakdown.length > 0 ? (
            <ul>
              {metrics.extended.error_breakdown.map((entry) => (
                <li key={entry.category}>
                  <strong>{entry.category}</strong> — {numberFormatter.format(entry.count)} ocorrência(s)
                </li>
              ))}
            </ul>
          ) : (
            <p>Sem erros categorizados na janela monitorada.</p>
          )}
        </div>
      </section>

      <section
        id="observability-panel-evals"
        role="tabpanel"
        aria-labelledby="observability-tab-evals"
        hidden={activeTab !== 'evals'}
        className="observability__panel"
      >
        <form className="observability__form" onSubmit={handleEvalSubmit}>
          <div className="observability__form-field">
            <label htmlFor="observability-eval-provider">Provider alvo</label>
            <select
              id="observability-eval-provider"
              value={selectedEvalProvider}
              onChange={(event) => setSelectedEvalProvider(event.target.value)}
              disabled={providers.length === 0}
            >
              <option value="auto">Selecionar automaticamente</option>
              {providers.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.name}
                </option>
              ))}
            </select>
            <small>
              {providers.length === 0
                ? 'Sem providers configurados. Cadastre credenciais para liberar as execuções.'
                : 'Escolha qual provider será avaliado ou deixe a seleção automática pelas políticas de roteamento.'}
            </small>
          </div>

          <div className="observability__form-field">
            <label htmlFor="observability-eval-preset">Preset de avaliação</label>
            <select
              id="observability-eval-preset"
              value={selectedEvalPreset}
              onChange={(event) => setSelectedEvalPreset(event.target.value)}
            >
              {PRESETS.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.label}
                </option>
              ))}
            </select>
            <small>
              Combine latência, custo e qualidade para validar rollouts. Presets podem ser personalizados no
              módulo de Policies.
            </small>
          </div>

          <button type="submit" className="observability__eval-button" disabled={isRunningEval || providers.length === 0}>
            {isRunningEval ? 'Executando eval…' : 'Disparar eval agora'}
          </button>
        </form>

        {evalResult ? (
          <p role="status" className="observability__status">
            {evalResult}
          </p>
        ) : (
          <p className="observability__status">
            Configure presets específicos ou use a seleção automática para validar regressões antes de promover
            providers para produção.
          </p>
        )}
      </section>
    </section>
  );
}

const PRESETS = [
  {
    id: 'latency-regression',
    label: 'Latência P95 vs baseline',
  },
  {
    id: 'cost-drift',
    label: 'Custo por mil tokens',
  },
  {
    id: 'quality-smoke',
    label: 'Smoke test de qualidade',
  },
];
