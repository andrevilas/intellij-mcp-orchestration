import {
  FormEvent,
  type ChangeEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';

import type {
  AgentPlanRequest,
  AgentPlanResponse,
  AdminPlanPullRequestSummary,
  AdminPlanSummary,
  AgentSmokeRun,
  ApplyPolicyPlanResponse,
  ConfigPlan,
  ConfigPlanDiffSummary,
  ConfigPlanPreview,
  PlanExecutionPullRequest,
} from '../../api';
import { ApiError, postAgentPlan, postAgentSmokeRun, postPolicyPlanApply } from '../../api';
import PlanSummary from '../AdminChat/PlanSummary';
import PlanDiffViewer, { type PlanDiffItem } from '../../components/PlanDiffViewer';

interface AgentCreateWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onAgentCreated?: (slug: string) => void;
}

type WizardStep = 'basic' | 'schema' | 'policies';

interface WizardStepDefinition {
  id: WizardStep;
  title: string;
  description: string;
}

interface ToolDraft {
  id: string;
  name: string;
  description: string;
  schema: string;
}

interface ToolDraftError {
  name?: string;
  schema?: string;
}

type ToolErrorMap = Record<string, ToolDraftError>;

interface PendingPlan {
  id: string;
  plan: ConfigPlan;
  planPayload: AgentPlanResponse['planPayload'];
  diffItems: PlanDiffItem[];
  patch: string;
}

const STEP_DEFINITIONS: WizardStepDefinition[] = [
  {
    id: 'basic',
    title: 'Dados básicos',
    description: 'Defina identificador, nome exibido e repositório de destino.',
  },
  {
    id: 'schema',
    title: 'Capabilities e tools',
    description: 'Liste capabilities e descreva tools com schemas JSON.',
  },
  {
    id: 'policies',
    title: 'Policies e FinOps',
    description: 'Configure defaults operacionais e gere o plano.',
  },
];

const SMOKE_STATUS_LABELS: Record<AgentSmokeRun['status'], string> = {
  queued: 'Na fila',
  running: 'Em execução',
  passed: 'Aprovado',
  failed: 'Falhou',
};

function formatSmokeStatus(status: AgentSmokeRun['status']): string {
  return SMOKE_STATUS_LABELS[status] ?? status;
}

function sanitizeSlug(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
}

function parseCapabilities(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function generatePlanId(): string {
  return `agent-plan-${Math.random().toString(36).slice(2, 10)}`;
}

function createToolDraft(): ToolDraft {
  const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `tool-${Date.now()}`;
  return {
    id,
    name: '',
    description: '',
    schema: '{\n  "type": "object",\n  "properties": {}\n}',
  };
}

function mapPlanDiffItems(diffs: ConfigPlanDiffSummary[]): PlanDiffItem[] {
  if (!Array.isArray(diffs) || diffs.length === 0) {
    throw new Error('Plano não retornou diffs para o novo agent.');
  }
  return diffs.map((diff, index) => {
    const diffContent = typeof diff.diff === 'string' ? diff.diff : '';
    if (!diffContent.trim()) {
      throw new Error(`Plano não forneceu diff detalhado para ${diff.path}.`);
    }
    return {
      id: `${diff.path}-${index}`,
      title: diff.path,
      summary: diff.summary,
      diff: diffContent,
    };
  });
}

function buildPatchFromDiffs(items: PlanDiffItem[]): string {
  const combined = items
    .map((item) => (item.diff ?? '').trim())
    .filter((diff) => diff.length > 0)
    .join('\n');
  if (!combined) {
    throw new Error('Plano não possui diff aplicável.');
  }
  return `${combined}\n`;
}

function mapPreviewPullRequest(preview: ConfigPlanPreview | null): AdminPlanPullRequestSummary | null {
  if (!preview?.pullRequest) {
    return null;
  }
  return {
    id: preview.pullRequest.provider ?? 'git',
    number: '',
    title: preview.pullRequest.title,
    url: '',
    state: 'draft',
    reviewStatus: null,
    reviewers: [],
    branch: preview.branch ?? null,
    ciResults: [],
  };
}

function mapExecutionPullRequest(pr: PlanExecutionPullRequest | null): AdminPlanPullRequestSummary | null {
  if (!pr) {
    return null;
  }
  return {
    id: pr.id,
    number: pr.number,
    title: pr.title,
    url: pr.url,
    state: pr.state,
    reviewStatus: pr.reviewStatus ?? null,
    reviewers: pr.reviewers ?? [],
    branch: pr.branch ?? null,
    ciResults: pr.ciResults ?? [],
  };
}

function buildPlanSummary(planId: string, plan: ConfigPlan, preview: ConfigPlanPreview | null): AdminPlanSummary {
  const generatedAt = new Date().toISOString();
  const steps = plan.steps.map((step, index) => {
    const impact = step.actions
      .map((action) => `${action.type.toUpperCase()} ${action.path}`.trim())
      .filter((chunk) => chunk.length > 0)
      .join('\n');
    return {
      id: step.id || `agent-step-${index}`,
      title: step.title,
      description: step.description,
      status: 'ready' as const,
      impact: impact.length > 0 ? impact : null,
    };
  });

  return {
    id: planId,
    threadId: 'agent-create',
    status: 'ready',
    generatedAt,
    author: 'Console MCP',
    scope: plan.summary || 'Adicionar novo agent',
    steps,
    branch: preview?.branch ?? null,
    baseBranch: preview?.baseBranch ?? null,
    reviewers: [],
    pullRequest: mapPreviewPullRequest(preview),
  };
}

function extractErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    return error.message;
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}
export default function AgentCreateWizard({ isOpen, onClose, onAgentCreated }: AgentCreateWizardProps) {
  const headingId = useId();
  const panelRef = useRef<HTMLElement | null>(null);

  const [activeStep, setActiveStep] = useState<WizardStep>('basic');

  const [agentSlug, setAgentSlug] = useState('');
  const [agentSlugError, setAgentSlugError] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [displayNameError, setDisplayNameError] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [owner, setOwner] = useState('');
  const [repository, setRepository] = useState('agents-hub');
  const [repositoryError, setRepositoryError] = useState<string | null>(null);
  const [version, setVersion] = useState('0.1.0');
  const [modelProvider, setModelProvider] = useState('openai');
  const [modelName, setModelName] = useState('gpt-4o-mini');
  const [modelTemperature, setModelTemperature] = useState('0.1');
  const [modelTemperatureError, setModelTemperatureError] = useState<string | null>(null);

  const [capabilitiesInput, setCapabilitiesInput] = useState('structured-output');
  const [capabilitiesError, setCapabilitiesError] = useState<string | null>(null);
  const [tools, setTools] = useState<ToolDraft[]>(() => [createToolDraft()]);
  const [toolErrors, setToolErrors] = useState<ToolErrorMap>({});

  const [rateLimit, setRateLimit] = useState('120');
  const [rateLimitError, setRateLimitError] = useState<string | null>(null);
  const [concurrency, setConcurrency] = useState('4');
  const [concurrencyError, setConcurrencyError] = useState<string | null>(null);
  const [safetyMode, setSafetyMode] = useState('balanced');
  const [budgetLimit, setBudgetLimit] = useState('250');
  const [budgetCurrency, setBudgetCurrency] = useState('USD');
  const [budgetError, setBudgetError] = useState<string | null>(null);
  const [costCenter, setCostCenter] = useState('default-cost-center');
  const [costCenterError, setCostCenterError] = useState<string | null>(null);

  const [runSmokeAfterApply, setRunSmokeAfterApply] = useState(true);

  const [pendingPlan, setPendingPlan] = useState<PendingPlan | null>(null);
  const [planSummary, setPlanSummary] = useState<AdminPlanSummary | null>(null);
  const [planDiffItems, setPlanDiffItems] = useState<PlanDiffItem[]>([]);

  const [isPlanning, setPlanning] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);
  const [planStatusMessage, setPlanStatusMessage] = useState<string | null>(null);

  const [isApplying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [applyStatusMessage, setApplyStatusMessage] = useState<string | null>(null);
  const [applyResponse, setApplyResponse] = useState<ApplyPolicyPlanResponse | null>(null);

  const [isRunningSmoke, setRunningSmoke] = useState(false);
  const [smokeStatusMessage, setSmokeStatusMessage] = useState<string | null>(null);
  const [smokeError, setSmokeError] = useState<string | null>(null);
  const [smokeResult, setSmokeResult] = useState<AgentSmokeRun | null>(null);

  const stepIndex = useMemo(() => STEP_DEFINITIONS.findIndex((step) => step.id === activeStep), [activeStep]);

  const resetWizard = useCallback(() => {
    setActiveStep('basic');
    setAgentSlug('');
    setAgentSlugError(null);
    setDisplayName('');
    setDisplayNameError(null);
    setDescription('');
    setOwner('');
    setRepository('agents-hub');
    setRepositoryError(null);
    setVersion('0.1.0');
    setModelProvider('openai');
    setModelName('gpt-4o-mini');
    setModelTemperature('0.1');
    setModelTemperatureError(null);
    setCapabilitiesInput('structured-output');
    setCapabilitiesError(null);
    setTools([createToolDraft()]);
    setToolErrors({});
    setRateLimit('120');
    setRateLimitError(null);
    setConcurrency('4');
    setConcurrencyError(null);
    setSafetyMode('balanced');
    setBudgetLimit('250');
    setBudgetCurrency('USD');
    setBudgetError(null);
    setCostCenter('default-cost-center');
    setCostCenterError(null);
    setRunSmokeAfterApply(true);
    setPendingPlan(null);
    setPlanSummary(null);
    setPlanDiffItems([]);
    setPlanning(false);
    setPlanError(null);
    setPlanStatusMessage(null);
    setApplying(false);
    setApplyError(null);
    setApplyStatusMessage(null);
    setApplyResponse(null);
    setRunningSmoke(false);
    setSmokeStatusMessage(null);
    setSmokeError(null);
    setSmokeResult(null);
  }, []);

  const handleClose = useCallback(() => {
    resetWizard();
    onClose();
  }, [onClose, resetWizard]);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const frame = requestAnimationFrame(() => {
      const focusable = panelRef.current?.querySelector<HTMLElement>(
        'input:not([type="hidden"]):not([disabled]), textarea:not([disabled]), select:not([disabled])',
      );
      focusable?.focus({ preventScroll: true });
    });

    function handleKeydown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        handleClose();
      }
    }

    document.addEventListener('keydown', handleKeydown);

    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('keydown', handleKeydown);
    };
  }, [handleClose, isOpen]);

  const handleBackdropClick = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      if (event.target === event.currentTarget) {
        handleClose();
      }
    },
    [handleClose],
  );

  const handleStepNavigation = useCallback(
    (nextStep: WizardStep) => {
      const targetIndex = STEP_DEFINITIONS.findIndex((step) => step.id === nextStep);
      if (targetIndex <= stepIndex) {
        setActiveStep(nextStep);
      }
    },
    [stepIndex],
  );

  const handleSlugChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const value = sanitizeSlug(event.target.value);
    setAgentSlug(value);
    if (agentSlugError) {
      setAgentSlugError(null);
    }
  }, [agentSlugError]);

  const handleDisplayNameChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setDisplayName(event.target.value);
    if (displayNameError) {
      setDisplayNameError(null);
    }
  }, [displayNameError]);

  const handleRepositoryChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setRepository(event.target.value);
    if (repositoryError) {
      setRepositoryError(null);
    }
  }, [repositoryError]);

  const handleModelTemperatureChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setModelTemperature(event.target.value);
    if (modelTemperatureError) {
      setModelTemperatureError(null);
    }
  }, [modelTemperatureError]);

  const handleCapabilitiesChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setCapabilitiesInput(event.target.value);
    if (capabilitiesError) {
      setCapabilitiesError(null);
    }
  }, [capabilitiesError]);

  const handleToolChange = useCallback(
    (toolId: string, field: keyof ToolDraft, value: string) => {
      setTools((current) => current.map((tool) => (tool.id === toolId ? { ...tool, [field]: value } : tool)));
      setToolErrors((current) => {
        if (!(toolId in current)) {
          return current;
        }
        const next = { ...current };
        const errors = { ...next[toolId] };
        if (field === 'schema') {
          delete errors.schema;
        } else if (field === 'name') {
          delete errors.name;
        }
        if (Object.keys(errors).length === 0) {
          delete next[toolId];
        } else {
          next[toolId] = errors;
        }
        return next;
      });
    },
    [],
  );

  const handleAddTool = useCallback(() => {
    setTools((current) => [...current, createToolDraft()]);
  }, []);

  const handleRemoveTool = useCallback(
    (toolId: string) => {
      setTools((current) => {
        if (current.length === 1) {
          return current;
        }
        return current.filter((tool) => tool.id !== toolId);
      });
      setToolErrors((current) => {
        if (!(toolId in current)) {
          return current;
        }
        const next = { ...current };
        delete next[toolId];
        return next;
      });
    },
    [],
  );

  const validateCapabilitiesAndTools = useCallback(() => {
    let hasError = false;
    const capabilities = parseCapabilities(capabilitiesInput);
    if (capabilities.length === 0) {
      setCapabilitiesError('Informe pelo menos uma capability.');
      hasError = true;
    } else {
      setCapabilitiesError(null);
    }

    const nextErrors: ToolErrorMap = {};
    const parsedTools: Array<{ name: string; description: string; schema: Record<string, unknown> }> = [];

    for (const tool of tools) {
      const errors: ToolDraftError = {};
      const name = tool.name.trim();
      if (!name) {
        errors.name = 'Informe o nome da tool.';
        hasError = true;
      }

      const descriptionValue = tool.description.trim();
      let parsedSchema: Record<string, unknown> | null = null;
      const schemaText = tool.schema.trim();
      if (!schemaText) {
        errors.schema = 'Informe o schema JSON da tool.';
        hasError = true;
      } else {
        try {
          const parsed = JSON.parse(schemaText);
          if (typeof parsed !== 'object' || parsed === null) {
            throw new Error('Schema deve ser um objeto JSON.');
          }
          parsedSchema = parsed as Record<string, unknown>;
        } catch (error) {
          errors.schema = 'Schema JSON inválido. Revise a estrutura.';
          hasError = true;
        }
      }

      if (Object.keys(errors).length > 0) {
        nextErrors[tool.id] = errors;
      }

      if (!errors.name && !errors.schema && parsedSchema) {
        parsedTools.push({ name, description: descriptionValue, schema: parsedSchema });
      }
    }

    setToolErrors(nextErrors);

    if (hasError) {
      return null;
    }

    return { capabilities, tools: parsedTools };
  }, [capabilitiesInput, tools]);

  const validatePolicyDefaults = useCallback(() => {
    let hasError = false;

    const trimmedRateLimit = rateLimit.trim();
    let rateLimitValue: number | null = null;
    if (!trimmedRateLimit) {
      setRateLimitError('Informe um limite de requisições por minuto válido.');
      hasError = true;
    } else {
      const parsed = Number(trimmedRateLimit);
      if (Number.isNaN(parsed) || parsed <= 0) {
        setRateLimitError('Informe um limite de requisições por minuto válido.');
        hasError = true;
      } else {
        rateLimitValue = Math.round(parsed);
        setRateLimitError(null);
      }
    }

    const trimmedConcurrency = concurrency.trim();
    let concurrencyValue: number | null = null;
    if (!trimmedConcurrency) {
      setConcurrencyError('Informe o limite de execuções simultâneas.');
      hasError = true;
    } else {
      const parsed = Number(trimmedConcurrency);
      if (Number.isNaN(parsed) || parsed <= 0) {
        setConcurrencyError('Informe o limite de execuções simultâneas.');
        hasError = true;
      } else {
        concurrencyValue = Math.round(parsed);
        setConcurrencyError(null);
      }
    }

    const trimmedBudget = budgetLimit.trim();
    let budgetValue: number | null = null;
    if (!trimmedBudget) {
      setBudgetError('Informe um orçamento mensal válido.');
      hasError = true;
    } else {
      const parsed = Number(trimmedBudget);
      if (Number.isNaN(parsed) || parsed <= 0) {
        setBudgetError('Informe um orçamento mensal válido.');
        hasError = true;
      } else {
        budgetValue = parsed;
        setBudgetError(null);
      }
    }

    const trimmedCostCenter = costCenter.trim();
    if (!trimmedCostCenter) {
      setCostCenterError('Informe o centro de custo responsável.');
      hasError = true;
    } else {
      setCostCenterError(null);
    }

    if (hasError) {
      return null;
    }

    return {
      rateLimit: rateLimitValue ?? 0,
      concurrency: concurrencyValue ?? 0,
      budget: budgetValue ?? 0,
      costCenter: trimmedCostCenter,
    };
  }, [budgetLimit, concurrency, costCenter, rateLimit]);

  const handleBasicSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const normalizedSlug = sanitizeSlug(agentSlug);
      if (!normalizedSlug) {
        setAgentSlugError('Informe um identificador para o agent.');
        return;
      }
      setAgentSlug(normalizedSlug);
      setAgentSlugError(null);

      if (!displayName.trim()) {
        setDisplayNameError('Informe o nome exibido do agent.');
        return;
      }
      setDisplayNameError(null);

      if (!repository.trim()) {
        setRepositoryError('Informe o repositório onde o agent será criado.');
        return;
      }
      setRepositoryError(null);

      const trimmedTemperature = modelTemperature.trim();
      if (trimmedTemperature) {
        const parsed = Number(trimmedTemperature);
        if (Number.isNaN(parsed)) {
          setModelTemperatureError('Informe uma temperatura numérica.');
          return;
        }
      }
      setModelTemperatureError(null);

      setActiveStep('schema');
    },
    [agentSlug, displayName, modelTemperature, repository],
  );

  const handleSchemaSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const manifestSection = validateCapabilitiesAndTools();
      if (!manifestSection) {
        return;
      }
      setActiveStep('policies');
    },
    [validateCapabilitiesAndTools],
  );

  const handlePlanGeneration = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      const normalizedSlug = sanitizeSlug(agentSlug);
      if (!normalizedSlug) {
        setAgentSlugError('Informe um identificador para o agent.');
        setActiveStep('basic');
        return;
      }

      if (!displayName.trim()) {
        setDisplayNameError('Informe o nome exibido do agent.');
        setActiveStep('basic');
        return;
      }

      const trimmedTemperature = modelTemperature.trim();
      let temperatureValue: number | null = null;
      if (trimmedTemperature) {
        const parsed = Number(trimmedTemperature);
        if (Number.isNaN(parsed)) {
          setModelTemperatureError('Informe uma temperatura numérica.');
          setActiveStep('basic');
          return;
        }
        temperatureValue = parsed;
      }
      setModelTemperatureError(null);

      const capabilitiesSection = validateCapabilitiesAndTools();
      if (!capabilitiesSection) {
        setPlanError('Corrija as informações de capabilities e tools antes de gerar o plano.');
        setActiveStep('schema');
        return;
      }

      const policyDefaults = validatePolicyDefaults();
      if (!policyDefaults) {
        setPlanError('Revise os dados de policies e FinOps antes de gerar o plano.');
        return;
      }

      const manifest: Record<string, unknown> = {
        name: normalizedSlug,
        title: displayName.trim(),
        version: version.trim() || '0.1.0',
        description: description.trim() || null,
        owner: owner.trim() || null,
        capabilities: capabilitiesSection.capabilities,
        tools: capabilitiesSection.tools,
        model: {
          provider: modelProvider.trim() || null,
          name: modelName.trim() || null,
          parameters: temperatureValue !== null ? { temperature: temperatureValue } : {},
        },
        policies: {
          rate_limits: {
            requests_per_minute: policyDefaults.rateLimit,
            concurrent_requests: policyDefaults.concurrency,
          },
          safety: {
            mode: safetyMode,
          },
          budget: {
            currency: budgetCurrency,
            limit: policyDefaults.budget,
            period: 'monthly',
          },
        },
        finops: {
          cost_center: policyDefaults.costCenter,
          budgets: {
            balanced: {
              amount: policyDefaults.budget,
              currency: budgetCurrency,
              period: 'monthly',
            },
          },
        },
      };

      const requestPayload: AgentPlanRequest = {
        agent: {
          slug: normalizedSlug,
          repository: repository.trim() || 'agents-hub',
          manifest,
        },
      };

      setPlanning(true);
      setPlanError(null);
      setPlanStatusMessage(null);
      setPendingPlan(null);
      setApplyResponse(null);
      setApplyStatusMessage(null);
      setApplyError(null);
      setSmokeResult(null);
      setSmokeStatusMessage(null);
      setSmokeError(null);

      try {
        const response = await postAgentPlan(requestPayload);
        const diffItems = mapPlanDiffItems(response.plan.diffs);
        const patch = buildPatchFromDiffs(diffItems);
        const planId = generatePlanId();

        setPendingPlan({
          id: planId,
          plan: response.plan,
          planPayload: response.planPayload,
          diffItems,
          patch,
        });
        setPlanSummary(buildPlanSummary(planId, response.plan, response.preview ?? null));
        setPlanDiffItems(diffItems);
        setPlanStatusMessage('Plano gerado. Revise as alterações antes de aplicar.');
      } catch (error) {
        console.error('Failed to gerar plano de agent', error);
        const message = extractErrorMessage(error, 'Falha ao gerar plano para o novo agent.');
        setPlanError(message);
        setPlanSummary((current) => (current && current.status === 'applied' ? current : null));
        setPlanDiffItems((current) => (planSummary && planSummary.status === 'applied' ? current : []));
      } finally {
        setPlanning(false);
      }
    },
    [
      agentSlug,
      budgetCurrency,
      description,
      displayName,
      modelName,
      modelProvider,
      modelTemperature,
      owner,
      repository,
      safetyMode,
      validateCapabilitiesAndTools,
      validatePolicyDefaults,
      version,
      planSummary,
    ],
  );

  const handleRunSmoke = useCallback(
    async (slugOverride?: string) => {
      const normalizedSlug = slugOverride ?? sanitizeSlug(agentSlug);
      if (!normalizedSlug) {
        setSmokeError('Identificador do agent inválido para executar smoke.');
        return;
      }

      setRunningSmoke(true);
      setSmokeError(null);
      setSmokeStatusMessage('Disparando smoke do novo agent…');
      setSmokeResult(null);

      try {
        const run = await postAgentSmokeRun(normalizedSlug);
        setSmokeResult(run);
        const summaryParts = [`Smoke ${run.runId}: ${formatSmokeStatus(run.status)}`];
        if (run.summary) {
          summaryParts.push(run.summary);
        }
        setSmokeStatusMessage(summaryParts.join(' — '));
      } catch (error) {
        console.error('Failed to executar smoke do agent', error);
        const message = extractErrorMessage(error, 'Falha ao executar smoke do novo agent.');
        setSmokeError(message);
        setSmokeStatusMessage(null);
      } finally {
        setRunningSmoke(false);
      }
    },
    [agentSlug],
  );

  const handleApplyPlan = useCallback(async () => {
    if (!pendingPlan) {
      setApplyError('Gere um plano antes de aplicar as alterações.');
      return;
    }

    const patch = pendingPlan.patch.trim();
    if (!patch) {
      setApplyError('O plano não forneceu diff aplicável.');
      return;
    }

    const normalizedSlug = sanitizeSlug(agentSlug);
    if (!normalizedSlug) {
      setAgentSlugError('Informe um identificador para o agent.');
      setActiveStep('basic');
      return;
    }

    setApplying(true);
    setApplyError(null);
    setApplyStatusMessage(null);

    try {
      const response = await postPolicyPlanApply({
        planId: pendingPlan.id,
        plan: pendingPlan.planPayload,
        patch,
        actor: 'Console MCP',
        actorEmail: 'agents@console.mcp',
        commitMessage: `feat: adicionar agent ${displayName || normalizedSlug}`,
      });

      setApplyResponse(response);
      setPlanSummary((current) => {
        const base = current ?? buildPlanSummary(pendingPlan.id, pendingPlan.plan, null);
        return {
          ...base,
          status: 'applied',
          branch: response.branch ?? base.branch ?? null,
          baseBranch: response.baseBranch ?? base.baseBranch ?? null,
          pullRequest: mapExecutionPullRequest(response.pullRequest) ?? base.pullRequest ?? null,
        };
      });
      setPendingPlan(null);

      const details = [response.message];
      if (response.branch) {
        details.push(`Branch: ${response.branch}`);
      }
      if (response.pullRequest?.url) {
        details.push(`PR: ${response.pullRequest.url}`);
      }
      setApplyStatusMessage(details.join(' '));

      onAgentCreated?.(normalizedSlug);

      if (runSmokeAfterApply) {
        await handleRunSmoke(normalizedSlug);
      }
    } catch (error) {
      console.error('Failed to aplicar plano de agent', error);
      const message = extractErrorMessage(error, 'Falha ao aplicar o plano gerado.');
      setApplyError(message);
    } finally {
      setApplying(false);
    }
  }, [agentSlug, displayName, handleRunSmoke, onAgentCreated, pendingPlan, runSmokeAfterApply]);
  const summaryActions: ReactNode = useMemo(() => {
    if (pendingPlan) {
      return (
        <>
          <label className="mcp-wizard__checkbox">
            <input
              type="checkbox"
              checked={runSmokeAfterApply}
              onChange={(event) => setRunSmokeAfterApply(event.target.checked)}
              disabled={isPlanning || isApplying}
            />
            <span>Executar smoke automaticamente após aplicar</span>
          </label>
          <button
            type="button"
            className="mcp-wizard__button mcp-wizard__button--primary"
            onClick={handleApplyPlan}
            disabled={isPlanning || isApplying}
          >
            {isApplying ? 'Aplicando…' : 'Aplicar plano'}
          </button>
        </>
      );
    }

    if (applyResponse) {
      return (
        <button
          type="button"
          className="mcp-wizard__button"
          onClick={() => handleRunSmoke()}
          disabled={isRunningSmoke}
        >
          {isRunningSmoke ? 'Executando smoke…' : 'Executar smoke novamente'}
        </button>
      );
    }

    return null;
  }, [applyResponse, handleApplyPlan, handleRunSmoke, isApplying, isPlanning, isRunningSmoke, pendingPlan, runSmokeAfterApply]);

  if (!isOpen) {
    return null;
  }

  const currentStep = STEP_DEFINITIONS.find((step) => step.id === activeStep);

  return (
    <div
      className="agent-wizard"
      role="dialog"
      aria-modal="true"
      aria-labelledby={`${headingId}-title`}
      aria-describedby={`${headingId}-description`}
      onClick={handleBackdropClick}
    >
      <section
        className="mcp-wizard agent-wizard__panel"
        id={`agent-wizard-panel-${activeStep}`}
        role="document"
        ref={panelRef}
      >
        <header className="mcp-wizard__header agent-wizard__header">
          <div>
            <h2 id={`${headingId}-title`}>Adicionar novo agent</h2>
            <p id={`${headingId}-description`}>
              Preencha os passos abaixo para gerar o manifesto e o stub inicial do agent.
            </p>
          </div>
          <button type="button" className="agent-wizard__close" onClick={handleClose}>
            Fechar
          </button>
        </header>

        <ol className="mcp-wizard__steps" role="tablist">
          {STEP_DEFINITIONS.map((step, index) => {
            const isActive = step.id === activeStep;
            const isCompleted = stepIndex > index;
            const itemClass = isActive
              ? 'mcp-wizard__step mcp-wizard__step--active'
              : isCompleted
                ? 'mcp-wizard__step mcp-wizard__step--completed'
                : 'mcp-wizard__step';
            return (
              <li key={step.id} className={itemClass} role="presentation">
                <button
                  type="button"
                  id={`agent-wizard-tab-${step.id}`}
                  role="tab"
                  aria-selected={isActive}
                  aria-controls={`agent-wizard-panel-${step.id}`}
                  disabled={!isActive && index > stepIndex}
                  onClick={() => handleStepNavigation(step.id)}
                >
                  <span className="mcp-wizard__step-index">{index + 1}</span>
                  <span className="mcp-wizard__step-content">
                    <strong>{step.title}</strong>
                    <span>{step.description}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>

        <div className="mcp-wizard__panel" role="tabpanel" aria-labelledby={`agent-wizard-tab-${activeStep}`}>
          {currentStep?.id === 'basic' ? (
            <form className="mcp-wizard__form" onSubmit={handleBasicSubmit}>
              <div className="mcp-wizard__grid">
                <div className="mcp-wizard__field">
                  <label>
                    <span>Identificador do agent</span>
                    <input
                      type="text"
                      value={agentSlug}
                      onChange={handleSlugChange}
                      placeholder="sentinel-watcher"
                    />
                  </label>
                  {agentSlugError ? (
                    <p className="mcp-wizard__helper mcp-wizard__helper--error" role="alert">{agentSlugError}</p>
                  ) : null}
                </div>
                <div className="mcp-wizard__field">
                  <label>
                    <span>Nome exibido</span>
                    <input
                      type="text"
                      value={displayName}
                      onChange={handleDisplayNameChange}
                      placeholder="Sentinel Watcher"
                    />
                  </label>
                  {displayNameError ? (
                    <p className="mcp-wizard__helper mcp-wizard__helper--error" role="alert">{displayNameError}</p>
                  ) : null}
                </div>
              </div>

              <div className="mcp-wizard__grid">
                <div className="mcp-wizard__field">
                  <label>
                    <span>Descrição</span>
                    <textarea
                      value={description}
                      onChange={(event) => setDescription(event.target.value)}
                      placeholder="Resumo da função do agent"
                    />
                  </label>
                </div>
                <div className="mcp-wizard__field">
                  <label>
                    <span>Owner (opcional)</span>
                    <input
                      type="text"
                      value={owner}
                      onChange={(event) => setOwner(event.target.value)}
                      placeholder="@team-agents"
                    />
                  </label>
                </div>
              </div>

              <div className="mcp-wizard__grid">
                <div className="mcp-wizard__field">
                  <label>
                    <span>Repositório de destino</span>
                    <input
                      type="text"
                      value={repository}
                      onChange={handleRepositoryChange}
                      placeholder="agents-hub"
                    />
                  </label>
                  {repositoryError ? (
                    <p className="mcp-wizard__helper mcp-wizard__helper--error" role="alert">{repositoryError}</p>
                  ) : null}
                </div>
                <div className="mcp-wizard__field">
                  <label>
                    <span>Versão inicial</span>
                    <input type="text" value={version} onChange={(event) => setVersion(event.target.value)} />
                  </label>
                </div>
              </div>

              <fieldset className="mcp-wizard__fieldset">
                <legend>Modelo preferencial</legend>
                <div className="mcp-wizard__grid">
                  <div className="mcp-wizard__field">
                    <label>
                      <span>Provider</span>
                      <input
                        type="text"
                        value={modelProvider}
                        onChange={(event) => setModelProvider(event.target.value)}
                        placeholder="openai"
                      />
                    </label>
                  </div>
                  <div className="mcp-wizard__field">
                    <label>
                      <span>Modelo</span>
                      <input
                        type="text"
                        value={modelName}
                        onChange={(event) => setModelName(event.target.value)}
                        placeholder="gpt-4o-mini"
                      />
                    </label>
                  </div>
                  <div className="mcp-wizard__field">
                    <label>
                      <span>Temperatura (opcional)</span>
                      <input
                        type="text"
                        value={modelTemperature}
                        onChange={handleModelTemperatureChange}
                        placeholder="0.1"
                      />
                    </label>
                    {modelTemperatureError ? (
                      <p className="mcp-wizard__helper mcp-wizard__helper--error" role="alert">{modelTemperatureError}</p>
                    ) : null}
                  </div>
                </div>
              </fieldset>

              <div className="mcp-wizard__actions">
                <button type="submit" className="mcp-wizard__button mcp-wizard__button--primary">
                  Continuar
                </button>
              </div>
            </form>
          ) : null}

          {currentStep?.id === 'schema' ? (
            <form className="mcp-wizard__form" onSubmit={handleSchemaSubmit}>
              <div className="mcp-wizard__field">
                <label>
                  <span>Capabilities (separe por vírgula)</span>
                  <input
                    type="text"
                    value={capabilitiesInput}
                    onChange={handleCapabilitiesChange}
                    placeholder="structured-output,alerts"
                  />
                </label>
                {capabilitiesError ? (
                  <p className="mcp-wizard__helper mcp-wizard__helper--error" role="alert">{capabilitiesError}</p>
                ) : null}
              </div>

              <div className="mcp-wizard__tools">
                {tools.map((tool, index) => (
                  <div key={tool.id} className="mcp-wizard__tool-card">
                    <h3 className="mcp-wizard__tools-title">Tool {index + 1}</h3>
                    <div className="mcp-wizard__field">
                      <label>
                        <span>Nome da tool</span>
                        <input
                          type="text"
                          value={tool.name}
                          onChange={(event) => handleToolChange(tool.id, 'name', event.target.value)}
                          placeholder="check_signal"
                        />
                      </label>
                      {toolErrors[tool.id]?.name ? (
                        <p className="mcp-wizard__helper mcp-wizard__helper--error" role="alert">
                          {toolErrors[tool.id]?.name}
                        </p>
                      ) : null}
                    </div>
                    <div className="mcp-wizard__field">
                      <label>
                        <span>Descrição (opcional)</span>
                        <textarea
                          value={tool.description}
                          onChange={(event) => handleToolChange(tool.id, 'description', event.target.value)}
                          placeholder="Resumo da ferramenta"
                        />
                      </label>
                    </div>
                    <div className="mcp-wizard__field">
                      <label>
                        <span>Schema JSON</span>
                        <textarea
                          value={tool.schema}
                          onChange={(event) => handleToolChange(tool.id, 'schema', event.target.value)}
                          spellCheck={false}
                        />
                      </label>
                      {toolErrors[tool.id]?.schema ? (
                        <p className="mcp-wizard__helper mcp-wizard__helper--error" role="alert">
                          {toolErrors[tool.id]?.schema}
                        </p>
                      ) : null}
                    </div>
                    <div className="mcp-wizard__tools-actions">
                      <button
                        type="button"
                        className="mcp-wizard__button"
                        onClick={() => handleRemoveTool(tool.id)}
                        disabled={tools.length === 1}
                      >
                        Remover tool
                      </button>
                    </div>
                  </div>
                ))}
                <button type="button" className="mcp-wizard__button" onClick={handleAddTool}>
                  Adicionar tool
                </button>
              </div>

              <div className="mcp-wizard__actions">
                <button type="button" className="mcp-wizard__button" onClick={() => setActiveStep('basic')}>
                  Voltar
                </button>
                <button type="submit" className="mcp-wizard__button mcp-wizard__button--primary">
                  Continuar
                </button>
              </div>
            </form>
          ) : null}

          {currentStep?.id === 'policies' ? (
            <form className="mcp-wizard__form" onSubmit={handlePlanGeneration}>
              <div className="mcp-wizard__grid">
                <div className="mcp-wizard__field">
                  <label>
                    <span>Limite de requisições por minuto</span>
                    <input type="number" value={rateLimit} onChange={(event) => setRateLimit(event.target.value)} />
                  </label>
                  {rateLimitError ? (
                    <p className="mcp-wizard__helper mcp-wizard__helper--error" role="alert">{rateLimitError}</p>
                  ) : null}
                </div>
                <div className="mcp-wizard__field">
                  <label>
                    <span>Execuções simultâneas</span>
                    <input
                      type="number"
                      value={concurrency}
                      onChange={(event) => setConcurrency(event.target.value)}
                    />
                  </label>
                  {concurrencyError ? (
                    <p className="mcp-wizard__helper mcp-wizard__helper--error" role="alert">{concurrencyError}</p>
                  ) : null}
                </div>
              </div>

              <div className="mcp-wizard__grid">
                <div className="mcp-wizard__field">
                  <label>
                    <span>Safety mode</span>
                    <select value={safetyMode} onChange={(event) => setSafetyMode(event.target.value)}>
                      <option value="balanced">balanced</option>
                      <option value="strict">strict</option>
                      <option value="permissive">permissive</option>
                    </select>
                  </label>
                </div>
                <div className="mcp-wizard__field">
                  <label>
                    <span>Orçamento mensal</span>
                    <input
                      type="number"
                      value={budgetLimit}
                      onChange={(event) => setBudgetLimit(event.target.value)}
                      min="0"
                      step="0.01"
                    />
                  </label>
                  {budgetError ? (
                    <p className="mcp-wizard__helper mcp-wizard__helper--error" role="alert">{budgetError}</p>
                  ) : null}
                </div>
                <div className="mcp-wizard__field">
                  <label>
                    <span>Moeda</span>
                    <select value={budgetCurrency} onChange={(event) => setBudgetCurrency(event.target.value)}>
                      <option value="USD">USD</option>
                      <option value="BRL">BRL</option>
                      <option value="EUR">EUR</option>
                    </select>
                  </label>
                </div>
              </div>

              <div className="mcp-wizard__field">
                <label>
                  <span>Centro de custo</span>
                  <input
                    type="text"
                    value={costCenter}
                    onChange={(event) => setCostCenter(event.target.value)}
                    placeholder="finops-observability"
                  />
                </label>
                {costCenterError ? (
                  <p className="mcp-wizard__helper mcp-wizard__helper--error" role="alert">{costCenterError}</p>
                ) : null}
              </div>

              <div className="mcp-wizard__actions">
                <button type="button" className="mcp-wizard__button" onClick={() => setActiveStep('schema')}>
                  Voltar
                </button>
                <button
                  type="submit"
                  className="mcp-wizard__button mcp-wizard__button--primary"
                  disabled={isPlanning}
                >
                  {isPlanning ? 'Gerando plano…' : 'Gerar plano do agent'}
                </button>
              </div>

              {planError ? (
                <p className="mcp-wizard__helper mcp-wizard__helper--error" role="alert">{planError}</p>
              ) : null}
              {planStatusMessage ? (
                <p className="mcp-wizard__helper" role="status">{planStatusMessage}</p>
              ) : null}
            </form>
          ) : null}
        </div>

        <section className="agent-wizard__review" aria-live="polite">
          <PlanSummary
            plan={planSummary}
            isLoading={isPlanning || isApplying}
            actions={summaryActions}
          />
          <PlanDiffViewer
            diffs={planDiffItems}
            title="Diffs sugeridos"
            emptyMessage="Gere um plano para visualizar os arquivos agent.yaml e agent.py propostos."
          />

          {applyError ? (
            <p className="mcp-wizard__helper mcp-wizard__helper--error" role="alert">{applyError}</p>
          ) : null}
          {applyStatusMessage ? (
            <p className="mcp-wizard__helper" role="status">{applyStatusMessage}</p>
          ) : null}

          {smokeStatusMessage ? (
            <p className="mcp-wizard__helper" role="status">{smokeStatusMessage}</p>
          ) : null}
          {smokeError ? (
            <p className="mcp-wizard__helper mcp-wizard__helper--error" role="alert">{smokeError}</p>
          ) : null}
          {smokeResult ? (
            <div className="mcp-wizard__summary">
              <h3>Smoke do novo agent</h3>
              <dl>
                <div>
                  <dt>Execução</dt>
                  <dd>{smokeResult.runId}</dd>
                </div>
                <div>
                  <dt>Status</dt>
                  <dd>{formatSmokeStatus(smokeResult.status)}</dd>
                </div>
                {smokeResult.summary ? (
                  <div>
                    <dt>Resumo</dt>
                    <dd>{smokeResult.summary}</dd>
                  </div>
                ) : null}
                {smokeResult.reportUrl ? (
                  <div>
                    <dt>Relatório</dt>
                    <dd>
                      <a href={smokeResult.reportUrl} target="_blank" rel="noreferrer">
                        Abrir relatório
                      </a>
                    </dd>
                  </div>
                ) : null}
              </dl>
            </div>
          ) : null}
        </section>
      </section>
    </div>
  );
}
