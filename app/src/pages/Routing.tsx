import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { createTwoFilesPatch } from 'diff';
import './Routing.scss';
import { ROUTING_TEST_IDS } from './testIds';

import {
  fetchPolicyManifest,
  simulateRouting,
  patchConfigPoliciesPlan,
  postPolicyPlanApply,
  type PolicyManifestSnapshot,
  type PolicyManifestUpdateInput,
  type RoutingTierId,
  type ProviderSummary,
  type RoutingSimulationResult,
  type RoutingStrategyId,
  type RoutingIntentConfig,
  type RoutingRuleConfig,
  type PolicyPlanResponse,
  type ConfigPlanDiffSummary,
} from '../api';
import PlanDiffViewer, { type PlanDiffItem } from '../components/PlanDiffViewer';

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

interface RoutingIntentDraft {
  intent: string;
  description: string;
  tags: string;
  defaultTier: RoutingTierId;
  fallbackProviderId: string;
}

interface RoutingRuleDraft {
  id: string;
  description: string;
  intent: string;
  matcher: string;
  targetTier: RoutingTierId | '';
  providerId: string;
  weight: string;
}

interface RoutingFormState {
  maxIters: string;
  maxAttempts: string;
  requestTimeout: string;
  totalTimeout: string;
  defaultTier: RoutingTierId;
  fallbackTier: RoutingTierId | '';
  allowedTiers: Set<RoutingTierId>;
  intents: RoutingIntentDraft[];
  rules: RoutingRuleDraft[];
}

interface RoutingFormErrors {
  maxIters?: string;
  maxAttempts?: string;
  requestTimeout?: string;
  totalTimeout?: string;
  allowedTiers?: string;
  fallbackTier?: string;
  intents?: string;
  rules?: string;
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

const POLICY_MANIFEST_ID = 'manifest';
const ROUTING_PLAN_ACTOR_STORAGE_KEY = 'mcp-routing-plan-actor';
const ROUTING_PLAN_ACTOR_EMAIL_STORAGE_KEY = 'mcp-routing-plan-actor-email';
const ROUTING_PLAN_COMMIT_MESSAGE_STORAGE_KEY = 'mcp-routing-plan-commit-message';

type PendingRoutingPlan = {
  id: string;
  plan: PolicyPlanResponse['plan'];
  planPayload: PolicyPlanResponse['planPayload'];
  patch: string;
  diffs: PlanDiffItem[];
  nextSnapshot: PolicyManifestSnapshot;
};

function cloneManifest(snapshot: PolicyManifestSnapshot): PolicyManifestSnapshot {
  return JSON.parse(JSON.stringify(snapshot)) as PolicyManifestSnapshot;
}

function loadPlanPreference(key: string, fallback: string): string {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return fallback;
  }

  try {
    const value = window.localStorage.getItem(key);
    if (!value) {
      return fallback;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : fallback;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to load plan preference from storage', error);
    return fallback;
  }
}

function persistPlanPreference(key: string, value: string): void {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return;
  }

  try {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      window.localStorage.removeItem(key);
      return;
    }
    window.localStorage.setItem(key, trimmed);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to persist plan preference to storage', error);
  }
}

function generatePlanId(): string {
  const cryptoApi = (globalThis as { crypto?: Crypto }).crypto;
  if (cryptoApi && typeof cryptoApi.randomUUID === 'function') {
    return cryptoApi.randomUUID();
  }
  return `routing-plan-${Date.now()}`;
}

function applyRoutingUpdateToSnapshot(
  current: PolicyManifestSnapshot,
  update: PolicyManifestUpdateInput,
): PolicyManifestSnapshot {
  const next = cloneManifest(current);

  if (update.routing) {
    if (update.routing.maxIters !== undefined && update.routing.maxIters !== null) {
      next.routing.maxIters = update.routing.maxIters;
    }
    if (update.routing.maxAttempts !== undefined && update.routing.maxAttempts !== null) {
      next.routing.maxAttempts = update.routing.maxAttempts;
    }
    if (update.routing.requestTimeoutSeconds !== undefined && update.routing.requestTimeoutSeconds !== null) {
      next.routing.requestTimeoutSeconds = update.routing.requestTimeoutSeconds;
    }
    if (update.routing.totalTimeoutSeconds !== undefined) {
      next.routing.totalTimeoutSeconds = update.routing.totalTimeoutSeconds;
    }
    if (update.routing.defaultTier !== undefined) {
      next.routing.defaultTier = update.routing.defaultTier;
      if (!next.routing.allowedTiers.includes(update.routing.defaultTier)) {
        next.routing.allowedTiers = Array.from(new Set([...next.routing.allowedTiers, update.routing.defaultTier]));
      }
    }
    if (update.routing.allowedTiers !== undefined) {
      next.routing.allowedTiers = Array.from(new Set(update.routing.allowedTiers));
    }
    if (update.routing.fallbackTier !== undefined) {
      next.routing.fallbackTier = update.routing.fallbackTier;
    }
    if (update.routing.intents !== undefined) {
      next.routing.intents = update.routing.intents.map((intent) => ({ ...intent }));
    }
    if (update.routing.rules !== undefined) {
      next.routing.rules = update.routing.rules.map((rule) => ({ ...rule }));
    }
  }

  next.updatedAt = new Date().toISOString();
  return next;
}

function formatManifestSnapshot(snapshot: PolicyManifestSnapshot): string {
  return `${JSON.stringify(snapshot, null, 2)}\n`;
}

function mapPlanDiffItems(diffs: ConfigPlanDiffSummary[], manifestPatch: string): PlanDiffItem[] {
  const hasManifestPatch = manifestPatch.trim().length > 0;

  if (!diffs || diffs.length === 0) {
    if (!hasManifestPatch) {
      throw new Error('Plano de roteamento não retornou diff para o manifesto.');
    }
    return [
      {
        id: 'routing-manifest',
        title: 'policies/manifest.json',
        summary: 'Atualizar manifesto com novas regras de roteamento',
        diff: manifestPatch,
      },
    ];
  }

  return diffs.map((diff, index) => {
    const isManifestFile = diff.path.endsWith('manifest.json');
    if (isManifestFile && !hasManifestPatch) {
      throw new Error('Plano de roteamento não forneceu diff detalhado do manifesto.');
    }

    const diffContent = isManifestFile ? manifestPatch : diff.diff ?? '';
    if (!diffContent.trim()) {
      throw new Error(`Plano de roteamento retornou diff vazio para ${diff.path}.`);
    }

    return {
      id: `${diff.path}-${index}`,
      title: diff.path,
      summary: diff.summary,
      diff: diffContent,
    };
  });
}

function intentToDraft(intent: RoutingIntentConfig): RoutingIntentDraft {
  return {
    intent: intent.intent,
    description: intent.description ?? '',
    tags: intent.tags.join(', '),
    defaultTier: intent.defaultTier,
    fallbackProviderId: intent.fallbackProviderId ?? '',
  };
}

function draftToIntent(draft: RoutingIntentDraft): RoutingIntentConfig {
  const tags = draft.tags
    .split(',')
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);
  return {
    intent: draft.intent.trim(),
    description: draft.description.trim() || null,
    tags,
    defaultTier: draft.defaultTier,
    fallbackProviderId: draft.fallbackProviderId ? draft.fallbackProviderId : null,
  };
}

function ruleToDraft(rule: RoutingRuleConfig): RoutingRuleDraft {
  return {
    id: rule.id,
    description: rule.description ?? '',
    intent: rule.intent ?? '',
    matcher: rule.matcher,
    targetTier: rule.targetTier ?? '',
    providerId: rule.providerId ?? '',
    weight: rule.weight != null && Number.isFinite(rule.weight) ? String(rule.weight) : '',
  };
}

function draftToRule(draft: RoutingRuleDraft): RoutingRuleConfig {
  const trimmedWeight = draft.weight.trim();
  const weightValue = trimmedWeight.length > 0 ? Number(trimmedWeight) : null;
  return {
    id: draft.id.trim(),
    description: draft.description.trim() || null,
    intent: draft.intent.trim() ? draft.intent.trim() : null,
    matcher: draft.matcher.trim(),
    targetTier: draft.targetTier || null,
    providerId: draft.providerId ? draft.providerId : null,
    weight:
      weightValue != null && !Number.isNaN(weightValue) && Number.isFinite(weightValue) ? weightValue : null,
  };
}

interface IntentEditorListProps {
  intents: RoutingIntentDraft[];
  providers: ProviderSummary[];
  allowedTiers: RoutingTierId[];
  disabled: boolean;
  onChange: (next: RoutingIntentDraft[]) => void;
}

function IntentEditorList({ intents, providers, allowedTiers, disabled, onChange }: IntentEditorListProps) {
  const tierOptions = allowedTiers.length > 0 ? allowedTiers : (['economy', 'balanced', 'turbo'] as RoutingTierId[]);

  const handleIntentFieldChange = useCallback(
    (index: number, field: keyof RoutingIntentDraft, value: string | RoutingTierId) => {
      onChange(
        intents.map((intent, position) =>
          position === index ? { ...intent, [field]: value } : intent,
        ),
      );
    },
    [intents, onChange],
  );

  const handleIntentRemove = useCallback(
    (index: number) => {
      onChange(intents.filter((_, position) => position !== index));
    },
    [intents, onChange],
  );

  const handleIntentAdd = useCallback(() => {
    const fallbackTier = tierOptions.includes('balanced' as RoutingTierId)
      ? ('balanced' as RoutingTierId)
      : tierOptions[0] ?? ('balanced' as RoutingTierId);
    onChange([
      ...intents,
      { intent: '', description: '', tags: '', defaultTier: fallbackTier, fallbackProviderId: '' },
    ]);
  }, [intents, tierOptions, onChange]);

  return (
    <div className="routing-manifest__collection" aria-live="polite">
      {intents.map((intent, index) => (
        <fieldset key={`intent-${index}`} className="routing-manifest__fieldset">
          <legend>Intent #{index + 1}</legend>
          <div className="routing-manifest__grid routing-manifest__grid--intent">
            <label className="form-field">
              <span>Identificador</span>
              <input
                type="text"
                value={intent.intent}
                onChange={(event) => handleIntentFieldChange(index, 'intent', event.target.value)}
                placeholder="ex.: search.results"
                disabled={disabled}
              />
            </label>
            <label className="form-field">
              <span>Descrição</span>
              <input
                type="text"
                value={intent.description}
                onChange={(event) => handleIntentFieldChange(index, 'description', event.target.value)}
                placeholder="Resumo da finalidade"
                disabled={disabled}
              />
            </label>
            <label className="form-field">
              <span>Tags (separadas por vírgula)</span>
              <input
                type="text"
                value={intent.tags}
                onChange={(event) => handleIntentFieldChange(index, 'tags', event.target.value)}
                placeholder="ex.: canary, critical"
                disabled={disabled}
              />
            </label>
            <label className="form-field">
              <span>Tier padrão</span>
              <select
                value={intent.defaultTier}
                onChange={(event) => handleIntentFieldChange(index, 'defaultTier', event.target.value as RoutingTierId)}
                disabled={disabled}
              >
                {tierOptions.map((tier) => (
                  <option key={`intent-${index}-tier-${tier}`} value={tier}>
                    {TIER_LABEL[tier]}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-field">
              <span>Fallback dedicado</span>
              <select
                value={intent.fallbackProviderId}
                onChange={(event) => handleIntentFieldChange(index, 'fallbackProviderId', event.target.value)}
                disabled={disabled}
              >
                <option value="">Sem fallback dedicado</option>
                {providers.map((provider) => (
                  <option key={`intent-${index}-provider-${provider.id}`} value={provider.id}>
                    {provider.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="routing-manifest__actions">
            <button
              type="button"
              className="button button--ghost"
              onClick={() => handleIntentRemove(index)}
              disabled={disabled}
            >
              Remover intent
            </button>
          </div>
        </fieldset>
      ))}
      <button type="button" className="button button--secondary" onClick={handleIntentAdd} disabled={disabled}>
        Adicionar intent
      </button>
    </div>
  );
}

interface RuleEditorListProps {
  rules: RoutingRuleDraft[];
  intents: RoutingIntentDraft[];
  providers: ProviderSummary[];
  allowedTiers: RoutingTierId[];
  disabled: boolean;
  onChange: (next: RoutingRuleDraft[]) => void;
}

function RuleEditorList({ rules, intents, providers, allowedTiers, disabled, onChange }: RuleEditorListProps) {
  const tierOptions = allowedTiers.length > 0 ? allowedTiers : (['economy', 'balanced', 'turbo'] as RoutingTierId[]);

  const handleRuleFieldChange = useCallback(
    (index: number, field: keyof RoutingRuleDraft, value: string | RoutingTierId | '') => {
      onChange(
        rules.map((rule, position) =>
          position === index ? { ...rule, [field]: value } : rule,
        ),
      );
    },
    [rules, onChange],
  );

  const handleRuleRemove = useCallback(
    (index: number) => {
      onChange(rules.filter((_, position) => position !== index));
    },
    [rules, onChange],
  );

  const handleRuleAdd = useCallback(() => {
    onChange([
      ...rules,
      { id: '', description: '', intent: '', matcher: '', targetTier: '', providerId: '', weight: '' },
    ]);
  }, [rules, onChange]);

  return (
    <div className="routing-manifest__collection" aria-live="polite">
      {rules.map((rule, index) => (
        <fieldset key={`rule-${index}`} className="routing-manifest__fieldset">
          <legend>Regra #{index + 1}</legend>
          <div className="routing-manifest__grid routing-manifest__grid--rule">
            <label className="form-field">
              <span>Identificador</span>
              <input
                type="text"
                value={rule.id}
                onChange={(event) => handleRuleFieldChange(index, 'id', event.target.value)}
                placeholder="ex.: boost-turbo"
                disabled={disabled}
              />
            </label>
            <label className="form-field">
              <span>Descrição</span>
              <input
                type="text"
                value={rule.description}
                onChange={(event) => handleRuleFieldChange(index, 'description', event.target.value)}
                placeholder="Objetivo da regra"
                disabled={disabled}
              />
            </label>
            <label className="form-field">
              <span>Intent associada</span>
              <select
                value={rule.intent}
                onChange={(event) => handleRuleFieldChange(index, 'intent', event.target.value)}
                disabled={disabled}
              >
                <option value="">Qualquer intent</option>
                {intents.map((intent) => (
                  <option key={`rule-${index}-intent-${intent.intent || `i${index}`}`} value={intent.intent}>
                    {intent.intent || '(sem identificador)'}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-field">
              <span>Condição (matcher)</span>
              <input
                type="text"
                value={rule.matcher}
                onChange={(event) => handleRuleFieldChange(index, 'matcher', event.target.value)}
                placeholder="ex.: latency_p95_ms > 800"
                disabled={disabled}
              />
            </label>
            <label className="form-field">
              <span>Tier alvo</span>
              <select
                value={rule.targetTier}
                onChange={(event) =>
                  handleRuleFieldChange(index, 'targetTier', event.target.value ? (event.target.value as RoutingTierId) : '')
                }
                disabled={disabled}
              >
                <option value="">Manter cálculo do simulador</option>
                {tierOptions.map((tier) => (
                  <option key={`rule-${index}-tier-${tier}`} value={tier}>
                    {TIER_LABEL[tier]}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-field">
              <span>Provider forçado</span>
              <select
                value={rule.providerId}
                onChange={(event) => handleRuleFieldChange(index, 'providerId', event.target.value)}
                disabled={disabled}
              >
                <option value="">Herda distribuição</option>
                {providers.map((provider) => (
                  <option key={`rule-${index}-provider-${provider.id}`} value={provider.id}>
                    {provider.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-field">
              <span>Peso (%)</span>
              <input
                type="number"
                min={0}
                max={100}
                value={rule.weight}
                onChange={(event) => handleRuleFieldChange(index, 'weight', event.target.value)}
                placeholder="Opcional"
                disabled={disabled}
              />
            </label>
          </div>
          <div className="routing-manifest__actions">
            <button
              type="button"
              className="button button--ghost"
              onClick={() => handleRuleRemove(index)}
              disabled={disabled}
            >
              Remover regra
            </button>
          </div>
        </fieldset>
      ))}
      <button type="button" className="button button--secondary" onClick={handleRuleAdd} disabled={disabled}>
        Adicionar regra
      </button>
    </div>
  );
}

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
    intents: [],
    rules: [],
  });
  const [routingErrors, setRoutingErrors] = useState<RoutingFormErrors>({});
  const [routingMessage, setRoutingMessage] = useState<string | null>(null);
  const [isRoutingSaving, setRoutingSaving] = useState(false);
  const [pendingPlan, setPendingPlan] = useState<PendingRoutingPlan | null>(null);
  const [isPlanModalOpen, setPlanModalOpen] = useState(false);
  const [isPlanApplying, setPlanApplying] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);
  const [planActor, setPlanActor] = useState(() => loadPlanPreference(ROUTING_PLAN_ACTOR_STORAGE_KEY, 'Console MCP'));
  const [planActorEmail, setPlanActorEmail] = useState(() =>
    loadPlanPreference(ROUTING_PLAN_ACTOR_EMAIL_STORAGE_KEY, 'console@example.com'),
  );
  const [planCommitMessage, setPlanCommitMessage] = useState(() =>
    loadPlanPreference(ROUTING_PLAN_COMMIT_MESSAGE_STORAGE_KEY, 'chore: atualizar roteamento MCP'),
  );
  const simulationIntents = useMemo(() => {
    return routingForm.intents
      .map(draftToIntent)
      .filter((intent) => intent.intent.length > 0 || intent.tags.length > 0 || intent.description !== null);
  }, [routingForm.intents]);
  const simulationRules = useMemo(() => {
    return routingForm.rules
      .map(draftToRule)
      .filter((rule) => rule.id.length > 0 && rule.matcher.length > 0);
  }, [routingForm.rules]);

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
      intents: routing.intents.map(intentToDraft),
      rules: routing.rules.map(ruleToDraft),
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
      simulateRouting(
        { strategy: 'balanced', ...commonPayload, intents: simulationIntents, rules: simulationRules },
        controller.signal,
      ),
      simulateRouting(
        { strategy: strategyId, ...commonPayload, intents: simulationIntents, rules: simulationRules },
        controller.signal,
      ),
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
  }, [providers, strategyId, volumeMillions, failoverId, simulationIntents, simulationRules]);

  const selectedStrategy = STRATEGY_MAP.get(strategyId) ?? STRATEGIES[0];
  const planReady = baselinePlan !== null && plan !== null;
  const savings =
    planReady ? Number((baselinePlan.cost.totalUsd - plan.cost.totalUsd).toFixed(2)) : 0;
  const latencyDelta =
    planReady
      ? Number((plan.latency.avgLatencyMs - baselinePlan.latency.avgLatencyMs).toFixed(0))
      : 0;
  const reliabilityDelta = planReady
    ? Number(
        (plan.latency.reliabilityScore - baselinePlan.latency.reliabilityScore).toFixed(1),
      )
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

  const handleIntentsChange = useCallback((nextIntents: RoutingIntentDraft[]) => {
    setRoutingForm((current) => ({ ...current, intents: nextIntents }));
    setRoutingErrors((current) => ({ ...current, intents: undefined }));
    setRoutingMessage(null);
  }, []);

  const handleRulesChange = useCallback((nextRules: RoutingRuleDraft[]) => {
    setRoutingForm((current) => ({ ...current, rules: nextRules }));
    setRoutingErrors((current) => ({ ...current, rules: undefined }));
    setRoutingMessage(null);
  }, []);

  const handlePlanActorChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setPlanActor(value);
    persistPlanPreference(ROUTING_PLAN_ACTOR_STORAGE_KEY, value);
  }, []);

  const handlePlanActorEmailChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setPlanActorEmail(value);
    persistPlanPreference(ROUTING_PLAN_ACTOR_EMAIL_STORAGE_KEY, value);
  }, []);

  const handlePlanCommitMessageChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setPlanCommitMessage(value);
    persistPlanPreference(ROUTING_PLAN_COMMIT_MESSAGE_STORAGE_KEY, value);
  }, []);

  const handlePlanCancel = useCallback(() => {
    setPlanModalOpen(false);
    setPendingPlan(null);
    setPlanError(null);
  }, []);

  const handlePlanApply = useCallback(async () => {
    if (!pendingPlan) {
      return;
    }

    const planId = pendingPlan.id;
    setPlanApplying(true);
    setPlanError(null);
    try {
      const response = await postPolicyPlanApply({
        planId,
        plan: pendingPlan.planPayload,
        patch: pendingPlan.patch,
        actor: planActor.trim() || 'Console MCP',
        actorEmail: planActorEmail.trim() || 'console@example.com',
        commitMessage: planCommitMessage.trim() || 'chore: atualizar roteamento MCP',
      });
      const message = response.message || 'Plano aplicado com sucesso.';
      setRoutingMessage(message);
      setManifest(pendingPlan.nextSnapshot);
      setPendingPlan(null);
      setPlanModalOpen(false);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to apply routing plan', error);
      const message =
        error instanceof Error && error.message
          ? error.message
          : 'Falha ao aplicar plano. Tente novamente.';
      setPlanError(message);
    } finally {
      setPlanApplying(false);
      setRoutingSaving(false);
    }
  }, [pendingPlan, planActor, planActorEmail, planCommitMessage]);

  const handleRoutingSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
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

      if (routingForm.intents.length > 0) {
        const seenIntentIds = new Set<string>();
        const intentIssues: string[] = [];
        routingForm.intents.forEach((intent) => {
          const trimmedId = intent.intent.trim();
          if (!trimmedId) {
            intentIssues.push('Todas as intents devem ter um identificador.');
          } else if (seenIntentIds.has(trimmedId)) {
            intentIssues.push(`Intent duplicada: ${trimmedId}.`);
          } else {
            seenIntentIds.add(trimmedId);
          }
        });
        if (intentIssues.length > 0) {
          errors.intents = Array.from(new Set(intentIssues)).join(' ');
        }
      }

      if (routingForm.rules.length > 0) {
        const seenRuleIds = new Set<string>();
        const knownIntentIds = new Set(
          routingForm.intents.map((intent) => intent.intent.trim()).filter((value) => value.length > 0),
        );
        const ruleIssues: string[] = [];
        routingForm.rules.forEach((rule) => {
          const trimmedId = rule.id.trim();
          const trimmedMatcher = rule.matcher.trim();
          if (!trimmedId || !trimmedMatcher) {
            ruleIssues.push('Preencha identificador e condição para todas as regras.');
          }
          if (trimmedId && seenRuleIds.has(trimmedId)) {
            ruleIssues.push(`Regra duplicada: ${trimmedId}.`);
          }
          if (trimmedId) {
            seenRuleIds.add(trimmedId);
          }
          const weightRaw = rule.weight.trim();
          if (weightRaw) {
            const parsedWeight = Number(weightRaw);
            if (Number.isNaN(parsedWeight) || parsedWeight < 0 || parsedWeight > 100) {
              ruleIssues.push('Peso das regras deve estar entre 0% e 100%.');
            }
          }
          if (rule.intent.trim() && !knownIntentIds.has(rule.intent.trim())) {
            ruleIssues.push(`Intent desconhecida referenciada pela regra ${trimmedId || '(sem id)'}.`);
          }
        });
        if (ruleIssues.length > 0) {
          errors.rules = Array.from(new Set(ruleIssues)).join(' ');
        }
      }

      if (Object.keys(errors).length > 0) {
        setRoutingErrors(errors);
        setRoutingMessage(null);
        return;
      }

      if (!manifest) {
        setRoutingMessage('Carregue a configuração atual antes de gerar um plano.');
        return;
      }

      const intentsPayload = routingForm.intents.map(draftToIntent);
      const rulesPayload = routingForm.rules.map(draftToRule);

      const payload: PolicyManifestUpdateInput = {
        routing: {
          maxIters: Math.round(maxItersValue),
          maxAttempts: Math.round(maxAttemptsValue),
          requestTimeoutSeconds: Math.round(requestTimeoutValue),
          totalTimeoutSeconds: totalTimeoutValue !== null ? Math.round(totalTimeoutValue) : null,
          defaultTier: routingForm.defaultTier,
          allowedTiers: Array.from(new Set<RoutingTierId>(allowed)),
          fallbackTier: routingForm.fallbackTier || null,
          intents: intentsPayload,
          rules: rulesPayload,
        },
      };

      setRoutingSaving(true);
      setRoutingMessage('Gerando plano de atualização…');
      setRoutingErrors({});
      setPlanError(null);

      try {
        const planResponse = await patchConfigPoliciesPlan({
          policyId: POLICY_MANIFEST_ID,
          changes: payload,
        });

        const nextSnapshot = applyRoutingUpdateToSnapshot(manifest, payload);
        const currentManifestString = formatManifestSnapshot(manifest);
        const nextManifestString = formatManifestSnapshot(nextSnapshot);
        const patch = createTwoFilesPatch(
          'policies/manifest.json',
          'policies/manifest.json',
          currentManifestString,
          nextManifestString,
          undefined,
          undefined,
          { context: 3 },
        );

        const diffs = mapPlanDiffItems(planResponse.plan.diffs, patch);

        setPendingPlan({
          id: generatePlanId(),
          plan: planResponse.plan,
          planPayload: planResponse.planPayload,
          patch,
          diffs,
          nextSnapshot,
        });
        setPlanModalOpen(true);
        setRoutingErrors({});
        setRoutingMessage('Plano gerado. Revise as alterações antes de aplicar.');
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Failed to generate routing plan', error);
        const message =
          error instanceof Error && error.message
            ? error.message
            : 'Falha ao gerar plano de atualização. Tente novamente.';
        setRoutingMessage(message);
        setPendingPlan(null);
        setPlanModalOpen(false);
      } finally {
        setRoutingSaving(false);
      }
    },
    [routingForm, manifest],
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
    <>
      {isPlanModalOpen && pendingPlan ? (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="routing-plan-modal-title">
          <div className="modal">
            <header className="modal__header">
              <h2 id="routing-plan-modal-title" className="modal__title">
                Confirmar alterações de roteamento
              </h2>
              <p className="modal__subtitle">{pendingPlan.plan.summary}</p>
            </header>
            <div className="modal__body">
              <PlanDiffViewer
                diffs={pendingPlan.diffs}
                testId="routing-plan-diffs"
                itemTestIdPrefix="routing-plan-diff"
              />
              <div
                className="modal__form"
                role="group"
                aria-labelledby="routing-plan-modal-title"
                data-testid={ROUTING_TEST_IDS.planForm}
              >
                <div className="modal__field">
                  <label className="modal__label" htmlFor="routing-plan-actor">
                    Autor da alteração
                  </label>
                  <input
                    id="routing-plan-actor"
                    type="text"
                    className="modal__input"
                    value={planActor}
                    onChange={handlePlanActorChange}
                    placeholder="Nome completo do autor"
                    autoComplete="name"
                  />
                </div>
                <div className="modal__field">
                  <label className="modal__label" htmlFor="routing-plan-actor-email">
                    E-mail do autor
                  </label>
                  <input
                    id="routing-plan-actor-email"
                    type="email"
                    className="modal__input"
                    value={planActorEmail}
                    onChange={handlePlanActorEmailChange}
                    placeholder="autor@example.com"
                    autoComplete="email"
                  />
                </div>
                <div className="modal__field">
                  <label className="modal__label" htmlFor="routing-plan-commit-message">
                    Mensagem do commit
                  </label>
                  <input
                    id="routing-plan-commit-message"
                    type="text"
                    className="modal__input"
                    value={planCommitMessage}
                    onChange={handlePlanCommitMessageChange}
                    placeholder="Descreva o objetivo das alterações"
                  />
                </div>
              </div>
              {planError && <p className="modal__error">{planError}</p>}
            </div>
            <footer className="modal__footer">
              <button
                type="button"
                className="button button--ghost"
                onClick={handlePlanCancel}
                disabled={isPlanApplying}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="button button--primary"
                onClick={handlePlanApply}
                disabled={isPlanApplying}
              >
                {isPlanApplying ? 'Aplicando…' : 'Aplicar plano'}
              </button>
            </footer>
          </div>
        </div>
      ) : null}
      <section className="routing-lab" data-testid={ROUTING_TEST_IDS.lab}>
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

      <section
        className="routing-manifest"
        aria-labelledby="routing-manifest-heading"
        data-testid={ROUTING_TEST_IDS.manifest.section}
      >
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
        <form
          className="routing-manifest__form"
          onSubmit={handleRoutingSubmit}
          data-testid={ROUTING_TEST_IDS.manifest.form}
        >
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

          <section
            className="routing-manifest__section"
            aria-labelledby="routing-intents-heading"
            data-testid={ROUTING_TEST_IDS.intentsSection}
          >
            <header className="routing-manifest__section-header">
              <h4 id="routing-intents-heading">Intents direcionadas</h4>
              <p>Mapeie intents com tiers padrão e fallback dedicados.</p>
            </header>
            <IntentEditorList
              intents={routingForm.intents}
              providers={providers}
              allowedTiers={allowedTiers}
              disabled={isManifestLoading || isRoutingSaving}
              onChange={handleIntentsChange}
            />
            {routingErrors.intents && <p className="form-field__error">{routingErrors.intents}</p>}
          </section>

          <section
            className="routing-manifest__section"
            aria-labelledby="routing-rules-heading"
            data-testid={ROUTING_TEST_IDS.rulesSection}
          >
            <header className="routing-manifest__section-header">
              <h4 id="routing-rules-heading">Regras customizadas</h4>
              <p>Force tiers, provedores ou pesos quando condições específicas forem atendidas.</p>
            </header>
            <RuleEditorList
              rules={routingForm.rules}
              intents={routingForm.intents}
              providers={providers}
              allowedTiers={allowedTiers}
              disabled={isManifestLoading || isRoutingSaving}
              onChange={handleRulesChange}
            />
            {routingErrors.rules && <p className="form-field__error">{routingErrors.rules}</p>}
          </section>

          <div className="routing-manifest__actions">
            <button
              type="submit"
              className="button button--primary"
              disabled={isManifestLoading || isRoutingSaving}
            >
              {isRoutingSaving ? 'Gerando plano…' : 'Gerar plano'}
            </button>
          </div>
        </form>
      </section>

      <div className="routing-lab__layout">
        <section
          className="routing-lab__panel"
          aria-labelledby="routing-config"
          data-testid={ROUTING_TEST_IDS.configPanel}
        >
          <div className="routing-lab__panel-header">
            <h3 id="routing-config">Configuração do cenário</h3>
            <span className="routing-lab__focus" data-testid={ROUTING_TEST_IDS.focus}>
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
              <span aria-live="polite" data-testid={ROUTING_TEST_IDS.volumeValue}>
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
              value={
                failoverId
                  ? providers.find((provider) => provider.id === failoverId)?.name ?? failoverId
                  : ''
              }
              onChange={(event) => {
                const value = event.target.value;
                if (!value) {
                  setFailoverId(null);
                  return;
                }
                const matched = providers.find(
                  (provider) => provider.id === value || provider.name === value,
                );
                setFailoverId(matched ? matched.id : value);
              }}
            >
              <option value="">Nenhuma rota indisponível</option>
              {providers.map((provider) => (
                <option key={provider.id} value={provider.name} data-provider-id={provider.id}>
                  {provider.name}
                </option>
              ))}
            </select>
          </div>
        </section>

        <section
          className="routing-lab__panel"
          aria-labelledby="routing-metrics"
          data-testid={ROUTING_TEST_IDS.metricsPanel}
        >
          <div className="routing-lab__panel-header">
            <h3 id="routing-metrics">Métricas projetadas</h3>
            <span className="routing-lab__focus">Comparativo vs. baseline</span>
          </div>

          {planReady ? (
            <>
              <dl className="routing-lab__summary-grid">
                <div className="routing-lab__summary-card">
                  <dt>Projeção de custo</dt>
                  <dd data-testid={ROUTING_TEST_IDS.totalCost}>{formatCurrency(plan.cost.totalUsd)}</dd>
                  <small>Custo mensal estimado para {volumeMillions.toFixed(0)} mi tokens</small>
                </div>
                <div className="routing-lab__summary-card">
                  <dt>Economia vs baseline</dt>
                  <dd data-testid={ROUTING_TEST_IDS.savings}>{formatDeltaCurrency(savings)}</dd>
                  <small>
                    Baseline: {baselinePlan ? formatCurrency(baselinePlan.cost.totalUsd) : '—'}
                  </small>
                </div>
                <div className="routing-lab__summary-card">
                  <dt>Latência P95 projetada</dt>
                  <dd data-testid={ROUTING_TEST_IDS.latency}>{formatLatency(plan.latency.avgLatencyMs)}</dd>
                  <small>Delta: {latencyDeltaLabel} vs baseline</small>
                </div>
                <div className="routing-lab__summary-card">
                  <dt>Confiabilidade ponderada</dt>
                  <dd data-testid={ROUTING_TEST_IDS.reliability}>{plan.latency.reliabilityScore.toFixed(1)}%</dd>
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
              Cobertura de {distribution.length} provedores garante {plan.latency.reliabilityScore.toFixed(1)}% de
              confiabilidade ponderada.
            </li>
            <li>
              Tokens mensais distribuídos entre {distribution.length} rotas com custo médio de {formatCurrency(
                plan.cost.costPerMillionUsd,
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
    </>
  );
}
