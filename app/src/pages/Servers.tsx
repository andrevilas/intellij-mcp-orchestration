import { useEffect, useMemo, useRef, useState } from 'react';

import type { ProviderSummary, Session } from '../api';
import ServerActions, { type ServerAction } from '../components/ServerActions';
import { seededMod } from '../utils/hash';

export interface ServersProps {
  providers: ProviderSummary[];
  sessions: Session[];
  isLoading: boolean;
  initialError: string | null;
}

type ServerStatus = 'up' | 'down';

interface LocalLogEntry {
  id: string;
  timestamp: string;
  message: string;
  origin: 'action' | 'status';
}

interface ServerState {
  status: ServerStatus;
  uptimeAnchor: number | null;
  localLogs: LocalLogEntry[];
}

const MAX_LOCAL_LOGS = 12;
const MAX_COMBINED_LOGS = 15;

const ACTION_MESSAGES: Record<ServerAction, { requested: string; completed: string }> = {
  start: {
    requested: 'Iniciando servidor via MCP Console…',
    completed: 'Servidor inicializado e pronto para provisionamento.',
  },
  stop: {
    requested: 'Solicitando parada graciosa do servidor…',
    completed: 'Servidor finalizado. Processo encerrado com sucesso.',
  },
  restart: {
    requested: 'Reinício solicitado. Enfileirando drain das conexões…',
    completed: 'Servidor reiniciado. Healthcheck reporta status UP.',
  },
};

function createLogEntry(message: string, origin: LocalLogEntry['origin'] = 'action'): LocalLogEntry {
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    timestamp: new Date().toISOString(),
    message,
    origin,
  };
}

function clampLogs(entries: LocalLogEntry[]): LocalLogEntry[] {
  return entries.slice(0, MAX_LOCAL_LOGS);
}

function initializeState(provider: ProviderSummary): ServerState {
  const isOnline = provider.is_available !== false;
  const uptimeSeed = seededMod(provider.id, 72 * 60 * 60 * 1000);
  return {
    status: isOnline ? 'up' : 'down',
    uptimeAnchor: isOnline ? Date.now() - uptimeSeed : null,
    localLogs: [],
  };
}

function formatUptime(anchor: number | null): string {
  if (!anchor) {
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

function createSessionLog(session: Session): LocalLogEntry {
  const status = session.status.toLowerCase();
  const reason = session.reason ? ` · ${session.reason}` : '';
  const client = session.client ? ` (cliente: ${session.client})` : '';
  return {
    id: `session-${session.id}`,
    timestamp: session.created_at,
    message: `Sessão ${session.id} — ${status}${reason}${client}`,
    origin: 'status',
  };
}

function mergeLogs(local: LocalLogEntry[], sessionLogs: LocalLogEntry[]): LocalLogEntry[] {
  const combined = [...local, ...sessionLogs];
  combined.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  return combined.slice(0, MAX_COMBINED_LOGS);
}

function getStatusLabel(status: ServerStatus): string {
  return status === 'up' ? 'Online' : 'Offline';
}

export default function Servers({ providers, sessions, isLoading, initialError }: ServersProps) {
  const [serverStates, setServerStates] = useState<Record<string, ServerState>>({});
  const [pendingAction, setPendingAction] = useState<{ providerId: string; action: ServerAction } | null>(null);
  const pendingTimeouts = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    return () => {
      pendingTimeouts.current.forEach((timeout) => clearTimeout(timeout));
      pendingTimeouts.current.clear();
    };
  }, []);

  useEffect(() => {
    setServerStates((current) => {
      const next: Record<string, ServerState> = {};
      for (const provider of providers) {
        const existing = current[provider.id];
        if (!existing) {
          next[provider.id] = initializeState(provider);
          continue;
        }

        let status: ServerStatus = existing.status;
        let uptimeAnchor = existing.uptimeAnchor;
        let localLogs = existing.localLogs;

        if (provider.is_available === false && existing.status === 'up') {
          status = 'down';
          uptimeAnchor = null;
          localLogs = clampLogs([createLogEntry('Healthcheck sinalizou indisponibilidade.', 'status'), ...localLogs]);
        }

        next[provider.id] = { status, uptimeAnchor, localLogs };
      }
      return next;
    });
  }, [providers]);

  const sessionsByProvider = useMemo(() => {
    const map = new Map<string, LocalLogEntry[]>();
    const ordered = sessions.slice().sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    for (const session of ordered) {
      const entry = createSessionLog(session);
      const existing = map.get(session.provider_id) ?? [];
      if (existing.length >= MAX_COMBINED_LOGS) {
        continue;
      }
      map.set(session.provider_id, [...existing, entry]);
    }
    return map;
  }, [sessions]);

  function updateState(providerId: string, updater: (previous: ServerState) => ServerState) {
    const provider = providers.find((item) => item.id === providerId);
    setServerStates((current) => {
      const currentState = current[providerId] ?? initializeState(
        provider ?? {
          id: providerId,
          name: providerId,
          command: providerId,
          tags: [],
          capabilities: [],
          transport: 'stdio',
        },
      );
      return {
        ...current,
        [providerId]: updater(currentState),
      };
    });
  }

  function handleAction(providerId: string, action: ServerAction) {
    const requestedMessage = ACTION_MESSAGES[action].requested;
    const completedMessage = ACTION_MESSAGES[action].completed;

    setPendingAction({ providerId, action });

    updateState(providerId, (previous) => ({
      status: previous.status,
      uptimeAnchor: previous.uptimeAnchor,
      localLogs: clampLogs([createLogEntry(requestedMessage), ...previous.localLogs]),
    }));

    const timeout = setTimeout(() => {
      updateState(providerId, (previous) => {
        const status: ServerStatus = action === 'stop' ? 'down' : 'up';
        const uptimeAnchor = status === 'up' ? Date.now() : null;
        return {
          status,
          uptimeAnchor,
          localLogs: clampLogs([createLogEntry(completedMessage), ...previous.localLogs]),
        };
      });

      setPendingAction((current) => {
        if (current && current.providerId === providerId) {
          return null;
        }
        return current;
      });
      pendingTimeouts.current.delete(providerId);
    }, 900);

    pendingTimeouts.current.set(providerId, timeout);
  }

  const hasProviders = providers.length > 0;

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
          <strong>{providers.filter((provider) => (serverStates[provider.id]?.status ?? 'up') === 'up').length}</strong>
          <span>online</span>
        </div>
        <div className="status-pill status-pill--offline">
          <span className="status-pill__dot status-pill__dot--offline" />
          <strong>{providers.filter((provider) => (serverStates[provider.id]?.status ?? 'up') === 'down').length}</strong>
          <span>offline</span>
        </div>
        <div className="status-pill status-pill--total">
          <span className="status-pill__dot status-pill__dot--total" />
          <strong>{providers.length}</strong>
          <span>total</span>
        </div>
      </section>

      {isLoading && <p className="info">Sincronizando informações dos servidores…</p>}
      {initialError && <p className="error">{initialError}</p>}

      {!isLoading && !initialError && !hasProviders && (
        <p className="info">Cadastre servidores MCP para acompanhar ações de start/stop por aqui.</p>
      )}

      <section className="server-grid" aria-live="polite">
        {providers.map((provider) => {
          const state = serverStates[provider.id] ?? initializeState(provider);
          const sessionLogs = sessionsByProvider.get(provider.id) ?? [];
          const combinedLogs = mergeLogs(state.localLogs, sessionLogs);
          const lastSession = sessionLogs[0];
          const pendingForProvider = pendingAction && pendingAction.providerId === provider.id ? pendingAction.action : null;

          return (
            <article key={provider.id} className="server-card">
              <header className="server-card__header">
                <div>
                  <h2>{provider.name}</h2>
                  <p className="server-card__meta">{provider.description || 'Sem descrição informada.'}</p>
                </div>
                <span
                  className={`server-status ${state.status === 'up' ? 'server-status--up' : 'server-status--down'}`}
                  aria-live="polite"
                >
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
                  <dd>{formatUptime(state.uptimeAnchor)}</dd>
                </div>
                <div>
                  <dt>Última sessão</dt>
                  <dd>{lastSession ? new Date(lastSession.timestamp).toLocaleString() : '—'}</dd>
                </div>
              </dl>

              <ServerActions
                status={state.status}
                pendingAction={pendingForProvider}
                onStart={() => handleAction(provider.id, 'start')}
                onStop={() => handleAction(provider.id, 'stop')}
                onRestart={() => handleAction(provider.id, 'restart')}
              />

              <div className="server-card__logs">
                <header>
                  <h3>Log tail</h3>
                  <span>{combinedLogs.length > 0 ? `${combinedLogs.length} eventos recentes` : 'Sem eventos registrados'}</span>
                </header>
                <ol>
                  {combinedLogs.map((log) => (
                    <li key={log.id}>
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
