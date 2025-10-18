import {
  type ChangeEvent,
  type FormEvent,
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
  const panelRef = useRef<HTMLElement | null>(null);

  const [agentSlug, setAgentSlug] = useState('');
  const [agentSlugError, setAgentSlugError] = useState<string | null>(null);
  const [repository, setRepository] = useState(DEFAULT_REPOSITORY);
  const [repositoryError, setRepositoryError] = useState<string | null>(null);
  const [manifestInput, setManifestInput] = useState(DEFAULT_MANIFEST_TEMPLATE);
  const [manifestError, setManifestError] = useState<string | null>(null);
  const [selectedServers, setSelectedServers] = useState<string[]>([]);
  const [selectedServersError, setSelectedServersError] = useState<string | null>(null);

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

  const sortedProviders = useMemo(() => {
    return [...providers].sort((a, b) => a.name.localeCompare(b.name));
  }, [providers]);

  const resetWizard = useCallback(() => {
    setAgentSlug('');
    setAgentSlugError(null);
    setRepository(DEFAULT_REPOSITORY);
    setRepositoryError(null);
    setManifestInput(DEFAULT_MANIFEST_TEMPLATE);
    setManifestError(null);
    setSelectedServers([]);
    setSelectedServersError(null);
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
  }, []);

  const handleClose = useCallback(() => {
    resetWizard();
    onClose();
  }, [onClose, resetWizard]);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const frame = window.requestAnimationFrame(() => {
      const focusable = panelRef.current?.querySelector<HTMLElement>(
        'input:not([type="hidden"]):not([disabled]), textarea:not([disabled])',
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
      window.cancelAnimationFrame(frame);
      document.removeEventListener('keydown', handleKeydown);
    };
  }, [handleClose, isOpen]);

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

  const handleBackdropClick = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      if (event.target === event.currentTarget) {
        handleClose();
      }
    },
    [handleClose],
  );

  const handleSlugChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const value = sanitizeSlug(event.target.value);
    setAgentSlug(value);
    if (agentSlugError) {
      setAgentSlugError(null);
    }
  }, [agentSlugError]);

  const handleRepositoryChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setRepository(event.target.value);
    if (repositoryError) {
      setRepositoryError(null);
    }
  }, [repositoryError]);

  const handleManifestChange = useCallback((event: ChangeEvent<HTMLTextAreaElement>) => {
    setManifestInput(event.target.value);
    if (manifestError) {
      setManifestError(null);
    }
  }, [manifestError]);

  const handleToggleServer = useCallback((serverId: string) => {
    setSelectedServers((current) => {
      if (current.includes(serverId)) {
        return current.filter((id) => id !== serverId);
      }
      return [...current, serverId];
    });
    setSelectedServersError(null);
  }, []);

  const handleGeneratePlan = useCallback(async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const normalizedSlug = sanitizeSlug(agentSlug);
    if (!normalizedSlug) {
      setAgentSlugError('Informe o identificador do agent.');
      return;
    }

    if (!repository.trim()) {
      setRepositoryError('Informe o repositório de destino.');
      return;
    }

    let manifest: Record<string, unknown>;
    try {
      manifest = parseManifestInput(manifestInput);
    } catch (error) {
      setManifestError(error instanceof Error ? error.message : 'Manifesto base inválido.');
      return;
    }

    const manifestRecord: Record<string, unknown> = { ...manifest };
    const currentName = manifestRecord['name'];
    if (typeof currentName !== 'string' || !currentName.trim()) {
      manifestRecord['name'] = normalizedSlug;
    }

    if (!Array.isArray(selectedServers) || selectedServers.length === 0) {
      setSelectedServersError('Selecione pelo menos um servidor MCP.');
      return;
    }

    setPlanning(true);
    setPlanError(null);
    setPlanMessage('Gerando plano governado para o novo agent…');
    setPlanSummary(null);
    setPendingPlan(null);
    setRisks([]);
    setApplyResponse(null);
    setApplyStatusMessage(null);

    try {
      const requestPayload = {
        agent: {
          slug: normalizedSlug,
          repository: repository.trim(),
          manifest: manifestRecord,
        },
        manifestSource: manifestInput,
        mcpServers: selectedServers,
      } as const;

      const response = await postGovernedAgentPlan(requestPayload);
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
  }, [agentSlug, manifestInput, repository, selectedServers]);

  const handleApplyPlan = useCallback(async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

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
      setAgentSlugError('Informe o identificador do agent.');
      return;
    }

    const normalizedCommit = commitMessage.trim() || `feat: adicionar agent ${normalizedSlug}`;

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
          pullRequest: mapExecutionPullRequest(response.pullRequest) ?? base.pullRequest ?? null,
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
  }, [agentSlug, commitMessage, onAgentCreated, pendingPlan]);

  if (!isOpen) {
    return null;
  }

  const hasRisks = risks.length > 0;

  const actions: ReactNode = useMemo(() => {
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

  return (
    <div className="agent-wizard" role="presentation" onClick={handleBackdropClick}>
      <section
        className="agent-wizard__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        ref={panelRef}
      >
        <header className="mcp-wizard__header">
          <div>
            <h2 id={headingId}>Novo agent governado</h2>
            <p>Preencha os dados básicos, cole o manifesto base e selecione os servidores MCP envolvidos.</p>
          </div>
          <button type="button" className="agent-wizard__close" onClick={handleClose}>
            Fechar
          </button>
        </header>

        <div className="agent-wizard__review">
          <form onSubmit={handleGeneratePlan} className="mcp-wizard">
            <fieldset className="mcp-wizard__fields" disabled={isPlanning}>
              <legend>Dados do agent</legend>
              <div className="mcp-wizard__field">
                <label htmlFor="new-agent-slug">Identificador do agent</label>
                <input
                  id="new-agent-slug"
                  value={agentSlug}
                  onChange={handleSlugChange}
                  placeholder="Ex.: sentinel-watcher"
                  autoComplete="off"
                />
                {agentSlugError ? (
                  <p className="mcp-wizard__helper mcp-wizard__helper--error" role="alert">
                    {agentSlugError}
                  </p>
                ) : null}
              </div>
              <div className="mcp-wizard__field">
                <label htmlFor="new-agent-repo">Repositório de destino</label>
                <input
                  id="new-agent-repo"
                  value={repository}
                  onChange={handleRepositoryChange}
                  placeholder="Ex.: agents-hub"
                  autoComplete="off"
                />
                {repositoryError ? (
                  <p className="mcp-wizard__helper mcp-wizard__helper--error" role="alert">
                    {repositoryError}
                  </p>
                ) : null}
              </div>
              <div className="mcp-wizard__field">
                <label htmlFor="new-agent-manifest">Manifesto base (JSON)</label>
                <textarea
                  id="new-agent-manifest"
                  value={manifestInput}
                  onChange={handleManifestChange}
                  rows={8}
                  spellCheck={false}
                />
                <p className="mcp-wizard__helper">
                  Inclua as chaves principais do agent (name, title, capabilities, model, tools...).
                </p>
                {manifestError ? (
                  <p className="mcp-wizard__helper mcp-wizard__helper--error" role="alert">
                    {manifestError}
                  </p>
                ) : null}
              </div>
              <div className="mcp-wizard__field">
                <span>Servidores MCP selecionados</span>
                {providersLoading ? <p className="mcp-wizard__helper">Carregando servidores MCP…</p> : null}
                {providersError ? (
                  <p className="mcp-wizard__helper mcp-wizard__helper--error" role="alert">
                    {providersError}
                  </p>
                ) : null}
                {!providersLoading && !providersError ? (
                  sortedProviders.length > 0 ? (
                    <ul className="mcp-wizard__options">
                      {sortedProviders.map((server) => (
                        <li key={server.id}>
                          <label className="mcp-wizard__checkbox">
                            <input
                              type="checkbox"
                              checked={selectedServers.includes(server.id)}
                              onChange={() => handleToggleServer(server.id)}
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
                  )
                ) : null}
                {selectedServersError ? (
                  <p className="mcp-wizard__helper mcp-wizard__helper--error" role="alert">
                    {selectedServersError}
                  </p>
                ) : null}
              </div>
            </fieldset>
            <button type="submit" className="mcp-wizard__button mcp-wizard__button--primary" disabled={isPlanning}>
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

          <PlanSummary plan={planSummary} isLoading={isPlanning} actions={actions} />
          <PlanDiffViewer
            diffs={pendingPlan?.diffItems ?? []}
            emptyMessage="Gere um plano para visualizar os arquivos propostos."
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

          <form onSubmit={handleApplyPlan} className="mcp-wizard">
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
      </section>
    </div>
  );
}
