import { ChangeEvent, FormEvent, useCallback, useMemo, useRef, useState } from 'react';

import './admin-chat.scss';

import {
  fetchNotifications,
  postConfigReload,
  postPolicyPlanApply,
  type ConfigReloadResponse,
  type NotificationSummary,
} from '../../api';
import useAdminChat from '../../hooks/useAdminChat';
import PlanDiffViewer, { type PlanDiffItem } from '../../components/PlanDiffViewer';
import PlanSummary from './PlanSummary';
import RiskCard from './RiskCard';
import McpOnboardingWizard from './McpOnboardingWizard';
import McpServersList from './McpServersList';
import MediaLightbox from '../../components/MediaLightbox';
import MediaPlayer, { type MediaSource } from '../../components/MediaPlayer';
import ModalBase from '../../components/modals/ModalBase';
import ConfirmationModal from '../../components/modals/ConfirmationModal';

const ROLE_LABELS = {
  user: 'Operador',
  assistant: 'Copiloto',
  system: 'Sistema',
} as const;

interface SupportedArtifact {
  id: string;
  title: string;
  description: string;
  risk: string;
  placeholderPath: string;
  placeholderParameters?: string;
}

const SUPPORTED_ARTIFACTS: SupportedArtifact[] = [
  {
    id: 'agent.manifest',
    title: 'Manifesto MCP',
    description:
      'Estrutura base com defaults determinísticos e validação automática antes do merge.',
    risk:
      'Risco: manifesto incompatível. Mitigação: validar contra o schema AgentManifest antes de aplicar.',
    placeholderPath: 'agents-hub/app/agents/<slug>/agent.yaml',
    placeholderParameters: '{"owner":"platform-team","capabilities":["structured-output"]}',
  },
  {
    id: 'agent.readme',
    title: 'README do agente',
    description:
      'Documentação operacional cobrindo deploy, rollback e responsáveis pelo suporte.',
    risk:
      'Risco: documentação desatualizada. Mitigação: revisar checklist com o time responsável.',
    placeholderPath: 'agents-hub/app/agents/<slug>/README.md',
    placeholderParameters: '{"owner":"platform-team"}',
  },
  {
    id: 'agent.langgraph',
    title: 'Stub LangGraph',
    description:
      'Módulo Python conectando manifesto a um tool determinístico com validações básicas.',
    risk:
      'Risco: tool inconsistente. Mitigação: executar testes de fumaça e validar o retorno determinístico.',
    placeholderPath: 'agents-hub/app/agents/<slug>/agent.py',
    placeholderParameters: '{"tool_name":"demo_tool"}',
  },
  {
    id: 'finops.checklist',
    title: 'Checklist FinOps',
    description:
      'Checklist padronizado para revisões de custo e risco antes de promover alterações.',
    risk:
      'Risco: checklist incompleto. Mitigação: sincronizar revisão com o time de FinOps.',
    placeholderPath: 'generated/finops/checklist.md',
    placeholderParameters: '{"owner":"finops-team","checklist_title":"Revisão mensal"}',
  },
];

type QuickstartMedia = MediaSource & {
  thumbnail?: string;
  thumbnailAlt?: string;
};

interface QuickstartExample {
  id: string;
  label: string;
  prompt: string;
  scope?: string;
  description?: string;
  focus?: 'prompt' | 'scope';
}

interface QuickstartResource {
  id: string;
  badge: string;
  title: string;
  description: string;
  cta: string;
  media?: QuickstartMedia;
  href?: string;
  hrefLabel?: string;
  examples?: QuickstartExample[];
}

const QUICKSTART_RESOURCES: QuickstartResource[] = [
  {
    id: 'admin-chat-demo',
    badge: 'Demo',
    title: 'Veja o Admin Chat em ação',
    description:
      'Assista ao walkthrough com geração de plano, revisão de diffs e aprovação HITL em menos de 2 minutos.',
    cta: 'Assistir demo',
    media: {
      type: 'iframe',
      src: 'https://www.youtube.com/embed/J0jrn9qPKDg',
      title: 'Walkthrough do Admin Chat',
      allow:
        'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share',
      thumbnail: 'https://img.youtube.com/vi/J0jrn9qPKDg/hqdefault.jpg',
      thumbnailAlt: 'Frame do walkthrough do Admin Chat com plano e revisão de diffs na tela',
    },
    href: 'https://www.youtube.com/watch?v=J0jrn9qPKDg',
    hrefLabel: 'Abrir no YouTube',
  },
  {
    id: 'admin-chat-docs',
    badge: 'Docs',
    title: 'Leia o quickstart completo',
    description:
      'Guia passo a passo com intents suportadas, exemplos de payload e comandos HTTP para o Admin Chat.',
    cta: 'Abrir documentação',
    href: 'https://github.com/openai/intellij-mcp-orchestration/blob/main/docs/admin-chat-quickstart.md',
  },
  {
    id: 'admin-chat-examples',
    badge: 'Exemplos',
    title: 'Teste pedidos prontos',
    description:
      'Preencha o prompt e o escopo automaticamente com fluxos aprovados pela plataforma.',
    cta: 'Usar exemplo',
    examples: [
      {
        id: 'hitl-scope',
        label: 'Gerar plano HITL',
        prompt: 'Preciso habilitar checkpoints HITL para as rotas críticas com aprovação dupla.',
        scope: 'Habilitar checkpoints HITL nas rotas prioritárias',
        description: 'Sugestão validada para reforçar checkpoints antes do rollout.',
      },
      {
        id: 'manifest-reload',
        label: 'Regenerar manifesto MCP',
        prompt:
          'Quero regenerar o manifesto do agente de faturamento com suporte a structured-output mantendo owners.',
        scope: 'Atualizar manifesto do agente de faturamento com owners atualizados',
        description: 'Útil para validar alterações antes de solicitar um reload automatizado.',
        focus: 'scope',
      },
    ],
  },
];

const RELOAD_ACTOR_STORAGE_KEY = 'admin-chat.reload.actor';
const RELOAD_ACTOR_EMAIL_STORAGE_KEY = 'admin-chat.reload.actor_email';
const RELOAD_COMMIT_STORAGE_KEY = 'admin-chat.reload.commit_message';

function loadReloadPreference(key: string, fallback = ''): string {
  try {
    return window.localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

function persistReloadPreference(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // ignore persistence errors (private browsing, etc)
  }
}

function generatePlanId(): string {
  return `reload-${Math.random().toString(36).slice(2, 10)}`;
}

export interface AdminChatProps {
  onNotificationsUpdate?: (items: NotificationSummary[]) => void;
}

export default function AdminChat({ onNotificationsUpdate }: AdminChatProps) {
  const {
    messages,
    plan,
    diffs,
    risks,
    hitlRequest,
    isChatLoading,
    isPlanLoading,
    isApplyLoading,
    error,
    statusMessage,
    sendMessage,
    generatePlan,
    applyPlan,
    confirmHitl,
    cancelHitl,
    clearStatus,
    clearError,
    hasConversation,
  } = useAdminChat();

  const promptInputRef = useRef<HTMLTextAreaElement | null>(null);
  const scopeInputRef = useRef<HTMLInputElement | null>(null);
  const [prompt, setPrompt] = useState('');
  const [scope, setScope] = useState('');
  const [note, setNote] = useState('');
  const [scopeError, setScopeError] = useState<string | null>(null);
  const [isReloadModalOpen, setReloadModalOpen] = useState(false);
  const [selectedArtifact, setSelectedArtifact] = useState<SupportedArtifact | null>(null);
  const [reloadTargetPath, setReloadTargetPath] = useState('');
  const [reloadParameters, setReloadParameters] = useState('');
  const [reloadParametersError, setReloadParametersError] = useState<string | null>(null);
  const [reloadError, setReloadError] = useState<string | null>(null);
  const [reloadApplyError, setReloadApplyError] = useState<string | null>(null);
  const [reloadPlanResponse, setReloadPlanResponse] = useState<ConfigReloadResponse | null>(null);
  const [reloadPlanId, setReloadPlanId] = useState<string | null>(null);
  const [isReloadGenerating, setReloadGenerating] = useState(false);
  const [isReloadApplying, setReloadApplying] = useState(false);
  const [isReloadApplyConfirmOpen, setReloadApplyConfirmOpen] = useState(false);
  const [reloadSuccessMessage, setReloadSuccessMessage] = useState<string | null>(null);
  const [reloadActor, setReloadActor] = useState(() => loadReloadPreference(RELOAD_ACTOR_STORAGE_KEY));
  const [reloadActorEmail, setReloadActorEmail] = useState(() => loadReloadPreference(RELOAD_ACTOR_EMAIL_STORAGE_KEY));
  const [reloadCommitMessage, setReloadCommitMessage] = useState(() =>
    loadReloadPreference(RELOAD_COMMIT_STORAGE_KEY, 'chore: regenerar artefato de configuração'),
  );
  const [openQuickstartResource, setOpenQuickstartResource] = useState<QuickstartResource | null>(null);

  const handleSend = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = prompt.trim();
    if (!trimmed) {
      return;
    }
    try {
      await sendMessage(trimmed);
      setPrompt('');
    } catch {
      // handled by hook
    }
  };

  const handleGeneratePlan = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedScope = scope.trim();
    if (!trimmedScope && !plan) {
      setScopeError('Informe um escopo para gerar o plano.');
      return;
    }
    try {
      await generatePlan(trimmedScope || plan?.scope || '', {
        refresh: Boolean(plan && trimmedScope === ''),
      });
      if (!trimmedScope && plan) {
        setScope(plan.scope);
      }
      setScopeError(null);
    } catch {
      // handled
    }
  };

  const handleApply = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      await applyPlan(note.trim() ? note.trim() : null);
    } catch {
      // handled
    }
  };

  const handleConfirm = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      await confirmHitl(note.trim() ? note.trim() : null);
      setNote('');
    } catch {
      // handled
    }
  };

  const handleReloadSuccessDismiss = useCallback(() => {
    setReloadSuccessMessage(null);
  }, []);

  const handleOpenReloadModal = useCallback(
    (artifact: SupportedArtifact) => {
      setSelectedArtifact(artifact);
      setReloadModalOpen(true);
      setReloadPlanResponse(null);
      setReloadPlanId(null);
      setReloadError(null);
      setReloadApplyError(null);
      setReloadParametersError(null);
      setReloadTargetPath(artifact.placeholderPath);
      setReloadParameters(artifact.placeholderParameters ?? '');
      if (!reloadCommitMessage.trim()) {
        const defaultCommit = `chore: regenerar ${artifact.title.toLowerCase()}`;
        setReloadCommitMessage(defaultCommit);
        persistReloadPreference(RELOAD_COMMIT_STORAGE_KEY, defaultCommit);
      }
    },
    [reloadCommitMessage],
  );

  const handleReloadCancel = useCallback(() => {
    setReloadModalOpen(false);
    setSelectedArtifact(null);
    setReloadPlanResponse(null);
    setReloadPlanId(null);
    setReloadError(null);
    setReloadApplyError(null);
    setReloadParametersError(null);
    setReloadApplyConfirmOpen(false);
    setReloadTargetPath('');
    setReloadParameters('');
    setReloadGenerating(false);
    setReloadApplying(false);
  }, []);

  const handleReloadTargetPathChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setReloadTargetPath(event.target.value);
    setReloadError(null);
  }, []);

  const handleReloadParametersChange = useCallback((event: ChangeEvent<HTMLTextAreaElement>) => {
    setReloadParameters(event.target.value);
    setReloadParametersError(null);
    setReloadError(null);
  }, []);

  const handleReloadGenerate = useCallback(
    async (event?: FormEvent<HTMLFormElement>) => {
      event?.preventDefault();
      if (!selectedArtifact) {
        return;
      }
      const trimmedPath = reloadTargetPath.trim();
      if (!trimmedPath) {
        setReloadError('Informe o caminho de destino para o artefato.');
        return;
      }

      let parsedParameters: Record<string, unknown> | undefined;
      if (reloadParameters.trim()) {
        try {
          parsedParameters = JSON.parse(reloadParameters);
          setReloadParametersError(null);
        } catch (cause) {
          console.error('Invalid reload parameters', cause);
          setReloadParametersError('Parâmetros devem ser um JSON válido.');
          return;
        }
      } else {
        setReloadParametersError(null);
      }

      setReloadGenerating(true);
      setReloadError(null);
      setReloadApplyError(null);
      try {
        const response = await postConfigReload({
          artifactType: selectedArtifact.id,
          targetPath: trimmedPath,
          parameters: parsedParameters,
        });
        setReloadPlanResponse(response);
        setReloadPlanId(generatePlanId());
      } catch (cause) {
        const message =
          cause instanceof Error && cause.message
            ? cause.message
            : 'Falha ao gerar plano de reload. Tente novamente.';
        setReloadError(message);
        setReloadPlanResponse(null);
        setReloadPlanId(null);
      } finally {
        setReloadGenerating(false);
      }
    },
    [reloadParameters, reloadTargetPath, selectedArtifact],
  );

  const handleReloadApply = useCallback(async () => {
    setReloadApplyConfirmOpen(false);
    if (!reloadPlanResponse || !reloadPlanId) {
      return;
    }

    const actor = reloadActor.trim();
    const actorEmail = reloadActorEmail.trim();
    if (!actor) {
      setReloadApplyError('Informe o autor da alteração.');
      return;
    }
    if (!actorEmail) {
      setReloadApplyError('Informe o e-mail do autor.');
      return;
    }

    setReloadApplying(true);
    setReloadApplyError(null);
    try {
      const response = await postPolicyPlanApply({
        planId: reloadPlanId,
        plan: reloadPlanResponse.planPayload,
        patch: reloadPlanResponse.patch,
        actor,
        actorEmail,
        commitMessage: reloadCommitMessage.trim() || undefined,
      });
      const details: string[] = [response.message];
      if (response.branch) {
        details.push(`Branch: ${response.branch}`);
      }
      if (response.pullRequest?.url) {
        details.push(`PR: ${response.pullRequest.url}`);
      }
      setReloadSuccessMessage(details.join(' '));
      setReloadModalOpen(false);
      setSelectedArtifact(null);
      setReloadPlanResponse(null);
      setReloadPlanId(null);
      setReloadTargetPath('');
      setReloadParameters('');
      setReloadError(null);
      if (onNotificationsUpdate) {
        try {
          const items = await fetchNotifications();
          onNotificationsUpdate(items);
        } catch (notificationError) {
          console.error('Falha ao atualizar notificações após reload', notificationError);
        }
      }
    } catch (cause) {
      const message =
        cause instanceof Error && cause.message
          ? cause.message
          : 'Falha ao aplicar plano de reload. Tente novamente.';
      setReloadApplyError(message);
    } finally {
      setReloadApplying(false);
    }
  }, [
    onNotificationsUpdate,
    reloadActor,
    reloadActorEmail,
    reloadCommitMessage,
    reloadPlanId,
    reloadPlanResponse,
  ]);

  const handleReloadActorChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const { value } = event.target;
    setReloadActor(value);
    persistReloadPreference(RELOAD_ACTOR_STORAGE_KEY, value);
    setReloadApplyError(null);
  }, []);

  const handleReloadActorEmailChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const { value } = event.target;
    setReloadActorEmail(value);
    persistReloadPreference(RELOAD_ACTOR_EMAIL_STORAGE_KEY, value);
    setReloadApplyError(null);
  }, []);

  const handleReloadCommitMessageChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const { value } = event.target;
    setReloadCommitMessage(value);
    persistReloadPreference(RELOAD_COMMIT_STORAGE_KEY, value);
  }, []);

  const handleQuickstartMediaOpen = useCallback((resource: QuickstartResource) => {
    if (!resource.media) {
      return;
    }
    setOpenQuickstartResource(resource);
  }, []);

  const handleQuickstartMediaClose = useCallback(() => {
    setOpenQuickstartResource(null);
  }, []);

  const handleQuickstartExample = useCallback(
    (example: QuickstartExample) => {
      setPrompt(example.prompt);
      if (typeof example.scope === 'string') {
        setScope(example.scope);
      }
      requestAnimationFrame(() => {
        if (example.focus === 'scope') {
          scopeInputRef.current?.focus();
        } else {
          promptInputRef.current?.focus();
        }
      });
    },
    [setPrompt, setScope],
  );

  const hasRisks = risks.length > 0;
  const roleLabels = useMemo(() => ROLE_LABELS, []);

  const planDiffItems = useMemo<PlanDiffItem[]>(
    () =>
      diffs.map((diff) => ({
        id: diff.id,
        title: diff.file,
        summary: diff.summary,
        diff: diff.diff,
      })),
    [diffs],
  );

  const reloadDiffItems = useMemo<PlanDiffItem[]>(() => {
    if (!reloadPlanResponse) {
      return [];
    }
    const normalizedPatch = reloadPlanResponse.patch.trim() ? reloadPlanResponse.patch : null;
    return reloadPlanResponse.plan.diffs.map((diff, index) => ({
      id: `${diff.path}-${index}`,
      title: diff.path,
      summary: diff.summary,
      diff: diff.diff ?? normalizedPatch,
    }));
  }, [reloadPlanResponse]);

  const planActions = (
    <div className="admin-chat__plan-actions">
      <form className="admin-chat__form" onSubmit={handleGeneratePlan}>
        <label className="admin-chat__label" htmlFor="admin-chat-scope">
          Escopo do plano
        </label>
        <div className="admin-chat__form-row">
          <input
            id="admin-chat-scope"
            name="scope"
            type="text"
            value={scope}
            ref={scopeInputRef}
            onChange={(event) => {
              setScope(event.target.value);
              if (scopeError) {
                setScopeError(null);
              }
            }}
            placeholder="Ex.: Atualizar guardrails para rotas críticas"
            aria-invalid={scopeError ? 'true' : 'false'}
            aria-describedby={scopeError ? 'admin-chat-scope-error' : undefined}
            disabled={isPlanLoading}
          />
          <button type="submit" className="admin-chat__button" disabled={isPlanLoading}>
            {plan ? 'Regenerar plano' : 'Gerar plano'}
          </button>
        </div>
        {scopeError ? (
          <p id="admin-chat-scope-error" className="admin-chat__helper admin-chat__helper--error">
            {scopeError}
          </p>
        ) : (
          <p className="admin-chat__helper">
            O escopo ajuda o copiloto a focar no rollout desejado. Você pode reaproveitar o escopo atual.
          </p>
        )}
      </form>
      {hitlRequest ? (
        <form className="admin-chat__form" onSubmit={handleConfirm}>
          <p className="admin-chat__helper admin-chat__helper--warning" role="alert">
            {hitlRequest.message}
          </p>
          <label className="admin-chat__label" htmlFor="admin-chat-note">
            Nota para aprovação (opcional)
          </label>
          <textarea
            id="admin-chat-note"
            name="note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={3}
            disabled={isApplyLoading}
          />
          <div className="admin-chat__button-row">
            <button type="submit" className="admin-chat__button admin-chat__button--primary" disabled={isApplyLoading}>
              Confirmar aplicação
            </button>
            <button
              type="button"
              className="admin-chat__button admin-chat__button--ghost"
              onClick={cancelHitl}
              disabled={isApplyLoading}
            >
              Cancelar
            </button>
          </div>
        </form>
      ) : (
        <form className="admin-chat__form" onSubmit={handleApply}>
          <label className="admin-chat__label" htmlFor="admin-chat-note">
            Nota para aplicação (opcional)
          </label>
          <textarea
            id="admin-chat-note"
            name="note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={3}
            disabled={isApplyLoading}
          />
          <div className="admin-chat__button-row">
            <button
              type="submit"
              className="admin-chat__button admin-chat__button--primary"
              disabled={isApplyLoading || !plan}
            >
              Aplicar plano
            </button>
          </div>
        </form>
      )}
    </div>
  );

  return (
    <div className="admin-chat">
      <div className="admin-chat__layout">
        <section className="admin-chat__panel admin-chat__panel--conversation">
          <header className="admin-chat__header">
            <h1>Assistente administrativo MCP</h1>
            <p>Converse com o copiloto para gerar planos, revisar diffs e aplicar mudanças com segurança.</p>
          </header>

          {statusMessage ? (
            <div className="admin-chat__alert admin-chat__alert--success" role="status">
              <p>{statusMessage}</p>
              <button type="button" onClick={clearStatus} className="admin-chat__alert-dismiss" aria-label="Fechar alerta">
                ×
              </button>
            </div>
          ) : null}

          {reloadSuccessMessage ? (
            <div className="admin-chat__alert admin-chat__alert--success" role="status">
              <p>{reloadSuccessMessage}</p>
              <button
                type="button"
                onClick={handleReloadSuccessDismiss}
                className="admin-chat__alert-dismiss"
                aria-label="Fechar alerta de reload"
              >
                ×
              </button>
            </div>
          ) : null}

          {error ? (
            <div className="admin-chat__alert admin-chat__alert--error" role="alert">
              <p>{error}</p>
              <button type="button" onClick={clearError} className="admin-chat__alert-dismiss" aria-label="Fechar erro">
                ×
              </button>
            </div>
          ) : null}

          <div className="admin-chat__messages" role="log" aria-live="polite">
            {hasConversation ? (
              <ul>
                {messages.map((message) => (
                  <li key={message.id} className={`admin-chat__message admin-chat__message--${message.role}`}>
                    <header>
                      <span className="admin-chat__message-role">{roleLabels[message.role]}</span>
                      <time dateTime={message.createdAt}>{new Date(message.createdAt).toLocaleString()}</time>
                    </header>
                    <p>{message.content}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="admin-chat__placeholder">
                Nenhuma interação ainda. Envie uma mensagem para o copiloto iniciar um diagnóstico assistido.
              </p>
            )}
            {isChatLoading ? <p className="admin-chat__loading">Processando solicitação…</p> : null}
          </div>

          <form className="admin-chat__form" onSubmit={handleSend}>
            <label className="admin-chat__label" htmlFor="admin-chat-message">
              Mensagem para o copiloto
            </label>
            <textarea
              id="admin-chat-message"
              name="message"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              rows={4}
              placeholder="Ex.: Gere um plano para habilitar checkpoints HITL nas rotas de maior risco"
              disabled={isChatLoading}
              ref={promptInputRef}
            />
            <div className="admin-chat__button-row">
              <button type="submit" className="admin-chat__button admin-chat__button--primary" disabled={isChatLoading}>
                Enviar mensagem
              </button>
            </div>
          </form>

          <McpOnboardingWizard />
          <McpServersList planButtonAriaLabel={(server) => `Gerar plano para ${server.name || server.id}`} />
        </section>

        <aside className="admin-chat__panel admin-chat__panel--summary">
          <PlanSummary plan={plan} isLoading={isPlanLoading} actions={planActions} />
          <section
            className="admin-chat__quickstart"
            role="region"
            aria-labelledby="admin-chat-quickstart-title"
          >
            <h2 id="admin-chat-quickstart-title">Comece rápido</h2>
            <p className="admin-chat__quickstart-lead">
              Explore o fluxo assistido com uma demo visual e um guia com exemplos reais.
            </p>
            <div className="admin-chat__quickstart-grid">
              {QUICKSTART_RESOURCES.map((resource) => {
                const titleId = `${resource.id}-title`;
                const descriptionId = `${resource.id}-description`;
                const hasActions = Boolean(resource.media || resource.href);

                return (
                  <article
                    key={resource.id}
                    className="admin-chat__quickstart-card"
                    aria-labelledby={titleId}
                    aria-describedby={descriptionId}
                  >
                    <span className="admin-chat__quickstart-badge">{resource.badge}</span>
                    {resource.media?.thumbnail ? (
                      <button
                        type="button"
                        className="admin-chat__quickstart-media"
                        onClick={() => handleQuickstartMediaOpen(resource)}
                        aria-label={`Pré-visualizar ${resource.title}`}
                      >
                        <img
                          src={resource.media.thumbnail}
                          alt={resource.media.thumbnailAlt ?? resource.title}
                          loading="lazy"
                        />
                      </button>
                    ) : null}
                    <h3 id={titleId}>{resource.title}</h3>
                    <p id={descriptionId}>{resource.description}</p>
                    {resource.examples ? (
                      <ul className="admin-chat__quickstart-examples">
                        {resource.examples.map((example) => {
                          const exampleDescriptionId = `${example.id}-description`;
                          return (
                            <li key={example.id}>
                              <button
                                type="button"
                                className="admin-chat__quickstart-example-button"
                                onClick={() => handleQuickstartExample(example)}
                                aria-describedby={
                                  example.description ? exampleDescriptionId : undefined
                                }
                              >
                                {example.label}
                              </button>
                              {example.description ? (
                                <p
                                  id={exampleDescriptionId}
                                  className="admin-chat__quickstart-example-description"
                                >
                                  {example.description}
                                </p>
                              ) : null}
                            </li>
                          );
                        })}
                      </ul>
                    ) : null}
                    {hasActions ? (
                      <div className="admin-chat__quickstart-actions">
                        {resource.media ? (
                          <button
                            type="button"
                            className="admin-chat__quickstart-button"
                            onClick={() => handleQuickstartMediaOpen(resource)}
                          >
                            {resource.cta}
                          </button>
                        ) : null}
                        {resource.href ? (
                          <a
                            className="admin-chat__quickstart-link"
                            href={resource.href}
                            target="_blank"
                            rel="noreferrer noopener"
                          >
                            {resource.hrefLabel ?? resource.cta}
                          </a>
                        ) : null}
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          </section>
          <PlanDiffViewer diffs={planDiffItems} />
          <section className="admin-chat__risks">
            <h2>Riscos e checkpoints</h2>
            {hasRisks ? (
              <div className="admin-chat__risks-grid">
                {risks.map((risk) => (
                  <RiskCard key={risk.id} risk={risk} />
                ))}
              </div>
            ) : (
              <p className="admin-chat__placeholder">
                Nenhum risco elevado encontrado. Gere um plano para visualizar checkpoints sugeridos.
              </p>
            )}
          </section>
          <section className="admin-chat__assistant-docs">
            <h2>Templates suportados</h2>
            <ul>
              {SUPPORTED_ARTIFACTS.map((artifact) => (
                <li key={artifact.id}>
                  <h3>{artifact.title}</h3>
                  <p>{artifact.description}</p>
                  <p className="admin-chat__assistant-risk">{artifact.risk}</p>
                  <div className="admin-chat__assistant-actions">
                    <button
                      type="button"
                      className="admin-chat__button"
                      onClick={() => handleOpenReloadModal(artifact)}
                      disabled={isReloadGenerating || isReloadApplying}
                    >
                      Regenerar artefato
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>
      {openQuickstartResource?.media ? (
        <MediaLightbox
          open={Boolean(openQuickstartResource)}
          title={openQuickstartResource.title}
          description={openQuickstartResource.description}
          onClose={handleQuickstartMediaClose}
        >
          <MediaPlayer source={openQuickstartResource.media} />
          {openQuickstartResource.href ? (
            <a
              className="admin-chat__quickstart-link"
              href={openQuickstartResource.href}
              target="_blank"
              rel="noreferrer noopener"
            >
              {openQuickstartResource.hrefLabel ?? 'Abrir em nova aba'}
            </a>
          ) : null}
        </MediaLightbox>
      ) : null}
      {isReloadModalOpen && selectedArtifact ? (
        <ModalBase
          isOpen={isReloadModalOpen}
          onClose={handleReloadCancel}
          title={`Regenerar ${selectedArtifact.title}`}
          description={
            reloadPlanResponse
              ? reloadPlanResponse.plan.summary
              : 'Informe o destino e os parâmetros opcionais antes de gerar o plano.'
          }
          size="xl"
          closeOnBackdrop={false}
          dialogClassName="modal"
          contentClassName="modal__body"
          footer={
            <div className="modal__footer">
              <button
                type="button"
                className="button button--ghost"
                onClick={handleReloadCancel}
                disabled={isReloadGenerating || isReloadApplying}
              >
                Cancelar
              </button>
              {reloadPlanResponse ? (
                <button
                  type="button"
                  className="button button--primary"
                  onClick={() => setReloadApplyConfirmOpen(true)}
                  disabled={isReloadApplying}
                >
                  {isReloadApplying ? 'Aplicando…' : 'Aplicar plano'}
                </button>
              ) : (
                <button
                  type="button"
                  className="button button--primary"
                  onClick={() => void handleReloadGenerate()}
                  disabled={isReloadGenerating}
                >
                  {isReloadGenerating ? 'Gerando…' : 'Gerar plano'}
                </button>
              )}
            </div>
          }
        >
          {reloadPlanResponse ? (
            <div>
              <p>{reloadPlanResponse.message}</p>
              {reloadApplyError ? <p className="modal__error">{reloadApplyError}</p> : null}
              {reloadError && !reloadApplyError ? <p className="modal__error">{reloadError}</p> : null}
              <PlanDiffViewer
                diffs={reloadDiffItems}
                title="Alterações propostas"
                emptyMessage="Nenhuma alteração detectada para o artefato informado."
              />
              <div className="modal__form" role="group">
                <div className="modal__field">
                  <label className="modal__label" htmlFor="admin-reload-target">Caminho de destino</label>
                  <input
                    id="admin-reload-target"
                    type="text"
                    className="modal__input"
                    value={reloadTargetPath}
                    onChange={handleReloadTargetPathChange}
                    readOnly
                    disabled
                  />
                </div>
                <div className="modal__field">
                  <label className="modal__label" htmlFor="admin-reload-actor">Autor da alteração</label>
                  <input
                    id="admin-reload-actor"
                    type="text"
                    className="modal__input"
                    value={reloadActor}
                    onChange={handleReloadActorChange}
                    placeholder="Nome completo"
                    disabled={isReloadApplying}
                  />
                </div>
                <div className="modal__field">
                  <label className="modal__label" htmlFor="admin-reload-email">E-mail do autor</label>
                  <input
                    id="admin-reload-email"
                    type="email"
                    className="modal__input"
                    value={reloadActorEmail}
                    onChange={handleReloadActorEmailChange}
                    placeholder="autor@example.com"
                    disabled={isReloadApplying}
                  />
                </div>
                <div className="modal__field">
                  <label className="modal__label" htmlFor="admin-reload-commit">Mensagem do commit</label>
                  <input
                    id="admin-reload-commit"
                    type="text"
                    className="modal__input"
                    value={reloadCommitMessage}
                    onChange={handleReloadCommitMessageChange}
                    disabled={isReloadApplying}
                  />
                </div>
              </div>
            </div>
          ) : (
            <form className="modal__form" onSubmit={handleReloadGenerate}>
              {reloadError ? <p className="modal__error">{reloadError}</p> : null}
              <div className="modal__field">
                <label className="modal__label" htmlFor="admin-reload-target">Caminho de destino</label>
                <input
                  id="admin-reload-target"
                  type="text"
                  className="modal__input"
                  value={reloadTargetPath}
                  onChange={handleReloadTargetPathChange}
                  placeholder={selectedArtifact.placeholderPath}
                  disabled={isReloadGenerating}
                />
              </div>
              <div className="modal__field">
                <label className="modal__label" htmlFor="admin-reload-parameters">Parâmetros (JSON)</label>
                <textarea
                  id="admin-reload-parameters"
                  className="modal__input"
                  rows={4}
                  value={reloadParameters}
                  onChange={handleReloadParametersChange}
                  placeholder={selectedArtifact.placeholderParameters ?? '{ }'}
                  disabled={isReloadGenerating}
                />
                {reloadParametersError ? <p className="modal__error">{reloadParametersError}</p> : null}
              </div>
            </form>
          )}
        </ModalBase>
      ) : null}
      <ConfirmationModal
        isOpen={isReloadApplyConfirmOpen}
        title={`Aplicar plano · ${selectedArtifact?.title ?? 'artefato'}`}
        description={reloadPlanResponse?.plan.summary}
        confirmLabel="Armar aplicação"
        confirmArmedLabel="Aplicar agora"
        onConfirm={handleReloadApply}
        onCancel={() => setReloadApplyConfirmOpen(false)}
        isLoading={isReloadApplying}
      />
    </div>
  );
}
