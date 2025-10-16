import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';

import {
  fetchPolicyManifest,
  simulateRouting,
  updatePolicyManifest,
  type PolicyManifestSnapshot,
  type PolicyManifestUpdateInput,
  type RoutingTierId,
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

interface RoutingFormState {
  maxIters: string;
  maxAttempts: string;
  requestTimeout: string;
  totalTimeout: string;
  defaultTier: RoutingTierId;
  fallbackTier: RoutingTierId | '';
  allowedTiers: Set<RoutingTierId>;
}

interface RoutingFormErrors {
  maxIters?: string;
  maxAttempts?: string;
  requestTimeout?: string;
  totalTimeout?: string;
  allowedTiers?: string;
  fallbackTier?: string;
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

const TIER_LABEL: Record<RoutingTierId, string> = {
  economy: 'Economy',
  balanced: 'Balanced',
  turbo: 'Turbo',
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

export default function Routing({ providers, isLoading, initialError }: RoutingProps) {
  const [strategyId, setStrategyId] = useState<RoutingStrategyId>('finops');
  const [volumeMillions, setVolumeMillions] = useState<number>(12);
  const [failoverId, setFailoverId] = useState<string | null>(null);
  const [baselinePlan, setBaselinePlan] = useState<RoutingSimulationResult | null>(null);
  const [plan, setPlan] = useState<RoutingSimulationResult | null>(null);
  const [simulationError, setSimulationError] = useState<string | null>(null);
  const [isSimulating, setIsSimulating] = useState<boolean>(false);
  const [manifest, setManifest] = useState<PolicyManifestSnapshot | null>(null);
  const [isManifestLoading, setManifestLoading] = useState(false);
  const [manifestError, setManifestError] = useState<string | null>(null);
  const [routingForm, setRoutingForm] = useState<RoutingFormState>({
    maxIters: '',
    maxAttempts: '',
    requestTimeout: '',
    totalTimeout: '',
    defaultTier: 'balanced',
    fallbackTier: '',
    allowedTiers: new Set<RoutingTierId>(['balanced']),
  });
  const [routingErrors, setRoutingErrors] = useState<RoutingFormErrors>({});
  const [routingMessage, setRoutingMessage] = useState<string | null>(null);
  const [isRoutingSaving, setRoutingSaving] = useState(false);

  useEffect(() => {
    if (failoverId && !providers.some((provider) => provider.id === failoverId)) {
      setFailoverId(null);
    }
  }, [providers, failoverId]);

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
        setManifestError('Não foi possível carregar o manifesto de roteamento.');
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

    const routing = manifest.routing;
    setRoutingForm({
      maxIters: routing.maxIters.toString(),
      maxAttempts: routing.maxAttempts.toString(),
      requestTimeout: routing.requestTimeoutSeconds.toString(),
      totalTimeout: routing.totalTimeoutSeconds ? routing.totalTimeoutSeconds.toString() : '',
      defaultTier: routing.defaultTier,
      fallbackTier: routing.fallbackTier ?? '',
      allowedTiers: new Set<RoutingTierId>(routing.allowedTiers),
    });
    setRoutingErrors({});
  }, [manifest]);

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

  const allowedTiers = useMemo(() => Array.from(routingForm.allowedTiers.values()), [routingForm.allowedTiers]);

  const fallbackOptions = useMemo(() => {
    return [''].concat(allowedTiers.filter((tier) => tier !== routingForm.defaultTier));
  }, [allowedTiers, routingForm.defaultTier]);

  const handleRoutingFieldChange = useCallback(
    (field: keyof Pick<RoutingFormState, 'maxIters' | 'maxAttempts' | 'requestTimeout' | 'totalTimeout'>, value: string) => {
      setRoutingForm((current) => ({ ...current, [field]: value }));
      setRoutingErrors((current) => ({ ...current, [field]: undefined }));
      setRoutingMessage(null);
    },
    [],
  );

  const handleDefaultTierChange = useCallback((event: ChangeEvent<HTMLSelectElement>) => {
    const nextTier = event.target.value as RoutingTierId;
    setRoutingForm((current) => {
      const nextAllowed = new Set<RoutingTierId>(current.allowedTiers);
      nextAllowed.add(nextTier);
      const nextFallback = current.fallbackTier === nextTier ? '' : current.fallbackTier;
      return {
        ...current,
        defaultTier: nextTier,
        fallbackTier: nextFallback,
        allowedTiers: nextAllowed,
      };
    });
    setRoutingErrors((current) => ({ ...current, allowedTiers: undefined }));
    setRoutingMessage(null);
  }, []);

  const handleFallbackChange = useCallback((event: ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value as RoutingTierId | '';
    setRoutingForm((current) => ({ ...current, fallbackTier: value }));
    setRoutingErrors((current) => ({ ...current, fallbackTier: undefined }));
    setRoutingMessage(null);
  }, []);

  const handleAllowedTierToggle = useCallback((tier: RoutingTierId) => {
    setRoutingForm((current) => {
      if (tier === current.defaultTier) {
        return current;
      }

      const nextAllowed = new Set<RoutingTierId>(current.allowedTiers);
      if (nextAllowed.has(tier)) {
        nextAllowed.delete(tier);
      } else {
        nextAllowed.add(tier);
      }

      const nextFallback = nextAllowed.has(current.fallbackTier as RoutingTierId)
        ? current.fallbackTier
        : '';

      return { ...current, allowedTiers: nextAllowed, fallbackTier: nextFallback };
    });
    setRoutingErrors((current) => ({ ...current, allowedTiers: undefined, fallbackTier: undefined }));
    setRoutingMessage(null);
  }, []);

  const handleRoutingSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      const errors: RoutingFormErrors = {};

      const maxItersValue = Number(routingForm.maxIters.trim());
      if (!routingForm.maxIters || Number.isNaN(maxItersValue) || maxItersValue <= 0) {
        errors.maxIters = 'Informe um número maior que zero.';
      }

      const maxAttemptsValue = Number(routingForm.maxAttempts.trim());
      if (!routingForm.maxAttempts || Number.isNaN(maxAttemptsValue) || maxAttemptsValue <= 0) {
        errors.maxAttempts = 'Máximo de tentativas deve ser maior que zero.';
      }

      const requestTimeoutValue = Number(routingForm.requestTimeout.trim());
      if (!routingForm.requestTimeout || Number.isNaN(requestTimeoutValue) || requestTimeoutValue <= 0) {
        errors.requestTimeout = 'Timeout por iteração deve ser maior que zero.';
      }

      let totalTimeoutValue: number | null = null;
      if (routingForm.totalTimeout.trim()) {
        const parsed = Number(routingForm.totalTimeout.trim());
        if (Number.isNaN(parsed) || parsed <= 0) {
          errors.totalTimeout = 'Timeout total deve ser maior que zero ou deixado em branco.';
        } else {
          totalTimeoutValue = parsed;
        }
      }

      const allowed = Array.from(routingForm.allowedTiers.values());
      if (!allowed.includes(routingForm.defaultTier)) {
        allowed.push(routingForm.defaultTier);
      }

      if (allowed.length === 0) {
        errors.allowedTiers = 'Selecione pelo menos um tier permitido.';
      }

      if (routingForm.fallbackTier && !allowed.includes(routingForm.fallbackTier)) {
        errors.fallbackTier = 'Escolha um fallback que esteja entre os tiers permitidos.';
      }

      if (Object.keys(errors).length > 0) {
        setRoutingErrors(errors);
        setRoutingMessage(null);
        return;
      }

      const payload: PolicyManifestUpdateInput = {
        routing: {
          maxIters: Math.round(maxItersValue),
          maxAttempts: Math.round(maxAttemptsValue),
          requestTimeoutSeconds: Math.round(requestTimeoutValue),
          totalTimeoutSeconds: totalTimeoutValue !== null ? Math.round(totalTimeoutValue) : null,
          defaultTier: routingForm.defaultTier,
          allowedTiers: Array.from(new Set<RoutingTierId>(allowed)),
          fallbackTier: routingForm.fallbackTier || null,
        },
      };

      setRoutingSaving(true);
      setRoutingMessage(null);
      setRoutingErrors({});

      updatePolicyManifest(payload)
        .then(() => {
          setRoutingMessage('Configuração de roteamento atualizada com sucesso.');
          setManifest((current) => {
            if (!current || !payload.routing) {
              return current;
            }
            return {
              ...current,
              routing: {
                ...current.routing,
                ...payload.routing,
              },
              updatedAt: new Date().toISOString(),
            };
          });
        })
        .catch(() => {
          setRoutingMessage('Falha ao atualizar o roteamento. Tente novamente.');
        })
        .finally(() => {
          setRoutingSaving(false);
        });
    },
    [routingForm],
  );

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

      <section className="routing-manifest" aria-labelledby="routing-manifest-heading">
        <header className="routing-manifest__header">
          <div>
            <h3 id="routing-manifest-heading">Política de roteamento em produção</h3>
            <p>Atualize limites determinísticos aplicados nas execuções reais.</p>
          </div>
          <span className="routing-manifest__timestamp">
            Última atualização: {manifest?.updatedAt ? new Date(manifest.updatedAt).toLocaleString('pt-BR') : '—'}
          </span>
        </header>
        {manifestError && <p className="error">{manifestError}</p>}
        {routingMessage && <p className="status status--inline">{routingMessage}</p>}
        <form className="routing-manifest__form" onSubmit={handleRoutingSubmit}>
          <div className="routing-manifest__grid">
            <label className="form-field">
              <span>Máximo de iterações</span>
              <input
                type="number"
                min={1}
                value={routingForm.maxIters}
                onChange={(event) => handleRoutingFieldChange('maxIters', event.target.value)}
                disabled={isManifestLoading || isRoutingSaving}
                aria-invalid={routingErrors.maxIters ? 'true' : 'false'}
                aria-describedby={routingErrors.maxIters ? 'routing-maxiters-error' : undefined}
              />
              {routingErrors.maxIters && (
                <span id="routing-maxiters-error" className="form-field__error">
                  {routingErrors.maxIters}
                </span>
              )}
            </label>

            <label className="form-field">
              <span>Máximo de tentativas</span>
              <input
                type="number"
                min={1}
                value={routingForm.maxAttempts}
                onChange={(event) => handleRoutingFieldChange('maxAttempts', event.target.value)}
                disabled={isManifestLoading || isRoutingSaving}
                aria-invalid={routingErrors.maxAttempts ? 'true' : 'false'}
                aria-describedby={routingErrors.maxAttempts ? 'routing-maxattempts-error' : undefined}
              />
              {routingErrors.maxAttempts && (
                <span id="routing-maxattempts-error" className="form-field__error">
                  {routingErrors.maxAttempts}
                </span>
              )}
            </label>

            <label className="form-field">
              <span>Timeout por tentativa (s)</span>
              <input
                type="number"
                min={1}
                value={routingForm.requestTimeout}
                onChange={(event) => handleRoutingFieldChange('requestTimeout', event.target.value)}
                disabled={isManifestLoading || isRoutingSaving}
                aria-invalid={routingErrors.requestTimeout ? 'true' : 'false'}
                aria-describedby={routingErrors.requestTimeout ? 'routing-requesttimeout-error' : undefined}
              />
              {routingErrors.requestTimeout && (
                <span id="routing-requesttimeout-error" className="form-field__error">
                  {routingErrors.requestTimeout}
                </span>
              )}
            </label>

            <label className="form-field">
              <span>Timeout total (s)</span>
              <input
                type="number"
                min={1}
                value={routingForm.totalTimeout}
                onChange={(event) => handleRoutingFieldChange('totalTimeout', event.target.value)}
                disabled={isManifestLoading || isRoutingSaving}
                aria-invalid={routingErrors.totalTimeout ? 'true' : 'false'}
                aria-describedby={routingErrors.totalTimeout ? 'routing-totaltimeout-error' : undefined}
                placeholder="Opcional"
              />
              {routingErrors.totalTimeout && (
                <span id="routing-totaltimeout-error" className="form-field__error">
                  {routingErrors.totalTimeout}
                </span>
              )}
            </label>
          </div>

          <div className="routing-manifest__tiers">
            <fieldset>
              <legend>Tiers permitidos</legend>
              <p className="routing-manifest__hint">O tier padrão não pode ser removido.</p>
              <div className="routing-manifest__tiers-grid">
                {(Object.keys(TIER_LABEL) as RoutingTierId[]).map((tier) => (
                  <label key={tier} className="form-field form-field--checkbox routing-manifest__tier-option">
                    <input
                      type="checkbox"
                      checked={routingForm.allowedTiers.has(tier) || tier === routingForm.defaultTier}
                      onChange={() => handleAllowedTierToggle(tier)}
                      disabled={tier === routingForm.defaultTier || isManifestLoading || isRoutingSaving}
                    />
                    <span>{TIER_LABEL[tier]}</span>
                  </label>
                ))}
              </div>
              {routingErrors.allowedTiers && <p className="form-field__error">{routingErrors.allowedTiers}</p>}
            </fieldset>

            <div className="routing-manifest__selects">
              <label className="form-field">
                <span>Tier padrão</span>
                <select
                  value={routingForm.defaultTier}
                  onChange={handleDefaultTierChange}
                  disabled={isManifestLoading || isRoutingSaving}
                >
                  {(Object.keys(TIER_LABEL) as RoutingTierId[]).map((tier) => (
                    <option key={tier} value={tier}>
                      {TIER_LABEL[tier]}
                    </option>
                  ))}
                </select>
              </label>

              <label className="form-field">
                <span>Fallback automático</span>
                <select
                  value={routingForm.fallbackTier}
                  onChange={handleFallbackChange}
                  disabled={isManifestLoading || isRoutingSaving || fallbackOptions.length <= 1}
                  aria-invalid={routingErrors.fallbackTier ? 'true' : 'false'}
                  aria-describedby={routingErrors.fallbackTier ? 'routing-fallback-error' : undefined}
                >
                  <option value="">Sem fallback dedicado</option>
                  {fallbackOptions
                    .filter((option): option is RoutingTierId => option !== '')
                    .map((tier) => (
                      <option key={tier} value={tier}>
                        {TIER_LABEL[tier]}
                      </option>
                    ))}
                </select>
                {routingErrors.fallbackTier && (
                  <span id="routing-fallback-error" className="form-field__error">
                    {routingErrors.fallbackTier}
                  </span>
                )}
              </label>
            </div>
          </div>

          <div className="routing-manifest__actions">
            <button
              type="submit"
              className="button button--primary"
              disabled={isManifestLoading || isRoutingSaving}
            >
              {isRoutingSaving ? 'Salvando…' : 'Salvar configuração'}
            </button>
          </div>
        </form>
      </section>

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
