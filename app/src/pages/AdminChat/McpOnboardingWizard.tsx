import { FormEvent, Fragment, useMemo, useState } from 'react';

import type {
  AdminPlanDiff,
  AdminPlanSummary,
  AdminRiskItem,
  ConfigOnboardRequest,
  ConfigOnboardResponse,
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

export default function McpOnboardingWizard() {
  const [activeStep, setActiveStep] = useState<WizardStep>('basic');
  const [agentId, setAgentId] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [repository, setRepository] = useState('');
  const [description, setDescription] = useState('');
  const [owner, setOwner] = useState('');
  const [tags, setTags] = useState('');
  const [capabilities, setCapabilities] = useState('');

  const [authMode, setAuthMode] = useState<AuthenticationMode>('api_key');
  const [secretName, setSecretName] = useState('');
  const [authInstructions, setAuthInstructions] = useState('');
  const [authEnvironment, setAuthEnvironment] = useState('');

  const [tools, setTools] = useState<ToolDraft[]>([
    { name: '', description: '', entryPoint: '' },
  ]);

  const [runSmokeTests, setRunSmokeTests] = useState(true);
  const [qualityGates, setQualityGates] = useState('operacao,finops');
  const [validationNotes, setValidationNotes] = useState('');
  const [applyNote, setApplyNote] = useState('');

  const [isPlanning, setPlanning] = useState(false);
  const [isApplying, setApplying] = useState(false);
  const [isRunningSmoke, setRunningSmoke] = useState(false);
  const [isTrackingStatus, setTrackingStatus] = useState(false);

  const [plan, setPlan] = useState<AdminPlanSummary | null>(null);
  const [diffs, setDiffs] = useState<AdminPlanDiff[]>([]);
  const [risks, setRisks] = useState<AdminRiskItem[]>([]);
  const [planMessage, setPlanMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
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

  const handleStepChange = (nextStep: WizardStep) => {
    const currentIndex = stepIndex;
    const nextIndex = STEP_DEFINITIONS.findIndex((step) => step.id === nextStep);
    if (nextIndex <= currentIndex) {
      setActiveStep(nextStep);
    }
  };

  const handleNextStep = (event: FormEvent<HTMLFormElement>, next: WizardStep) => {
    event.preventDefault();
    setActiveStep(next);
  };

  const handleToolChange = (index: number, field: keyof ToolDraft, value: string) => {
    setTools((current) => {
      const next = current.slice();
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const handleAddTool = () => {
    setTools((current) => [...current, { name: '', description: '', entryPoint: '' }]);
  };

  const handleRemoveTool = (index: number) => {
    setTools((current) => {
      if (current.length === 1) {
        return current;
      }
      return current.filter((_, itemIndex) => itemIndex !== index);
    });
  };

  const buildPayload = (): ConfigOnboardRequest => {
    const normalizedTools = tools
      .map((tool) => ({
        name: tool.name.trim(),
        description: tool.description.trim(),
        entryPoint: tool.entryPoint.trim(),
      }))
      .filter((tool) => tool.name.length > 0);

    return {
      agent: {
        id: agentId.trim(),
        name: (displayName || agentId).trim(),
        repository: repository.trim(),
        description: description.trim() || null,
        owner: owner.trim() || null,
        tags: splitValues(tags),
        capabilities: splitValues(capabilities),
      },
      authentication: {
        mode: authMode,
        secretName: secretName.trim() || null,
        instructions: authInstructions.trim() || null,
        environment: authEnvironment.trim() || null,
      },
      tools: normalizedTools,
      validation: {
        runSmokeTests,
        qualityGates: splitValues(qualityGates),
        notes: validationNotes.trim() || null,
      },
    };
  };

  const handleGeneratePlan = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPlanning(true);
    setError(null);
    setPlanMessage(null);
    try {
      const payload = buildPayload();
      if (!payload.agent.id || !payload.agent.repository) {
        throw new Error('Informe o identificador e o repositório do agente.');
      }
      const response: ConfigOnboardResponse = await postConfigMcpOnboard(payload);
      setPlan(response.plan);
      setDiffs(response.diffs);
      setRisks(response.risks);
      setPlanMessage(response.message);
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
      const summary = await postConfigPlan({ intent: 'summarize', threadId: plan.threadId });
      setPlan(summary.plan);
      setDiffs(summary.diffs);
      setRisks(summary.risks);
      const response = await postConfigApply({
        intent: 'apply',
        threadId: summary.plan.threadId,
        planId: summary.plan.id,
        note: applyNote.trim() ? applyNote.trim() : null,
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
        providerId: agentId.trim() || plan.scope,
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
        return (
          <form className="mcp-wizard__form" onSubmit={(event) => handleNextStep(event, 'auth')}>
            <div className="mcp-wizard__grid">
              <div className="mcp-wizard__field">
                <label htmlFor="mcp-basic-id">Identificador do agente</label>
                <input
                  id="mcp-basic-id"
                  value={agentId}
                  onChange={(event) => setAgentId(event.target.value)}
                  placeholder="Ex.: openai-gpt4o"
                  required
                />
              </div>
              <div className="mcp-wizard__field">
                <label htmlFor="mcp-basic-name">Nome exibido</label>
                <input
                  id="mcp-basic-name"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  placeholder="Ex.: OpenAI GPT-4o"
                />
              </div>
            </div>
            <div className="mcp-wizard__field">
              <label htmlFor="mcp-basic-repo">Repositório Git</label>
              <input
                id="mcp-basic-repo"
                value={repository}
                onChange={(event) => setRepository(event.target.value)}
                placeholder="agents/openai-gpt4o"
                required
              />
            </div>
            <div className="mcp-wizard__grid">
              <div className="mcp-wizard__field">
                <label htmlFor="mcp-basic-owner">Owner responsável</label>
                <input
                  id="mcp-basic-owner"
                  value={owner}
                  onChange={(event) => setOwner(event.target.value)}
                  placeholder="@squad-mcp"
                />
              </div>
              <div className="mcp-wizard__field">
                <label htmlFor="mcp-basic-tags">Tags (separadas por vírgula)</label>
                <input
                  id="mcp-basic-tags"
                  value={tags}
                  onChange={(event) => setTags(event.target.value)}
                  placeholder="openai,prod,priority"
                />
              </div>
            </div>
            <div className="mcp-wizard__field">
              <label htmlFor="mcp-basic-capabilities">Capacidades (separadas por vírgula)</label>
              <input
                id="mcp-basic-capabilities"
                value={capabilities}
                onChange={(event) => setCapabilities(event.target.value)}
                placeholder="chat,planning"
              />
            </div>
            <div className="mcp-wizard__field">
              <label htmlFor="mcp-basic-description">Descrição</label>
              <textarea
                id="mcp-basic-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={3}
                placeholder="Contextualize o escopo funcional e restrições do MCP"
              />
            </div>
            <div className="mcp-wizard__actions">
              <button type="submit" className="mcp-wizard__button mcp-wizard__button--primary">
                Avançar para autenticação
              </button>
            </div>
          </form>
        );
      case 'auth':
        return (
          <form className="mcp-wizard__form" onSubmit={(event) => handleNextStep(event, 'tools')}>
            <fieldset className="mcp-wizard__fieldset">
              <legend>Modo de autenticação</legend>
              <label className="mcp-wizard__radio">
                <input
                  type="radio"
                  name="mcp-auth-mode"
                  value="api_key"
                  checked={authMode === 'api_key'}
                  onChange={() => setAuthMode('api_key')}
                />
                API Key
              </label>
              <label className="mcp-wizard__radio">
                <input
                  type="radio"
                  name="mcp-auth-mode"
                  value="oauth_client"
                  checked={authMode === 'oauth_client'}
                  onChange={() => setAuthMode('oauth_client')}
                />
                OAuth Client
              </label>
              <label className="mcp-wizard__radio">
                <input
                  type="radio"
                  name="mcp-auth-mode"
                  value="none"
                  checked={authMode === 'none'}
                  onChange={() => setAuthMode('none')}
                />
                Sem autenticação
              </label>
            </fieldset>
            <div className="mcp-wizard__field">
              <label htmlFor="mcp-auth-secret">Nome da credencial</label>
              <input
                id="mcp-auth-secret"
                value={secretName}
                onChange={(event) => setSecretName(event.target.value)}
                placeholder="OPENAI_API_KEY"
                disabled={authMode === 'none'}
              />
            </div>
            <div className="mcp-wizard__field">
              <label htmlFor="mcp-auth-env">Ambiente/namespace</label>
              <input
                id="mcp-auth-env"
                value={authEnvironment}
                onChange={(event) => setAuthEnvironment(event.target.value)}
                placeholder="production"
              />
            </div>
            <div className="mcp-wizard__field">
              <label htmlFor="mcp-auth-instructions">Instruções para provisionamento</label>
              <textarea
                id="mcp-auth-instructions"
                value={authInstructions}
                onChange={(event) => setAuthInstructions(event.target.value)}
                rows={3}
                placeholder="Ex.: gerar chave no vault e anexar ao secret manager"
              />
            </div>
            <div className="mcp-wizard__actions">
              <button type="button" className="mcp-wizard__button" onClick={() => setActiveStep('basic')}>
                Voltar
              </button>
              <button type="submit" className="mcp-wizard__button mcp-wizard__button--primary">
                Avançar para tools
              </button>
            </div>
          </form>
        );
      case 'tools':
        return (
          <form className="mcp-wizard__form" onSubmit={(event) => handleNextStep(event, 'validation')}>
            <div className="mcp-wizard__tools">
              {tools.map((tool, index) => (
                <Fragment key={`tool-${index}`}>
                  <h3 className="mcp-wizard__tools-title">Tool {index + 1}</h3>
                  <div className="mcp-wizard__field">
                    <label htmlFor={`mcp-tool-name-${index}`}>Nome da tool {index + 1}</label>
                    <input
                      id={`mcp-tool-name-${index}`}
                      value={tool.name}
                      onChange={(event) => handleToolChange(index, 'name', event.target.value)}
                      placeholder="catalog.search"
                    />
                  </div>
                  <div className="mcp-wizard__field">
                    <label htmlFor={`mcp-tool-description-${index}`}>Descrição da tool {index + 1}</label>
                    <textarea
                      id={`mcp-tool-description-${index}`}
                      value={tool.description}
                      onChange={(event) => handleToolChange(index, 'description', event.target.value)}
                      rows={2}
                      placeholder="Busca recursos no catálogo interno"
                    />
                  </div>
                  <div className="mcp-wizard__field">
                    <label htmlFor={`mcp-tool-entry-${index}`}>Entry point da tool {index + 1}</label>
                    <input
                      id={`mcp-tool-entry-${index}`}
                      value={tool.entryPoint}
                      onChange={(event) => handleToolChange(index, 'entryPoint', event.target.value)}
                      placeholder="catalog/search.py"
                    />
                  </div>
                  <div className="mcp-wizard__tools-actions">
                    <button type="button" onClick={() => handleRemoveTool(index)} className="mcp-wizard__button">
                      Remover tool
                    </button>
                  </div>
                </Fragment>
              ))}
              <button type="button" className="mcp-wizard__button" onClick={handleAddTool}>
                Adicionar tool
              </button>
            </div>
            <div className="mcp-wizard__actions">
              <button type="button" className="mcp-wizard__button" onClick={() => setActiveStep('auth')}>
                Voltar
              </button>
              <button type="submit" className="mcp-wizard__button mcp-wizard__button--primary">
                Ir para validação
              </button>
            </div>
          </form>
        );
      case 'validation':
        return (
          <div className="mcp-wizard__form">
            <form onSubmit={handleGeneratePlan} className="mcp-wizard__generate">
              <button
                type="submit"
                className="mcp-wizard__button mcp-wizard__button--primary"
                disabled={isPlanning}
              >
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
            <PlanSummary plan={plan} isLoading={isPlanning} />
            <PlanDiffViewer diffs={diffItems} />
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
            <form onSubmit={handleApply} className="mcp-wizard__apply">
              <div className="mcp-wizard__field">
                <label htmlFor="mcp-validation-notes">Checklist/observações adicionais</label>
                <textarea
                  id="mcp-validation-notes"
                  value={validationNotes}
                  onChange={(event) => setValidationNotes(event.target.value)}
                  rows={3}
                  placeholder="Checklist de validação manual, owners ou métricas relevantes"
                />
              </div>
              <div className="mcp-wizard__field">
                <label htmlFor="mcp-validation-gates">Quality gates (separados por vírgula)</label>
                <input
                  id="mcp-validation-gates"
                  value={qualityGates}
                  onChange={(event) => setQualityGates(event.target.value)}
                />
              </div>
              <label className="mcp-wizard__checkbox">
                <input
                  type="checkbox"
                  checked={runSmokeTests}
                  onChange={(event) => setRunSmokeTests(event.target.checked)}
                />
                Agendar smoke tests após aplicação
              </label>
              <div className="mcp-wizard__field">
                <label htmlFor="mcp-apply-note">Nota para aplicação</label>
                <textarea
                  id="mcp-apply-note"
                  value={applyNote}
                  onChange={(event) => setApplyNote(event.target.value)}
                  rows={3}
                  placeholder="Contextualize a aplicação do plano"
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
                <button type="button" className="mcp-wizard__button" onClick={() => setActiveStep('tools')}>
                  Voltar
                </button>
                <button
                  type="submit"
                  className="mcp-wizard__button mcp-wizard__button--primary"
                  disabled={isApplying || !plan}
                >
                  Confirmar e aplicar plano
                </button>
              </div>
            </form>
          </div>
        );
      case 'verification':
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
                onClick={handleRefreshStatus}
                disabled={isTrackingStatus || !applyResult}
              >
                {isTrackingStatus ? 'Atualizando status…' : 'Atualizar status'}
              </button>
              <button
                type="button"
                className="mcp-wizard__button mcp-wizard__button--primary"
                onClick={handleRunSmoke}
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
      default:
        return null;
    }
  };

  return (
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
  );
}
