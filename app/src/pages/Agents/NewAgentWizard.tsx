import { type FormEvent, type ReactNode, useCallback, useEffect, useId, useMemo, useState } from 'react';

import type {
  AdminPlanPullRequestSummary,
  AdminPlanSummary,
  ConfigPlan,
  ConfigPlanDiffSummary,
  ConfigPlanPreview,
  ConfigPlanRiskItem,
  ConfigPlanPayload,
  PlanExecutionPullRequest,
  ProviderSummary,
  ApplyPolicyPlanResponse,
} from '../../api';
import {
  ApiError,
  fetchProviders,
  postAgentPlanApply,
  postGovernedAgentPlan,
} from '../../api';
import PlanSummary from '../AdminChat/PlanSummary';
import PlanDiffViewer, { type PlanDiffItem } from '../../components/PlanDiffViewer';
import { NEW_AGENT_WIZARD_TEST_IDS } from '../testIds';
import { FormErrorSummary, Input, TextArea } from '../../components/forms';
import { McpFormProvider, useMcpForm } from '../../hooks/useMcpForm';
import ModalBase from '../../components/modals/ModalBase';
import ConfirmationModal from '../../components/modals/ConfirmationModal';

interface NewAgentWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onAgentCreated?: (slug: string) => void;
}

interface PendingPlan {
  id: string;
  plan: ConfigPlan;
  planPayload: ConfigPlanPayload;
  diffItems: PlanDiffItem[];
  patch: string;
}

interface PlanFormValues {
  slug: string;
  repository: string;
  manifest: string;
  servers: string[];
}

const DEFAULT_MANIFEST_TEMPLATE = `{
  "name": "<slug>",
  "title": "Nome exibido",
  "description": "Descreva o propósito do agent.",
  "capabilities": ["structured-output"],
  "model": {
    "provider": "openai",
    "name": "gpt-4o-mini"
  },
  "tools": []
}`;

const DEFAULT_REPOSITORY = 'agents-hub';
const DEFAULT_ACTOR = 'Console MCP';
const DEFAULT_ACTOR_EMAIL = 'agents@console.mcp';

function sanitizeSlug(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
}

function parseManifestInput(input: string): Record<string, unknown> {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error('Forneça o manifesto base em formato JSON.');
  }

  try {
    const parsed = JSON.parse(trimmed);
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('Manifesto base inválido. Forneça JSON válido.');
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    throw new Error('Manifesto base inválido. Forneça JSON válido.');
  }
}

function mapPlanDiffItems(diffs: ConfigPlanDiffSummary[]): PlanDiffItem[] {
  if (!Array.isArray(diffs) || diffs.length === 0) {
    throw new Error('O plano não retornou diffs para o novo agent.');
  }

  return diffs.map((diff, index) => {
    const diffContent = typeof diff.diff === 'string' ? diff.diff : '';
    if (!diffContent.trim()) {
      throw new Error(`Plano sem diff detalhado para ${diff.path}.`);
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
    .filter((chunk) => chunk.length > 0)
    .join('\n');

  if (!combined) {
    throw new Error('Plano não forneceu diff aplicável.');
  }

  return `${combined}\n`;
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
    author: DEFAULT_ACTOR,
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

function generatePlanId(): string {
  return `agent-plan-${Math.random().toString(36).slice(2, 10)}`;
}

export default function NewAgentWizard({ isOpen, onClose, onAgentCreated }: NewAgentWizardProps) {
  const headingId = useId();

  const planForm = useMcpForm<PlanFormValues>({
    defaultValues: {
      slug: '',
      repository: DEFAULT_REPOSITORY,
      manifest: DEFAULT_MANIFEST_TEMPLATE,
      servers: [],
    },
  });
  const {
    register,
    formState,
    reset: resetPlanForm,
    setError: setPlanFormError,
    clearErrors: clearPlanFormErrors,
    setValue: setPlanFormValue,
    getValues: getPlanFormValues,
  } = planForm;
  const slugErrorMessage =
    typeof formState.errors.slug?.message === 'string' ? formState.errors.slug?.message : undefined;
  const repositoryErrorMessage =
    typeof formState.errors.repository?.message === 'string'
      ? formState.errors.repository?.message
      : undefined;
  const manifestErrorMessage =
    typeof formState.errors.manifest?.message === 'string'
      ? formState.errors.manifest?.message
      : undefined;
  const serversErrorMessage =
    typeof formState.errors.servers?.message === 'string'
      ? formState.errors.servers?.message
      : undefined;
  const serversErrorId = serversErrorMessage ? `${headingId}-servers-error` : undefined;
  const serverValidationRules = useMemo(
    () => ({
      validate: (value: unknown) => {
        if (Array.isArray(value) && value.filter(Boolean).length > 0) {
          return true;
        }
        return 'Selecione pelo menos um servidor MCP.';
      },
    }),
    [],
  );

  const [providers, setProviders] = useState<ProviderSummary[]>([]);
  const [providersLoading, setProvidersLoading] = useState(false);
  const [providersError, setProvidersError] = useState<string | null>(null);

  const [isPlanning, setPlanning] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);
  const [planMessage, setPlanMessage] = useState<string | null>(null);
  const [planSummary, setPlanSummary] = useState<AdminPlanSummary | null>(null);
  const [pendingPlan, setPendingPlan] = useState<PendingPlan | null>(null);
  const [risks, setRisks] = useState<ConfigPlanRiskItem[]>([]);

  const [commitMessage, setCommitMessage] = useState('');
  const [isApplying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [applyStatusMessage, setApplyStatusMessage] = useState<string | null>(null);
  const [applyResponse, setApplyResponse] = useState<ApplyPolicyPlanResponse | null>(null);
  const [isApplyConfirmationOpen, setApplyConfirmationOpen] = useState(false);

  const sortedProviders = useMemo(() => {
    return [...providers].sort((a, b) => a.name.localeCompare(b.name));
  }, [providers]);

  const resetWizard = useCallback(() => {
    resetPlanForm({
      slug: '',
      repository: DEFAULT_REPOSITORY,
      manifest: DEFAULT_MANIFEST_TEMPLATE,
      servers: [],
    });
    setPlanning(false);
    setPlanError(null);
    setPlanMessage(null);
    setPlanSummary(null);
    setPendingPlan(null);
    setRisks([]);
    setCommitMessage('');
    setApplying(false);
    setApplyError(null);
    setApplyStatusMessage(null);
    setApplyResponse(null);
    setApplyConfirmationOpen(false);
  }, [resetPlanForm]);

  const handleClose = useCallback(() => {
    resetWizard();
    onClose();
  }, [onClose, resetWizard]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const controller = new AbortController();
    setProvidersLoading(true);
    setProvidersError(null);

    fetchProviders(controller.signal)
      .then((list) => {
        setProviders(list);
      })
      .catch((error) => {
        if (controller.signal.aborted) {
          return;
        }
        const message = extractErrorMessage(error, 'Falha ao carregar servidores MCP.');
        setProvidersError(message);
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setProvidersLoading(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [isOpen]);

  const handleGeneratePlan = useCallback(
    async (values: PlanFormValues) => {
      const normalizedSlug = sanitizeSlug(values.slug);
      const trimmedRepository = values.repository.trim();

      let manifestRecord: Record<string, unknown>;
      try {
        manifestRecord = parseManifestInput(values.manifest);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Manifesto base inválido. Forneça JSON válido.';
        setPlanFormError('manifest', { type: 'manual', message });
        setPlanError(message);
        setPlanMessage(null);
        return;
      }

      if (typeof manifestRecord.name !== 'string' || !manifestRecord.name.trim()) {
        manifestRecord.name = normalizedSlug;
      }

      const servers = Array.isArray(values.servers) ? values.servers.filter(Boolean) : [];
      if (servers.length === 0) {
        const message = 'Selecione pelo menos um servidor MCP.';
        setPlanFormError('servers', { type: 'manual', message });
        setPlanError(message);
        setPlanMessage(null);
        return;
      }

      setPlanFormValue('slug', normalizedSlug, { shouldDirty: true, shouldTouch: true });
      setPlanFormValue('repository', trimmedRepository, { shouldDirty: true, shouldTouch: true });
      clearPlanFormErrors(['servers']);

      setPlanning(true);
      setPlanError(null);
      setPlanMessage('Gerando plano governado para o novo agent…');
      setPlanSummary(null);
      setPendingPlan(null);
      setRisks([]);
      setApplyResponse(null);
      setApplyStatusMessage(null);

      try {
        const response = await postGovernedAgentPlan({
          agent: {
            slug: normalizedSlug,
            repository: trimmedRepository,
            manifest: manifestRecord,
          },
          manifestSource: values.manifest,
          mcpServers: servers,
        });
        const planId = generatePlanId();
        const diffItems = mapPlanDiffItems(response.plan.diffs);
        const patch = buildPatchFromDiffs(diffItems);

        setPendingPlan({
          id: planId,
          plan: response.plan,
          planPayload: response.planPayload,
          diffItems,
          patch,
        });
        setPlanSummary(buildPlanSummary(planId, response.plan, response.preview ?? null));
        setPlanMessage('Plano gerado. Revise as alterações antes de aplicar.');
        setRisks(response.plan.risks ?? []);
        setCommitMessage(
          response.preview?.commitMessage?.trim() || `feat: adicionar agent ${normalizedSlug}`,
        );
      } catch (error) {
        console.error('Falha ao gerar plano governado do agent', error);
        const message = extractErrorMessage(error, 'Falha ao gerar plano governado do agent.');
        setPlanError(message);
        setPlanMessage(null);
      } finally {
        setPlanning(false);
      }
    },
    [clearPlanFormErrors, setPlanFormError, setPlanFormValue],
  );

  const submitPlanForm = useMemo(
    () =>
      planForm.handleSubmit(handleGeneratePlan, () => {
        setPlanError(null);
        setPlanMessage(null);
      }),
    [handleGeneratePlan, planForm],
  );

  const hasRisks = risks.length > 0;

  const planActions: ReactNode = useMemo(() => {
    if (!pendingPlan) {
      return null;
    }
    return (
      <label className="mcp-wizard__checkbox">
        <input type="checkbox" checked readOnly />
        Diffs prontos para aplicar
      </label>
    );
  }, [pendingPlan]);

  const applyConfirmationContent = useMemo(() => {
    if (!pendingPlan) {
      return null;
    }
    return {
      title: 'Aplicar plano governado',
      description: pendingPlan.plan.summary,
      confirmLabel: 'Armar aplicação',
      confirmArmedLabel: 'Aplicar agora',
    } as const;
  }, [pendingPlan]);

  const requestApplyPlan = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!pendingPlan) {
        setApplyError('Gere um plano antes de aplicar as alterações.');
        return;
      }
      setApplyError(null);
      setApplyStatusMessage(null);
      setApplyConfirmationOpen(true);
    },
    [pendingPlan],
  );

  const closeApplyConfirmation = useCallback(() => {
    setApplyConfirmationOpen(false);
  }, []);

  const executeApplyPlan = useCallback(async () => {
    if (!pendingPlan) {
      setApplyError('Gere um plano antes de aplicar as alterações.');
      setApplyConfirmationOpen(false);
      return;
    }

    const patch = pendingPlan.patch.trim();
    if (!patch) {
      setApplyError('O plano não forneceu diff aplicável.');
      setApplyConfirmationOpen(false);
      return;
    }

    const slugValue = getPlanFormValues('slug');
    const normalizedSlug = sanitizeSlug(slugValue);
    if (!normalizedSlug) {
      setPlanFormError('slug', { type: 'manual', message: 'Informe o identificador do agent.' });
      try {
        planForm.setFocus('slug');
      } catch (error) {
        console.warn('Não foi possível focar o campo de slug do agent.', error);
      }
      setApplyConfirmationOpen(false);
      return;
    }

    const normalizedCommit = commitMessage.trim() || `feat: adicionar agent ${normalizedSlug}`;

    setApplyConfirmationOpen(false);
    setApplying(true);
    setApplyError(null);
    setApplyStatusMessage(null);

    try {
      const response = await postAgentPlanApply({
        planId: pendingPlan.id,
        plan: pendingPlan.planPayload,
        patch,
        actor: DEFAULT_ACTOR,
        actorEmail: DEFAULT_ACTOR_EMAIL,
        commitMessage: normalizedCommit,
      });

      setApplyResponse(response);
      setPlanSummary((current) => {
        const base = current ?? buildPlanSummary(pendingPlan.id, pendingPlan.plan, null);
        return {
          ...base,
          status: 'applied',
          branch: response.branch ?? base.branch ?? null,
          baseBranch: response.baseBranch ?? base.baseBranch ?? null,
          pullRequest: mapExecutionPullRequest(response.pullRequest ?? null) ?? base.pullRequest ?? null,
        };
      });
      setPendingPlan(null);

      const details: string[] = [response.message];
      if (response.branch) {
        details.push(`Branch: ${response.branch}`);
      }
      if (response.pullRequest?.url) {
        details.push(`PR: ${response.pullRequest.url}`);
      }
      setApplyStatusMessage(details.join(' '));

      onAgentCreated?.(normalizedSlug);
    } catch (error) {
      console.error('Falha ao aplicar plano governado do agent', error);
      const message = extractErrorMessage(error, 'Falha ao aplicar o plano gerado.');
      setApplyError(message);
    } finally {
      setApplying(false);
    }
  }, [commitMessage, getPlanFormValues, onAgentCreated, pendingPlan, planForm, setPlanFormError]);

  useEffect(() => {
    if (!isOpen) {
      setApplyConfirmationOpen(false);
    }
  }, [isOpen]);

  return (
    <>
      <ModalBase
        isOpen={isOpen}
        title="Novo agent governado"
        description="Preencha os dados básicos, cole o manifesto base e selecione os servidores MCP envolvidos."
        onClose={handleClose}
        closeOnBackdrop={false}
        size="xl"
        dialogClassName="agent-wizard__dialog"
        contentClassName="agent-wizard__content"
      >
        <div className="agent-wizard" data-testid={NEW_AGENT_WIZARD_TEST_IDS.root}>
          <div className="agent-wizard__review" data-testid={NEW_AGENT_WIZARD_TEST_IDS.panel}>
            <McpFormProvider {...planForm}>
              <form
                onSubmit={submitPlanForm}
                className="mcp-wizard"
                data-testid={NEW_AGENT_WIZARD_TEST_IDS.planForm}
              >
                <FormErrorSummary />
                <fieldset className="mcp-wizard__fields" disabled={isPlanning}>
                  <legend>Dados do agent</legend>
                  <div className="mcp-wizard__field">
                    <Input
                      label="Identificador do agent"
                      placeholder="Ex.: sentinel-watcher"
                      autoComplete="off"
                      required
                      error={slugErrorMessage}
                      helperText="Use letras minúsculas, números e hífens."
                      data-autofocus="true"
                      {...register('slug', {
                        required: 'Informe o identificador do agent.',
                        setValueAs: (value) => sanitizeSlug(String(value ?? '')),
                        validate: (value) =>
                          value && String(value).trim().length > 0
                            ? true
                            : 'Informe o identificador do agent.',
                      })}
                    />
                  </div>
                  <div className="mcp-wizard__field">
                    <Input
                      label="Repositório de destino"
                      placeholder="Ex.: agents-hub"
                      autoComplete="off"
                      required
                      error={repositoryErrorMessage}
                      {...register('repository', {
                        required: 'Informe o repositório de destino.',
                        setValueAs: (value) => String(value ?? '').trim(),
                      })}
                    />
                  </div>
                  <div className="mcp-wizard__field">
                    <TextArea
                      label="Manifesto base (JSON)"
                      rows={8}
                      spellCheck={false}
                      required
                      helperText="Inclua as chaves principais do agent (name, title, capabilities, model, tools...)."
                      error={manifestErrorMessage}
                      {...register('manifest', {
                        required: 'Forneça o manifesto base em JSON.',
                        validate: (value) => {
                          try {
                            parseManifestInput(value);
                            return true;
                          } catch (error) {
                            return error instanceof Error
                              ? error.message
                              : 'Manifesto base inválido. Forneça JSON válido.';
                          }
                        },
                      })}
                    />
                  </div>
                  <div className="mcp-wizard__field">
                    <fieldset className="mcp-wizard__fieldset">
                      <legend>Servidores MCP envolvidos</legend>
                      {providersLoading ? (
                        <p className="mcp-wizard__helper">Carregando servidores MCP…</p>
                      ) : providersError ? (
                        <p className="mcp-wizard__helper mcp-wizard__helper--error" role="alert">
                          {providersError}
                        </p>
                      ) : sortedProviders.length > 0 ? (
                        <ul className="mcp-wizard__options">
                          {sortedProviders.map((server) => (
                            <li key={server.id}>
                              <label className="mcp-wizard__checkbox">
                                <input
                                  type="checkbox"
                                  value={server.id}
                                  aria-describedby={serversErrorId}
                                  aria-invalid={serversErrorMessage ? 'true' : 'false'}
                                  {...register('servers', serverValidationRules)}
                                />
                                <span>
                                  <strong>{server.name}</strong>
                                  {server.description ? <span> — {server.description}</span> : null}
                                </span>
                              </label>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mcp-wizard__helper">Nenhum servidor MCP cadastrado.</p>
                      )}
                      {serversErrorMessage ? (
                        <p
                          id={serversErrorId}
                          className="mcp-wizard__helper mcp-wizard__helper--error"
                          role="alert"
                        >
                          {serversErrorMessage}
                        </p>
                      ) : null}
                    </fieldset>
                  </div>
                </fieldset>
                <button
                  type="submit"
                  className="mcp-wizard__button mcp-wizard__button--primary"
                  disabled={isPlanning}
                  data-testid={NEW_AGENT_WIZARD_TEST_IDS.generatePlan}
                >
                  {isPlanning ? 'Gerando plano…' : 'Gerar plano governado'}
                </button>
                {planError ? (
                  <p className="mcp-wizard__helper mcp-wizard__helper--error" role="alert">
                    {planError}
                  </p>
                ) : null}
                {planMessage ? (
                  <p className="mcp-wizard__helper" role="status">
                    {planMessage}
                  </p>
                ) : null}
              </form>
            </McpFormProvider>

            <PlanSummary
              plan={planSummary}
              isLoading={isPlanning}
              actions={planActions}
              testId="new-agent-plan-summary"
            />
            <PlanDiffViewer
              diffs={pendingPlan?.diffItems ?? []}
              emptyMessage="Gere um plano para visualizar os arquivos propostos."
              testId="new-agent-plan-diffs"
              itemTestIdPrefix="new-agent-diff"
            />

            {hasRisks ? (
              <section className="mcp-wizard mcp-wizard__risks">
                <h3>Riscos identificados</h3>
                <ul>
                  {risks.map((risk) => (
                    <li key={risk.title}>
                      <strong>{risk.title}</strong>
                      <span>
                        Impacto: {risk.impact} · Mitigação: {risk.mitigation}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            <form
              onSubmit={requestApplyPlan}
              className="mcp-wizard"
              data-testid={NEW_AGENT_WIZARD_TEST_IDS.applyForm}
            >
              <fieldset className="mcp-wizard__fields" disabled={isApplying || !pendingPlan}>
                <legend>Aplicar plano</legend>
                <div className="mcp-wizard__field">
                  <label htmlFor="new-agent-commit">Mensagem do commit</label>
                  <input
                    id="new-agent-commit"
                    value={commitMessage}
                    onChange={(event) => setCommitMessage(event.target.value)}
                    placeholder="feat: adicionar agent <slug>"
                  />
                </div>
              </fieldset>
              <button
                type="submit"
                className="mcp-wizard__button mcp-wizard__button--primary"
                disabled={isApplying || !pendingPlan}
                data-testid={NEW_AGENT_WIZARD_TEST_IDS.applyPlan}
              >
                {isApplying ? 'Aplicando plano…' : 'Aplicar plano'}
              </button>
              {applyError ? (
                <p className="mcp-wizard__helper mcp-wizard__helper--error" role="alert">
                  {applyError}
                </p>
              ) : null}
              {applyStatusMessage ? (
                <p className="mcp-wizard__helper" role="status">
                  {applyStatusMessage}
                </p>
              ) : null}
              {applyResponse?.pullRequest?.url ? (
                <p className="mcp-wizard__helper">
                  <a href={applyResponse.pullRequest.url} target="_blank" rel="noreferrer">
                    Abrir pull request aprovado
                  </a>
                </p>
              ) : null}
            </form>
          </div>
        </div>
      </ModalBase>
      <ConfirmationModal
        isOpen={isApplyConfirmationOpen}
        title={applyConfirmationContent?.title ?? 'Aplicar plano governado'}
        description={applyConfirmationContent?.description}
        confirmLabel={applyConfirmationContent?.confirmLabel ?? 'Confirmar aplicação'}
        confirmArmedLabel={applyConfirmationContent?.confirmArmedLabel ?? 'Aplicar agora'}
        onConfirm={executeApplyPlan}
        onCancel={closeApplyConfirmation}
        isLoading={isApplying}
        confirmHint="Clique uma vez para armar a aplicação."
        confirmArmedHint="Clique novamente para aplicar o plano."
      />
    </>
  );
}
