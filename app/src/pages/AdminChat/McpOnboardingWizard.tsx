import { Fragment, useEffect, useMemo, useState } from 'react';
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
  fetchMcpOnboardingStatus,
  postConfigApply,
  postConfigMcpOnboard,
  postConfigPlan,
  postMcpSmokeRun,
} from '../../api';
import PlanSummary from './PlanSummary';
import PlanDiffViewer, { type PlanDiffItem } from '../../components/PlanDiffViewer';
import { FormErrorSummary, Input, Switch, TextArea } from '../../components/forms';
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
  runSmokeTests: boolean;
  qualityGates: string;
  validationNotes: string;
  applyNote: string;
}

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

const STEP_VALIDATION_FIELDS: Record<WizardStep, (values: WizardFormValues) => Path<WizardFormValues>[]> = {
  basic: () => ['agentId', 'repository', 'endpoint'],
  auth: (values) => (values.authMode === 'none' ? [] : ['secretName']),
  tools: (values) =>
    values.tools.flatMap((_, index) =>
      [`tools.${index}.name`, `tools.${index}.entryPoint`].map((field) => field as Path<WizardFormValues>),
    ),
  validation: () => [],
  verification: () => [],
};

const STEP_ERROR_PREFIXES: Record<WizardStep, string[]> = {
  basic: ['agentId', 'displayName', 'repository', 'endpoint', 'description', 'owner', 'tags', 'capabilities'],
  auth: ['authMode', 'secretName', 'authInstructions', 'authEnvironment'],
  tools: ['tools'],
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

export default function McpOnboardingWizard() {
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
      runSmokeTests: true,
      qualityGates: 'operacao,finops',
      validationNotes: '',
      applyNote: '',
    },
    mode: 'onBlur',
  });
  const { control, getValues, trigger } = formMethods;
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
  ]);

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

  const invalidateConnection = () => {
    setConnectionStatus('idle');
    setConnectionFeedback(null);
    setValidationDetails(null);
  };

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
    setConnectionStatus('idle');
    setConnectionFeedback(null);
    setValidationDetails(null);
    try {
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
    } catch (cause) {
      setConnectionStatus('error');
      setConnectionFeedback(extractErrorMessage(cause));
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
  const agentIdField = useMcpField<WizardFormValues>('agentId', {
    rules: { required: 'Informe o identificador do agente.' },
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

  return (
    <form
      className="mcp-wizard__form"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void onNext();
      }}
    >
      <StepErrorSummary step="basic" visible={showErrors} />
      <div className="mcp-wizard__grid">
        <div className="mcp-wizard__field">
          <Input
            {...agentIdField.inputProps}
            label="Identificador do agente"
            placeholder="Ex.: openai-gpt4o"
            required
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
        <button type="submit" className="mcp-wizard__button mcp-wizard__button--primary">
          Avançar para autenticação
        </button>
      </div>
    </form>
  );
}

interface AuthStepProps {
  onBack: () => void;
  onNext: () => void;
  showErrors: boolean;
}

function AuthStep({ onBack, onNext, showErrors }: AuthStepProps): JSX.Element {
  const { register, watch } = useMcpFormContext<WizardFormValues>();
  const authMode = watch('authMode');
  const secretField = useMcpField<WizardFormValues>('secretName', {
    rules: {
      validate: (value) => {
        if (authMode === 'none') {
          return true;
        }

        if (typeof value === 'string' && value.trim()) {
          return true;
        }

        return 'Informe o nome da credencial.';
      },
    },
  });
  const authEnvironmentField = useMcpField<WizardFormValues>('authEnvironment');
  const authInstructionsField = useMcpField<WizardFormValues>('authInstructions');

  return (
    <form
      className="mcp-wizard__form"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void onNext();
      }}
    >
      <StepErrorSummary step="auth" visible={showErrors} />
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
        <button type="submit" className="mcp-wizard__button mcp-wizard__button--primary">
          Avançar para tools
        </button>
      </div>
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
  showErrors,
}: ToolsStepProps): JSX.Element {
  const disableNext = isValidating || connectionStatus === 'error';

  return (
    <form
      className="mcp-wizard__form"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (connectionStatus === 'error') {
          return;
        }
        void onNext();
      }}
    >
      <StepErrorSummary step="tools" visible={showErrors} />
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
        <button type="submit" className="mcp-wizard__button mcp-wizard__button--primary" disabled={disableNext}>
          Ir para validação
        </button>
      </div>
      {connectionStatus === 'success' && connectionFeedback ? (
        <p className="mcp-wizard__helper" role="status">
          {connectionFeedback}
        </p>
      ) : null}
      {connectionStatus === 'error' && connectionFeedback ? (
        <p className="mcp-wizard__helper mcp-wizard__helper--error" role="alert">
          {connectionFeedback}
        </p>
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
  const nameField = useMcpField<WizardFormValues>(`tools.${index}.name`, {
    rules: { required: 'Informe o nome da tool.' },
  });
  const descriptionField = useMcpField<WizardFormValues>(`tools.${index}.description`);
  const entryPointField = useMcpField<WizardFormValues>(`tools.${index}.entryPoint`, {
    rules: { required: 'Informe o entry point da tool.' },
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
