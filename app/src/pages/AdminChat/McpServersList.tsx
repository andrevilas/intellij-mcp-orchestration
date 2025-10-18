import { FormEvent, useEffect, useRef, useState } from 'react';

import {
  applyConfigMcpUpdate,
  fetchServerCatalog,
  planConfigMcpUpdate,
  type ConfigMcpUpdateApplyResponse,
  type ConfigMcpUpdateAuditMetadata,
  type McpServer,
  type McpServerUpdateInput,
} from '../../api';
import PlanDiffViewer, { type PlanDiffItem } from '../../components/PlanDiffViewer';

interface ServerDraft {
  name: string;
  command: string;
  description: string;
  tags: string;
  capabilities: string;
  transport: string;
}

interface PendingPlanState {
  server: McpServer;
  planId: string;
  summary: string;
  message: string | null;
  diffs: PlanDiffItem[];
  nextServer: McpServer;
}

type ServerResult = {
  status: 'success';
  message: string;
  audit: ConfigMcpUpdateAuditMetadata | null;
};

const DEFAULT_ACTOR = 'Console MCP';
const DEFAULT_ACTOR_EMAIL = 'console@example.com';
const DEFAULT_COMMIT_MESSAGE = 'chore: atualizar servidor MCP';

function buildDraft(server: McpServer): ServerDraft {
  return {
    name: server.name,
    command: server.command,
    description: server.description ?? '',
    tags: server.tags.join(', '),
    capabilities: server.capabilities.join(', '),
    transport: server.transport,
  };
}

function parseList(value: string): string[] {
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function buildUpdateInput(draft: ServerDraft): McpServerUpdateInput {
  const trimmedName = draft.name.trim();
  const trimmedCommand = draft.command.trim();
  const trimmedDescription = draft.description.trim();
  return {
    name: trimmedName || draft.name,
    command: trimmedCommand || draft.command,
    description: trimmedDescription ? trimmedDescription : null,
    tags: parseList(draft.tags),
    capabilities: parseList(draft.capabilities),
    transport: draft.transport,
  };
}

function buildServerSnapshot(original: McpServer, draft: ServerDraft): McpServer {
  const input = buildUpdateInput(draft);
  return {
    ...original,
    name: input.name,
    command: input.command,
    description: input.description,
    tags: input.tags,
    capabilities: input.capabilities,
    transport: input.transport,
  };
}

function sortList(values: string[]): string[] {
  return [...values].map((value) => value.trim()).filter(Boolean).sort();
}

function hasChanges(server: McpServer, draft: ServerDraft): boolean {
  const snapshot = buildServerSnapshot(server, draft);
  const description = snapshot.description ?? '';
  const currentDescription = server.description ?? '';
  if (snapshot.name !== server.name) {
    return true;
  }
  if (snapshot.command !== server.command) {
    return true;
  }
  if (description !== currentDescription) {
    return true;
  }
  const nextTags = sortList(snapshot.tags);
  const currentTags = sortList(server.tags);
  if (nextTags.length !== currentTags.length) {
    return true;
  }
  for (let index = 0; index < nextTags.length; index += 1) {
    if (nextTags[index] !== currentTags[index]) {
      return true;
    }
  }
  const nextCapabilities = sortList(snapshot.capabilities);
  const currentCapabilities = sortList(server.capabilities);
  if (nextCapabilities.length !== currentCapabilities.length) {
    return true;
  }
  for (let index = 0; index < nextCapabilities.length; index += 1) {
    if (nextCapabilities[index] !== currentCapabilities[index]) {
      return true;
    }
  }
  return false;
}

function formatSuccessMessage(response: ConfigMcpUpdateApplyResponse): string {
  const details: string[] = [response.message];
  if (response.audit?.recordId) {
    details.push(`Registro: ${response.audit.recordId}`);
  }
  if (response.audit?.branch) {
    details.push(`Branch: ${response.audit.branch}`);
  }
  if (response.audit?.pullRequest?.url) {
    details.push(`PR: ${response.audit.pullRequest.url}`);
  }
  return details.join(' ');
}

export default function McpServersList() {
  const [servers, setServers] = useState<McpServer[]>([]);
  const [drafts, setDrafts] = useState<Record<string, ServerDraft>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; message: string } | null>(null);
  const [planningServerId, setPlanningServerId] = useState<string | null>(null);
  const [pendingPlan, setPendingPlan] = useState<PendingPlanState | null>(null);
  const [isApplyLoading, setApplyLoading] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, ServerResult>>({});
  const previousResultRef = useRef<ServerResult | undefined>(undefined);
  const [applyActor, setApplyActor] = useState(DEFAULT_ACTOR);
  const [applyActorEmail, setApplyActorEmail] = useState(DEFAULT_ACTOR_EMAIL);
  const [applyCommitMessage, setApplyCommitMessage] = useState(DEFAULT_COMMIT_MESSAGE);
  const [applyNote, setApplyNote] = useState('');

  useEffect(() => {
    let isActive = true;
    const controller = new AbortController();
    async function loadServers() {
      setIsLoading(true);
      try {
        const catalog = await fetchServerCatalog(controller.signal);
        if (!isActive) {
          return;
        }
        setServers(catalog);
        const initialDrafts: Record<string, ServerDraft> = {};
        catalog.forEach((server) => {
          initialDrafts[server.id] = buildDraft(server);
        });
        setDrafts(initialDrafts);
      } catch (error) {
        if (!isActive) {
          return;
        }
        const message =
          error instanceof Error
            ? error.message
            : 'Falha ao carregar servidores MCP. Tente novamente mais tarde.';
        setFeedback({ kind: 'error', message });
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    }

    loadServers();

    return () => {
      isActive = false;
      controller.abort();
    };
  }, []);

  useEffect(() => {
    if (!pendingPlan) {
      return;
    }
    setApplyActor(DEFAULT_ACTOR);
    setApplyActorEmail(DEFAULT_ACTOR_EMAIL);
    setApplyCommitMessage(DEFAULT_COMMIT_MESSAGE);
    setApplyNote('');
    setApplyError(null);
  }, [pendingPlan]);

  const hasServers = servers.length > 0;

  const handleDraftChange = (serverId: string, field: keyof ServerDraft, value: string) => {
    setDrafts((current) => {
      const existing = current[serverId] ?? {
        name: '',
        command: '',
        description: '',
        tags: '',
        capabilities: '',
        transport: '',
      };
      return {
        ...current,
        [serverId]: { ...existing, [field]: value },
      };
    });
  };

  const handleResetDraft = (server: McpServer) => {
    setDrafts((current) => ({ ...current, [server.id]: buildDraft(server) }));
  };

  const handleFeedbackDismiss = () => {
    setFeedback(null);
  };

  const handlePlanSubmit = async (event: FormEvent<HTMLFormElement>, server: McpServer) => {
    event.preventDefault();
    setFeedback(null);
    setApplyError(null);

    const draft = drafts[server.id] ?? buildDraft(server);
    if (!hasChanges(server, draft)) {
      setFeedback({ kind: 'error', message: 'Nenhuma alteração pendente para este servidor MCP.' });
      return;
    }

    setPlanningServerId(server.id);
    try {
      const nextServer = buildServerSnapshot(server, draft);
      const response = await planConfigMcpUpdate({
        serverId: server.id,
        changes: {
          name: nextServer.name,
          command: nextServer.command,
          description: nextServer.description,
          tags: nextServer.tags,
          capabilities: nextServer.capabilities,
          transport: nextServer.transport,
        },
      });

      const diffItems: PlanDiffItem[] = response.diffs.map((diff) => ({
        id: diff.id,
        title: diff.title,
        summary: diff.summary ?? undefined,
        diff: diff.diff ?? undefined,
      }));

      setPendingPlan({
        server,
        planId: response.planId,
        summary: response.summary,
        message: response.message,
        diffs: diffItems,
        nextServer,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Falha ao gerar plano de atualização para o servidor MCP.';
      setFeedback({ kind: 'error', message });
    } finally {
      setPlanningServerId(null);
    }
  };

  const handlePlanCancel = () => {
    setPendingPlan(null);
    setApplyError(null);
  };

  const handleApply = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!pendingPlan) {
      return;
    }

    const trimmedActor = applyActor.trim();
    const trimmedEmail = applyActorEmail.trim();
    const trimmedCommit = applyCommitMessage.trim();
    const trimmedNote = applyNote.trim();

    if (!trimmedActor || !trimmedEmail) {
      setApplyError('Informe nome e e-mail para registrar o autor da alteração.');
      return;
    }

    setApplyLoading(true);
    setApplyError(null);
    setFeedback(null);
    previousResultRef.current = results[pendingPlan.server.id];

    try {
      const response = await applyConfigMcpUpdate({
        planId: pendingPlan.planId,
        serverId: pendingPlan.server.id,
        actor: trimmedActor,
        actorEmail: trimmedEmail,
        commitMessage: trimmedCommit ? trimmedCommit : null,
        note: trimmedNote ? trimmedNote : null,
      });

      if (response.status !== 'applied') {
        const message = response.message || 'Aplicação rejeitada para o servidor MCP.';
        setApplyError(message);
        setFeedback({ kind: 'error', message });
        setResults((current) => {
          const next = { ...current };
          if (previousResultRef.current) {
            next[pendingPlan.server.id] = previousResultRef.current;
          } else {
            delete next[pendingPlan.server.id];
          }
          return next;
        });
        return;
      }

      const message = formatSuccessMessage(response);
      setServers((current) =>
        current.map((item) => (item.id === pendingPlan.server.id ? pendingPlan.nextServer : item)),
      );
      setDrafts((current) => ({
        ...current,
        [pendingPlan.server.id]: buildDraft(pendingPlan.nextServer),
      }));
      setResults((current) => ({
        ...current,
        [pendingPlan.server.id]: { status: 'success', message, audit: response.audit },
      }));
      setFeedback({ kind: 'success', message });
      setPendingPlan(null);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Falha ao aplicar atualização do servidor MCP. Tente novamente.';
      setApplyError(message);
      setFeedback({ kind: 'error', message });
      setResults((current) => {
        const next = { ...current };
        if (previousResultRef.current) {
          next[pendingPlan.server.id] = previousResultRef.current;
        } else {
          delete next[pendingPlan.server.id];
        }
        return next;
      });
    } finally {
      setApplyLoading(false);
      previousResultRef.current = undefined;
    }
  };

  const renderResultMessage = (serverId: string) => {
    const result = results[serverId];
    if (!result) {
      return null;
    }
    return (
      <p className="mcp-servers__result" role="status">
        {result.message}
      </p>
    );
  };

  return (
    <section className="mcp-servers" aria-labelledby="mcp-servers-title">
      <header className="mcp-servers__header">
        <h2 id="mcp-servers-title">Servidores MCP assistidos</h2>
        <p>Revise alterações sugeridas, valide diffs e aplique atualizações com auditoria completa.</p>
      </header>

      {feedback ? (
        <div
          className={`admin-chat__alert admin-chat__alert--${feedback.kind}`}
          role={feedback.kind === 'error' ? 'alert' : 'status'}
        >
          <p>{feedback.message}</p>
          <button
            type="button"
            onClick={handleFeedbackDismiss}
            className="admin-chat__alert-dismiss"
            aria-label="Fechar alerta"
          >
            ×
          </button>
        </div>
      ) : null}

      {isLoading ? <p className="mcp-servers__loading">Carregando servidores MCP…</p> : null}

      {!isLoading && !hasServers ? (
        <p className="mcp-servers__empty">
          Cadastre servidores MCP para revisar atualizações assistidas por aqui.
        </p>
      ) : null}

      {hasServers ? (
        <ul className="mcp-servers__list">
          {servers.map((server) => {
            const draft = drafts[server.id] ?? buildDraft(server);
            const itemId = `mcp-server-${server.id}-title`;
            const planning = planningServerId === server.id;
            const dirty = hasChanges(server, draft);
            const nameId = `mcp-server-name-${server.id}`;
            const commandId = `mcp-server-command-${server.id}`;
            const descriptionId = `mcp-server-description-${server.id}`;
            const tagsId = `mcp-server-tags-${server.id}`;
            const capabilitiesId = `mcp-server-capabilities-${server.id}`;

            return (
              <li key={server.id} className="mcp-servers__item">
                <article className="mcp-servers__card" aria-labelledby={itemId}>
                  <header className="mcp-servers__item-header">
                    <h3 id={itemId}>{draft.name || server.name}</h3>
                    <span className="mcp-servers__badge" aria-label="Transporte configurado">
                      {server.transport}
                    </span>
                  </header>
                  {renderResultMessage(server.id)}
                  <form className="mcp-servers__form" onSubmit={(event) => handlePlanSubmit(event, server)}>
                    <div className="mcp-servers__field">
                      <label htmlFor={nameId}>Nome do servidor</label>
                      <input
                        id={nameId}
                        type="text"
                        value={draft.name}
                        onChange={(event) => handleDraftChange(server.id, 'name', event.target.value)}
                        disabled={planning}
                      />
                    </div>
                    <div className="mcp-servers__field">
                      <label htmlFor={commandId}>Comando ou endpoint</label>
                      <input
                        id={commandId}
                        type="text"
                        value={draft.command}
                        onChange={(event) => handleDraftChange(server.id, 'command', event.target.value)}
                        disabled={planning}
                      />
                    </div>
                    <div className="mcp-servers__field">
                      <label htmlFor={descriptionId}>Descrição</label>
                      <textarea
                        id={descriptionId}
                        value={draft.description}
                        onChange={(event) => handleDraftChange(server.id, 'description', event.target.value)}
                        rows={3}
                        disabled={planning}
                      />
                    </div>
                    <div className="mcp-servers__field">
                      <label htmlFor={tagsId}>Tags (separadas por vírgula)</label>
                      <input
                        id={tagsId}
                        type="text"
                        value={draft.tags}
                        onChange={(event) => handleDraftChange(server.id, 'tags', event.target.value)}
                        disabled={planning}
                      />
                    </div>
                    <div className="mcp-servers__field">
                      <label htmlFor={capabilitiesId}>Capacidades (separadas por vírgula)</label>
                      <input
                        id={capabilitiesId}
                        type="text"
                        value={draft.capabilities}
                        onChange={(event) => handleDraftChange(server.id, 'capabilities', event.target.value)}
                        disabled={planning}
                      />
                    </div>
                    <div className="mcp-servers__actions">
                      <button
                        type="submit"
                        className="button button--primary"
                        disabled={!dirty || planning}
                      >
                        {planning ? 'Gerando…' : 'Gerar plano'}
                      </button>
                      <button
                        type="button"
                        className="button button--ghost"
                        onClick={() => handleResetDraft(server)}
                        disabled={planning || !dirty}
                      >
                        Descartar alterações
                      </button>
                    </div>
                  </form>
                </article>
              </li>
            );
          })}
        </ul>
      ) : null}

      {pendingPlan ? (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="mcp-update-modal-title"
        >
          <form className="modal" onSubmit={handleApply}>
            <header className="modal__header">
              <h2 id="mcp-update-modal-title" className="modal__title">
                Revisar plano para {pendingPlan.server.name}
              </h2>
              <p className="modal__subtitle">{pendingPlan.summary}</p>
            </header>
            <div className="modal__body">
              {pendingPlan.message ? <p>{pendingPlan.message}</p> : null}
              {applyError ? (
                <p className="modal__error" role="alert">
                  {applyError}
                </p>
              ) : null}
              <PlanDiffViewer
                diffs={pendingPlan.diffs}
                title="Diffs sugeridos"
                emptyMessage="Nenhuma alteração detectada para este servidor."
              />
              <div className="modal__form" role="group" aria-labelledby="mcp-update-modal-title">
                <div className="modal__field">
                  <label className="modal__label" htmlFor="mcp-update-actor">
                    Autor da alteração
                  </label>
                  <input
                    id="mcp-update-actor"
                    className="modal__input"
                    type="text"
                    value={applyActor}
                    onChange={(event) => setApplyActor(event.target.value)}
                    disabled={isApplyLoading}
                  />
                </div>
                <div className="modal__field">
                  <label className="modal__label" htmlFor="mcp-update-email">
                    E-mail do autor
                  </label>
                  <input
                    id="mcp-update-email"
                    className="modal__input"
                    type="email"
                    value={applyActorEmail}
                    onChange={(event) => setApplyActorEmail(event.target.value)}
                    disabled={isApplyLoading}
                  />
                </div>
                <div className="modal__field">
                  <label className="modal__label" htmlFor="mcp-update-commit">
                    Mensagem do commit
                  </label>
                  <input
                    id="mcp-update-commit"
                    className="modal__input"
                    type="text"
                    value={applyCommitMessage}
                    onChange={(event) => setApplyCommitMessage(event.target.value)}
                    disabled={isApplyLoading}
                  />
                </div>
                <div className="modal__field">
                  <label className="modal__label" htmlFor="mcp-update-note">
                    Nota adicional (opcional)
                  </label>
                  <textarea
                    id="mcp-update-note"
                    className="modal__input"
                    rows={3}
                    value={applyNote}
                    onChange={(event) => setApplyNote(event.target.value)}
                    disabled={isApplyLoading}
                  />
                </div>
              </div>
            </div>
            <footer className="modal__footer">
              <button
                type="button"
                className="button button--ghost"
                onClick={handlePlanCancel}
                disabled={isApplyLoading}
              >
                Cancelar
              </button>
              <button type="submit" className="button button--primary" disabled={isApplyLoading}>
                {isApplyLoading ? 'Aplicando…' : 'Aplicar atualização'}
              </button>
            </footer>
          </form>
        </div>
      ) : null}
    </section>
  );
}
