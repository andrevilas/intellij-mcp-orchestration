import { useCallback, useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import type { ChangeEvent, FormEvent } from 'react';
import { createTwoFilesPatch } from 'diff';

import {
  createPolicyDeployment,
  deletePolicyDeployment,
  fetchPolicyDeployments,
  fetchPolicyManifest,
  fetchHitlQueue,
  fetchPolicyTemplates,
  resolveHitlRequest,
  patchConfigPoliciesPlan,
  postPolicyPlanApply,
  type PolicyPlanResponse,
  type ConfigPlanDiffSummary,
  type HitlEscalationChannel,
  type HitlApprovalRequest,
  type HitlCheckpoint,
  type HitlQueueSummary,
  type PolicyManifestSnapshot,
  type PolicyManifestUpdateInput,
  type PolicyDeployment,
  type PolicyRolloutAllocation,
  type PolicyTemplate,
  type PolicyTemplateId,
  type ProviderSummary,
} from '../api';
import PlanDiffViewer, { type PlanDiffItem } from '../components/PlanDiffViewer';
import Alert from '../components/feedback/Alert';
import PolicyTemplatePicker from '../components/PolicyTemplatePicker';
import ConfirmationModal from '../components/modals/ConfirmationModal';
import ModalBase from '../components/modals/ModalBase';
import { useToastNotification } from '../hooks/useToastNotification';
import { POLICIES_TEST_IDS } from './testIds';
import { describeFixtureRequest } from '../utils/fixtureStatus';
import { FileUploadControl, type UploadProgressHandler } from '../components/forms';
import { readFileAsText } from '../utils/readFile';

import './Policies.scss';

export interface PoliciesProps {
  providers: ProviderSummary[];
  isLoading: boolean;
  initialError: string | null;
}

const FALLBACK_TEMPLATE_ID: PolicyTemplateId = 'economy';

const EMPTY_TEMPLATE: PolicyTemplate = {
  id: FALLBACK_TEMPLATE_ID,
  name: 'Template indisponível',
  tagline: '—',
  description: 'Não foi possível carregar os templates de política no momento.',
  priceDelta: '—',
  latencyTarget: '—',
  guardrailLevel: '—',
  features: [],
};

const ESCALATION_OPTIONS: Array<{ value: HitlEscalationChannel | ''; label: string }> = [
  { value: '', label: 'Sem escalonamento' },
  { value: 'slack', label: 'Slack' },
  { value: 'email', label: 'E-mail' },
  { value: 'pagerduty', label: 'PagerDuty' },
];

const POLICY_MANIFEST_ID = 'manifest';

const PLAN_ACTOR_STORAGE_KEY = 'mcp-policy-plan-actor';
const PLAN_ACTOR_EMAIL_STORAGE_KEY = 'mcp-policy-plan-actor-email';
const PLAN_COMMIT_MESSAGE_STORAGE_KEY = 'mcp-policy-plan-commit-message';

type PendingPolicyPlan = {
  id: string;
  plan: PolicyPlanResponse['plan'];
  planPayload: PolicyPlanResponse['planPayload'];
  patch: string;
  diffs: PlanDiffItem[];
  nextSnapshot: PolicyManifestSnapshot;
};

function generatePlanId(): string {
  const cryptoApi = (globalThis as { crypto?: Crypto }).crypto;
  if (cryptoApi && typeof cryptoApi.randomUUID === 'function') {
    return cryptoApi.randomUUID();
  }
  return `policy-plan-${Date.now()}`;
}

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

function applyManifestUpdateToSnapshot(
  current: PolicyManifestSnapshot,
  update: PolicyManifestUpdateInput,
): PolicyManifestSnapshot {
  const next = cloneManifest(current);

  if (update.runtime) {
    if (update.runtime.maxIters !== undefined && update.runtime.maxIters !== null) {
      next.runtime.maxIters = update.runtime.maxIters;
    }
    if (update.runtime.timeouts) {
      if (update.runtime.timeouts.perIteration !== undefined) {
        next.runtime.timeouts.perIteration = update.runtime.timeouts.perIteration;
      }
      if (update.runtime.timeouts.total !== undefined) {
        next.runtime.timeouts.total = update.runtime.timeouts.total;
      }
    }
    if (update.runtime.retry) {
      if (update.runtime.retry.maxAttempts !== undefined) {
        next.runtime.retry.maxAttempts = update.runtime.retry.maxAttempts;
      }
      if (update.runtime.retry.initialDelay !== undefined) {
        next.runtime.retry.initialDelay = update.runtime.retry.initialDelay;
      }
      if (update.runtime.retry.backoffFactor !== undefined) {
        next.runtime.retry.backoffFactor = update.runtime.retry.backoffFactor;
      }
      if (update.runtime.retry.maxDelay !== undefined) {
        next.runtime.retry.maxDelay = update.runtime.retry.maxDelay;
      }
    }
    if (update.runtime.tracing) {
      if (update.runtime.tracing.enabled !== undefined) {
        next.runtime.tracing.enabled = Boolean(update.runtime.tracing.enabled);
      }
      if (update.runtime.tracing.sampleRate !== undefined && update.runtime.tracing.sampleRate !== null) {
        next.runtime.tracing.sampleRate = update.runtime.tracing.sampleRate;
      }
      if (update.runtime.tracing.exporter !== undefined) {
        next.runtime.tracing.exporter = update.runtime.tracing.exporter ?? next.runtime.tracing.exporter;
      }
    }
  }

  if (update.hitl) {
    if (update.hitl.enabled !== undefined) {
      next.hitl.enabled = Boolean(update.hitl.enabled);
    }
    if (update.hitl.checkpoints) {
      next.hitl.checkpoints = update.hitl.checkpoints.map((checkpoint) => ({ ...checkpoint }));
    } else if (update.hitl.checkpoints === null) {
      next.hitl.checkpoints = [];
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
      throw new Error('Plano de políticas não retornou diff para o manifesto.');
    }
    return [
      {
        id: 'policies-manifest',
        title: 'policies/manifest.json',
        summary: 'Atualizar manifesto com as novas configurações de runtime e HITL',
        diff: manifestPatch,
      },
    ];
  }

  return diffs.map((diff, index) => {
    const isManifestFile = diff.path.endsWith('manifest.json');
    if (isManifestFile && !hasManifestPatch) {
      throw new Error('Plano de políticas não forneceu diff detalhado do manifesto.');
    }

    const diffContent = isManifestFile ? manifestPatch : diff.diff ?? '';
    if (!diffContent.trim()) {
      throw new Error(`Plano de políticas retornou diff vazio para ${diff.path}.`);
    }

    return {
      id: `${diff.path}-${index}`,
      title: diff.path,
      summary: diff.summary,
      diff: diffContent,
    };
  });
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

type BannerKind = 'success' | 'info' | 'warning';

type RuntimeFormState = {
  maxIters: string;
  perIteration: string;
  totalTimeout: string;
  sampleRate: string;
};

type RuntimeFormErrors = {
  maxIters?: string;
  perIteration?: string;
  totalTimeout?: string;
  sampleRate?: string;
  checkpoints?: string;
};

const RUNTIME_FIELD_FOCUS_MAP: Record<keyof RuntimeFormErrors, string | null> = {
  maxIters: 'runtime-maxIters',
  perIteration: 'runtime-perIteration',
  totalTimeout: 'runtime-totalTimeout',
  sampleRate: 'runtime-sampleRate',
  checkpoints: 'policies-hitl-checkpoints',
};

type RuntimeUpdateInput = NonNullable<PolicyManifestUpdateInput['runtime']>;
type HitlUpdateInput = NonNullable<PolicyManifestUpdateInput['hitl']>;

export default function Policies({ providers, isLoading, initialError }: PoliciesProps) {
  const [templates, setTemplates] = useState<PolicyTemplate[]>([]);
  const [isTemplatesLoading, setIsTemplatesLoading] = useState(false);
  const [templatesError, setTemplatesError] = useState<string | null>(null);
  const [deployments, setDeployments] = useState<PolicyDeployment[]>([]);
  const [activeDeploymentId, setActiveDeploymentId] = useState<string | null>(null);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<PolicyTemplateId>(FALLBACK_TEMPLATE_ID);
  const [isMutating, setIsMutating] = useState(false);
  const [banner, setBanner] = useState<{ kind: BannerKind; message: string } | null>(null);
  const [rolloutPlans, setRolloutPlans] = useState<Map<PolicyTemplateId, PolicyRolloutAllocation[]>>(new Map());
  const [rolloutTimestamp, setRolloutTimestamp] = useState<string | null>(null);
  const [manifest, setManifest] = useState<PolicyManifestSnapshot | null>(null);
  const [isManifestLoading, setManifestLoading] = useState(false);
  const [manifestError, setManifestError] = useState<string | null>(null);
  const [runtimeForm, setRuntimeForm] = useState<RuntimeFormState>({
    maxIters: '',
    perIteration: '',
    totalTimeout: '',
    sampleRate: '10',
  });
  const [runtimeErrors, setRuntimeErrors] = useState<RuntimeFormErrors>({});
  const runtimeErrorItems = useMemo(
    () =>
      Object.entries(runtimeErrors)
        .filter(([, message]) => typeof message === 'string' && message.trim().length > 0)
        .map(([name, message]) => ({ name, message: String(message) })),
    [runtimeErrors],
  );
  const [isRuntimeSaving, setIsRuntimeSaving] = useState(false);
  const [runtimeMessage, setRuntimeMessage] = useState<string | null>(null);
  const [hitlEnabled, setHitlEnabled] = useState(false);
  const [checkpoints, setCheckpoints] = useState<HitlCheckpoint[]>([]);
  const [hitlQueue, setHitlQueue] = useState<HitlQueueSummary | null>(null);
  const [isHitlLoading, setHitlLoading] = useState(false);
  const [hitlError, setHitlError] = useState<string | null>(null);
  const [resolvingRequestId, setResolvingRequestId] = useState<string | null>(null);
  const [pendingPlan, setPendingPlan] = useState<PendingPolicyPlan | null>(null);
  const [isPlanModalOpen, setPlanModalOpen] = useState(false);
  const [isPlanApplyConfirmOpen, setPlanApplyConfirmOpen] = useState(false);
  const [isPlanApplying, setPlanApplying] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);
  const [planActor, setPlanActor] = useState(() => loadPlanPreference(PLAN_ACTOR_STORAGE_KEY, 'Console MCP'));
  const [planActorEmail, setPlanActorEmail] = useState(() =>
    loadPlanPreference(PLAN_ACTOR_EMAIL_STORAGE_KEY, 'console@example.com'),
  );
  const [planCommitMessage, setPlanCommitMessage] = useState(() =>
    loadPlanPreference(PLAN_COMMIT_MESSAGE_STORAGE_KEY, 'chore: atualizar políticas MCP'),
  );
  const templateMessages = useMemo(
    () => describeFixtureRequest('templates atualizados'),
    [],
  );
  const hitlMessages = useMemo(
    () =>
      describeFixtureRequest('fila de aprovações humanas', {
        errorPrefix: 'atualizar',
      }),
    [],
  );
  const historyMessages = useMemo(
    () => describeFixtureRequest('histórico de deploys'),
    [],
  );

  useToastNotification(initialError, {
    id: 'policies-initial-error',
    title: 'Console de políticas',
    variant: 'error',
    autoDismiss: false,
  });

  useToastNotification(templatesError, {
    id: 'policies-templates-error',
    title: 'Templates de políticas',
    variant: 'error',
    autoDismiss: false,
  });

  useToastNotification(historyError, {
    id: 'policies-history-error',
    title: 'Histórico de deploys',
    variant: 'error',
    autoDismiss: false,
  });

  useToastNotification(manifestError, {
    id: 'policies-manifest-error',
    title: 'Manifesto de runtime',
    variant: 'error',
    autoDismiss: false,
  });

  useToastNotification(planError, {
    id: 'policies-plan-error',
    title: 'Plano de rollout',
    variant: 'error',
    autoDismiss: false,
  });

  const runtimeToastVariant = runtimeMessage && runtimeMessage.toLowerCase().includes('falha')
    ? 'warning'
    : 'success';
  useToastNotification(runtimeMessage, {
    id: 'policies-runtime-status',
    title: 'Plano de runtime',
    variant: runtimeToastVariant,
  });

  const bannerMessage = banner?.message ?? null;
  const bannerVariant =
    banner?.kind === 'success' ? 'success' : banner?.kind === 'warning' ? 'warning' : 'info';
  useToastNotification(bannerMessage, {
    id: 'policies-banner',
    title: 'Templates MCP',
    variant: bannerVariant,
    autoDismiss: banner?.kind === 'success',
    duration: banner?.kind === 'success' ? 5000 : undefined,
  });

  useToastNotification(hitlError, {
    id: 'policies-hitl-error',
    title: 'Fila HITL',
    variant: 'error',
    autoDismiss: false,
  });

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    async function loadTemplates() {
      setIsTemplatesLoading(true);
      setTemplatesError(null);
      try {
        const catalog = await fetchPolicyTemplates(controller.signal);
        if (!active) {
          return;
        }
        setTemplates(catalog.templates);
        if (catalog.rollout) {
          const planMap = new Map<PolicyTemplateId, PolicyRolloutAllocation[]>();
          catalog.rollout.plans.forEach((plan) => {
            planMap.set(plan.templateId as PolicyTemplateId, plan.allocations);
          });
          setRolloutPlans(planMap);
          setRolloutTimestamp(catalog.rollout.generatedAt);
        } else {
          setRolloutPlans(new Map());
          setRolloutTimestamp(null);
        }
      } catch (error) {
        if (!active) {
          return;
        }
        if ((error as { name?: string }).name === 'AbortError') {
          return;
        }
        // eslint-disable-next-line no-console
        console.error('Failed to load policy templates', error);
        setTemplatesError('Não foi possível carregar templates de política.');
      } finally {
        if (active) {
          setIsTemplatesLoading(false);
        }
      }
    }

    loadTemplates();

    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  const handleRuntimeFieldChange = useCallback(
    (field: 'maxIters' | 'perIteration' | 'totalTimeout' | 'sampleRate', value: string) => {
      setRuntimeForm((current) => ({ ...current, [field]: value }));
      setRuntimeErrors((current) => ({ ...current, [field]: undefined }));
    },
    [],
  );

  const focusRuntimeField = useCallback((field: keyof RuntimeFormErrors) => {
    const targetId = RUNTIME_FIELD_FOCUS_MAP[field];
    if (!targetId) {
      return;
    }
    const element = document.getElementById(targetId);
    if (element instanceof HTMLElement) {
      element.focus();
    }
  }, []);

  const handleHitlToggle = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setHitlEnabled(event.target.checked);
    setRuntimeErrors((current) => ({ ...current, checkpoints: undefined }));
  }, []);

  const handleAddCheckpoint = useCallback(() => {
    setCheckpoints((current) => [
      ...current,
      { name: '', description: null, required: false, escalationChannel: null },
    ]);
    setRuntimeErrors((current) => ({ ...current, checkpoints: undefined }));
  }, []);

  const handleCheckpointChange = useCallback(
    (index: number, field: 'name' | 'description' | 'required' | 'escalationChannel', value: string | boolean) => {
      setCheckpoints((current) => {
        const next = current.slice();
        const existing = next[index] ?? { name: '', description: null, required: false, escalationChannel: null };
        const updated: HitlCheckpoint = { ...existing };

        if (field === 'required') {
          updated.required = Boolean(value);
        } else if (field === 'name') {
          updated.name = String(value);
        } else if (field === 'description') {
          const stringValue = String(value);
          updated.description = stringValue ? stringValue : null;
        } else {
          const stringValue = String(value);
          updated.escalationChannel = stringValue ? (stringValue as HitlEscalationChannel) : null;
        }

        next[index] = updated;
        return next;
      });
      setRuntimeErrors((current) => ({ ...current, checkpoints: undefined }));
    },
    [],
  );

  const handleRemoveCheckpoint = useCallback((index: number) => {
    setCheckpoints((current) => current.filter((_, itemIndex) => itemIndex !== index));
    setRuntimeErrors((current) => ({ ...current, checkpoints: undefined }));
  }, []);

  const refreshHitlQueue = useCallback(
    async (signal?: AbortSignal) => {
      setHitlLoading(true);
      setHitlError(null);
      try {
        const queue = await fetchHitlQueue(signal);
        setHitlQueue(queue);
      } catch (error) {
        if ((error as { name?: string }).name === 'AbortError') {
          return;
        }
        console.error('Failed to atualizar fila HITL', error);
        setHitlError(hitlMessages.error);
      } finally {
        setHitlLoading(false);
      }
    },
    [hitlMessages.error],
  );

  const handleManifestUpload = useCallback(
    async (file: File, onProgress: UploadProgressHandler) => {
      if (isManifestLoading) {
        throw new Error('Aguarde o carregamento atual antes de importar um manifesto.');
      }

      const text = await readFileAsText(file, onProgress);
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch (error) {
        throw new Error('Manifesto inválido. Forneça um arquivo JSON válido.');
      }

      if (!parsed || typeof parsed !== 'object') {
        throw new Error('Manifesto inválido. Forneça um arquivo JSON válido.');
      }

      const snapshot = parsed as Partial<PolicyManifestSnapshot>;
      if (!snapshot.runtime || !snapshot.hitl) {
        throw new Error('Manifesto deve conter as seções `runtime` e `hitl`.');
      }

      const runtime = snapshot.runtime as PolicyManifestSnapshot['runtime'];
      const hitl = snapshot.hitl as PolicyManifestSnapshot['hitl'];

      setManifest(snapshot as PolicyManifestSnapshot);
      setRuntimeForm({
        maxIters: runtime.maxIters ? String(runtime.maxIters) : '',
        perIteration: runtime.timeouts?.perIteration ? String(runtime.timeouts.perIteration) : '',
        totalTimeout: runtime.timeouts?.total ? String(runtime.timeouts.total) : '',
        sampleRate: String(Math.round((runtime.tracing?.sampleRate ?? 0) * 100)),
      });
      setHitlEnabled(Boolean(hitl.enabled));
      setCheckpoints(Array.isArray(hitl.checkpoints) ? hitl.checkpoints : []);
      setRuntimeErrors({});
      setRuntimeMessage(`Manifesto ${file.name} importado. Revise antes de gerar um plano.`);
      setManifestError(null);
    },
    [isManifestLoading, setManifest, setRuntimeForm, setHitlEnabled, setCheckpoints, setRuntimeErrors, setRuntimeMessage, setManifestError],
  );

  const handleHitlResolution = useCallback(
    async (request: HitlApprovalRequest, resolution: 'approved' | 'rejected') => {
      setResolvingRequestId(request.id);
      setHitlError(null);
      try {
        const updated = await resolveHitlRequest(request.id, {
          resolution,
          note: resolution === 'approved' ? 'Aprovado via Console MCP' : 'Rejeitado via Console MCP',
        });
        setHitlQueue((current) => {
          const pending = current?.pending ?? [];
          const resolved = current?.resolved ?? [];
          return {
            pending: pending.filter((item) => item.id !== request.id),
            resolved: [updated, ...resolved],
            updatedAt: new Date().toISOString(),
          };
        });
      } catch (error) {
        console.error('Failed to atualizar aprovação HITL', error);
        setHitlError('Não foi possível registrar a decisão humana.');
      } finally {
        setResolvingRequestId(null);
      }
    },
    [],
  );

  const handlePlanApply = useCallback(async () => {
    setPlanApplyConfirmOpen(false);
    if (!pendingPlan || !manifest) {
      setPlanModalOpen(false);
      return;
    }

    setPlanApplying(true);
    setPlanError(null);
    try {
      const trimmedActor = planActor.trim();
      const trimmedEmail = planActorEmail.trim();
      const trimmedCommit = planCommitMessage.trim();

      if (!trimmedActor || !trimmedEmail) {
        setPlanError('Informe nome e e-mail para registrar o autor da alteração.');
        setPlanApplying(false);
        return;
      }

      persistPlanPreference(PLAN_ACTOR_STORAGE_KEY, trimmedActor);
      persistPlanPreference(PLAN_ACTOR_EMAIL_STORAGE_KEY, trimmedEmail);
      if (trimmedCommit) {
        persistPlanPreference(PLAN_COMMIT_MESSAGE_STORAGE_KEY, trimmedCommit);
      }

      const response = await postPolicyPlanApply({
        planId: pendingPlan.id,
        plan: pendingPlan.planPayload,
        patch: pendingPlan.patch,
        actor: trimmedActor,
        actorEmail: trimmedEmail,
        commitMessage: trimmedCommit || undefined,
      });

      const updatedSnapshot = pendingPlan.nextSnapshot;
      setManifest(updatedSnapshot);
      setHitlEnabled(updatedSnapshot.hitl.enabled);
      setCheckpoints(updatedSnapshot.hitl.checkpoints);
      setRuntimeForm({
        maxIters: updatedSnapshot.runtime.maxIters ? String(updatedSnapshot.runtime.maxIters) : '',
        perIteration: updatedSnapshot.runtime.timeouts.perIteration
          ? String(updatedSnapshot.runtime.timeouts.perIteration)
          : '',
        totalTimeout: updatedSnapshot.runtime.timeouts.total
          ? String(updatedSnapshot.runtime.timeouts.total)
          : '',
        sampleRate: String(Math.round((updatedSnapshot.runtime.tracing.sampleRate ?? 0) * 100)),
      });
      setRuntimeErrors({});

      const details = [response.message];
      if (response.branch) {
        details.push(`Branch: ${response.branch}`);
      }
      if (response.pullRequest?.url) {
        details.push(`PR: ${response.pullRequest.url}`);
      }
      setRuntimeMessage(details.join(' '));

      setPendingPlan(null);
      setPlanModalOpen(false);
      void refreshHitlQueue();
    } catch (error) {
      console.error('Failed to aplicar plano de políticas', error);
      setPlanError('Falha ao aplicar plano de políticas. Tente novamente.');
    } finally {
      setPlanApplying(false);
    }
  }, [pendingPlan, manifest, planActor, planActorEmail, planCommitMessage, refreshHitlQueue]);

  const handlePlanCancel = useCallback(() => {
    setPlanModalOpen(false);
    setPlanError(null);
    setPendingPlan(null);
    setPlanApplyConfirmOpen(false);
  }, []);

  const handlePlanActorChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const { value } = event.target;
    setPlanActor(value);
    persistPlanPreference(PLAN_ACTOR_STORAGE_KEY, value);
    setPlanError(null);
  }, []);

  const handlePlanActorEmailChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const { value } = event.target;
    setPlanActorEmail(value);
    persistPlanPreference(PLAN_ACTOR_EMAIL_STORAGE_KEY, value);
    setPlanError(null);
  }, []);

  const handlePlanCommitMessageChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const { value } = event.target;
    setPlanCommitMessage(value);
    persistPlanPreference(PLAN_COMMIT_MESSAGE_STORAGE_KEY, value);
    setPlanError(null);
  }, []);

  const handleRuntimeSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const nextErrors: RuntimeFormErrors = {};

      const maxItersValue = runtimeForm.maxIters.trim() ? Number(runtimeForm.maxIters) : null;
      if (runtimeForm.maxIters && (Number.isNaN(maxItersValue) || (maxItersValue ?? 0) < 1)) {
        nextErrors.maxIters = 'Informe um número inteiro maior que zero.';
      }

      const perIterationValue = runtimeForm.perIteration.trim() ? Number(runtimeForm.perIteration) : null;
      if (runtimeForm.perIteration && (Number.isNaN(perIterationValue) || (perIterationValue ?? 0) <= 0)) {
        nextErrors.perIteration = 'Timeout por iteração deve ser positivo.';
      }

      const totalTimeoutValue = runtimeForm.totalTimeout.trim() ? Number(runtimeForm.totalTimeout) : null;
      if (runtimeForm.totalTimeout && (Number.isNaN(totalTimeoutValue) || (totalTimeoutValue ?? 0) <= 0)) {
        nextErrors.totalTimeout = 'Timeout total deve ser positivo.';
      }

      const sampleRateValue = runtimeForm.sampleRate.trim() ? Number(runtimeForm.sampleRate) : null;
      if (
        runtimeForm.sampleRate &&
        (Number.isNaN(sampleRateValue) || (sampleRateValue ?? 0) < 0 || (sampleRateValue ?? 0) > 100)
      ) {
        nextErrors.sampleRate = 'Amostragem deve estar entre 0% e 100%.';
      }

      if (hitlEnabled) {
        const missingNames = checkpoints.some((checkpoint) => !checkpoint.name.trim());
        if (missingNames) {
          nextErrors.checkpoints = 'Todos os checkpoints devem ter um nome.';
        }
      }

      if (Object.keys(nextErrors).length > 0) {
        setRuntimeErrors(nextErrors);
        return;
      }

      const runtimeUpdate: RuntimeUpdateInput = {};

      if (maxItersValue !== null) {
        runtimeUpdate.maxIters = Math.round(maxItersValue);
      }

      const timeoutsUpdate: { perIteration?: number | null; total?: number | null } = {};
      if (perIterationValue !== null) {
        timeoutsUpdate.perIteration = perIterationValue;
      }
      if (totalTimeoutValue !== null) {
        timeoutsUpdate.total = totalTimeoutValue;
      }
      if (Object.keys(timeoutsUpdate).length > 0) {
        runtimeUpdate.timeouts = timeoutsUpdate;
      }

      if (sampleRateValue !== null) {
        runtimeUpdate.tracing = {
          enabled: (sampleRateValue ?? 0) > 0,
          sampleRate: (Math.min(100, Math.max(0, sampleRateValue ?? 0)) / 100) || 0,
        };
      }

      const hitlUpdate: HitlUpdateInput = {
        enabled: hitlEnabled,
        checkpoints: checkpoints.map((checkpoint) => ({
          name: checkpoint.name.trim(),
          description: checkpoint.description?.trim() || null,
          required: checkpoint.required,
          escalationChannel: checkpoint.escalationChannel ?? null,
        })),
      };

      if (!manifest) {
        setRuntimeMessage('Carregue a configuração atual antes de gerar um plano.');
        return;
      }

      setIsRuntimeSaving(true);
      setRuntimeMessage(null);
      setPlanError(null);
      try {
        const payload: PolicyManifestUpdateInput = {};
        if (Object.keys(runtimeUpdate).length > 0) {
          payload.runtime = runtimeUpdate;
        }
        payload.hitl = hitlUpdate;

        const planResponse = await patchConfigPoliciesPlan({
          policyId: POLICY_MANIFEST_ID,
          changes: payload,
        });

        const nextSnapshot = applyManifestUpdateToSnapshot(manifest, payload);
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
        setRuntimeErrors({});
        setPlanError(null);
        setRuntimeMessage('Plano gerado. Revise as alterações antes de aplicar.');
      } catch (error) {
        console.error('Failed to gerar plano de políticas', error);
        const message =
          error instanceof Error && error.message ? error.message : 'Falha ao gerar plano de atualização. Tente novamente.';
        setPlanError(message);
        setPendingPlan(null);
        setPlanModalOpen(false);
        setRuntimeMessage(message);
      } finally {
        setIsRuntimeSaving(false);
      }
    },
    [checkpoints, hitlEnabled, runtimeForm],
  );
  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    async function loadDeployments() {
      setIsHistoryLoading(true);
      setHistoryError(null);
      try {
        const summary = await fetchPolicyDeployments(controller.signal);
        if (!active) {
          return;
        }
        setDeployments(summary.deployments);
        setActiveDeploymentId(summary.activeId);
      } catch (error) {
        if (!active) {
          return;
        }
        if ((error as { name?: string }).name === 'AbortError') {
          return;
        }
        // eslint-disable-next-line no-console
        console.error('Failed to load policy deployments', error);
        setHistoryError('Não foi possível carregar o histórico de deploys.');
      } finally {
        if (active) {
          setIsHistoryLoading(false);
        }
      }
    }

    loadDeployments();

    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    async function loadManifestData() {
      setManifestLoading(true);
      setManifestError(null);
      try {
        const snapshot = await fetchPolicyManifest(controller.signal);
        if (!active) {
          return;
        }
        setManifest(snapshot);
        setHitlEnabled(snapshot.hitl.enabled);
        setCheckpoints(snapshot.hitl.checkpoints);
        setRuntimeForm({
          maxIters: snapshot.runtime.maxIters ? String(snapshot.runtime.maxIters) : '',
          perIteration: snapshot.runtime.timeouts.perIteration ? String(snapshot.runtime.timeouts.perIteration) : '',
          totalTimeout: snapshot.runtime.timeouts.total ? String(snapshot.runtime.timeouts.total) : '',
          sampleRate: String(Math.round((snapshot.runtime.tracing.sampleRate ?? 0) * 100)),
        });
        setRuntimeErrors({});
        setRuntimeMessage(null);
      } catch (error) {
        if (!active || (error as { name?: string }).name === 'AbortError') {
          return;
        }
        console.error('Failed to load manifest snapshot', error);
        setManifestError('Não foi possível carregar a configuração de runtime e HITL.');
      } finally {
        if (active) {
          setManifestLoading(false);
        }
      }
    }

    loadManifestData();
    refreshHitlQueue(controller.signal);

    return () => {
      active = false;
      controller.abort();
    };
  }, [refreshHitlQueue]);

  const templateMap = useMemo(
    () => new Map(templates.map((template) => [template.id, template])),
    [templates],
  );

  const activeDeployment = useMemo(() => {
    if (deployments.length === 0) {
      return null;
    }
    if (activeDeploymentId) {
      const match = deployments.find((deployment) => deployment.id === activeDeploymentId);
      if (match) {
        return match;
      }
    }
    return deployments[deployments.length - 1];
  }, [deployments, activeDeploymentId]);

  useEffect(() => {
    if (activeDeployment) {
      setSelectedTemplateId(activeDeployment.templateId as PolicyTemplateId);
    }
  }, [activeDeployment?.templateId]);

  const fallbackTemplate = templates[0] ?? EMPTY_TEMPLATE;
  const activeTemplate = activeDeployment
    ? templateMap.get(activeDeployment.templateId as PolicyTemplateId) ?? fallbackTemplate
    : fallbackTemplate;
  const activeIndex = activeDeployment ? deployments.findIndex((item) => item.id === activeDeployment.id) : -1;
  const previousDeployment = activeIndex > 0 ? deployments[activeIndex - 1] : null;
  const previousTemplate = previousDeployment
    ? templateMap.get(previousDeployment.templateId as PolicyTemplateId) ?? fallbackTemplate
    : null;

  const rolloutPlan = rolloutPlans.get(selectedTemplateId) ?? [];
  const activeReliability = activeDeployment
    ? {
        sloP95: activeDeployment.sloP95Ms,
        budgetUsage: activeDeployment.budgetUsagePct,
        incidents: activeDeployment.incidentsCount,
      }
    : null;
  const guardrailScore = activeDeployment?.guardrailScore ?? null;

  useEffect(() => {
    if (templates.length === 0) {
      return;
    }
    if (!templateMap.has(selectedTemplateId)) {
      const fallbackId = (
        (activeDeployment?.templateId as PolicyTemplateId | undefined) ??
        templates[templates.length - 1]?.id ??
        FALLBACK_TEMPLATE_ID
      ) as PolicyTemplateId;
      setSelectedTemplateId(fallbackId);
    }
  }, [templateMap, selectedTemplateId, templates, activeDeployment?.templateId]);

  const selectedTemplate = templateMap.get(selectedTemplateId) ?? fallbackTemplate;
  const disableActions = isMutating || isTemplatesLoading || isHistoryLoading;
  const canRollback = Boolean(previousDeployment) && !disableActions;
  const [policyConfirmation, setPolicyConfirmation] = useState<{ action: 'apply' | 'rollback' } | null>(null);
  const [isPolicyConfirming, setIsPolicyConfirming] = useState(false);

  const executeApply = useCallback(async () => {
    if (disableActions) {
      return;
    }

    if (activeDeployment && selectedTemplateId === (activeDeployment.templateId as PolicyTemplateId)) {
      setBanner({ kind: 'info', message: 'O template selecionado já está ativo na frota MCP.' });
      return;
    }

    setIsMutating(true);
    setBanner(null);
    try {
      const deployment = await createPolicyDeployment({
        templateId: selectedTemplateId,
        author: 'Console MCP',
        window: 'Rollout monitorado',
        note: `Rollout manual: ${selectedTemplate.name}.`,
      });
      setDeployments((current) => [...current, deployment]);
      setActiveDeploymentId(deployment.id);
      setBanner({ kind: 'success', message: `${selectedTemplate.name} ativado para toda a frota.` });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to apply policy template', error);
      setBanner({ kind: 'warning', message: 'Não foi possível aplicar o template selecionado. Tente novamente.' });
    } finally {
      setIsMutating(false);
    }
  }, [
    disableActions,
    activeDeployment,
    selectedTemplateId,
    selectedTemplate.name,
    setBanner,
    setDeployments,
    setActiveDeploymentId,
  ]);

  const executeRollback = useCallback(async () => {
    if (!previousDeployment || !previousTemplate || !activeDeployment || disableActions) {
      return;
    }

    setIsMutating(true);
    setBanner(null);
    try {
      await deletePolicyDeployment(activeDeployment.id);
      setDeployments((current) => current.filter((item) => item.id !== activeDeployment.id));
      setActiveDeploymentId(previousDeployment.id);
      setSelectedTemplateId(previousDeployment.templateId as PolicyTemplateId);
      setBanner({ kind: 'warning', message: `Rollback concluído para ${previousTemplate.name}.` });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to rollback policy deployment', error);
      setBanner({ kind: 'warning', message: 'Falha ao realizar rollback. Tente novamente.' });
    } finally {
      setIsMutating(false);
    }
  }, [
    previousDeployment,
    previousTemplate,
    activeDeployment,
    disableActions,
    setDeployments,
    setActiveDeploymentId,
  ]);

  const handleApplyClick = useCallback(() => {
    if (disableActions) {
      return;
    }
    if (activeDeployment && selectedTemplateId === (activeDeployment.templateId as PolicyTemplateId)) {
      setBanner({ kind: 'info', message: 'O template selecionado já está ativo na frota MCP.' });
      return;
    }
    setPolicyConfirmation({ action: 'apply' });
  }, [disableActions, activeDeployment, selectedTemplateId]);

  const handleRollbackClick = useCallback(() => {
    if (!previousDeployment || !previousTemplate || !activeDeployment || disableActions) {
      return;
    }
    setPolicyConfirmation({ action: 'rollback' });
  }, [previousDeployment, previousTemplate, activeDeployment, disableActions]);

  const closePolicyConfirmation = useCallback(() => {
    if (isPolicyConfirming) {
      return;
    }
    setPolicyConfirmation(null);
  }, [isPolicyConfirming]);

  const confirmPolicyAction = useCallback(() => {
    if (!policyConfirmation) {
      return;
    }
    setIsPolicyConfirming(true);
    const runner = policyConfirmation.action === 'apply' ? executeApply() : executeRollback();
    void runner.finally(() => {
      setIsPolicyConfirming(false);
      setPolicyConfirmation(null);
    });
  }, [policyConfirmation, executeApply, executeRollback]);

  const policyModalContent = useMemo(() => {
    if (!policyConfirmation) {
      return null;
    }
    if (policyConfirmation.action === 'apply') {
      return {
        title: `Aplicar template · ${selectedTemplate.name}`,
        description: `Ativar ${selectedTemplate.name} inicia rollout monitorado em toda a frota MCP.`,
        confirmLabel: 'Aplicar template',
        confirmArmedLabel: 'Aplicar agora',
      } as const;
    }
    if (policyConfirmation.action === 'rollback' && previousTemplate) {
      return {
        title: `Rollback imediato · ${previousTemplate.name}`,
        description: `Reverterá o rollout atual e restaurará ${previousTemplate.name} como template ativo.`,
        confirmLabel: 'Confirmar rollback',
        confirmArmedLabel: 'Rollback agora',
      } as const;
    }
    return {
      title: 'Confirmar ação',
      description: undefined,
      confirmLabel: 'Confirmar',
      confirmArmedLabel: 'Confirmar agora',
    } as const;
  }, [policyConfirmation, previousTemplate, selectedTemplate.name]);

  return (
    <>
      {isPlanModalOpen && pendingPlan ? (
        <ModalBase
          isOpen={isPlanModalOpen}
          onClose={handlePlanCancel}
          title="Confirmar alterações nas políticas"
          description={pendingPlan.plan.summary}
          size="xl"
          closeOnBackdrop={false}
          dialogClassName="modal"
          contentClassName="modal__body"
          footer={
            <div className="modal__footer">
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
                onClick={() => setPlanApplyConfirmOpen(true)}
                disabled={isPlanApplying}
              >
                {isPlanApplying ? 'Aplicando…' : 'Aplicar plano'}
              </button>
            </div>
          }
        >
          <PlanDiffViewer
            diffs={pendingPlan.diffs}
            testId={POLICIES_TEST_IDS.planDiffs}
            itemTestIdPrefix={POLICIES_TEST_IDS.planDiffPrefix}
          />
          <div className="modal__form" role="group" data-testid={POLICIES_TEST_IDS.planForm}>
            <div className="modal__field">
              <label className="modal__label" htmlFor="policy-plan-actor">
                Autor da alteração
              </label>
              <input
                id="policy-plan-actor"
                type="text"
                className="modal__input"
                value={planActor}
                onChange={handlePlanActorChange}
                placeholder="Nome completo do autor"
                autoComplete="name"
              />
            </div>
            <div className="modal__field">
              <label className="modal__label" htmlFor="policy-plan-actor-email">
                E-mail do autor
              </label>
              <input
                id="policy-plan-actor-email"
                type="email"
                className="modal__input"
                value={planActorEmail}
                onChange={handlePlanActorEmailChange}
                placeholder="autor@example.com"
                autoComplete="email"
              />
            </div>
            <div className="modal__field">
              <label className="modal__label" htmlFor="policy-plan-commit-message">
                Mensagem do commit
              </label>
              <input
                id="policy-plan-commit-message"
                type="text"
                className="modal__input"
                value={planCommitMessage}
                onChange={handlePlanCommitMessageChange}
                placeholder="Descreva o objetivo das alterações"
              />
            </div>
          </div>
          {planError && <p className="modal__error">{planError}</p>}
        </ModalBase>
      ) : null}
      <ConfirmationModal
        isOpen={isPlanApplyConfirmOpen}
        title="Aplicar plano de políticas"
        description={pendingPlan?.plan.summary}
        confirmLabel="Armar aplicação"
        confirmArmedLabel="Aplicar agora"
        onConfirm={handlePlanApply}
        onCancel={() => setPlanApplyConfirmOpen(false)}
        isLoading={isPlanApplying}
      />
      <ConfirmationModal
        isOpen={Boolean(policyConfirmation)}
        title={policyModalContent?.title ?? 'Confirmar ação'}
        description={policyModalContent?.description}
        confirmLabel={policyModalContent?.confirmLabel ?? 'Confirmar'}
        confirmArmedLabel={policyModalContent?.confirmArmedLabel ?? 'Confirmar agora'}
        onConfirm={confirmPolicyAction}
        onCancel={closePolicyConfirmation}
        isLoading={isPolicyConfirming}
      />
      <main className="policies" data-testid={POLICIES_TEST_IDS.main}>
      <section className="policies__hero" data-testid={POLICIES_TEST_IDS.hero}>
        <h1>Políticas MCP · roteamento inteligente</h1>
        <p>
          Modele custos, latência e guardrails de cada rota com templates opinativos. Aplique canários, faça rollback em um
          clique e acompanhe o impacto sobre provedores MCP em tempo real.
        </p>
      </section>

      <section
        className="policies__status"
        aria-label="Resumo do template ativo"
        data-testid={POLICIES_TEST_IDS.status}
      >
        <article className="policy-overview">
          <header>
            <span>Template ativo</span>
            <h2>{activeTemplate.name}</h2>
          </header>
          <p>{activeTemplate.description}</p>
          <dl>
            <div>
              <dt>Último deploy</dt>
              <dd>{activeDeployment ? formatDateTime(activeDeployment.deployedAt) : '—'}</dd>
            </div>
            <div>
              <dt>Autor</dt>
              <dd>{activeDeployment ? activeDeployment.author : '—'}</dd>
            </div>
            <div>
              <dt>Janela</dt>
              <dd>{activeDeployment && activeDeployment.window ? activeDeployment.window : '—'}</dd>
            </div>
          </dl>
          <ul className="policy-overview__metrics">
            <li>
              <span>P95 observado</span>
              <strong>{activeReliability ? `${activeReliability.sloP95} ms` : '—'}</strong>
            </li>
            <li>
              <span>Uso de budget</span>
              <strong>{activeReliability ? `${activeReliability.budgetUsage}%` : '—'}</strong>
            </li>
            <li>
              <span>Incidentes em 30 dias</span>
              <strong>{activeReliability ? activeReliability.incidents : '—'}</strong>
            </li>
            <li>
              <span>Guardrail score</span>
              <strong>{guardrailScore ?? '—'}</strong>
            </li>
          </ul>
        </article>

        <article className="policy-overview policy-overview--secondary">
          <header>
            <span>Pronto para rollback</span>
            <h2>{previousTemplate ? previousTemplate.name : 'Sem histórico'}</h2>
          </header>
          <p>
            {previousTemplate
              ? `Rollback imediato recupera o template ${previousTemplate.name} sem perda de histórico.`
              : 'Quando houver outro deploy registrado, você poderá reverter em um clique.'}
          </p>
          <dl>
            <div>
              <dt>Última alteração</dt>
              <dd>{previousDeployment ? formatDateTime(previousDeployment.deployedAt) : '—'}</dd>
            </div>
            <div>
              <dt>Autor</dt>
              <dd>{previousDeployment ? previousDeployment.author : '—'}</dd>
            </div>
            <div>
              <dt>Nota</dt>
              <dd>{previousDeployment && previousDeployment.note ? previousDeployment.note : '—'}</dd>
            </div>
          </dl>
        </article>
      </section>

      {banner && <p className={`policy-banner policy-banner--${banner.kind}`}>{banner.message}</p>}
      {isLoading && <p className="info">Calculando políticas recomendadas…</p>}
      {initialError && <p className="error">{initialError}</p>}

      <section className="policies__templates" data-testid={POLICIES_TEST_IDS.templates}>
        <header className="policies__templates-header">
          <h2>Templates opinativos</h2>
          <p>
            Compare latência, custo e guardrails por template. A seleção abaixo ajusta o plano de rollout proposto antes de
            aplicar.
          </p>
        </header>
        {isTemplatesLoading && <p className="status">{templateMessages.loading}</p>}
        {templatesError && <p className="error">{templatesError}</p>}
        <PolicyTemplatePicker
          templates={templates}
          value={selectedTemplateId}
          onChange={setSelectedTemplateId}
          disabled={disableActions || isLoading}
        />
      </section>

      <div className="policies__actions" data-testid={POLICIES_TEST_IDS.actions}>
        <button
          type="button"
          className="policy-action policy-action--primary"
          onClick={handleApplyClick}
          disabled={disableActions}
        >
          Aplicar template
        </button>
        <button
          type="button"
          className="policy-action policy-action--ghost"
          onClick={handleRollbackClick}
          disabled={!canRollback}
        >
          Rollback imediato
        </button>
      </div>

      <section className="policies__plan" data-testid={POLICIES_TEST_IDS.plan}>
        <header>
          <h2>Plano de rollout</h2>
          <p>
            Distribuição sugerida para o template <strong>{selectedTemplate.name}</strong> considerando criticidade e
            capacidade dos servidores MCP cadastrados.
          </p>
          <span className="rollout-plan__timestamp">
            Última atualização: {rolloutTimestamp ? formatDateTime(rolloutTimestamp) : '—'}
          </span>
        </header>
        {rolloutPlan.length === 0 ? (
          <p className="status">
            Nenhum plano de rollout disponível para o template selecionado.
            {providers.length > 0 && ' Registre um deploy para gerar a distribuição entre os provedores cadastrados.'}
          </p>
        ) : (
          <>
            <figure
              className="rollout-plan__chart"
              aria-label="Cobertura sugerida por segmento"
              data-testid={POLICIES_TEST_IDS.rolloutChart}
            >
              <ol className="rollout-plan__chart-list">
                {rolloutPlan.map((entry) => {
                  const coverageValue = Math.max(0, Math.min(100, Math.round(entry.coverage)));
                  return (
                    <li key={`${entry.segment.id}-chart`} className="rollout-plan__chart-item">
                      <div className="rollout-plan__chart-header">
                        <span>{entry.segment.name}</span>
                        <strong>{coverageValue}%</strong>
                      </div>
                      <div className="rollout-plan__chart-bar" role="presentation" aria-hidden="true">
                        <span
                          className="rollout-plan__chart-fill"
                          style={{ width: `${coverageValue}%` }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ol>
              <figcaption>Distribuição percentual calculada a partir das fixtures locais.</figcaption>
            </figure>
            <ul className="rollout-plan">
              {rolloutPlan.map((entry) => (
                <li key={entry.segment.id} className="rollout-plan__item">
                  <div className="rollout-plan__summary">
                    <h3>
                      {entry.segment.name}
                      <span className="rollout-plan__coverage"> · {Math.round(entry.coverage)}%</span>
                    </h3>
                    <p>{entry.segment.description}</p>
                  </div>
                  <div className="rollout-plan__providers" aria-live="polite">
                    {entry.providers.length > 0 ? (
                      entry.providers.map((provider) => (
                        <span key={provider.id} className="rollout-chip">
                          {provider.name}
                        </span>
                      ))
                    ) : (
                      <span className="rollout-chip rollout-chip--muted">Sem servidores neste estágio</span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section
        className="policies__runtime"
        aria-labelledby="runtime-settings-heading"
        data-testid={POLICIES_TEST_IDS.runtime.section}
      >
        <header>
          <div>
            <h2 id="runtime-settings-heading">Runtime, timeouts e tracing</h2>
            <p>Edite limites operacionais aplicados durante as execuções MCP.</p>
          </div>
        </header>
        <FileUploadControl
          title="Importar manifesto de políticas"
          description="Faça upload de um manifest.json para pré-preencher runtime e checkpoints HITL."
          accept=".json"
          maxSizeBytes={512 * 1024}
          idleMessage="Ou selecione o manifest.json exportado anteriormente."
          actionLabel="Importar manifesto"
          onUpload={handleManifestUpload}
        />
        {manifestError && <p className="error">{manifestError}</p>}
        {runtimeMessage && <p className="status status--inline">{runtimeMessage}</p>}
        <form
          className="runtime-settings"
          onSubmit={handleRuntimeSubmit}
          data-testid={POLICIES_TEST_IDS.runtime.form}
        >
          {runtimeErrorItems.length > 0 ? (
            <Alert
              variant="error"
              title="Revise os campos destacados."
              description={
                <div className="runtime-settings__error-summary">
                  <p className="runtime-settings__error-helper">
                    Alguns valores precisam de atenção antes de gerar um plano governado.
                  </p>
                  <ul className="runtime-settings__error-list">
                    {runtimeErrorItems.map((item) => (
                      <li key={item.name}>
                        <button
                          type="button"
                          className="runtime-settings__error-link"
                          onClick={() => focusRuntimeField(item.name as keyof RuntimeFormErrors)}
                        >
                          {item.message}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              }
            />
          ) : null}
          <div className="runtime-settings__grid">
            <label className="form-field">
              <span>Máximo de iterações</span>
              <input
                id="runtime-maxIters"
                type="number"
                min={1}
                value={runtimeForm.maxIters}
                onChange={(event) => handleRuntimeFieldChange('maxIters', event.target.value)}
                placeholder="ex.: 3"
                disabled={isManifestLoading || isRuntimeSaving}
                aria-invalid={runtimeErrors.maxIters ? 'true' : 'false'}
                aria-describedby={runtimeErrors.maxIters ? 'runtime-maxiters-error' : undefined}
                className={clsx({ 'is-invalid': Boolean(runtimeErrors.maxIters) })}
              />
              {runtimeErrors.maxIters && (
                <span id="runtime-maxiters-error" className="form-field__error" role="alert">
                  {runtimeErrors.maxIters}
                </span>
              )}
            </label>

            <label className="form-field">
              <span>Timeout por iteração (s)</span>
              <input
                id="runtime-perIteration"
                type="number"
                min={1}
                value={runtimeForm.perIteration}
                onChange={(event) => handleRuntimeFieldChange('perIteration', event.target.value)}
                placeholder="ex.: 45"
                disabled={isManifestLoading || isRuntimeSaving}
                aria-invalid={runtimeErrors.perIteration ? 'true' : 'false'}
                aria-describedby={runtimeErrors.perIteration ? 'runtime-periteration-error' : undefined}
                className={clsx({ 'is-invalid': Boolean(runtimeErrors.perIteration) })}
              />
              {runtimeErrors.perIteration && (
                <span id="runtime-periteration-error" className="form-field__error" role="alert">
                  {runtimeErrors.perIteration}
                </span>
              )}
            </label>

            <label className="form-field">
              <span>Timeout total (s)</span>
              <input
                id="runtime-totalTimeout"
                type="number"
                min={1}
                value={runtimeForm.totalTimeout}
                onChange={(event) => handleRuntimeFieldChange('totalTimeout', event.target.value)}
                placeholder="ex.: 180"
                disabled={isManifestLoading || isRuntimeSaving}
                aria-invalid={runtimeErrors.totalTimeout ? 'true' : 'false'}
                aria-describedby={runtimeErrors.totalTimeout ? 'runtime-totaltimeout-error' : undefined}
                className={clsx({ 'is-invalid': Boolean(runtimeErrors.totalTimeout) })}
              />
              {runtimeErrors.totalTimeout && (
                <span id="runtime-totaltimeout-error" className="form-field__error" role="alert">
                  {runtimeErrors.totalTimeout}
                </span>
              )}
            </label>

            <label className="form-field">
              <span>Sample rate de tracing (%)</span>
              <input
                id="runtime-sampleRate"
                type="number"
                min={0}
                max={100}
                value={runtimeForm.sampleRate}
                onChange={(event) => handleRuntimeFieldChange('sampleRate', event.target.value)}
                placeholder="ex.: 10"
                disabled={isManifestLoading || isRuntimeSaving}
                aria-invalid={runtimeErrors.sampleRate ? 'true' : 'false'}
                aria-describedby={runtimeErrors.sampleRate ? 'runtime-samplerate-error' : undefined}
                className={clsx({ 'is-invalid': Boolean(runtimeErrors.sampleRate) })}
              />
              {runtimeErrors.sampleRate && (
                <span id="runtime-samplerate-error" className="form-field__error" role="alert">
                  {runtimeErrors.sampleRate}
                </span>
              )}
            </label>
          </div>

          <fieldset
            className={clsx('runtime-settings__hitl', {
              'runtime-settings__hitl--invalid': Boolean(runtimeErrors.checkpoints),
            })}
            data-testid={POLICIES_TEST_IDS.runtime.hitlSettings}
            id="policies-hitl-checkpoints"
            tabIndex={-1}
            aria-invalid={runtimeErrors.checkpoints ? 'true' : 'false'}
          >
            <legend>Checkpoints de aprovação humana (HITL)</legend>
            <label className="form-field form-field--checkbox">
              <input
                type="checkbox"
                checked={hitlEnabled}
                onChange={handleHitlToggle}
                disabled={isManifestLoading || isRuntimeSaving}
              />
              <span>Exigir aprovação humana para este agente</span>
            </label>
            {hitlEnabled && (
              <>
                <p className="help-text">Adicione checkpoints para pausar execuções críticas e acionar o time certo.</p>
                <div className="checkpoint-list">
                  {checkpoints.length === 0 && <p className="info">Nenhum checkpoint definido. Adicione um abaixo.</p>}
                  {checkpoints.map((checkpoint, index) => (
                    <div key={`checkpoint-${index}`} className="checkpoint-item">
                      <div className="checkpoint-item__fields">
                        <label className="form-field">
                          <span>Nome</span>
                          <input
                            type="text"
                            value={checkpoint.name}
                            onChange={(event) => handleCheckpointChange(index, 'name', event.target.value)}
                            disabled={isRuntimeSaving}
                            placeholder="ex.: Ops review"
                          />
                        </label>
                        <label className="form-field">
                          <span>Descrição</span>
                          <input
                            type="text"
                            value={checkpoint.description ?? ''}
                            onChange={(event) => handleCheckpointChange(index, 'description', event.target.value)}
                            disabled={isRuntimeSaving}
                            placeholder="Contextualize o checkpoint"
                          />
                        </label>
                      </div>
                      <div className="checkpoint-item__meta">
                        <label className="form-field form-field--checkbox">
                          <input
                            type="checkbox"
                            checked={checkpoint.required}
                            onChange={(event) => handleCheckpointChange(index, 'required', event.target.checked)}
                            disabled={isRuntimeSaving}
                          />
                          <span>Obrigatório para continuar</span>
                        </label>
                        <label className="form-field">
                          <span>Escalonamento</span>
                          <select
                            value={checkpoint.escalationChannel ?? ''}
                            onChange={(event) => handleCheckpointChange(index, 'escalationChannel', event.target.value)}
                            disabled={isRuntimeSaving}
                          >
                            {ESCALATION_OPTIONS.map((option) => (
                              <option key={option.value || 'none'} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <button
                          type="button"
                          className="button button--ghost checkpoint-item__remove"
                          onClick={() => handleRemoveCheckpoint(index)}
                          disabled={isRuntimeSaving}
                        >
                          Remover
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  className="button button--ghost"
                  onClick={handleAddCheckpoint}
                  disabled={isRuntimeSaving}
                >
                  Adicionar checkpoint
                </button>
              </>
            )}
            {runtimeErrors.checkpoints && (
              <p className="form-field__error" role="alert">
                {runtimeErrors.checkpoints}
              </p>
            )}
          </fieldset>

          <div className="runtime-settings__actions">
            <button
              type="submit"
              className="button button--primary"
              disabled={
                isRuntimeSaving || isManifestLoading || isPlanModalOpen || isPlanApplying
              }
            >
              {isRuntimeSaving ? 'Gerando plano…' : 'Gerar plano'}
            </button>
          </div>
        </form>
      </section>

      <section
        className="policies__hitl"
        aria-labelledby="hitl-queue-heading"
        data-testid={POLICIES_TEST_IDS.hitlQueue}
      >
        <header>
          <div>
            <h2 id="hitl-queue-heading">Fila de aprovações humanas</h2>
            <p>Monitore e aprove ou rejeite execuções que exigem intervenção humana.</p>
          </div>
          <button
            type="button"
            className="button button--ghost"
            onClick={() => refreshHitlQueue()}
            disabled={isHitlLoading}
          >
            {isHitlLoading ? 'Atualizando…' : 'Atualizar fila'}
          </button>
        </header>
        <span className="hitl-queue__timestamp">
          Última atualização: {hitlQueue?.updatedAt ? formatDateTime(hitlQueue.updatedAt) : '—'}
        </span>
        {hitlError && <p className="error">{hitlError}</p>}
        {isHitlLoading && <p className="status">{hitlMessages.loading}</p>}
        {!isHitlLoading && hitlQueue && hitlQueue.pending.length === 0 && (
          <p className="info">Nenhuma aprovação pendente no momento.</p>
        )}
        {!isHitlLoading && hitlQueue && hitlQueue.pending.length > 0 && (
          <ul className="hitl-queue">
            {hitlQueue.pending.map((request) => (
              <li key={request.id} className="hitl-queue__item">
                <div className="hitl-queue__details">
                  <h3>{request.checkpoint}</h3>
                  <p>{request.metadata?.reason ? String(request.metadata.reason) : 'Aguardando decisão.'}</p>
                  <dl>
                    <div>
                      <dt>Agente</dt>
                      <dd>{request.agent}</dd>
                    </div>
                    <div>
                      <dt>Rota</dt>
                      <dd>{request.route ?? '—'}</dd>
                    </div>
                    <div>
                      <dt>Confiança</dt>
                      <dd>{request.confidence != null ? `${Math.round(request.confidence * 100)}%` : '—'}</dd>
                    </div>
                  </dl>
                </div>
                <div className="hitl-queue__actions">
                  <button
                    type="button"
                    className="button button--ghost"
                    onClick={() => handleHitlResolution(request, 'rejected')}
                    disabled={resolvingRequestId === request.id}
                  >
                    Bloquear
                  </button>
                  <button
                    type="button"
                    className="button button--primary"
                    onClick={() => handleHitlResolution(request, 'approved')}
                    disabled={resolvingRequestId === request.id}
                  >
                    Liberar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="policies__history" data-testid={POLICIES_TEST_IDS.history}>
        <header>
          <h2>Histórico de deploys</h2>
          <p>Acompanhe os templates aplicados na frota e os motivos registrados.</p>
        </header>
        {isHistoryLoading && <p className="status">{historyMessages.loading}</p>}
        {historyError && <p className="error">{historyError}</p>}
        <ol className="policy-history">
          {deployments
            .slice()
            .reverse()
            .map((deployment) => {
              const template = templateMap.get(deployment.templateId as PolicyTemplateId) ?? fallbackTemplate;
              return (
                <li key={`${deployment.id}`}>
                  <div className="policy-history__header">
                    <span className="policy-history__template">{template.name}</span>
                    <time dateTime={deployment.deployedAt}>{formatDateTime(deployment.deployedAt)}</time>
                  </div>
                  <p>{deployment.note ?? '—'}</p>
                  <span className="policy-history__meta">
                    {deployment.author} · {deployment.window ?? '—'}
                  </span>
                </li>
              );
            })}
          {deployments.length === 0 && !isHistoryLoading && !historyError && (
            <li className="policy-history__empty">Nenhum deploy registrado até o momento.</li>
          )}
        </ol>
      </section>
    </main>
    </>
  );
}
