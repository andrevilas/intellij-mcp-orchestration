import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  ApiError,
  type ProviderSummary,
  type ServerProcessLifecycle,
  type ServerProcessLogsResult,
  type ServerProcessLogEntry,
  type ServerProcessStateSnapshot,
  fetchServerProcessLogs,
  fetchServerProcesses,
  restartServerProcess,
  startServerProcess,
  stopServerProcess,
} from '../api';
import ServerActions, { type ServerAction } from '../components/ServerActions';

export interface ServersProps {
  providers: ProviderSummary[];
  isLoading: boolean;
  initialError: string | null;
}

const MAX_LOG_ENTRIES = 20;

function createFallbackState(provider: ProviderSummary): ServerProcessStateSnapshot {
  return {
    serverId: provider.id,
    status: 'stopped',
    command: provider.command,
    pid: null,
    startedAt: null,
    stoppedAt: null,
    returnCode: null,
    lastError: null,
    logs: [],
    cursor: null,
  };
}

function dedupeAndSortLogs(entries: ServerProcessLogEntry[]): ServerProcessLogEntry[] {
  const map = new Map<string, ServerProcessLogEntry>();
  for (const entry of entries) {
    map.set(entry.id, entry);
  }
  return Array.from(map.values())
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, MAX_LOG_ENTRIES);
}

function mergeSnapshots(
  previous: ServerProcessStateSnapshot | undefined,
  incoming: ServerProcessStateSnapshot,
): ServerProcessStateSnapshot {
  if (!previous) {
    return {
      ...incoming,
      logs: dedupeAndSortLogs(incoming.logs),
    };
  }

  const logs = dedupeAndSortLogs([...incoming.logs, ...previous.logs]);
  return {
    serverId: incoming.serverId,
    status: incoming.status,
    command: incoming.command,
    pid: incoming.pid,
    startedAt: incoming.startedAt,
    stoppedAt: incoming.stoppedAt,
    returnCode: incoming.returnCode,
    lastError: incoming.lastError,
    logs,
    cursor: incoming.cursor ?? previous.cursor ?? null,
  };
}

function mergeLogsIntoState(
  state: ServerProcessStateSnapshot,
  result: ServerProcessLogsResult,
): ServerProcessStateSnapshot {
  if (result.logs.length === 0) {
    if ((result.cursor ?? state.cursor) === state.cursor) {
      return state;
    }
    return { ...state, cursor: result.cursor ?? state.cursor ?? null };
  }

  const logs = dedupeAndSortLogs([...result.logs, ...state.logs]);
  return {
    ...state,
    logs,
    cursor: result.cursor ?? state.cursor ?? null,
  };
}

function formatUptime(startedAt: string | null): string {
  if (!startedAt) {
    return '—';
  }
  const anchor = new Date(startedAt).getTime();
  if (Number.isNaN(anchor)) {
    return '—';
  }
  const diff = Date.now() - anchor;
  if (diff <= 0) {
    return '<1m';
  }
  const totalMinutes = Math.floor(diff / (1000 * 60));
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  const parts: string[] = [];
  if (days > 0) {
    parts.push(`${days}d`);
  }
  if (hours > 0) {
    parts.push(`${hours}h`);
  }
  if (minutes > 0 && parts.length < 2) {
    parts.push(`${minutes}m`);
  }
  return parts.length > 0 ? parts.join(' ') : '<1m';
}

function getStatusLabel(status: ServerProcessLifecycle): string {
  switch (status) {
    case 'running':
      return 'Online';
    case 'stopped':
      return 'Offline';
    case 'error':
      return 'Falha';
    default:
      return status;
  }
}

function getStatusClass(status: ServerProcessLifecycle): string {
  switch (status) {
    case 'running':
      return 'server-status--up';
    case 'error':
      return 'server-status--error';
    default:
      return 'server-status--down';
  }
}

export default function Servers({ providers, isLoading, initialError }: ServersProps) {
  const [processStates, setProcessStates] = useState<Record<string, ServerProcessStateSnapshot>>({});
  const [pendingAction, setPendingAction] = useState<{ providerId: string; action: ServerAction } | null>(null);
  const [actionErrors, setActionErrors] = useState<Record<string, string | null>>({});
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  const processStatesRef = useRef<Record<string, ServerProcessStateSnapshot>>({});
  const actionControllers = useRef<Map<string, AbortController>>(new Map());
  const isMountedRef = useRef(true);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      actionControllers.current.forEach((controller) => controller.abort());
      actionControllers.current.clear();
    };
  }, []);

  useEffect(() => {
    processStatesRef.current = processStates;
  }, [processStates]);

  useEffect(() => {
    if (providers.length === 0) {
      setProcessStates({});
      return;
    }

    const controller = new AbortController();
    setIsSyncing(true);
    setSyncError(null);

    fetchServerProcesses(controller.signal)
      .then((snapshots) => {
        if (!isMountedRef.current || controller.signal.aborted) {
          return;
        }

        setProcessStates((current) => {
          const snapshotMap = new Map<string, ServerProcessStateSnapshot>();
          for (const snapshot of snapshots) {
            snapshotMap.set(snapshot.serverId, snapshot);
          }

          const next: Record<string, ServerProcessStateSnapshot> = {};
          for (const provider of providers) {
            const incoming = snapshotMap.get(provider.id) ?? createFallbackState(provider);
            next[provider.id] = mergeSnapshots(current[provider.id], incoming);
          }
          return next;
        });
      })
      .catch((error) => {
        if (!controller.signal.aborted && isMountedRef.current) {
          const message = error instanceof Error ? error.message : 'Falha ao sincronizar estado do supervisor';
          setSyncError(message);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted && isMountedRef.current) {
          setIsSyncing(false);
        }
      });

    return () => controller.abort();
  }, [providers]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      const states = processStatesRef.current;
      const updates = Object.values(states)
        .filter((state) => state.cursor !== null)
        .map(async (state) => {
          try {
            const result = await fetchServerProcessLogs(state.serverId, state.cursor ?? undefined);
            return { serverId: state.serverId, result };
          } catch (error) {
            if (error instanceof DOMException && error.name === 'AbortError') {
              return null;
            }
            console.error('Falha ao atualizar logs do supervisor', error);
            return null;
          }
        });

      if (updates.length === 0) {
        return;
      }

      void Promise.all(updates).then((results) => {
        if (!isMountedRef.current) {
          return;
        }
        setProcessStates((current) => {
          let mutated = false;
          const next = { ...current };
          for (const entry of results) {
            if (!entry) {
              continue;
            }
            const currentState = current[entry.serverId];
            if (!currentState) {
              continue;
            }
            const merged = mergeLogsIntoState(currentState, entry.result);
            if (merged !== currentState) {
              next[entry.serverId] = merged;
              mutated = true;
            }
          }
          return mutated ? next : current;
        });
      });
    }, 5000);

    return () => window.clearInterval(interval);
  }, []);

  const handleAction = useCallback(
    (providerId: string, action: ServerAction) => {
      const previousController = actionControllers.current.get(providerId);
      previousController?.abort();

      const controller = new AbortController();
      actionControllers.current.set(providerId, controller);

      const runner =
        action === 'start' ? startServerProcess : action === 'stop' ? stopServerProcess : restartServerProcess;

      setPendingAction({ providerId, action });
      setActionErrors((current) => ({ ...current, [providerId]: null }));

      runner(providerId, controller.signal)
        .then((snapshot) => {
          if (!isMountedRef.current || controller.signal.aborted) {
            return;
          }
          setProcessStates((current) => ({
            ...current,
            [providerId]: mergeSnapshots(current[providerId], snapshot),
          }));
        })
        .catch((error) => {
          if (!isMountedRef.current || controller.signal.aborted) {
            return;
          }
          const message =
            error instanceof ApiError ? error.message : 'Falha ao executar ação no servidor supervisionado.';
          setActionErrors((current) => ({ ...current, [providerId]: message }));
        })
        .finally(() => {
          if (!controller.signal.aborted && isMountedRef.current) {
            setPendingAction((current) => {
              if (current && current.providerId === providerId) {
                return null;
              }
              return current;
            });
            actionControllers.current.delete(providerId);
          }
        });
    },
    [],
  );

  const hasProviders = providers.length > 0;

  const statusSummary = useMemo(() => {
    let running = 0;
    let offline = 0;
    for (const provider of providers) {
      const status = processStates[provider.id]?.status ?? 'stopped';
      if (status === 'running') {
        running += 1;
      } else {
        offline += 1;
      }
    }
    return { running, offline };
  }, [processStates, providers]);

  return (
    <main className="servers">
      <section className="servers__hero">
        <h1>Servidores MCP · operações</h1>
        <p>
          Gerencie o ciclo de vida dos servidores MCP diretamente pela console. Acompanhe status em tempo real, uptime e eventos
          recentes.
        </p>
      </section>

      <section className="servers__status" aria-label="Resumo dos servidores">
        <div className="status-pill">
          <span className="status-pill__dot status-pill__dot--online" />
          <strong>{statusSummary.running}</strong>
          <span>online</span>
        </div>
        <div className="status-pill status-pill--offline">
          <span className="status-pill__dot status-pill__dot--offline" />
          <strong>{statusSummary.offline}</strong>
          <span>offline</span>
        </div>
        <div className="status-pill status-pill--total">
          <span className="status-pill__dot status-pill__dot--total" />
          <strong>{providers.length}</strong>
          <span>total</span>
        </div>
      </section>

      {(isLoading || isSyncing) && <p className="info">Sincronizando informações dos servidores…</p>}
      {initialError && <p className="error">{initialError}</p>}
      {syncError && <p className="error">{syncError}</p>}

      {!isLoading && !initialError && !hasProviders && (
        <p className="info">Cadastre servidores MCP para acompanhar ações de start/stop por aqui.</p>
      )}

      <section className="server-grid" aria-live="polite">
        {providers.map((provider) => {
          const state = processStates[provider.id] ?? createFallbackState(provider);
          const pendingForProvider =
            pendingAction && pendingAction.providerId === provider.id ? pendingAction.action : null;
          const actionMessage = actionErrors[provider.id] ?? state.lastError ?? null;

          return (
            <article key={provider.id} className="server-card">
              <header className="server-card__header">
                <div>
                  <h2>{provider.name}</h2>
                  <p className="server-card__meta">{provider.description || 'Sem descrição informada.'}</p>
                </div>
                <span className={`server-status ${getStatusClass(state.status)}`} aria-live="polite">
                  {getStatusLabel(state.status)}
                </span>
              </header>

              <dl className="server-card__details">
                <div>
                  <dt>Comando</dt>
                  <dd>
                    <code>{provider.command}</code>
                  </dd>
                </div>
                <div>
                  <dt>Transporte</dt>
                  <dd>{provider.transport}</dd>
                </div>
                <div>
                  <dt>Uptime</dt>
                  <dd>{formatUptime(state.startedAt)}</dd>
                </div>
                <div>
                  <dt>Status detalhado</dt>
                  <dd>{state.lastError ? state.lastError : '—'}</dd>
                </div>
              </dl>

              <ServerActions
                status={state.status}
                pendingAction={pendingForProvider}
                onStart={() => handleAction(provider.id, 'start')}
                onStop={() => handleAction(provider.id, 'stop')}
                onRestart={() => handleAction(provider.id, 'restart')}
              >
                {actionMessage && <p className="server-actions__feedback">{actionMessage}</p>}
              </ServerActions>

              <div className="server-card__logs">
                <header>
                  <h3>Log tail</h3>
                  <span>
                    {state.logs.length > 0 ? `${state.logs.length} eventos recentes` : 'Sem eventos registrados'}
                  </span>
                </header>
                <ol>
                  {state.logs.map((log) => (
                    <li key={log.id} className={log.level === 'error' ? 'log-entry log-entry--error' : 'log-entry'}>
                      <span className="log-timestamp">{new Date(log.timestamp).toLocaleTimeString()}</span>
                      <span className="log-message">{log.message}</span>
                    </li>
                  ))}
                </ol>
              </div>
            </article>
          );
        })}
      </section>
    </main>
  );
}
