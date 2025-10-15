import { useMemo, useState } from 'react';

import type { ProviderSummary } from '../api';
import { seededMod } from '../utils/hash';

export interface RoutingProps {
  providers: ProviderSummary[];
  isLoading: boolean;
  initialError: string | null;
}

type Lane = 'economy' | 'balanced' | 'turbo';

type StrategyId = 'balanced' | 'finops' | 'latency' | 'resilience';

interface RouteProfile {
  id: string;
  provider: ProviderSummary;
  lane: Lane;
  costPerMillion: number;
  latencyP95: number;
  reliability: number;
  capacityScore: number;
}

interface Strategy {
  id: StrategyId;
  label: string;
  description: string;
  focus: string;
  weights: Record<Lane, number>;
}

interface PlanDistributionEntry {
  route: RouteProfile;
  share: number;
  tokensMillions: number;
  cost: number;
}

interface PlanResult {
  totalCost: number;
  costPerMillion: number;
  avgLatency: number;
  reliabilityScore: number;
  distribution: PlanDistributionEntry[];
  excludedRoute: RouteProfile | null;
}

const STRATEGIES: Strategy[] = [
  {
    id: 'balanced',
    label: 'Baseline · Equilíbrio',
    description: 'Mix atual com foco em equilíbrio entre custo e latência.',
    focus: 'Balanceamento padrão',
    weights: { economy: 0.3, balanced: 0.5, turbo: 0.2 },
  },
  {
    id: 'finops',
    label: 'FinOps · Custo mínimo',
    description: 'Prioriza provedores econômicos mantendo rotas críticas protegidas.',
    focus: 'Redução de custo',
    weights: { economy: 0.55, balanced: 0.35, turbo: 0.1 },
  },
  {
    id: 'latency',
    label: 'Latência prioritária',
    description: 'Favorece modelos rápidos e pré-aquecidos para SLAs agressivos.',
    focus: 'Resposta em milissegundos',
    weights: { economy: 0.1, balanced: 0.35, turbo: 0.55 },
  },
  {
    id: 'resilience',
    label: 'Alta resiliência',
    description: 'Distribui tráfego entre provedores redundantes com folga de capacidade.',
    focus: 'Disponibilidade e failover',
    weights: { economy: 0.25, balanced: 0.45, turbo: 0.3 },
  },
];

const STRATEGY_MAP = new Map(STRATEGIES.map((strategy) => [strategy.id, strategy]));

const LANE_BASELINES: Record<Lane, { cost: number; latency: number }> = {
  economy: { cost: 12, latency: 2400 },
  balanced: { cost: 19, latency: 1500 },
  turbo: { cost: 32, latency: 780 },
};

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

function determineLane(provider: ProviderSummary): Lane {
  const seed = seededMod(`${provider.id}-lane`, 100);
  if (seed < 38) {
    return 'economy';
  }
  if (seed < 74) {
    return 'balanced';
  }
  return 'turbo';
}

function buildRoutes(providers: ProviderSummary[]): RouteProfile[] {
  return providers.map((provider) => {
    const lane = determineLane(provider);
    const { cost, latency } = LANE_BASELINES[lane];
    const costMultiplier = 0.82 + seededMod(`${provider.id}-cost`, 35) / 100;
    const latencyMultiplier = 0.78 + seededMod(`${provider.id}-lat`, 40) / 100;
    const reliability = 90 + seededMod(`${provider.id}-rel`, 9);
    const capacityScore = 60 + seededMod(`${provider.id}-cap`, 50);

    return {
      id: provider.id,
      provider,
      lane,
      costPerMillion: Number((cost * costMultiplier).toFixed(2)),
      latencyP95: Math.round(latency * latencyMultiplier),
      reliability: Number((reliability + seededMod(`${provider.id}-rel2`, 6) / 10).toFixed(1)),
      capacityScore,
    };
  });
}

function computePlan(
  routes: RouteProfile[],
  strategy: Strategy,
  failoverId: string,
  volumeMillions: number,
): PlanResult {
  if (routes.length === 0) {
    return {
      totalCost: 0,
      costPerMillion: 0,
      avgLatency: 0,
      reliabilityScore: 0,
      distribution: [],
      excludedRoute: null,
    };
  }

  const excludedRoute = failoverId === 'none' ? null : routes.find((route) => route.id === failoverId) ?? null;
  const activeRoutes = routes.filter((route) => route.id !== failoverId);

  if (activeRoutes.length === 0) {
    return {
      totalCost: 0,
      costPerMillion: 0,
      avgLatency: 0,
      reliabilityScore: 0,
      distribution: [],
      excludedRoute,
    };
  }

  const laneEntries: Array<{ lane: Lane; weight: number; routes: RouteProfile[]; capacityTotal: number }> = ['economy', 'balanced', 'turbo'].map((lane) => {
    const entries = activeRoutes.filter((route) => route.lane === lane);
    const capacityTotal = entries.reduce((sum, entry) => sum + entry.capacityScore, 0);
    return {
      lane: lane as Lane,
      weight: strategy.weights[lane as Lane],
      routes: entries,
      capacityTotal,
    };
  });

  const totalActiveLaneWeight = laneEntries.reduce((sum, entry) => {
    if (entry.routes.length === 0) {
      return sum;
    }
    return sum + entry.weight;
  }, 0);

  const distribution: PlanDistributionEntry[] = [];

  laneEntries.forEach((entry) => {
    if (entry.routes.length === 0 || totalActiveLaneWeight === 0) {
      return;
    }
    const laneShare = entry.weight / totalActiveLaneWeight;
    const laneCapacity = entry.capacityTotal || entry.routes.length;
    entry.routes.forEach((route) => {
      const capacityRatio = laneCapacity === 0 ? 0 : route.capacityScore / laneCapacity;
      distribution.push({
        route,
        share: laneShare * capacityRatio,
        tokensMillions: 0,
        cost: 0,
      });
    });
  });

  const totalShare = distribution.reduce((sum, entry) => sum + entry.share, 0);

  if (totalShare === 0) {
    return {
      totalCost: 0,
      costPerMillion: 0,
      avgLatency: 0,
      reliabilityScore: 0,
      distribution: [],
      excludedRoute,
    };
  }

  distribution.forEach((entry) => {
    const normalizedShare = entry.share / totalShare;
    entry.share = normalizedShare;
    entry.tokensMillions = Number((normalizedShare * volumeMillions).toFixed(2));
    entry.cost = Number((entry.tokensMillions * entry.route.costPerMillion).toFixed(2));
  });

  const totalCost = distribution.reduce((sum, entry) => sum + entry.cost, 0);
  const avgLatency = distribution.reduce((sum, entry) => sum + entry.share * entry.route.latencyP95, 0);
  const reliabilityScore = distribution.reduce((sum, entry) => sum + entry.share * entry.route.reliability, 0);

  return {
    totalCost: Number(totalCost.toFixed(2)),
    costPerMillion: volumeMillions > 0 ? Number((totalCost / volumeMillions).toFixed(2)) : 0,
    avgLatency: Number(avgLatency.toFixed(0)),
    reliabilityScore: Number(reliabilityScore.toFixed(1)),
    distribution: distribution.sort((a, b) => b.share - a.share),
    excludedRoute,
  };
}

export default function Routing({ providers, isLoading, initialError }: RoutingProps) {
  const [strategyId, setStrategyId] = useState<StrategyId>('finops');
  const [volumeMillions, setVolumeMillions] = useState<number>(12);
  const [failoverId, setFailoverId] = useState<string>('none');

  const routes = useMemo(() => buildRoutes(providers), [providers]);
  const selectedStrategy = STRATEGY_MAP.get(strategyId) ?? STRATEGIES[0];

  const baselinePlan = useMemo(
    () => computePlan(routes, STRATEGY_MAP.get('balanced') ?? STRATEGIES[0], failoverId, volumeMillions),
    [routes, failoverId, volumeMillions],
  );

  const plan = useMemo(
    () => computePlan(routes, selectedStrategy, failoverId, volumeMillions),
    [routes, selectedStrategy, failoverId, volumeMillions],
  );

  const savings = Number((baselinePlan.totalCost - plan.totalCost).toFixed(2));
  const latencyDelta = Number((plan.avgLatency - baselinePlan.avgLatency).toFixed(0));
  const reliabilityDelta = Number((plan.reliabilityScore - baselinePlan.reliabilityScore).toFixed(1));
  const latencyDeltaLabel =
    latencyDelta === 0 ? '±0 ms' : `${latencyDelta > 0 ? '+' : '−'}${formatLatency(Math.abs(latencyDelta))}`;

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

  if (routes.length === 0) {
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
                  onChange={(event) => setStrategyId(event.target.value as StrategyId)}
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
              value={failoverId}
              onChange={(event) => setFailoverId(event.target.value)}
            >
              <option value="none">Nenhuma rota indisponível</option>
              {routes.map((route) => (
                <option key={route.id} value={route.id}>
                  {route.provider.name}
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
          <dl className="routing-lab__summary-grid">
            <div className="routing-lab__summary-card">
              <dt>Projeção de custo</dt>
              <dd data-testid="routing-total-cost">{formatCurrency(plan.totalCost)}</dd>
              <small>Custo mensal estimado para {volumeMillions.toFixed(0)} mi tokens</small>
            </div>
            <div className="routing-lab__summary-card">
              <dt>Economia vs baseline</dt>
              <dd data-testid="routing-savings">{formatDeltaCurrency(savings)}</dd>
              <small>Baseline: {formatCurrency(baselinePlan.totalCost)}</small>
            </div>
            <div className="routing-lab__summary-card">
              <dt>Latência P95 projetada</dt>
              <dd data-testid="routing-latency">{formatLatency(plan.avgLatency)}</dd>
              <small>
                Delta: {latencyDeltaLabel} vs baseline
              </small>
            </div>
            <div className="routing-lab__summary-card">
              <dt>Confiabilidade ponderada</dt>
              <dd data-testid="routing-reliability">{plan.reliabilityScore.toFixed(1)}%</dd>
              <small>
                {reliabilityDelta >= 0 ? '+' : ''}
                {reliabilityDelta.toFixed(1)} p.p. em relação ao baseline
              </small>
            </div>
          </dl>
          {plan.excludedRoute && (
            <div className="routing-lab__banner" role="status">
              <strong>Tráfego realocado após falha</strong>
              <p>
                {plan.excludedRoute.provider.name} ficou indisponível. A distribuição foi recalculada para manter o SLA
                desejado.
              </p>
            </div>
          )}
        </section>
      </div>

      <section className="routing-lab__panel" aria-labelledby="routing-breakdown">
        <div className="routing-lab__panel-header">
          <h3 id="routing-breakdown">Distribuição por rota</h3>
          <span className="routing-lab__focus">
            {plan.distribution.length} de {routes.length} provedores ativos
          </span>
        </div>

        {plan.distribution.length === 0 ? (
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
                {plan.distribution.map((entry) => (
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
        )}
      </section>

      <section className="routing-lab__panel" aria-labelledby="routing-insights">
        <div className="routing-lab__panel-header">
          <h3 id="routing-insights">Insights acionáveis</h3>
        </div>
        <ul className="routing-lab__insights">
          <li>
            {selectedStrategy.focus}: ajuste fino sugerido para {formatCurrency(Math.abs(savings))}{' '}
            {savings >= 0 ? 'em economia potencial.' : 'em investimento adicional.'}
          </li>
          <li>
            Cobertura de {plan.distribution.length} provedores garante {plan.reliabilityScore.toFixed(1)}% de
            confiabilidade ponderada.
          </li>
          <li>
            Tokens mensais distribuídos entre {plan.distribution.length} rotas com custo médio de
            {' '}
            {formatCurrency(plan.costPerMillion)} por 1M tokens.
          </li>
        </ul>
      </section>
    </section>
  );
}
