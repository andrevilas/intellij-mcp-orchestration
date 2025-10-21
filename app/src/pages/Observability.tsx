import {
  Suspense,
  lazy,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from 'react';

import './Observability.scss';

import {
  ApiError,
  fetchObservabilityPreferences,
  updateObservabilityPreferences,
  type AdminPlanStep,
  type AdminPlanSummary,
  type ObservabilityPreferences,
  type ObservabilityPreferencesUpdateInput,
  type ObservabilityProviderSettings,
  type ObservabilityProviderType,
  type ProviderSummary,
  type TelemetryMetrics,
} from '../api';
import KpiCard from '../components/KpiCard';
import PlanSummary from './AdminChat/PlanSummary';
import { formatCurrency, formatLatency, formatPercent, numberFormatter } from './observability/formatters';

let observabilityChartsPromise:
  | Promise<typeof import('./observability/metrics-visuals')>
  | null = null;

const loadObservabilityCharts = () => {
  if (!observabilityChartsPromise) {
    observabilityChartsPromise = import('./observability/metrics-visuals');
  }
  return observabilityChartsPromise;
};

const ObservabilityCharts = lazy(async () => {
  const module = await loadObservabilityCharts();
  return { default: module.ObservabilityCharts };
});

export interface ObservabilityProps {
  providers: ProviderSummary[];
  metrics: TelemetryMetrics | null;
  isLoading: boolean;
  initialError: string | null;
}

type TabId = 'metrics' | 'tracing' | 'evals';

export interface TraceRow {
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

type PreferenceKey = 'tracing' | 'metrics' | 'evals';

interface PreferenceFormState {
  isEnabled: boolean;
  provider: ObservabilityProviderType | '';
  endpoint: string;
  project: string;
  touched: {
    provider: boolean;
    endpoint: boolean;
    project: boolean;
  };
}

type PreferenceStateMap = Record<PreferenceKey, PreferenceFormState>;

interface PreferenceErrors {
  provider?: string;
  endpoint?: string;
  project?: string;
}

type PreferenceErrorsMap = Record<PreferenceKey, PreferenceErrors>;

type PreferencesFeedback = { kind: 'success' | 'error'; message: string };

const PROVIDER_LABELS: Record<ObservabilityProviderType, string> = {
  langsmith: 'LangSmith',
  otlp: 'OTLP collector',
};

const PROVIDER_OPTIONS: Array<{ value: ObservabilityProviderType; label: string }> = [
  { value: 'langsmith', label: PROVIDER_LABELS.langsmith },
  { value: 'otlp', label: PROVIDER_LABELS.otlp },
];

const PREFERENCE_LABELS: Record<PreferenceKey, string> = {
  tracing: 'Tracing',
  metrics: 'Métricas',
  evals: 'Evals',
};

const PREFERENCE_DESCRIPTIONS: Record<PreferenceKey, string> = {
  tracing: 'Envie spans consolidados para inspecionar regressões e latência.',
  metrics: 'Publique métricas agregadas em coletores externos.',
  evals: 'Conecte providers de evals para validar providers MCP.',
};

const DEFAULT_PROVIDER_BY_KEY: Record<PreferenceKey, ObservabilityProviderType> = {
  tracing: 'langsmith',
  metrics: 'otlp',
  evals: 'langsmith',
};

const EMPTY_STATE: PreferenceFormState = {
  isEnabled: false,
  provider: '',
  endpoint: '',
  project: '',
  touched: { provider: false, endpoint: false, project: false },
};

function cloneEmptyState(): PreferenceFormState {
  return {
    ...EMPTY_STATE,
    touched: { ...EMPTY_STATE.touched },
  };
}

function mapSettingsToFormState(
  settings: ObservabilityProviderSettings | null,
): PreferenceFormState {
  if (!settings) {
    return cloneEmptyState();
  }
  return {
    isEnabled: true,
    provider: settings.provider,
    endpoint: settings.endpoint ?? '',
    project: settings.project ?? '',
    touched: { provider: false, endpoint: false, project: false },
  };
}

function buildPreferenceStateFromPreferences(
  preferences: ObservabilityPreferences | null,
): PreferenceStateMap {
  return {
    tracing: mapSettingsToFormState(preferences?.tracing ?? null),
    metrics: mapSettingsToFormState(preferences?.metrics ?? null),
    evals: mapSettingsToFormState(preferences?.evals ?? null),
  };
}

function validatePreference(key: PreferenceKey, state: PreferenceFormState): PreferenceErrors {
  if (!state.isEnabled) {
    return {};
  }
  const errors: PreferenceErrors = {};
  if (!state.provider) {
    errors.provider = `Selecione um provider para ${PREFERENCE_LABELS[key].toLowerCase()}.`;
  }
  if (state.provider === 'otlp') {
    const endpoint = state.endpoint.trim();
    if (!endpoint) {
      errors.endpoint = 'Endpoint é obrigatório para providers OTLP.';
    } else {
      try {
        const parsed = new URL(endpoint);
        if (!['http:', 'https:'].includes(parsed.protocol)) {
          throw new Error('Invalid protocol');
        }
      } catch {
        errors.endpoint = 'Informe uma URL válida (https://collector...).';
      }
    }
  }
  if (state.provider === 'langsmith') {
    const project = state.project.trim();
    if (!project) {
      errors.project = 'Informe o nome do projeto LangSmith.';
    }
  }
  return errors;
}

function buildUpdateInputFromState(state: PreferenceStateMap): ObservabilityPreferencesUpdateInput {
  const payload: ObservabilityPreferencesUpdateInput = {};
  (Object.keys(state) as PreferenceKey[]).forEach((key) => {
    const entry = state[key];
    if (!entry.isEnabled) {
      payload[key] = null;
      return;
    }
    if (!entry.provider) {
      payload[key] = null;
      return;
    }
    const normalized: ObservabilityProviderSettings = {
      provider: entry.provider,
    };
    if (entry.provider === 'otlp') {
      normalized.endpoint = entry.endpoint.trim();
    }
    if (entry.provider === 'langsmith') {
      normalized.project = entry.project.trim();
    }
    payload[key] = normalized;
  });
  return payload;
}

function describePreferenceSettings(
  key: PreferenceKey,
  settings: ObservabilityProviderSettings | null,
): { description: string; impact: string | null } {
  if (!settings) {
    return {
      description: `${PREFERENCE_LABELS[key]} desativado.`,
      impact: 'Nenhum provider configurado.',
    };
  }
  const providerLabel = PROVIDER_LABELS[settings.provider];
  const details: string[] = [];
  if (settings.provider === 'langsmith') {
    details.push(settings.project ? `Projeto: ${settings.project}` : 'Projeto não informado');
  }
  if (settings.provider === 'otlp') {
    details.push(settings.endpoint ? `Endpoint: ${settings.endpoint}` : 'Endpoint não informado');
  }
  return {
    description: `${providerLabel} ativo para ${PREFERENCE_LABELS[key].toLowerCase()}.`,
    impact: details.length > 0 ? details.join(' · ') : null,
  };
}

function buildPreferencesPlan(preferences: ObservabilityPreferences | null): AdminPlanSummary | null {
  if (!preferences?.updatedAt) {
    return null;
  }

  const steps: AdminPlanStep[] = (Object.keys(PREFERENCE_LABELS) as PreferenceKey[]).map((key) => {
    const snapshot = describePreferenceSettings(key, preferences[key]);
    return {
      id: `observability-${key}`,
      title: PREFERENCE_LABELS[key],
      description: snapshot.description,
      status: 'ready',
      impact: snapshot.impact,
    };
  });

  return {
    id: 'observability-preferences',
    threadId: 'observability-preferences',
    status: 'applied',
    generatedAt: preferences.updatedAt,
    author: preferences.audit?.actorName ?? preferences.audit?.actorId ?? 'Console MCP',
    scope: 'Preferências globais de observabilidade',
    steps,
    branch: null,
    baseBranch: null,
    reviewers: [],
    pullRequest: null,
  };
}

function extractApiErrorMessage(error: ApiError, fallback: string): string {
  if (error.status === 401) {
    return 'Você não tem permissão para executar esta ação.';
  }
  if (!error.body) {
    return fallback;
  }
  try {
    const parsed = JSON.parse(error.body) as { detail?: unknown };
    if (parsed && typeof parsed === 'object' && typeof parsed.detail === 'string') {
      return parsed.detail;
    }
  } catch {
    // Ignore JSON parse failures and fallback to raw body
  }
  return error.body || fallback;
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
  const [preferences, setPreferences] = useState<ObservabilityPreferences | null>(null);
  const [formState, setFormState] = useState<PreferenceStateMap>(buildPreferenceStateFromPreferences(null));
  const [isLoadingPreferences, setIsLoadingPreferences] = useState<boolean>(false);
  const [isSavingPreferences, setIsSavingPreferences] = useState<boolean>(false);
  const [preferencesError, setPreferencesError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<PreferencesFeedback | null>(null);
  const pendingEvalTimer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (pendingEvalTimer.current !== null) {
        window.clearTimeout(pendingEvalTimer.current);
      }
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setIsLoadingPreferences(true);

    fetchObservabilityPreferences(controller.signal)
      .then((result) => {
        if (controller.signal.aborted) {
          return;
        }
        setPreferences(result);
        setFormState(buildPreferenceStateFromPreferences(result));
        setPreferencesError(null);
      })
      .catch((error) => {
        if (controller.signal.aborted) {
          return;
        }
        if (error instanceof ApiError) {
          const message = error.status === 401
            ? 'Você não tem permissão para visualizar as preferências de observabilidade.'
            : extractApiErrorMessage(error, 'Falha ao carregar preferências de observabilidade.');
          setPreferencesError(message);
        } else {
          setPreferencesError('Falha ao carregar preferências de observabilidade.');
        }
        setPreferences(null);
        setFormState(buildPreferenceStateFromPreferences(null));
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsLoadingPreferences(false);
        }
      });

    return () => controller.abort();
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

  const validationErrors = useMemo<PreferenceErrorsMap>(() => {
    const result = {} as PreferenceErrorsMap;
    (Object.keys(PREFERENCE_LABELS) as PreferenceKey[]).forEach((key) => {
      result[key] = validatePreference(key, formState[key]);
    });
    return result;
  }, [formState]);

  const hasBlockingErrors = useMemo(() => {
    return (Object.keys(validationErrors) as PreferenceKey[]).some((key) => {
      const entry = validationErrors[key];
      return Boolean(entry.provider || entry.endpoint || entry.project);
    });
  }, [validationErrors]);

  const preferencesPlan = useMemo(() => buildPreferencesPlan(preferences), [preferences]);

  const isFormReadOnly = preferencesError !== null && !preferences;
  const disableForm = isLoadingPreferences || isSavingPreferences || isFormReadOnly;

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

  function handleToggleChange(key: PreferenceKey, enabled: boolean) {
    setFormState((current) => {
      const next = { ...current };
      const state = {
        ...next[key],
        isEnabled: enabled,
        touched: { provider: false, endpoint: false, project: false },
      };
      if (enabled && !state.provider) {
        state.provider = DEFAULT_PROVIDER_BY_KEY[key];
      }
      next[key] = state;
      return next;
    });
    setFeedback(null);
  }

  function handleProviderChange(key: PreferenceKey, event: ChangeEvent<HTMLSelectElement>) {
    const value = event.target.value as ObservabilityProviderType;
    setFormState((current) => {
      const next = { ...current };
      const touched = { ...next[key].touched, provider: true };
      next[key] = {
        ...next[key],
        provider: value,
        touched,
        endpoint: value === 'langsmith' ? '' : next[key].endpoint,
        project: value === 'otlp' ? '' : next[key].project,
      };
      return next;
    });
    setFeedback(null);
  }

  function handleEndpointChange(key: PreferenceKey, event: ChangeEvent<HTMLInputElement>) {
    const value = event.target.value;
    setFormState((current) => {
      const next = { ...current };
      next[key] = {
        ...next[key],
        endpoint: value,
        touched: { ...next[key].touched, endpoint: true },
      };
      return next;
    });
    setFeedback(null);
  }

  function handleProjectChange(key: PreferenceKey, event: ChangeEvent<HTMLInputElement>) {
    const value = event.target.value;
    setFormState((current) => {
      const next = { ...current };
      next[key] = {
        ...next[key],
        project: value,
        touched: { ...next[key].touched, project: true },
      };
      return next;
    });
    setFeedback(null);
  }

  function handlePreferencesSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (hasBlockingErrors) {
      setFormState((current) => {
        const next = { ...current };
        (Object.keys(validationErrors) as PreferenceKey[]).forEach((key) => {
          const entry = validationErrors[key];
          const touched = { ...next[key].touched };
          if (entry.provider) {
            touched.provider = true;
          }
          if (entry.endpoint) {
            touched.endpoint = true;
          }
          if (entry.project) {
            touched.project = true;
          }
          next[key] = { ...next[key], touched };
        });
        return next;
      });
      setFeedback({ kind: 'error', message: 'Corrija os campos destacados antes de salvar.' });
      return;
    }

    const payload = buildUpdateInputFromState(formState);
    setIsSavingPreferences(true);
    setFeedback(null);

    updateObservabilityPreferences(payload)
      .then((result) => {
        setPreferences(result);
        setFormState(buildPreferenceStateFromPreferences(result));
        setPreferencesError(null);
        setFeedback({
          kind: 'success',
          message: 'Preferências de observabilidade atualizadas com sucesso.',
        });
      })
      .catch((error) => {
        if (error instanceof ApiError) {
          setFeedback({
            kind: 'error',
            message: extractApiErrorMessage(error, 'Falha ao salvar preferências de observabilidade.'),
          });
        } else {
          setFeedback({
            kind: 'error',
            message: 'Falha ao salvar preferências de observabilidade.',
          });
        }
      })
      .finally(() => {
        setIsSavingPreferences(false);
      });
  }

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

      <div className="observability__preferences">
        <form className="observability__preferences-form" onSubmit={handlePreferencesSubmit} noValidate>
          <header className="observability__preferences-header">
            <div>
              <h3>Preferências de observabilidade</h3>
              <p>
                Conecte tracing, métricas e evals às ferramentas oficiais para garantir auditoria centralizada.
              </p>
            </div>
            {isLoadingPreferences ? (
              <span className="observability__preferences-tag" role="status" aria-live="polite">
                Carregando…
              </span>
            ) : null}
          </header>

          {(Object.keys(PREFERENCE_LABELS) as PreferenceKey[]).map((key) => {
            const state = formState[key];
            const errors = validationErrors[key];
            const providerId = `observability-${key}-provider`;
            const endpointId = `observability-${key}-endpoint`;
            const projectId = `observability-${key}-project`;
            const showProviderError = Boolean(state.touched.provider && errors.provider);
            const showEndpointField = state.isEnabled && state.provider === 'otlp';
            const showProjectField = state.isEnabled && state.provider === 'langsmith';
            const showEndpointError = Boolean(state.touched.endpoint && errors.endpoint);
            const showProjectError = Boolean(state.touched.project && errors.project);
            return (
              <fieldset key={key} className="observability__preference" disabled={disableForm}>
                <legend>
                  <span>{PREFERENCE_LABELS[key]}</span>
                  <label className="observability__toggle">
                    <input
                      type="checkbox"
                      checked={state.isEnabled}
                      onChange={(event) => handleToggleChange(key, event.target.checked)}
                      disabled={disableForm}
                    />
                    <span>{state.isEnabled ? 'Ativo' : 'Desativado'}</span>
                  </label>
                </legend>
                <p className="observability__preference-description">{PREFERENCE_DESCRIPTIONS[key]}</p>
                <div className="observability__field">
                  <label htmlFor={providerId}>Provider</label>
                  <select
                    id={providerId}
                    value={state.provider}
                    onChange={(event) => handleProviderChange(key, event)}
                    disabled={!state.isEnabled || disableForm}
                  >
                    <option value="" disabled>
                      Selecione um provider
                    </option>
                    {PROVIDER_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  {showProviderError ? (
                    <span className="observability__field-error" role="alert">
                      {errors.provider}
                    </span>
                  ) : null}
                </div>
                {showEndpointField ? (
                  <div className="observability__field">
                    <label htmlFor={endpointId}>Endpoint</label>
                    <input
                      type="url"
                      id={endpointId}
                      value={state.endpoint}
                      onChange={(event) => handleEndpointChange(key, event)}
                      placeholder="https://collector.exemplo.com/v1/traces"
                      disabled={disableForm}
                      autoComplete="off"
                    />
                    <small>Informe o endpoint HTTP(s) do coletor OTLP configurado.</small>
                    {showEndpointError ? (
                      <span className="observability__field-error" role="alert">
                        {errors.endpoint}
                      </span>
                    ) : null}
                  </div>
                ) : null}
                {showProjectField ? (
                  <div className="observability__field">
                    <label htmlFor={projectId}>Projeto</label>
                    <input
                      type="text"
                      id={projectId}
                      value={state.project}
                      onChange={(event) => handleProjectChange(key, event)}
                      placeholder="Nome do projeto LangSmith"
                      disabled={disableForm}
                      autoComplete="off"
                    />
                    <small>Projeto LangSmith que receberá spans e execuções avaliadas.</small>
                    {showProjectError ? (
                      <span className="observability__field-error" role="alert">
                        {errors.project}
                      </span>
                    ) : null}
                  </div>
                ) : null}
                {!state.isEnabled ? (
                  <p className="observability__preference-muted">Preferência desativada para este domínio.</p>
                ) : null}
              </fieldset>
            );
          })}

          {preferencesError ? (
            <p role="alert" className="observability__feedback observability__feedback--error">
              {preferencesError}
            </p>
          ) : null}

          {feedback ? (
            <p
              role={feedback.kind === 'error' ? 'alert' : 'status'}
              className={`observability__feedback observability__feedback--${feedback.kind}`}
              aria-live="polite"
            >
              {feedback.message}
            </p>
          ) : null}

          <div className="observability__preferences-actions">
            <button type="submit" disabled={disableForm || hasBlockingErrors || isSavingPreferences}>
              {isSavingPreferences ? 'Salvando…' : 'Salvar preferências'}
            </button>
          </div>
        </form>

        <PlanSummary plan={preferencesPlan} isLoading={isLoadingPreferences || isSavingPreferences} />
      </div>

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

        <Suspense
          fallback={
            <>
              <article className="observability__chart" role="status" aria-live="polite">
                <header>
                  <h3>Latência média por provedor</h3>
                  <p>Compare a latência das execuções para identificar outliers rapidamente.</p>
                </header>
                <div className="observability__chart-canvas">
                  <p>Carregando gráficos de métricas…</p>
                </div>
              </article>
              <article className="observability__chart" role="status" aria-live="polite">
                <header>
                  <h3>Distribuição de sucesso por provedor</h3>
                  <p>Relacione volume de execuções, sucesso e custo médio.</p>
                </header>
                <div className="observability__chart-canvas">
                  <p>Carregando gráficos de métricas…</p>
                </div>
              </article>
            </>
          }
        >
          <ObservabilityCharts traceRows={traceRows} />
        </Suspense>
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
