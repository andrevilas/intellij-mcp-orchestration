import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { AgentSmokeRun, AgentStatus, AgentSummary } from '../api';
import { ApiError, fetchAgents, postAgentSmokeRun } from '../api';
import AgentDetailPanel from '../components/AgentDetailPanel';
import AgentCreateWizard from './Agents/AgentCreateWizard';
import SmokeEndpointsPanel from '../components/SmokeEndpointsPanel';
import { formatAgentTimestamp, formatModel, formatStatus, STATUS_CLASS } from '../utils/agents';

type StatusFilter = 'all' | AgentStatus;

interface ToastState {
  kind: 'success' | 'error';
  title: string;
  description: string | null;
  run: AgentSmokeRun | null;
  agent: AgentSummary | null;
}

const STATUS_ORDER: AgentStatus[] = ['healthy', 'degraded', 'pending', 'failed', 'inactive', 'unknown'];

const SMOKE_STATUS_LABELS = {
  queued: 'Na fila',
  running: 'Em execução',
  passed: 'Aprovado',
  failed: 'Falhou',
} as const;

function formatSmokeStatus(status: AgentSmokeRun['status']): string {
  return SMOKE_STATUS_LABELS[status] ?? status;
}

const AUTO_DISMISS_MS = 8000;

function Agents(): JSX.Element {
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [pendingSmoke, setPendingSmoke] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [activeAgent, setActiveAgent] = useState<AgentSummary | null>(null);
  const [isCreateWizardOpen, setCreateWizardOpen] = useState(false);
  const smokeControllers = useRef(new Map<string, AbortController>());

  const reloadAgents = useCallback(() => {
    setIsLoading(true);
    setError(null);

    fetchAgents()
      .then((response) => {
        setAgents(response);
      })
      .catch((cause) => {
        const message =
          cause instanceof ApiError
            ? cause.message
            : 'Falha ao carregar catálogo de agents.';
        setError(message);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  const handleOpenCreate = useCallback(() => {
    setCreateWizardOpen(true);
  }, []);

  const handleCloseCreate = useCallback(() => {
    setCreateWizardOpen(false);
  }, []);

  const handleAgentCreated = useCallback(
    (_slug: string) => {
      reloadAgents();
    },
    [reloadAgents],
  );

  useEffect(() => {
    const controller = new AbortController();
    let isMounted = true;

    setIsLoading(true);
    setError(null);

    fetchAgents(controller.signal)
      .then((response) => {
        if (!isMounted) {
          return;
        }
        setAgents(response);
      })
      .catch((cause) => {
        if (!isMounted) {
          return;
        }
        const message =
          cause instanceof ApiError
            ? cause.message
            : 'Falha ao carregar catálogo de agents.';
        setError(message);
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
      controller.abort();
    };
  }, []);

  useEffect(() => {
    return () => {
      for (const controller of smokeControllers.current.values()) {
        controller.abort();
      }
      smokeControllers.current.clear();
    };
  }, []);

  useEffect(() => {
    if (!activeAgent) {
      return;
    }

    const latest = agents.find((candidate) => candidate.name === activeAgent.name) ?? null;
    if (!latest) {
      setActiveAgent(null);
      return;
    }

    if (latest !== activeAgent) {
      setActiveAgent(latest);
    }
  }, [agents, activeAgent]);

  useEffect(() => {
    if (!toast) {
      return undefined;
    }

    const timeout = window.setTimeout(() => setToast(null), AUTO_DISMISS_MS);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const availableStatuses = useMemo(() => {
    const unique = new Set<AgentStatus>();
    for (const agent of agents) {
      unique.add(agent.status);
    }
    return Array.from(unique.values()).sort(
      (a, b) => STATUS_ORDER.indexOf(a) - STATUS_ORDER.indexOf(b),
    );
  }, [agents]);

  const normalizedQuery = query.trim().toLowerCase();

  const filteredAgents = useMemo(() => {
    return agents.filter((agent) => {
      if (statusFilter !== 'all' && agent.status !== statusFilter) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      const haystack = [
        agent.title,
        agent.name,
        agent.owner ?? '',
        agent.capabilities.join(' '),
        agent.model?.name ?? '',
        agent.model?.provider ?? '',
      ]
        .join(' ')
        .toLowerCase();

      return haystack.includes(normalizedQuery);
    });
  }, [agents, normalizedQuery, statusFilter]);

  const handleSmoke = useCallback((agent: AgentSummary) => {
    const existing = smokeControllers.current.get(agent.name);
    existing?.abort();

    const controller = new AbortController();
    smokeControllers.current.set(agent.name, controller);

    setPendingSmoke(agent.name);
    setToast(null);

    postAgentSmokeRun(agent.name, controller.signal)
      .then((run) => {
        if (controller.signal.aborted) {
          return;
        }
        setToast({
          kind: 'success',
          title: `Smoke disparado para ${agent.title}`,
          description: run.summary,
          run,
          agent,
        });
      })
      .catch((cause) => {
        if (controller.signal.aborted) {
          return;
        }
        const message =
          cause instanceof ApiError
            ? cause.message
            : 'Falha ao executar smoke no runner.';
        setToast({
          kind: 'error',
          title: `Falha ao executar smoke para ${agent.title}`,
          description: message,
          run: null,
          agent,
        });
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setPendingSmoke((current) => (current === agent.name ? null : current));
        }
        smokeControllers.current.delete(agent.name);
      });
  }, []);

  const handleDetail = useCallback((agent: AgentSummary) => {
    setActiveAgent(agent);
  }, []);

  const handleCloseDetail = useCallback(() => {
    setActiveAgent(null);
  }, []);

  const renderTable = filteredAgents.length > 0;

  return (
    <section className="agents">
      <header className="agents__header">
        <div>
          <h2>Catálogo de agents</h2>
          <p>Monitore owners, status operacionais e últimos deploys.</p>
        </div>
        <div className="agents__controls">
          <form
            className="agents__filters"
            onSubmit={(event) => event.preventDefault()}
            role="search"
          >
            <label className="agents__filter">
              <span>Buscar agente</span>
              <input
                type="search"
                value={query}
                placeholder="Nome, owner ou capability"
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <label className="agents__filter">
              <span>Filtrar status</span>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
              >
                <option value="all">Todos</option>
                {availableStatuses.map((status) => (
                  <option key={status} value={status}>
                    {formatStatus(status)}
                  </option>
                ))}
              </select>
            </label>
          </form>
          <button type="button" className="agents__create-button" onClick={handleOpenCreate}>
            + Novo agent
          </button>
        </div>
      </header>

      <SmokeEndpointsPanel />

      {toast ? (
        <div
          className={
            toast.kind === 'success'
              ? 'agents__toast agents__toast--success'
              : 'agents__toast agents__toast--error'
          }
          role="status"
          aria-live="polite"
        >
          <div className="agents__toast-content">
            <strong>{toast.title}</strong>
            {toast.run ? (
              <p>
                Execução {toast.run.runId}:{' '}
                <strong>{formatSmokeStatus(toast.run.status)}</strong>
              </p>
            ) : null}
            {toast.description ? <p>{toast.description}</p> : null}
            {toast.run?.reportUrl ? (
              <p>
                <a href={toast.run.reportUrl} target="_blank" rel="noreferrer">
                  Abrir relatório
                </a>
              </p>
            ) : null}
          </div>
          <button
            type="button"
            className="agents__toast-dismiss"
            onClick={() => setToast(null)}
            aria-label="Fechar alerta"
          >
            ×
          </button>
        </div>
      ) : null}

      {error ? (
        <div className="agents__empty" role="alert">
          {error}
        </div>
      ) : isLoading ? (
        <p className="agents__empty">Carregando catálogo de agents…</p>
      ) : !renderTable ? (
        <div className="agents__empty" role="status">
          Nenhum agent encontrado com os filtros aplicados.
        </div>
      ) : (
        <>
          <table className="agents__table">
            <thead>
              <tr>
                <th scope="col">Nome</th>
                <th scope="col">Modelo</th>
                <th scope="col">Status</th>
                <th scope="col">Último deploy</th>
                <th scope="col">Owner</th>
                <th scope="col" aria-label="Ações" />
              </tr>
            </thead>
            <tbody>
              {filteredAgents.map((agent) => (
                <tr key={agent.name}>
                  <th scope="row">
                    <div className="agents__name">
                      <span className="agents__name-title">{agent.title}</span>
                      <span className="agents__name-meta">
                        {agent.name} · v{agent.version}
                      </span>
                    </div>
                  </th>
                  <td>
                    <div className="agents__model" title={formatModel(agent)}>
                      <span>{formatModel(agent)}</span>
                    </div>
                  </td>
                  <td>
                    <span className={`agents__status ${STATUS_CLASS[agent.status]}`}>
                      {formatStatus(agent.status)}
                    </span>
                  </td>
                  <td>
                    <time dateTime={agent.lastDeployedAt ?? undefined}>
                      {formatAgentTimestamp(agent.lastDeployedAt)}
                    </time>
                  </td>
                  <td>{agent.owner ?? '—'}</td>
                  <td>
                    <div className="agents__actions">
                      <button
                        type="button"
                        className="agents__detail-button"
                        onClick={() => handleDetail(agent)}
                        aria-label={`Abrir detalhes de ${agent.title}`}
                      >
                        Detalhes
                      </button>
                      <button
                        type="button"
                        className="agents__smoke-button"
                        onClick={() => handleSmoke(agent)}
                        disabled={pendingSmoke === agent.name}
                        aria-label={`Executar smoke para ${agent.title}`}
                      >
                        {pendingSmoke === agent.name ? 'Executando…' : 'Smoke'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <ul className="agents__cards">
            {filteredAgents.map((agent) => (
              <li key={agent.name} className="agents__card">
                <div>
                  <h3>{agent.title}</h3>
                  <p className="agents__card-subtitle">
                    {agent.name} · v{agent.version}
                  </p>
                </div>
                <dl className="agents__card-grid">
                  <div>
                    <dt>Modelo</dt>
                    <dd>{formatModel(agent)}</dd>
                  </div>
                  <div>
                    <dt>Status</dt>
                    <dd>
                      <span className={`agents__status ${STATUS_CLASS[agent.status]}`}>
                        {formatStatus(agent.status)}
                      </span>
                    </dd>
                  </div>
                  <div>
                    <dt>Último deploy</dt>
                    <dd>{formatAgentTimestamp(agent.lastDeployedAt)}</dd>
                  </div>
                  <div>
                    <dt>Owner</dt>
                    <dd>{agent.owner ?? '—'}</dd>
                  </div>
                </dl>
                <div className="agents__card-footer">
                  <span className="agents__card-capabilities">
                    {agent.capabilities.length > 0
                      ? agent.capabilities.join(', ')
                      : 'Sem capabilities cadastradas'}
                  </span>
                  <div className="agents__card-actions">
                    <button
                      type="button"
                      className="agents__detail-button"
                      onClick={() => handleDetail(agent)}
                      aria-label={`Abrir detalhes de ${agent.title}`}
                    >
                      Detalhes
                    </button>
                    <button
                      type="button"
                      className="agents__smoke-button"
                      onClick={() => handleSmoke(agent)}
                      disabled={pendingSmoke === agent.name}
                      aria-label={`Executar smoke para ${agent.title}`}
                    >
                      {pendingSmoke === agent.name ? 'Executando…' : 'Smoke'}
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
      {activeAgent ? (
        <AgentDetailPanel key={activeAgent.name} agent={activeAgent} onClose={handleCloseDetail} />
      ) : null}
      <AgentCreateWizard
        isOpen={isCreateWizardOpen}
        onClose={handleCloseCreate}
        onAgentCreated={handleAgentCreated}
      />
    </section>
  );
}

export default Agents;
