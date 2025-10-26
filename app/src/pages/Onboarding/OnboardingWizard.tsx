import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';

import type {
  AdminPlanDiff,
  AdminPlanSummary,
  AdminRiskItem,
  ConfigOnboardRequest,
  ConfigOnboardResponse,
  ConfigOnboardValidation,
  ConfigApplyHitlResponse,
  ConfigApplySuccessResponse,
  McpOnboardingStatus,
  McpSmokeRunResponse,
} from '../../api';
import {
  fetchAgents,
  fetchMcpOnboardingStatus,
  postConfigApply,
  postConfigMcpOnboard,
  postConfigPlan,
  postMcpSmokeRun,
} from '../../api';
import PlanSummary from '../AdminChat/PlanSummary';
import PlanDiffViewer, { type PlanDiffItem } from '../../components/PlanDiffViewer';
import { FormErrorSummary, Input, Switch, TextArea } from '../../components/forms';
import Alert from '../../components/feedback/Alert';
import {
  McpFormProvider,
  useMcpField,
  useMcpForm,
  useMcpFormContext,
  type FormErrorSummaryItem,
} from '../../hooks/useMcpForm';
import {
  useFieldArray,
  useWatch,
  type FieldArrayWithId,
  type FieldError,
  type FieldErrors,
  type Path,
} from 'react-hook-form';

interface WizardStepDefinition {
  id: WizardStep;
  title: string;
  description: string;
}

type WizardStep = 'basic' | 'auth' | 'tools' | 'validation' | 'verification';

type AuthenticationMode = ConfigOnboardRequest['authentication']['mode'];

interface ToolDraft {
  name: string;
  description: string;
  entryPoint: string;
}

interface WizardFormValues {
  agentId: string;
  displayName: string;
  repository: string;
  endpoint: string;
  description: string;
  owner: string;
  tags: string;
  capabilities: string;
  authMode: AuthenticationMode;
  secretName: string;
  authInstructions: string;
  authEnvironment: string;
  tools: ToolDraft[];
  connectionTested: boolean;
  runSmokeTests: boolean;
  qualityGates: string;
  validationNotes: string;
  applyNote: string;
}

type AgentAvailabilityStatus = 'idle' | 'validating' | 'available' | 'unavailable' | 'error';

interface AgentAvailabilityCache {
  value: string;
  status: 'available' | 'unavailable' | 'error';
  message: string;
}

const AGENT_ID_PATTERN = /^[a-z0-9](?:[a-z0-9-_]{1,62}[a-z0-9])?$/;
const AGENT_ID_PATTERN_MESSAGE =
  'Use letras minúsculas, números, hífens ou underlines (3 a 64 caracteres).';

function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'Falha ao comunicar com a API de onboarding MCP.';
}

function splitValues(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function getToolValidationFields(
  values: WizardFormValues,
  includeConnectionCheck = true,
): Path<WizardFormValues>[] {
  const baseFields = (values.tools ?? []).flatMap((_, index) =>
    [`tools.${index}.name`, `tools.${index}.entryPoint`].map((field) => field as Path<WizardFormValues>),
  );
  if (includeConnectionCheck) {
    baseFields.push('connectionTested' as Path<WizardFormValues>);
  }
  return baseFields;
}

const STEP_DEFINITIONS: WizardStepDefinition[] = [
  {
    id: 'basic',
    title: 'Dados básicos',
    description: 'Defina identificador, repositório e contexto inicial do servidor MCP.',
  },
  {
    id: 'auth',
    title: 'Autenticação',
    description: 'Configure o mecanismo de autenticação e a credencial correspondente.',
  },
  {
    id: 'tools',
    title: 'Tools',
    description: 'Liste as tools expostas pelo agente e os entrypoints associados.',
  },
  {
    id: 'validation',
    title: 'Validação',
    description: 'Gere o plano, revise diffs sugeridos e confirme a aplicação.',
  },
  {
    id: 'verification',
    title: 'Smoke & status',
    description: 'Acompanhe branch/PR gerados, execute smoke tests e monitore o status.',
  },
];

const CONNECTION_REQUIRED_MESSAGE = 'Teste a conexão com o servidor MCP antes de avançar.';
const CONNECTION_PREREQUISITES_MESSAGE = 'Preencha os campos obrigatórios antes de validar a conexão.';

const STEP_VALIDATION_FIELDS: Record<WizardStep, (values: WizardFormValues) => Path<WizardFormValues>[]> = {
  basic: () => ['agentId', 'repository', 'endpoint'],
  auth: (values) => (values.authMode === 'none' ? [] : ['secretName']),
  tools: (values) => getToolValidationFields(values),
  validation: () => [],
  verification: () => [],
};

const STEP_ERROR_PREFIXES: Record<WizardStep, string[]> = {
  basic: ['agentId', 'displayName', 'repository', 'endpoint', 'description', 'owner', 'tags', 'capabilities'],
  auth: ['authMode', 'secretName', 'authInstructions', 'authEnvironment'],
  tools: ['tools', 'connectionTested'],
  validation: ['validationNotes', 'qualityGates', 'runSmokeTests', 'applyNote'],
  verification: [],
};

function isFieldErrorValue(value: unknown): value is FieldError {
  return Boolean(value && typeof value === 'object' && 'type' in value && 'message' in value);
}

function collectStepErrorItems(
  errors: FieldErrors<WizardFormValues>,
  step: WizardStep,
  parent?: string,
  accumulator: FormErrorSummaryItem[] = [],
): FormErrorSummaryItem[] {
  for (const [key, value] of Object.entries(errors)) {
    if (!value) {
      continue;
    }
    const path = parent ? `${parent}.${key}` : key;
    if (isFieldErrorValue(value) && value.message) {
      if (
        STEP_ERROR_PREFIXES[step].some((prefix) => path === prefix || path.startsWith(`${prefix}.`))
      ) {
        accumulator.push({ name: path, message: String(value.message) });
      }
      continue;
    }
    if (typeof value === 'object') {
      collectStepErrorItems(value as FieldErrors<WizardFormValues>, step, path, accumulator);
    }
  }
  return accumulator;
}

function StepErrorSummary({ step, visible }: { step: WizardStep; visible: boolean }): JSX.Element | null {
  const { formState } = useMcpFormContext<WizardFormValues>();
  const items = visible ? collectStepErrorItems(formState.errors, step) : [];
  if (!visible || items.length === 0) {
    return null;
  }
  return <FormErrorSummary items={items} />;
}

export default function OnboardingWizard() {
  const [activeStep, setActiveStep] = useState<WizardStep>('basic');
  const [submittedStep, setSubmittedStep] = useState<WizardStep | null>(null);
  const formMethods = useMcpForm<WizardFormValues>({
    defaultValues: {
      agentId: '',
      displayName: '',
      repository: '',
      endpoint: '',
      description: '',
      owner: '',
      tags: '',
      capabilities: '',
      authMode: 'api_key',
      secretName: '',
      authInstructions: '',
      authEnvironment: '',
      tools: [{ name: '', description: '', entryPoint: '' }],
      connectionTested: false,
      runSmokeTests: true,
      qualityGates: 'operacao,finops',
      validationNotes: '',
      applyNote: '',
    },
    mode: 'onBlur',
  });
  const {
    control,
    getValues,
    trigger,
    setValue,
    clearErrors,
    setError: setFormError,
    register,
    unregister,
  } = formMethods;

  useEffect(() => {
    register('connectionTested', {
      validate: (value) => (value ? true : CONNECTION_REQUIRED_MESSAGE),
    });
    return () => {
      unregister('connectionTested');
    };
  }, [register, unregister]);
  const { fields: toolFields, append: appendTool, remove: removeTool } = useFieldArray({
    control,
    name: 'tools',
  });

  const runSmokeTests = useWatch({ control, name: 'runSmokeTests' }) ?? true;
  const agentIdValue = useWatch({ control, name: 'agentId' }) ?? '';
  const displayNameValue = useWatch({ control, name: 'displayName' });
  const repositoryValue = useWatch({ control, name: 'repository' }) ?? '';
  const endpointValue = useWatch({ control, name: 'endpoint' }) ?? '';
  const descriptionValue = useWatch({ control, name: 'description' });
  const ownerValue = useWatch({ control, name: 'owner' });
  const tagsValue = useWatch({ control, name: 'tags' });
  const capabilitiesValue = useWatch({ control, name: 'capabilities' });
  const authModeValue = useWatch({ control, name: 'authMode' }) ?? 'api_key';
  const secretNameValue = useWatch({ control, name: 'secretName' });
  const authInstructionsValue = useWatch({ control, name: 'authInstructions' });
  const authEnvironmentValue = useWatch({ control, name: 'authEnvironment' });
  const toolsValue = useWatch({ control, name: 'tools' }) ?? [];
  const connectionTestedValue = useWatch({ control, name: 'connectionTested' }) ?? false;
  const [isPlanning, setPlanning] = useState(false);
  const [isApplying, setApplying] = useState(false);
  const [isRunningSmoke, setRunningSmoke] = useState(false);
  const [isTrackingStatus, setTrackingStatus] = useState(false);
  const [isValidatingConnection, setValidatingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [connectionFeedback, setConnectionFeedback] = useState<string | null>(null);

  const [plan, setPlan] = useState<AdminPlanSummary | null>(null);
  const [diffs, setDiffs] = useState<AdminPlanDiff[]>([]);
  const [risks, setRisks] = useState<AdminRiskItem[]>([]);
  const [planMessage, setPlanMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [validationDetails, setValidationDetails] = useState<ConfigOnboardValidation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [smokeError, setSmokeError] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [hitlRequest, setHitlRequest] = useState<ConfigApplyHitlResponse | null>(null);
  const [applyResult, setApplyResult] = useState<ConfigApplySuccessResponse | null>(null);
  const [smokeResult, setSmokeResult] = useState<McpSmokeRunResponse | null>(null);
  const [trackerStatus, setTrackerStatus] = useState<McpOnboardingStatus | null>(null);

  const stepIndex = useMemo(() => STEP_DEFINITIONS.findIndex((step) => step.id === activeStep), [activeStep]);

  const diffItems = useMemo<PlanDiffItem[]>(
    () =>
      diffs.map((diff) => ({
        id: diff.id,
        title: diff.file,
        summary: diff.summary,
        diff: diff.diff,
      })),
    [diffs],
  );

  const goToStep = (step: WizardStep) => {
    setActiveStep(step);
    setSubmittedStep(null);
  };

  const handleStepChange = (nextStep: WizardStep) => {
    const currentIndex = stepIndex;
    const nextIndex = STEP_DEFINITIONS.findIndex((step) => step.id === nextStep);
    if (nextIndex <= currentIndex) {
      goToStep(nextStep);
    }
  };

  const invalidateConnection = useCallback(
    (shouldValidate = false) => {
      setConnectionStatus('idle');
      setConnectionFeedback(null);
      setValidationDetails(null);
      setValue('connectionTested', false, {
        shouldDirty: true,
        shouldTouch: false,
        shouldValidate,
      });
      clearErrors('connectionTested');
    },
    [clearErrors, setValue],
  );

  useEffect(() => {
    invalidateConnection();
  }, [
    agentIdValue,
    displayNameValue,
    repositoryValue,
    endpointValue,
    descriptionValue,
    ownerValue,
    tagsValue,
    capabilitiesValue,
    authModeValue,
    secretNameValue,
    authInstructionsValue,
    authEnvironmentValue,
    toolsValue,
    invalidateConnection,
  ]);

  const handleNextStep = async (next: WizardStep) => {
    const values = getValues();
    const fields = STEP_VALIDATION_FIELDS[activeStep](values);
    if (fields.length > 0) {
      const isValid = await trigger(fields, { shouldFocus: true });
      if (!isValid) {
        setSubmittedStep(activeStep);
        return;
      }
    }
    setSubmittedStep(null);
    setActiveStep(next);
  };

  const buildPayload = (): ConfigOnboardRequest => {
    const values = getValues();
    const normalizedTools = (values.tools ?? [])
      .map((tool) => ({
        name: tool.name.trim(),
        description: tool.description.trim(),
        entryPoint: tool.entryPoint.trim(),
      }))
      .filter((tool) => tool.name.length > 0);

    return {
      endpoint: values.endpoint.trim(),
      agent: {
        id: values.agentId.trim(),
        name: (values.displayName || values.agentId).trim(),
        repository: values.repository.trim(),
        description: values.description.trim() || null,
        owner: values.owner.trim() || null,
        tags: splitValues(values.tags),
        capabilities: splitValues(values.capabilities),
      },
      authentication: {
        mode: values.authMode,
        secretName: values.authMode === 'none' ? null : values.secretName.trim() || null,
        instructions: values.authInstructions.trim() || null,
        environment: values.authEnvironment.trim() || null,
      },
      tools: normalizedTools,
      validation: {
        runSmokeTests: values.runSmokeTests,
        qualityGates: splitValues(values.qualityGates),
        notes: values.validationNotes.trim() || null,
      },
    };
  };

  const handleAddTool = () => {
    appendTool({ name: '', description: '', entryPoint: '' });
    invalidateConnection();
  };

  const handleRemoveTool = (index: number) => {
    if (toolFields.length === 1) {
      return;
    }
    removeTool(index);
    invalidateConnection();
  };

  const handleValidateConnection = async () => {
    setValidatingConnection(true);
    invalidateConnection();
    try {
      const values = getValues();
      const fieldSet = new Set<Path<WizardFormValues>>([
        ...STEP_VALIDATION_FIELDS.basic(values),
        ...STEP_VALIDATION_FIELDS.auth(values),
        ...getToolValidationFields(values, false),
      ]);
      const requiredFields = Array.from(fieldSet);
      if (requiredFields.length > 0) {
        const isValid = await trigger(requiredFields, { shouldFocus: true });
        if (!isValid) {
          setSubmittedStep('tools');
          setConnectionStatus('error');
          setConnectionFeedback(CONNECTION_PREREQUISITES_MESSAGE);
          setFormError('connectionTested', { type: 'manual', message: CONNECTION_PREREQUISITES_MESSAGE });
          return;
        }
      }

      const payload = buildPayload();
      if (!payload.endpoint) {
        throw new Error('Informe o endpoint do servidor MCP.');
      }
      if (!/^wss?:\/\//.test(payload.endpoint)) {
        throw new Error('O endpoint deve iniciar com ws:// ou wss://.');
      }
      const response = await postConfigMcpOnboard({
        ...payload,
        intent: 'validate',
      });
      setConnectionStatus('success');
      setConnectionFeedback(response.message || 'Conexão validada com sucesso.');
      setValidationDetails(response.validation ?? null);
      setValue('connectionTested', true, {
        shouldDirty: true,
        shouldTouch: true,
        shouldValidate: true,
      });
      clearErrors('connectionTested');
    } catch (cause) {
      const message = extractErrorMessage(cause);
      setSubmittedStep('tools');
      setConnectionStatus('error');
      setConnectionFeedback(message);
      setFormError('connectionTested', {
        type: 'manual',
        message: message || CONNECTION_REQUIRED_MESSAGE,
      });
    } finally {
      setValidatingConnection(false);
    }
  };

  const handleGeneratePlan = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPlanning(true);
    setError(null);
    setPlanMessage(null);
    setValidationDetails(null);
    try {
      const payload = buildPayload();
      if (!payload.agent.id || !payload.agent.repository) {
        throw new Error('Informe o identificador e o repositório do agente.');
      }
      if (!payload.endpoint) {
        throw new Error('Informe o endpoint do servidor MCP.');
      }
      if (!/^wss?:\/\//.test(payload.endpoint)) {
        throw new Error('O endpoint deve iniciar com ws:// ou wss://.');
      }
      const response: ConfigOnboardResponse = await postConfigMcpOnboard({
        ...payload,
        intent: 'plan',
      });
      setPlan(response.plan);
      setDiffs(response.diffs);
      setRisks(response.risks);
      setPlanMessage(response.message);
      setValidationDetails(response.validation ?? null);
      setActiveStep('validation');
    } catch (cause) {
      setError(extractErrorMessage(cause));
    } finally {
      setPlanning(false);
    }
  };

  const handleApply = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!plan) {
      setApplyError('Gere um plano antes de aplicar.');
      return;
    }

    setApplying(true);
    setApplyError(null);
    setStatusMessage(null);
    setStatusError(null);
    setSmokeError(null);
    setHitlRequest(null);
    try {
      const values = getValues();
      const summary = await postConfigPlan({ intent: 'summarize', threadId: plan.threadId });
      setPlan(summary.plan);
      setDiffs(summary.diffs);
      setRisks(summary.risks);
      const response = await postConfigApply({
        intent: 'apply',
        threadId: summary.plan.threadId,
        planId: summary.plan.id,
        note: values.applyNote.trim() ? values.applyNote.trim() : null,
      });

      if (response.status === 'hitl_required') {
        setHitlRequest(response);
        setApplyError('A aprovação humana é necessária antes de aplicar o plano.');
        return;
      }

      setApplyResult(response);
      setStatusMessage(response.message);
      setTrackerStatus(null);
      setActiveStep('verification');
    } catch (cause) {
      setApplyError(extractErrorMessage(cause));
    } finally {
      setApplying(false);
    }
  };

  const handleRunSmoke = async () => {
    if (!applyResult || !plan) {
      return;
    }
    setRunningSmoke(true);
    setSmokeError(null);
    try {
      const response = await postMcpSmokeRun({
        recordId: applyResult.recordId,
        planId: plan.id,
        providerId: agentIdValue.trim() || plan.scope,
      });
      setSmokeResult(response);
    } catch (cause) {
      setSmokeError(extractErrorMessage(cause));
    } finally {
      setRunningSmoke(false);
    }
  };

  const handleRefreshStatus = async () => {
    if (!applyResult) {
      return;
    }
    setTrackingStatus(true);
    setStatusError(null);
    try {
      const status = await fetchMcpOnboardingStatus(applyResult.recordId);
      setTrackerStatus(status);
    } catch (cause) {
      setStatusError(extractErrorMessage(cause));
    } finally {
      setTrackingStatus(false);
    }
  };

  const renderStep = () => {
    switch (activeStep) {
      case 'basic':
        return <BasicStep onNext={() => handleNextStep('auth')} showErrors={submittedStep === 'basic'} />;
      case 'auth':
        return (
          <AuthStep
            onBack={() => goToStep('basic')}
            onNext={() => handleNextStep('tools')}
            showErrors={submittedStep === 'auth'}
          />
        );
      case 'tools':
        return (
          <ToolsStep
            fields={toolFields}
            onAddTool={handleAddTool}
            onRemoveTool={handleRemoveTool}
            onBack={() => goToStep('auth')}
            onNext={() => handleNextStep('validation')}
            onValidateConnection={handleValidateConnection}
            isValidating={isValidatingConnection}
            connectionStatus={connectionStatus}
            connectionFeedback={connectionFeedback}
            connectionTested={connectionTestedValue}
            showErrors={submittedStep === 'tools'}
          />
        );
      case 'validation':
        return (
          <ValidationStep
            onBack={() => goToStep('tools')}
            onGeneratePlan={handleGeneratePlan}
            onApply={handleApply}
            showErrors={submittedStep === 'validation'}
            isPlanning={isPlanning}
            isApplying={isApplying}
            plan={plan}
            diffs={diffItems}
            risks={risks}
            error={error}
            planMessage={planMessage}
            validationDetails={validationDetails}
            applyError={applyError}
            hitlRequest={hitlRequest}
          />
        );
      case 'verification':
        return (
          <VerificationStep
            statusMessage={statusMessage}
            statusError={statusError}
            trackerStatus={trackerStatus}
            applyResult={applyResult}
            smokeError={smokeError}
            smokeResult={smokeResult}
            onRefreshStatus={handleRefreshStatus}
            onRunSmoke={handleRunSmoke}
            isTrackingStatus={isTrackingStatus}
            isRunningSmoke={isRunningSmoke}
            runSmokeTests={runSmokeTests}
          />
        );
      default:
        return null;
    }
  };


  return (
    <McpFormProvider {...formMethods}>
      <section className="mcp-wizard" aria-labelledby="mcp-wizard-heading">
        <header className="mcp-wizard__header">
        <div>
          <h2 id="mcp-wizard-heading">Onboarding assistido MCP</h2>
          <p>Preencha as etapas para gerar plano, aplicar branch/PR e executar smoke tests automaticamente.</p>
        </div>
      </header>
      <ol className="mcp-wizard__steps" role="tablist">
        {STEP_DEFINITIONS.map((step, index) => {
          const isActive = step.id === activeStep;
          const isCompleted = index < stepIndex;
          return (
            <li
              key={step.id}
              className={
                isActive
                  ? 'mcp-wizard__step mcp-wizard__step--active'
                  : isCompleted
                  ? 'mcp-wizard__step mcp-wizard__step--completed'
                  : 'mcp-wizard__step'
              }
            >
              <button
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-current={isActive ? 'step' : undefined}
                tabIndex={isActive ? 0 : -1}
                aria-controls={`mcp-wizard-panel-${step.id}`}
                id={`mcp-wizard-tab-${step.id}`}
                disabled={!isActive && !isCompleted}
                onClick={() => handleStepChange(step.id)}
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
      <div
        id={`mcp-wizard-panel-${activeStep}`}
        role="tabpanel"
        aria-labelledby={`mcp-wizard-tab-${activeStep}`}
        className="mcp-wizard__panel"
      >
        {renderStep()}
      </div>
      </section>
    </McpFormProvider>
  );
}


interface BasicStepProps {
  onNext: () => void;
  showErrors: boolean;
}

function BasicStep({ onNext, showErrors }: BasicStepProps): JSX.Element {
  const form = useMcpFormContext<WizardFormValues>();
  const agentAvailabilityCacheRef = useRef<AgentAvailabilityCache | null>(null);
  const isMountedRef = useRef(true);
  const [agentValidationStatus, setAgentValidationStatus] = useState<AgentAvailabilityStatus>('idle');
  const [agentValidationMessage, setAgentValidationMessage] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const updateAvailability = useCallback(
    (status: AgentAvailabilityStatus, message: string | null = null) => {
      if (!isMountedRef.current) {
        return;
      }
      setAgentValidationStatus(status);
      setAgentValidationMessage(message);
    },
    [],
  );

  const agentIdValidatorRef = useRef<((value: unknown) => Promise<true | string> | string | boolean) | null>(null);

  if (agentIdValidatorRef.current === null) {
    agentIdValidatorRef.current = async (rawValue: unknown) => {
      const value = typeof rawValue === 'string' ? rawValue.trim() : '';
      if (!value) {
        agentAvailabilityCacheRef.current = null;
        updateAvailability('idle');
        return true;
      }

      if (!AGENT_ID_PATTERN.test(value)) {
        agentAvailabilityCacheRef.current = null;
        updateAvailability('idle');
        return true;
      }

      const cached = agentAvailabilityCacheRef.current;
      if (cached && cached.value === value) {
        updateAvailability(cached.status, cached.message);
        return cached.status === 'available' ? true : cached.message;
      }

      updateAvailability('validating', 'Validando disponibilidade…');
      try {
        const agents = await fetchAgents();
        const normalized = value.toLowerCase();
        const exists = agents.some((agent) => (agent.name ?? '').toLowerCase() === normalized);
        if (exists) {
          const message = `Identificador ${value} já está em uso.`;
          agentAvailabilityCacheRef.current = { value, status: 'unavailable', message };
          updateAvailability('unavailable', message);
          return message;
        }
        const message = 'Identificador disponível.';
        agentAvailabilityCacheRef.current = { value, status: 'available', message };
        updateAvailability('available', message);
        return true;
      } catch (error) {
        const resolvedMessage =
          extractErrorMessage(error) || 'Não foi possível validar o identificador. Tente novamente.';
        agentAvailabilityCacheRef.current = { value, status: 'error', message: resolvedMessage };
        updateAvailability('error', resolvedMessage);
        return resolvedMessage;
      }
    };
  }

  const agentIdField = useMcpField<WizardFormValues>('agentId', {
    rules: {
      required: 'Informe o identificador do agente.',
      pattern: {
        value: AGENT_ID_PATTERN,
        message: AGENT_ID_PATTERN_MESSAGE,
      },
      validate: agentIdValidatorRef.current,
    },
  });
  const displayNameField = useMcpField<WizardFormValues>('displayName');
  const repositoryField = useMcpField<WizardFormValues>('repository', {
    rules: { required: 'Informe o repositório Git do agente.' },
  });
  const endpointField = useMcpField<WizardFormValues>('endpoint', {
    rules: {
      required: 'Informe o endpoint do servidor MCP.',
      pattern: {
        value: /^wss?:\/\//i,
        message: 'O endpoint deve iniciar com ws:// ou wss://.',
      },
    },
  });
  const ownerField = useMcpField<WizardFormValues>('owner');
  const tagsField = useMcpField<WizardFormValues>('tags');
  const capabilitiesField = useMcpField<WizardFormValues>('capabilities');
  const descriptionField = useMcpField<WizardFormValues>('description');
  const [agentIdValue = '', repositoryValue = '', endpointValue = ''] = form.watch([
    'agentId',
    'repository',
    'endpoint',
  ]);
  const agentState = form.getFieldState('agentId', form.formState);
  const repositoryState = form.getFieldState('repository', form.formState);
  const endpointState = form.getFieldState('endpoint', form.formState);

  const trimmedAgentId = agentIdValue.trim();
  const trimmedRepository = repositoryValue.trim();
  const trimmedEndpoint = endpointValue.trim();
  useEffect(() => {
    const cached = agentAvailabilityCacheRef.current;
    if (!trimmedAgentId) {
      agentAvailabilityCacheRef.current = null;
      updateAvailability('idle');
      return;
    }
    if (!cached || cached.value !== trimmedAgentId) {
      updateAvailability('idle');
    } else {
      updateAvailability(cached.status, cached.message);
    }
  }, [trimmedAgentId, updateAvailability]);

  const hasErrors = agentIdField.isInvalid || repositoryField.isInvalid || endpointField.isInvalid;
  const hasTouched = agentState.isTouched || repositoryState.isTouched || endpointState.isTouched;
  const isAgentChecking = agentValidationStatus === 'validating';
  const canProceed =
    trimmedAgentId.length > 0 &&
    trimmedRepository.length > 0 &&
    trimmedEndpoint.length > 0 &&
    !hasErrors &&
    !isAgentChecking;
  const shouldShowSummary = showErrors || (hasTouched && hasErrors);

  const agentHelperStatus =
    agentValidationStatus === 'validating'
      ? (
          <span className="mcp-form-helper__status" role="status">
            Validando disponibilidade…
          </span>
        )
      : agentValidationStatus === 'available'
      ? (
          <span className="mcp-form-helper__status" data-variant="success" role="status">
            {agentValidationMessage}
          </span>
        )
      : agentValidationStatus === 'unavailable' || agentValidationStatus === 'error'
      ? (
          <span className="mcp-form-helper__status" data-variant="error" role="alert">
            {agentValidationMessage}
          </span>
        )
      : agentValidationMessage
      ? (
          <span className="mcp-form-helper__status" role="status">
            {agentValidationMessage}
          </span>
        )
      : null;

  const agentHelperText = agentHelperStatus ? (
    <>
      <span>{AGENT_ID_PATTERN_MESSAGE}</span>
      {agentHelperStatus}
    </>
  ) : (
    AGENT_ID_PATTERN_MESSAGE
  );

  return (
    <form
      className="mcp-wizard__form"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void onNext();
      }}
    >
      <StepErrorSummary step="basic" visible={shouldShowSummary} />
      <div className="mcp-wizard__grid">
      <div className="mcp-wizard__field">
        <Input
          {...agentIdField.inputProps}
          label="Identificador do agente"
          placeholder="Ex.: openai-gpt4o"
          required
          helperText={agentHelperText}
          error={agentIdField.error}
        />
      </div>
        <div className="mcp-wizard__field">
          <Input
            {...displayNameField.inputProps}
            label="Nome exibido"
            placeholder="Ex.: OpenAI GPT-4o"
            error={displayNameField.error}
          />
        </div>
      </div>
      <div className="mcp-wizard__field">
        <Input
          {...repositoryField.inputProps}
          label="Repositório Git"
          placeholder="agents/openai-gpt4o"
          required
          error={repositoryField.error}
        />
      </div>
      <div className="mcp-wizard__field">
        <Input
          {...endpointField.inputProps}
          label="Endpoint MCP (ws/wss)"
          placeholder="wss://mcp.example.com/ws"
          required
          error={endpointField.error}
        />
      </div>
      <div className="mcp-wizard__grid">
        <div className="mcp-wizard__field">
          <Input
            {...ownerField.inputProps}
            label="Owner responsável"
            placeholder="@squad-mcp"
            error={ownerField.error}
          />
        </div>
        <div className="mcp-wizard__field">
          <Input
            {...tagsField.inputProps}
            label="Tags (separadas por vírgula)"
            placeholder="openai,prod,priority"
            error={tagsField.error}
          />
        </div>
      </div>
      <div className="mcp-wizard__field">
        <Input
          {...capabilitiesField.inputProps}
          label="Capacidades (separadas por vírgula)"
          placeholder="chat,planning"
          error={capabilitiesField.error}
        />
      </div>
      <div className="mcp-wizard__field">
        <TextArea
          {...descriptionField.inputProps}
          label="Descrição"
          rows={3}
          placeholder="Contextualize o escopo funcional e restrições do MCP"
          error={descriptionField.error}
        />
      </div>
      <div className="mcp-wizard__actions">
        <button
          type="submit"
          className="mcp-wizard__button mcp-wizard__button--primary"
          disabled={!canProceed}
        >
          Avançar para autenticação
        </button>
      </div>
      {!canProceed ? (
        <Alert
          variant="info"
          title="Complete os dados obrigatórios"
          description="Informe identificador, repositório Git e endpoint MCP válidos para prosseguir."
        />
      ) : null}
    </form>
  );
}

interface AuthStepProps {
  onBack: () => void;
  onNext: () => void;
  showErrors: boolean;
}

function AuthStep({ onBack, onNext, showErrors }: AuthStepProps): JSX.Element {
  const form = useMcpFormContext<WizardFormValues>();
  const { register } = form;
  const authMode = form.watch('authMode');
  const secretField = useMcpField<WizardFormValues>('secretName', {
    rules: {
      validate: (value) => {
        if (authMode === 'none') {
          return true;
        }

        if (typeof value !== 'string' || !value.trim()) {
          return 'Informe o nome da credencial.';
        }
        const normalized = value.trim();
        if (!/^[A-Z0-9._-]{3,}$/.test(normalized)) {
          return 'Use letras maiúsculas, números, hífens, pontos ou underscores.';
        }

        return true;
      },
    },
  });
  const authEnvironmentField = useMcpField<WizardFormValues>('authEnvironment');
  const authInstructionsField = useMcpField<WizardFormValues>('authInstructions');
  const secretValue = (form.watch('secretName') ?? '').trim();
  const secretState = form.getFieldState('secretName', form.formState);
  const requiresSecret = authMode !== 'none';
  const hasErrors = secretField.isInvalid && requiresSecret;
  const hasTouched = secretState.isTouched;
  const canProceed = (!requiresSecret || secretValue.length > 0) && !hasErrors;
  const shouldShowSummary = showErrors || (hasErrors && (hasTouched || secretValue.length > 0));

  return (
    <form
      className="mcp-wizard__form"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void onNext();
      }}
    >
      <StepErrorSummary step="auth" visible={shouldShowSummary} />
      <fieldset className="mcp-wizard__fieldset">
        <legend>Modo de autenticação</legend>
        <label className="mcp-wizard__radio">
          <input type="radio" value="api_key" {...register('authMode')} checked={authMode === 'api_key'} />
          API Key
        </label>
        <label className="mcp-wizard__radio">
          <input type="radio" value="oauth_client" {...register('authMode')} checked={authMode === 'oauth_client'} />
          OAuth Client
        </label>
        <label className="mcp-wizard__radio">
          <input type="radio" value="none" {...register('authMode')} checked={authMode === 'none'} />
          Sem autenticação
        </label>
      </fieldset>
      <div className="mcp-wizard__field">
        <Input
          {...secretField.inputProps}
          label="Nome da credencial"
          placeholder="OPENAI_API_KEY"
          disabled={authMode === 'none'}
          error={secretField.error}
        />
      </div>
      <div className="mcp-wizard__field">
        <Input
          {...authEnvironmentField.inputProps}
          label="Ambiente/namespace"
          placeholder="production"
          error={authEnvironmentField.error}
        />
      </div>
      <div className="mcp-wizard__field">
        <TextArea
          {...authInstructionsField.inputProps}
          label="Instruções para provisionamento"
          rows={3}
          placeholder="Ex.: gerar chave no vault e anexar ao secret manager"
          error={authInstructionsField.error}
        />
      </div>
      <div className="mcp-wizard__actions">
        <button type="button" className="mcp-wizard__button" onClick={onBack}>
          Voltar
        </button>
        <button
          type="submit"
          className="mcp-wizard__button mcp-wizard__button--primary"
          disabled={!canProceed}
        >
          Avançar para tools
        </button>
      </div>
      {requiresSecret && !canProceed ? (
        <Alert
          variant="warning"
          title="Credencial obrigatória"
          description="Informe o nome da credencial antes de avançar ou selecione 'Sem autenticação'."
        />
      ) : null}
    </form>
  );
}

interface ToolsStepProps {
  fields: FieldArrayWithId<WizardFormValues, 'tools', 'id'>[];
  onAddTool: () => void;
  onRemoveTool: (index: number) => void;
  onBack: () => void;
  onNext: () => void;
  onValidateConnection: () => Promise<void> | void;
  isValidating: boolean;
  connectionStatus: 'idle' | 'success' | 'error';
  connectionFeedback: string | null;
  connectionTested: boolean;
  showErrors: boolean;
}

function ToolsStep({
  fields,
  onAddTool,
  onRemoveTool,
  onBack,
  onNext,
  onValidateConnection,
  isValidating,
  connectionStatus,
  connectionFeedback,
  connectionTested,
  showErrors,
}: ToolsStepProps): JSX.Element {
  const form = useMcpFormContext<WizardFormValues>();
  const toolsValue = (form.watch('tools') ?? []) as ToolDraft[];
  const toolStates = fields.map((_, index) => ({
    name: form.getFieldState(`tools.${index}.name`, form.formState),
    entry: form.getFieldState(`tools.${index}.entryPoint`, form.formState),
  }));
  const hasIncomplete = toolsValue.some((tool) => !tool?.name?.trim() || !tool?.entryPoint?.trim());
  const hasErrors = toolStates.some((state) => state.name.invalid || state.entry.invalid);
  const hasTouched = toolStates.some((state) => state.name.isTouched || state.entry.isTouched);
  const isConnectionSuccessful = connectionStatus === 'success' && connectionTested;
  const canProceed = !isValidating && isConnectionSuccessful && !hasIncomplete && !hasErrors;
  const shouldShowSummary = showErrors || ((hasErrors || hasIncomplete) && hasTouched);
  const showMissingToolsAlert = (hasIncomplete || hasErrors) && !isValidating;
  const showConnectionPrompt = !connectionTested && connectionStatus !== 'error';

  return (
    <form
      className="mcp-wizard__form"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (!canProceed) {
          return;
        }
        void onNext();
      }}
    >
      <StepErrorSummary step="tools" visible={shouldShowSummary} />
      <div className="mcp-wizard__tools">
        {fields.map((field, index) => (
          <ToolFields
            key={field.id}
            index={index}
            canRemove={fields.length > 1}
            onRemove={() => onRemoveTool(index)}
          />
        ))}
        <button type="button" className="mcp-wizard__button" onClick={onAddTool}>
          Adicionar tool
        </button>
      </div>
      <div className="mcp-wizard__actions">
        <button type="button" className="mcp-wizard__button" onClick={onBack}>
          Voltar
        </button>
        <button
          type="button"
          className="mcp-wizard__button"
          onClick={() => void onValidateConnection()}
          disabled={isValidating}
        >
          {isValidating ? 'Testando conexão…' : 'Testar conexão'}
        </button>
        <button
          type="submit"
          className="mcp-wizard__button mcp-wizard__button--primary"
          disabled={!canProceed}
        >
          Ir para validação
        </button>
      </div>
      {showMissingToolsAlert ? (
        <Alert
          variant="info"
          title="Finalize as tools obrigatórias"
          description="Informe nome e entry point para cada tool listada para habilitar a próxima etapa."
        />
      ) : null}
      {showConnectionPrompt ? (
        <Alert
          variant="warning"
          title="Teste a conexão do MCP"
          description="Execute o teste de conexão para validar endpoint e habilitar a próxima etapa."
        />
      ) : null}
      {connectionStatus === 'success' && connectionFeedback ? (
        <Alert variant="success" title="Conexão validada" description={connectionFeedback} />
      ) : null}
      {connectionStatus === 'error' && connectionFeedback ? (
        <Alert variant="error" title="Erro ao validar conexão" description={connectionFeedback} />
      ) : null}
    </form>
  );
}

interface ToolFieldsProps {
  index: number;
  onRemove: () => void;
  canRemove: boolean;
}

function ToolFields({ index, onRemove, canRemove }: ToolFieldsProps): JSX.Element {
  const form = useMcpFormContext<WizardFormValues>();
  const nameField = useMcpField<WizardFormValues>(`tools.${index}.name`, {
    rules: {
      required: 'Informe o nome da tool.',
      validate: (value) => {
        const trimmed = typeof value === 'string' ? value.trim() : '';
        if (!trimmed) {
          return 'Informe o nome da tool.';
        }
        const tools = (form.getValues('tools') ?? []) as ToolDraft[];
        const duplicates = tools.filter((tool, toolIndex) =>
          toolIndex !== index && (tool?.name ?? '').trim() === trimmed,
        );
        if (duplicates.length > 0) {
          return 'Nome de tool duplicado.';
        }
        return true;
      },
    },
  });
  const descriptionField = useMcpField<WizardFormValues>(`tools.${index}.description`);
  const entryPointField = useMcpField<WizardFormValues>(`tools.${index}.entryPoint`, {
    rules: {
      required: 'Informe o entry point da tool.',
      pattern: {
        value: /^\S+$/,
        message: 'O entry point não deve conter espaços.',
      },
    },
  });

  return (
    <Fragment>
      <h3 className="mcp-wizard__tools-title">Tool {index + 1}</h3>
      <div className="mcp-wizard__field">
        <Input
          {...nameField.inputProps}
          label={`Nome da tool ${index + 1}`}
          placeholder="catalog.search"
          required
          error={nameField.error}
        />
      </div>
      <div className="mcp-wizard__field">
        <TextArea
          {...descriptionField.inputProps}
          label={`Descrição da tool ${index + 1}`}
          rows={2}
          placeholder="Busca recursos no catálogo interno"
          error={descriptionField.error}
        />
      </div>
      <div className="mcp-wizard__field">
        <Input
          {...entryPointField.inputProps}
          label={`Entry point da tool ${index + 1}`}
          placeholder="catalog/search.py"
          required
          error={entryPointField.error}
        />
      </div>
      <div className="mcp-wizard__tools-actions">
        <button type="button" className="mcp-wizard__button" onClick={onRemove} disabled={!canRemove}>
          Remover tool
        </button>
      </div>
    </Fragment>
  );
}

interface ValidationStepProps {
  onBack: () => void;
  onGeneratePlan: (event: FormEvent<HTMLFormElement>) => void;
  onApply: (event: FormEvent<HTMLFormElement>) => void;
  showErrors: boolean;
  isPlanning: boolean;
  isApplying: boolean;
  plan: AdminPlanSummary | null;
  diffs: PlanDiffItem[];
  risks: AdminRiskItem[];
  error: string | null;
  planMessage: string | null;
  validationDetails: ConfigOnboardValidation | null;
  applyError: string | null;
  hitlRequest: ConfigApplyHitlResponse | null;
}

function ValidationStep({
  onBack,
  onGeneratePlan,
  onApply,
  showErrors,
  isPlanning,
  isApplying,
  plan,
  diffs,
  risks,
  error,
  planMessage,
  validationDetails,
  applyError,
  hitlRequest,
}: ValidationStepProps): JSX.Element {
  const validationNotesField = useMcpField<WizardFormValues>('validationNotes');
  const qualityGatesField = useMcpField<WizardFormValues>('qualityGates');
  const runSmokeField = useMcpField<WizardFormValues>('runSmokeTests');
  const applyNoteField = useMcpField<WizardFormValues>('applyNote');

  return (
    <div className="mcp-wizard__form">
      <form onSubmit={onGeneratePlan} className="mcp-wizard__generate" noValidate>
        <button type="submit" className="mcp-wizard__button mcp-wizard__button--primary" disabled={isPlanning}>
          {plan ? 'Regenerar plano de onboarding' : 'Gerar plano de onboarding'}
        </button>
      </form>
      {error ? (
        <p className="mcp-wizard__helper mcp-wizard__helper--error" role="alert">
          {error}
        </p>
      ) : null}
      {planMessage ? (
        <p className="mcp-wizard__helper" role="status">
          {planMessage}
        </p>
      ) : null}
      {validationDetails ? (
        <section className="mcp-wizard__summary">
          <h3>Resultado da validação</h3>
          <dl>
            <div>
              <dt>Endpoint</dt>
              <dd>{validationDetails.endpoint}</dd>
            </div>
            <div>
              <dt>Transporte</dt>
              <dd>{validationDetails.transport}</dd>
            </div>
          </dl>
          <div className="mcp-wizard__validation-tools">
            <h4>Ferramentas detectadas</h4>
            {validationDetails.tools.length > 0 ? (
              <ul>
                {validationDetails.tools.map((tool) => (
                  <li key={tool.name}>
                    <strong>{tool.name}</strong>
                    {tool.description ? <span> — {tool.description}</span> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mcp-wizard__helper">Nenhuma tool detectada.</p>
            )}
          </div>
          <div className="mcp-wizard__validation-tools">
            <h4>Ferramentas pendentes</h4>
            {validationDetails.missingTools.length > 0 ? (
              <ul>
                {validationDetails.missingTools.map((tool) => (
                  <li key={tool}>{tool}</li>
                ))}
              </ul>
            ) : (
              <p className="mcp-wizard__helper">Nenhuma tool pendente.</p>
            )}
          </div>
        </section>
      ) : null}
      <PlanSummary plan={plan} isLoading={isPlanning} />
      <PlanDiffViewer diffs={diffs} />
      {risks.length > 0 ? (
        <section className="mcp-wizard__risks">
          <h3>Riscos identificados</h3>
          <ul>
            {risks.map((risk) => (
              <li key={risk.id}>
                <strong>{risk.title}</strong>
                <span>{risk.description}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <form onSubmit={onApply} className="mcp-wizard__apply" noValidate>
        <StepErrorSummary step="validation" visible={showErrors} />
        <div className="mcp-wizard__field">
          <TextArea
            {...validationNotesField.inputProps}
            label="Checklist/observações adicionais"
            rows={3}
            placeholder="Checklist de validação manual, owners ou métricas relevantes"
            error={validationNotesField.error}
          />
        </div>
        <div className="mcp-wizard__field">
          <Input
            {...qualityGatesField.inputProps}
            label="Quality gates (separados por vírgula)"
            error={qualityGatesField.error}
          />
        </div>
        <Switch
          {...runSmokeField.inputProps}
          label="Agendar smoke tests após aplicação"
          description="Os smoke tests serão executados automaticamente assim que o plano for aplicado."
          error={runSmokeField.error}
        />
        <div className="mcp-wizard__field">
          <TextArea
            {...applyNoteField.inputProps}
            label="Nota para aplicação"
            rows={3}
            placeholder="Contextualize a aplicação do plano"
            error={applyNoteField.error}
          />
        </div>
        {applyError ? (
          <p className="mcp-wizard__helper mcp-wizard__helper--error" role="alert">
            {applyError}
          </p>
        ) : null}
        {hitlRequest ? (
          <p className="mcp-wizard__helper mcp-wizard__helper--warning" role="alert">
            {hitlRequest.request.message}
          </p>
        ) : null}
        <div className="mcp-wizard__actions">
          <button type="button" className="mcp-wizard__button" onClick={onBack}>
            Voltar
          </button>
          <button type="submit" className="mcp-wizard__button mcp-wizard__button--primary" disabled={isApplying || !plan}>
            Confirmar e aplicar plano
          </button>
        </div>
      </form>
    </div>
  );
}

interface VerificationStepProps {
  statusMessage: string | null;
  statusError: string | null;
  trackerStatus: McpOnboardingStatus | null;
  applyResult: ConfigApplySuccessResponse | null;
  smokeError: string | null;
  smokeResult: McpSmokeRunResponse | null;
  onRefreshStatus: () => void | Promise<void>;
  onRunSmoke: () => void | Promise<void>;
  isTrackingStatus: boolean;
  isRunningSmoke: boolean;
  runSmokeTests: boolean;
}

function VerificationStep({
  statusMessage,
  statusError,
  trackerStatus,
  applyResult,
  smokeError,
  smokeResult,
  onRefreshStatus,
  onRunSmoke,
  isTrackingStatus,
  isRunningSmoke,
  runSmokeTests,
}: VerificationStepProps): JSX.Element {
  return (
    <div className="mcp-wizard__verification">
      {statusMessage ? (
        <p className="mcp-wizard__helper" role="status">
          {statusMessage}
        </p>
      ) : null}
      {applyResult ? (
        <section className="mcp-wizard__summary">
          <h3>Detalhes da aplicação</h3>
          <dl>
            <div>
              <dt>Registro</dt>
              <dd>{applyResult.recordId}</dd>
            </div>
            {applyResult.branch ? (
              <div>
                <dt>Branch</dt>
                <dd>{applyResult.branch}</dd>
              </div>
            ) : null}
            {applyResult.baseBranch ? (
              <div>
                <dt>Base</dt>
                <dd>{applyResult.baseBranch}</dd>
              </div>
            ) : null}
            {applyResult.commitSha ? (
              <div>
                <dt>Commit</dt>
                <dd>{applyResult.commitSha}</dd>
              </div>
            ) : null}
            {applyResult.pullRequest ? (
              <div>
                <dt>Pull Request</dt>
                <dd>
                  <a href={applyResult.pullRequest.url} target="_blank" rel="noreferrer">
                    {applyResult.pullRequest.title}
                  </a>
                </dd>
              </div>
            ) : null}
          </dl>
        </section>
      ) : null}
      {statusError ? (
        <p className="mcp-wizard__helper mcp-wizard__helper--error" role="alert">
          {statusError}
        </p>
      ) : null}
      {trackerStatus ? (
        <section className="mcp-wizard__summary">
          <h3>Status da execução</h3>
          <p>
            Situação atual: <strong>{trackerStatus.status}</strong>
          </p>
          {trackerStatus.pullRequest ? (
            <p>
              Último PR: <a href={trackerStatus.pullRequest.url}>{trackerStatus.pullRequest.title}</a>
            </p>
          ) : null}
          {trackerStatus.updatedAt ? (
            <p>
              Atualizado em {new Date(trackerStatus.updatedAt).toLocaleString()}
            </p>
          ) : null}
        </section>
      ) : null}
      <div className="mcp-wizard__actions">
        <button
          type="button"
          className="mcp-wizard__button"
          onClick={() => void onRefreshStatus()}
          disabled={isTrackingStatus || !applyResult}
        >
          {isTrackingStatus ? 'Atualizando status…' : 'Atualizar status'}
        </button>
        <button
          type="button"
          className="mcp-wizard__button mcp-wizard__button--primary"
          onClick={() => void onRunSmoke()}
          disabled={isRunningSmoke || !applyResult || !runSmokeTests}
        >
          {isRunningSmoke ? 'Executando smoke…' : 'Executar smoke tests'}
        </button>
      </div>
      {smokeError ? (
        <p className="mcp-wizard__helper mcp-wizard__helper--error" role="alert">
          {smokeError}
        </p>
      ) : null}
      {smokeResult ? (
        <section className="mcp-wizard__summary">
          <h3>Smoke tests</h3>
          <p>
            Execução {smokeResult.runId}: <strong>{smokeResult.status}</strong>
          </p>
          <p>{smokeResult.summary}</p>
        </section>
      ) : null}
    </div>
  );
}
