import { useEffect, useState } from 'react';

import {
  simulateRouting,
  type ProviderSummary,
  type RoutingSimulationResult,
  type RoutingStrategyId,
} from '../api';

export interface RoutingProps {
  providers: ProviderSummary[];
  isLoading: boolean;
  initialError: string | null;
}

interface Strategy {
  id: RoutingStrategyId;
  label: string;
  description: string;
  focus: string;
}

const STRATEGIES: Strategy[] = [
  {
    id: 'balanced',
    label: 'Baseline · Equilíbrio',
    description: 'Mix atual com foco em equilíbrio entre custo e latência.',
    focus: 'Balanceamento padrão',
  },
  {
    id: 'finops',
    label: 'FinOps · Custo mínimo',
    description: 'Prioriza provedores econômicos mantendo rotas críticas protegidas.',
    focus: 'Redução de custo',
  },
  {
    id: 'latency',
    label: 'Latência prioritária',
    description: 'Favorece modelos rápidos e pré-aquecidos para SLAs agressivos.',
    focus: 'Resposta em milissegundos',
  },
  {
    id: 'resilience',
    label: 'Alta resiliência',
    description: 'Distribui tráfego entre provedores redundantes com folga de capacidade.',
    focus: 'Disponibilidade e failover',
  },
];

const STRATEGY_MAP = new Map(STRATEGIES.map((strategy) => [strategy.id, strategy]));

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: value >= 1000 ? 0 : 1,
  }).format(value);
}

function formatDeltaCurrency(value: number): string {
  const formatted = formatCurrency(Math.abs(value));
  if (value === 0) {
    return formatted;
  }
  return value > 0 ? `− ${formatted}` : `+ ${formatted}`;
}

function formatLatency(value: number): string {
  if (Number.isNaN(value) || value <= 0) {
    return '—';
  }
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)} s`;
  }
  return `${Math.round(value)} ms`;
}

export default function Routing({ providers, isLoading, initialError }: RoutingProps) {
  const [strategyId, setStrategyId] = useState<RoutingStrategyId>('finops');
  const [volumeMillions, setVolumeMillions] = useState<number>(12);
  const [failoverId, setFailoverId] = useState<string | null>(null);
  const [baselinePlan, setBaselinePlan] = useState<RoutingSimulationResult | null>(null);
  const [plan, setPlan] = useState<RoutingSimulationResult | null>(null);
  const [simulationError, setSimulationError] = useState<string | null>(null);
  const [isSimulating, setIsSimulating] = useState<boolean>(false);

  useEffect(() => {
    if (failoverId && !providers.some((provider) => provider.id === failoverId)) {
      setFailoverId(null);
    }
  }, [providers, failoverId]);

  useEffect(() => {
    if (providers.length === 0) {
      setBaselinePlan(null);
      setPlan(null);
      setSimulationError(null);
      setIsSimulating(false);
      return;
    }

    const controller = new AbortController();
    const providerIds = providers.map((provider) => provider.id);
    const commonPayload = {
      providerIds,
      failoverProviderId: failoverId,
      volumeMillions,
    };

    setIsSimulating(true);
    setSimulationError(null);
    setBaselinePlan(null);
    setPlan(null);

    Promise.all([
      simulateRouting({ strategy: 'balanced', ...commonPayload }, controller.signal),
      simulateRouting({ strategy: strategyId, ...commonPayload }, controller.signal),
    ])
      .then(([baselineResult, planResult]) => {
        if (controller.signal.aborted) {
          return;
        }
        setBaselinePlan(baselineResult);
        setPlan(planResult);
      })
      .catch((error: unknown) => {
        if ((error as Error)?.name === 'AbortError' || controller.signal.aborted) {
          return;
        }
        setBaselinePlan(null);
        setPlan(null);
        const fallback = 'Não foi possível simular o roteamento. Tente novamente em instantes.';
        setSimulationError(fallback);
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsSimulating(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [providers, strategyId, volumeMillions, failoverId]);

  const selectedStrategy = STRATEGY_MAP.get(strategyId) ?? STRATEGIES[0];
  const planReady = baselinePlan !== null && plan !== null;
  const savings = planReady ? Number((baselinePlan.totalCost - plan.totalCost).toFixed(2)) : 0;
  const latencyDelta = planReady ? Number((plan.avgLatency - baselinePlan.avgLatency).toFixed(0)) : 0;
  const reliabilityDelta = planReady
    ? Number((plan.reliabilityScore - baselinePlan.reliabilityScore).toFixed(1))
    : 0;
  const latencyDeltaLabel = planReady
    ? latencyDelta === 0
      ? '±0 ms'
      : `${latencyDelta > 0 ? '+' : '−'}${formatLatency(Math.abs(latencyDelta))}`
    : '±0 ms';

  const distribution = plan?.distribution ?? [];
  const excludedRoute = plan?.excludedRoute ?? null;
  const simulationMessage = simulationError ?? (isSimulating ? 'Carregando simulação…' : 'Simulação indisponível no momento.');
  const statusRole = simulationError ? 'alert' : 'status';

  if (isLoading) {
    return (
      <section className="routing-lab">
        <p className="routing-lab__empty">Carregando dados de provedores…</p>
      </section>
    );
  }

  if (initialError) {
    return (
      <section className="routing-lab" role="alert">
        <p className="routing-lab__empty">{initialError}</p>
      </section>
    );
  }

  if (providers.length === 0) {
    return (
      <section className="routing-lab">
        <p className="routing-lab__empty">
          Cadastre pelo menos um provider MCP para liberar o laboratório de routing.
        </p>
      </section>
    );
  }

  return (
    <section className="routing-lab">
      <header className="routing-lab__intro">
        <div>
          <p className="routing-lab__eyebrow">Routing Lab</p>
          <h2>Simulador “what-if” de roteamento</h2>
          <p>
            Combine modelos, falhas simuladas e volume projetado para visualizar custo, latência e confiabilidade
            antes de aplicar novas rotas na frota MCP.
          </p>
        </div>
      </header>

      <div className="routing-lab__layout">
        <section className="routing-lab__panel" aria-labelledby="routing-config">
          <div className="routing-lab__panel-header">
            <h3 id="routing-config">Configuração do cenário</h3>
            <span className="routing-lab__focus" data-testid="routing-focus">
              {selectedStrategy.focus}
            </span>
          </div>
          <fieldset className="routing-lab__fieldset">
            <legend>Estratégia desejada</legend>
            {STRATEGIES.map((strategy) => (
              <label
                key={strategy.id}
                className={
                  strategyId === strategy.id
                    ? 'routing-lab__option routing-lab__option--active'
                    : 'routing-lab__option'
                }
              >
                <input
                  type="radio"
                  name="routing-strategy"
                  value={strategy.id}
                  checked={strategyId === strategy.id}
                  onChange={(event) => setStrategyId(event.target.value as RoutingStrategyId)}
                />
                <span>
                  <strong>{strategy.label}</strong>
                  <small>{strategy.description}</small>
                </span>
              </label>
            ))}
          </fieldset>

          <div className="routing-lab__control">
            <label htmlFor="routing-volume">
              Volume mensal (milhões de tokens)
              <span aria-live="polite" data-testid="routing-volume-value">
                {volumeMillions.toFixed(0)} mi
              </span>
            </label>
            <input
              id="routing-volume"
              type="range"
              min={3}
              max={30}
              step={1}
              value={volumeMillions}
              onChange={(event) => setVolumeMillions(Number(event.target.value))}
            />
          </div>

          <div className="routing-lab__control">
            <label htmlFor="routing-failover">Falha simulada</label>
            <select
              id="routing-failover"
              value={failoverId ?? ''}
              onChange={(event) => {
                const value = event.target.value;
                setFailoverId(value === '' ? null : value);
              }}
            >
              <option value="">Nenhuma rota indisponível</option>
              {providers.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.name}
                </option>
              ))}
            </select>
          </div>
        </section>

        <section className="routing-lab__panel" aria-labelledby="routing-metrics">
          <div className="routing-lab__panel-header">
            <h3 id="routing-metrics">Métricas projetadas</h3>
            <span className="routing-lab__focus">Comparativo vs. baseline</span>
          </div>

          {planReady ? (
            <>
              <dl className="routing-lab__summary-grid">
                <div className="routing-lab__summary-card">
                  <dt>Projeção de custo</dt>
                  <dd data-testid="routing-total-cost">{formatCurrency(plan.totalCost)}</dd>
                  <small>Custo mensal estimado para {volumeMillions.toFixed(0)} mi tokens</small>
                </div>
                <div className="routing-lab__summary-card">
                  <dt>Economia vs baseline</dt>
                  <dd data-testid="routing-savings">{formatDeltaCurrency(savings)}</dd>
                  <small>
                    Baseline: {baselinePlan ? formatCurrency(baselinePlan.totalCost) : '—'}
                  </small>
                </div>
                <div className="routing-lab__summary-card">
                  <dt>Latência P95 projetada</dt>
                  <dd data-testid="routing-latency">{formatLatency(plan.avgLatency)}</dd>
                  <small>Delta: {latencyDeltaLabel} vs baseline</small>
                </div>
                <div className="routing-lab__summary-card">
                  <dt>Confiabilidade ponderada</dt>
                  <dd data-testid="routing-reliability">{plan.reliabilityScore.toFixed(1)}%</dd>
                  <small>
                    {`${reliabilityDelta >= 0 ? '+' : ''}${reliabilityDelta.toFixed(1)} p.p. em relação ao baseline`}
                  </small>
                </div>
              </dl>
              {excludedRoute && (
                <div className="routing-lab__banner" role="status">
                  <strong>Tráfego realocado após falha</strong>
                  <p>
                    {excludedRoute.provider.name} ficou indisponível. A distribuição foi recalculada para manter o SLA
                    desejado.
                  </p>
                </div>
              )}
            </>
          ) : (
            <p className="routing-lab__empty" role={statusRole}>
              {simulationMessage}
            </p>
          )}
        </section>
      </div>

      <section className="routing-lab__panel" aria-labelledby="routing-breakdown">
        <div className="routing-lab__panel-header">
          <h3 id="routing-breakdown">Distribuição por rota</h3>
          <span className="routing-lab__focus">
            {plan
              ? `${distribution.length} de ${providers.length} provedores ativos`
              : isSimulating
              ? 'Simulação em andamento…'
              : '—'}
          </span>
        </div>

        {planReady ? (
          distribution.length === 0 ? (
            <p className="routing-lab__empty">Nenhuma rota disponível para o cenário escolhido.</p>
          ) : (
            <div className="routing-lab__table-wrapper">
              <table className="routing-lab__table">
                <thead>
                  <tr>
                    <th scope="col">Provider</th>
                    <th scope="col">Classe</th>
                    <th scope="col">Participação</th>
                    <th scope="col">Tokens/mês</th>
                    <th scope="col">Custo</th>
                    <th scope="col">Latência P95</th>
                  </tr>
                </thead>
                <tbody>
                  {distribution.map((entry) => (
                    <tr key={entry.route.id}>
                      <th scope="row">
                        <span className="routing-lab__provider">{entry.route.provider.name}</span>
                        <small>{entry.route.provider.description}</small>
                      </th>
                      <td>
                        <span className={`routing-lab__tag routing-lab__tag--${entry.route.lane}`}>
                          {entry.route.lane === 'economy' && 'Economia'}
                          {entry.route.lane === 'balanced' && 'Equilíbrio'}
                          {entry.route.lane === 'turbo' && 'Turbo'}
                        </span>
                      </td>
                      <td>
                        <strong>{(entry.share * 100).toFixed(1)}%</strong>
                      </td>
                      <td>{entry.tokensMillions.toFixed(2)} mi</td>
                      <td>{formatCurrency(entry.cost)}</td>
                      <td>{formatLatency(entry.route.latencyP95)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : (
          <p className="routing-lab__empty" role={statusRole}>
            {simulationMessage}
          </p>
        )}
      </section>

      <section className="routing-lab__panel" aria-labelledby="routing-insights">
        <div className="routing-lab__panel-header">
          <h3 id="routing-insights">Insights acionáveis</h3>
        </div>
        {planReady ? (
          <ul className="routing-lab__insights">
            <li>
              {selectedStrategy.focus}: ajuste fino sugerido para {formatCurrency(Math.abs(savings))}{' '}
              {savings >= 0 ? 'em economia potencial.' : 'em investimento adicional.'}
            </li>
            <li>
              Cobertura de {distribution.length} provedores garante {plan.reliabilityScore.toFixed(1)}% de
              confiabilidade ponderada.
            </li>
            <li>
              Tokens mensais distribuídos entre {distribution.length} rotas com custo médio de {formatCurrency(
                plan.costPerMillion,
              )}{' '}
              por 1M tokens.
            </li>
          </ul>
        ) : (
          <p className="routing-lab__empty" role={statusRole}>
            {simulationMessage}
          </p>
        )}
      </section>
    </section>
  );
}
