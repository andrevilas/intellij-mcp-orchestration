import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';

import {
  ApiError,
  type McpServer,
  type ProviderSummary,
  type ServerHealthCheck,
  type ServerHealthStatus,
  type ServerProcessLifecycle,
  type ServerProcessLogEntry,
  type ServerProcessLogsResult,
  type ServerProcessStateSnapshot,
  type DiagnosticsResponse,
  type DiagnosticsComponent,
  deleteServerDefinition,
  fetchServerHealthHistory,
  fetchServerProcessLogs,
  fetchServerProcesses,
  pingServerHealth,
  runDiagnostics,
  restartServerProcess,
  startServerProcess,
  stopServerProcess,
  updateServerDefinition,
} from '../api';
import ServerActions, { type ServerAction } from '../components/ServerActions';
import ConfirmationModal from '../components/modals/ConfirmationModal';

export interface ServersProps {
  providers: ProviderSummary[];
  isLoading: boolean;
  initialError: string | null;
}

const MAX_LOG_ENTRIES = 20;
const MAX_HEALTH_ENTRIES = 6;

interface EditServerFormData {
  name: string;
  command: string;
  description: string;
  tags: string[];
  capabilities: string[];
  transport: string;
}

interface EditDialogProps {
  provider: ProviderSummary | null;
  isOpen: boolean;
  isSubmitting: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (data: EditServerFormData) => void;
}

interface DeleteDialogProps {
  provider: ProviderSummary | null;
  isOpen: boolean;
  isSubmitting: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}

interface ServerActionConfirmation {
  provider: ProviderSummary;
  action: ServerAction;
}

const SERVER_ACTION_COPY: Record<ServerAction, {
  title: string;
  confirm: string;
  armed: string;
  description: (name: string) => string;
}> = {
  start: {
    title: 'Iniciar servidor',
    confirm: 'Iniciar servidor',
    armed: 'Iniciar agora',
    description: (name: string) =>
      `Confirme para iniciar ${name}. O supervisor executará o comando configurado para esse servidor MCP.`,
  },
  stop: {
    title: 'Parar servidor',
    confirm: 'Parar servidor',
    armed: 'Parar agora',
    description: (name: string) =>
      `Confirme para encerrar ${name}. O processo supervisionado será finalizado e novos requests serão bloqueados.`,
  },
  restart: {
    title: 'Reiniciar servidor',
    confirm: 'Reiniciar servidor',
    armed: 'Reiniciar agora',
    description: (name: string) =>
      `Confirme para reiniciar ${name}. O supervisor encerrará o processo atual antes de iniciar uma nova instância.`,
  },
};

interface PingStatus {
  isLoading: boolean;
  error: string | null;
}

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

function formatHealthStatus(status: ServerHealthStatus): string {
  switch (status) {
    case 'healthy':
      return 'Saudável';
    case 'degraded':
      return 'Instável';
    case 'error':
      return 'Falha';
    default:
      return status;
  }
}

interface DiagnosticsState {
  isRunning: boolean;
  result: DiagnosticsResponse | null;
  error: string | null;
}

function resolveProviderCountFromData(data: unknown): number | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return null;
  }
  const providers = (data as { providers?: unknown }).providers;
  return Array.isArray(providers) ? providers.length : null;
}

function describeDiagnosticsComponent(
  component: DiagnosticsComponent,
  okMessage: string,
  fallback: string,
): string {
  if (component.ok) {
    return okMessage;
  }
  return component.error && component.error.trim().length > 0 ? component.error : fallback;
}

function getHealthBadgeClass(status: ServerHealthStatus | null | undefined): string {
  switch (status) {
    case 'healthy':
      return 'server-health__badge server-health__badge--healthy';
    case 'degraded':
      return 'server-health__badge server-health__badge--degraded';
    case 'error':
      return 'server-health__badge server-health__badge--error';
    default:
      return 'server-health__badge';
  }
}

function formatCheckedAt(checkedAt: string): string {
  const parsed = new Date(checkedAt);
  if (Number.isNaN(parsed.getTime())) {
    return checkedAt;
  }
  return `${parsed.toLocaleDateString()} ${parsed.toLocaleTimeString()}`;
}

function parseCommaSeparated(value: string): string[] {
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function mapServerToProvider(server: McpServer, fallback?: ProviderSummary): ProviderSummary {
  return {
    id: server.id,
    name: server.name,
    command: server.command,
    description: server.description ?? undefined,
    tags: server.tags,
    capabilities: server.capabilities,
    transport: server.transport,
    is_available: fallback?.is_available ?? true,
  };
}

function EditServerDialog({ provider, isOpen, isSubmitting, error, onCancel, onSubmit }: EditDialogProps) {
  const [name, setName] = useState('');
  const [command, setCommand] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');
  const [capabilities, setCapabilities] = useState('');
  const [transport, setTransport] = useState('stdio');
  const [validationErrors, setValidationErrors] = useState<{ name?: string; command?: string }>({});
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const nameInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isOpen || !provider) {
      return;
    }
    setValidationErrors({});
    setName(provider.name);
    setCommand(provider.command);
    setDescription(provider.description ?? '');
    setTags(provider.tags.join(', '));
    setCapabilities(provider.capabilities.join(', '));
    setTransport(provider.transport);

    const frame = requestAnimationFrame(() => {
      nameInputRef.current?.focus({ preventScroll: true });
    });

    return () => cancelAnimationFrame(frame);
  }, [isOpen, provider?.id]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    function handleKeydown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCancel();
      }
    }
    document.addEventListener('keydown', handleKeydown);
    return () => document.removeEventListener('keydown', handleKeydown);
  }, [isOpen, onCancel]);

  if (!isOpen || !provider) {
    return null;
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedName = name.trim();
    const trimmedCommand = command.trim();
    const errors: { name?: string; command?: string } = {};
    if (!trimmedName) {
      errors.name = 'Informe um nome legível para o servidor MCP.';
    }
    if (!trimmedCommand) {
      errors.command = 'Informe o comando de execução ou endpoint do servidor MCP.';
    }
    setValidationErrors(errors);
    if (Object.keys(errors).length > 0) {
      return;
    }
    onSubmit({
      name: trimmedName,
      command: trimmedCommand,
      description: description.trim(),
      tags: parseCommaSeparated(tags),
      capabilities: parseCommaSeparated(capabilities),
      transport: transport.trim() || 'stdio',
    });
  };

  function handleBackdropClick(event: React.MouseEvent<HTMLDivElement>) {
    if (event.target === dialogRef.current) {
      onCancel();
    }
  }

  return (
    <div className="server-dialog" role="dialog" aria-modal="true" aria-labelledby="edit-server-title" ref={dialogRef} onClick={handleBackdropClick}>
      <div className="server-dialog__content">
        <header className="server-dialog__header">
          <h2 id="edit-server-title">Editar servidor MCP</h2>
          <p>Atualize metadados, comando de execução e taxonomia utilizada nas automações.</p>
        </header>
        <form className="server-dialog__form" onSubmit={handleSubmit}>
          <label className="server-dialog__field">
            <span>Nome exibido</span>
            <input ref={nameInputRef} value={name} onChange={(event) => setName(event.target.value)} disabled={isSubmitting} />
            {validationErrors.name && <span className="server-dialog__error">{validationErrors.name}</span>}
          </label>
          <label className="server-dialog__field">
            <span>Comando/endpoint</span>
            <input value={command} onChange={(event) => setCommand(event.target.value)} disabled={isSubmitting} />
            {validationErrors.command && <span className="server-dialog__error">{validationErrors.command}</span>}
          </label>
          <label className="server-dialog__field">
            <span>Descrição</span>
            <textarea value={description} onChange={(event) => setDescription(event.target.value)} disabled={isSubmitting} rows={3} />
          </label>
          <label className="server-dialog__field">
            <span>Transporte</span>
            <input value={transport} onChange={(event) => setTransport(event.target.value)} disabled={isSubmitting} />
          </label>
          <label className="server-dialog__field">
            <span>Tags (separadas por vírgula)</span>
            <input value={tags} onChange={(event) => setTags(event.target.value)} disabled={isSubmitting} />
          </label>
          <label className="server-dialog__field">
            <span>Capacidades (separadas por vírgula)</span>
            <input value={capabilities} onChange={(event) => setCapabilities(event.target.value)} disabled={isSubmitting} />
          </label>
          {error && <p className="server-dialog__error" role="alert">{error}</p>}
          <div className="server-dialog__actions">
            <button type="button" onClick={onCancel} disabled={isSubmitting}>
              Cancelar
            </button>
            <button type="submit" className="server-dialog__primary" disabled={isSubmitting}>
              {isSubmitting ? 'Salvando…' : 'Salvar alterações'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ConfirmDeleteDialog({ provider, isOpen, isSubmitting, error, onCancel, onConfirm }: DeleteDialogProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    function handleKeydown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCancel();
      }
    }
    document.addEventListener('keydown', handleKeydown);
    return () => document.removeEventListener('keydown', handleKeydown);
  }, [isOpen, onCancel]);

  if (!isOpen || !provider) {
    return null;
  }

  function handleBackdropClick(event: React.MouseEvent<HTMLDivElement>) {
    if (event.target === dialogRef.current) {
      onCancel();
    }
  }

  return (
    <div className="server-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-server-title" ref={dialogRef} onClick={handleBackdropClick}>
      <div className="server-dialog__content">
        <header className="server-dialog__header">
          <h2 id="delete-server-title">Remover servidor MCP</h2>
          <p>Essa ação remove o servidor do catálogo. Supervisão e históricos deixarão de ser exibidos.</p>
        </header>
        <div className="server-dialog__body">
          <p>
            Deseja realmente remover <strong>{provider.name}</strong>? Essa ação não é reversível.
          </p>
          {error && <p className="server-dialog__error" role="alert">{error}</p>}
        </div>
        <div className="server-dialog__actions">
          <button type="button" onClick={onCancel} disabled={isSubmitting}>
            Cancelar
          </button>
          <button type="button" className="server-dialog__danger" onClick={onConfirm} disabled={isSubmitting}>
            {isSubmitting ? 'Removendo…' : 'Remover servidor'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Servers({ providers, isLoading, initialError }: ServersProps) {
  const [processStates, setProcessStates] = useState<Record<string, ServerProcessStateSnapshot>>({});
  const [pendingAction, setPendingAction] = useState<{ providerId: string; action: ServerAction } | null>(null);
  const [actionErrors, setActionErrors] = useState<Record<string, string | null>>({});
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [providerOverrides, setProviderOverrides] = useState<Record<string, ProviderSummary>>({});
  const [hiddenProviders, setHiddenProviders] = useState<string[]>([]);
  const [healthHistory, setHealthHistory] = useState<Record<string, ServerHealthCheck[]>>({});
  const [healthErrors, setHealthErrors] = useState<Record<string, string | null>>({});
  const [pingStatus, setPingStatus] = useState<Record<string, PingStatus>>({});
  const [editState, setEditState] = useState<{ isOpen: boolean; provider: ProviderSummary | null; isSubmitting: boolean; error: string | null }>({
    isOpen: false,
    provider: null,
    isSubmitting: false,
    error: null,
  });
  const [deleteState, setDeleteState] = useState<{ isOpen: boolean; provider: ProviderSummary | null; isSubmitting: boolean; error: string | null }>({
    isOpen: false,
    provider: null,
    isSubmitting: false,
    error: null,
  });
  const [actionConfirmation, setActionConfirmation] = useState<ServerActionConfirmation | null>(null);
  const [isActionConfirming, setIsActionConfirming] = useState(false);
  const [diagnosticsAgent, setDiagnosticsAgent] = useState('catalog-search');
  const [diagnosticsState, setDiagnosticsState] = useState<DiagnosticsState>({
    isRunning: false,
    result: null,
    error: null,
  });

  const processStatesRef = useRef<Record<string, ServerProcessStateSnapshot>>({});
  const actionControllers = useRef<Map<string, AbortController>>(new Map());
  const pingControllers = useRef<Map<string, AbortController>>(new Map());
  const isMountedRef = useRef(true);

  const visibleProviders = useMemo(() => {
    const hidden = new Set(hiddenProviders);
    return providers
      .filter((provider) => !hidden.has(provider.id))
      .map((provider) => providerOverrides[provider.id] ?? provider);
  }, [providers, providerOverrides, hiddenProviders]);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      actionControllers.current.forEach((controller) => controller.abort());
      actionControllers.current.clear();
      pingControllers.current.forEach((controller) => controller.abort());
      pingControllers.current.clear();
    };
  }, []);

  useEffect(() => {
    processStatesRef.current = processStates;
  }, [processStates]);

  const handleDiagnosticsSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const trimmedAgent = diagnosticsAgent.trim();
      if (!trimmedAgent) {
        setDiagnosticsState({ isRunning: false, result: null, error: 'Informe o nome do agent.' });
        return;
      }

      setDiagnosticsState({ isRunning: true, result: null, error: null });
      try {
        const response = await runDiagnostics({
          agent: trimmedAgent,
          config: { metadata: { surface: 'servers-diagnostics' } },
        });
        setDiagnosticsState({ isRunning: false, result: response, error: null });
      } catch (error) {
        const message =
          error instanceof ApiError ? error.message : 'Não foi possível executar o diagnóstico.';
        setDiagnosticsState({ isRunning: false, result: null, error: message });
      }
    },
    [diagnosticsAgent],
  );

  useEffect(() => {
    if (visibleProviders.length === 0) {
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
          for (const provider of visibleProviders) {
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
  }, [visibleProviders]);

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

  useEffect(() => {
    if (visibleProviders.length === 0) {
      setHealthHistory({});
      setHealthErrors({});
      return;
    }

    const controller = new AbortController();

    for (const provider of visibleProviders) {
      setHealthErrors((current) => ({ ...current, [provider.id]: null }));
    }

    void Promise.all(
      visibleProviders.map(async (provider) => {
        try {
          const history = await fetchServerHealthHistory(provider.id, controller.signal);
          if (!isMountedRef.current || controller.signal.aborted) {
            return;
          }
          setHealthHistory((current) => ({
            ...current,
            [provider.id]: history.slice(0, MAX_HEALTH_ENTRIES),
          }));
        } catch (error) {
          if (!isMountedRef.current || controller.signal.aborted) {
            return;
          }
          const message = error instanceof ApiError ? error.message : 'Falha ao carregar histórico de health.';
          setHealthErrors((current) => ({ ...current, [provider.id]: message }));
        }
      }),
    );

    return () => controller.abort();
  }, [visibleProviders]);

  const runServerAction = useCallback((providerId: string, action: ServerAction) => {
    const previousController = actionControllers.current.get(providerId);
    previousController?.abort();

    const controller = new AbortController();
    actionControllers.current.set(providerId, controller);

    const runner =
      action === 'start' ? startServerProcess : action === 'stop' ? stopServerProcess : restartServerProcess;

    setPendingAction({ providerId, action });
    setActionErrors((current) => ({ ...current, [providerId]: null }));

    return runner(providerId, controller.signal)
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
        const message = error instanceof ApiError ? error.message : 'Falha ao executar ação no servidor supervisionado.';
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
  }, []);

  const openActionConfirmation = useCallback((provider: ProviderSummary, action: ServerAction) => {
    setActionConfirmation({ provider, action });
  }, []);

  const closeActionConfirmation = useCallback(() => {
    if (isActionConfirming) {
      return;
    }
    setActionConfirmation(null);
  }, [isActionConfirming]);

  const confirmServerAction = useCallback(() => {
    if (!actionConfirmation) {
      return;
    }
    setIsActionConfirming(true);
    void runServerAction(actionConfirmation.provider.id, actionConfirmation.action).finally(() => {
      setIsActionConfirming(false);
      setActionConfirmation(null);
    });
  }, [actionConfirmation, runServerAction]);

  const handlePing = useCallback((providerId: string) => {
    const previous = pingControllers.current.get(providerId);
    previous?.abort();

    const controller = new AbortController();
    pingControllers.current.set(providerId, controller);

    setPingStatus((current) => ({
      ...current,
      [providerId]: { isLoading: true, error: null },
    }));

    pingServerHealth(providerId, controller.signal)
      .then((check) => {
        if (!isMountedRef.current || controller.signal.aborted) {
          return;
        }
        setHealthHistory((current) => {
          const history = current[providerId] ?? [];
          return {
            ...current,
            [providerId]: [check, ...history].slice(0, MAX_HEALTH_ENTRIES),
          };
        });
        setHealthErrors((current) => ({ ...current, [providerId]: null }));
        setPingStatus((current) => ({
          ...current,
          [providerId]: { isLoading: false, error: null },
        }));
      })
      .catch((error) => {
        if (!isMountedRef.current || controller.signal.aborted) {
          return;
        }
        const message = error instanceof ApiError ? error.message : 'Falha ao executar ping no servidor MCP.';
        setPingStatus((current) => ({
          ...current,
          [providerId]: { isLoading: false, error: message },
        }));
      })
      .finally(() => {
        pingControllers.current.delete(providerId);
      });
  }, []);

  const openEditDialog = useCallback((provider: ProviderSummary) => {
    setEditState({ isOpen: true, provider, isSubmitting: false, error: null });
  }, []);

  const closeEditDialog = useCallback(() => {
    setEditState({ isOpen: false, provider: null, isSubmitting: false, error: null });
  }, []);

  const submitEdit = useCallback(
    (data: EditServerFormData) => {
      const target = editState.provider;
      if (!target) {
        return;
      }
      setEditState((current) => ({ ...current, isSubmitting: true, error: null }));
      updateServerDefinition(target.id, {
        name: data.name,
        command: data.command,
        description: data.description || null,
        tags: data.tags,
        capabilities: data.capabilities,
        transport: data.transport,
      })
        .then((server) => {
          if (!isMountedRef.current) {
            return;
          }
          const updatedProvider = mapServerToProvider(server, target);
          setProviderOverrides((current) => ({ ...current, [server.id]: updatedProvider }));
          setProcessStates((current) => {
            const existing = current[server.id];
            if (!existing) {
              return current;
            }
            return { ...current, [server.id]: { ...existing, command: server.command } };
          });
          setEditState({ isOpen: false, provider: null, isSubmitting: false, error: null });
        })
        .catch((error) => {
          if (!isMountedRef.current) {
            return;
          }
          const message = error instanceof ApiError ? error.message : 'Falha ao atualizar servidor MCP.';
          setEditState((current) => ({ ...current, isSubmitting: false, error: message }));
        });
    },
    [editState.provider],
  );

  const openDeleteDialog = useCallback((provider: ProviderSummary) => {
    setDeleteState({ isOpen: true, provider, isSubmitting: false, error: null });
  }, []);

  const closeDeleteDialog = useCallback(() => {
    setDeleteState({ isOpen: false, provider: null, isSubmitting: false, error: null });
  }, []);

  const confirmDelete = useCallback(() => {
    const target = deleteState.provider;
    if (!target) {
      return;
    }
    setDeleteState((current) => ({ ...current, isSubmitting: true, error: null }));
    deleteServerDefinition(target.id)
      .then(() => {
        if (!isMountedRef.current) {
          return;
        }
        setHiddenProviders((current) => (current.includes(target.id) ? current : [...current, target.id]));
        setProviderOverrides((current) => {
          if (!(target.id in current)) {
            return current;
          }
          const next = { ...current };
          delete next[target.id];
          return next;
        });
        setProcessStates((current) => {
          if (!(target.id in current)) {
            return current;
          }
          const next = { ...current };
          delete next[target.id];
          return next;
        });
        setPendingAction((current) => (current && current.providerId === target.id ? null : current));
        setActionErrors((current) => {
          if (!(target.id in current)) {
            return current;
          }
          const next = { ...current };
          delete next[target.id];
          return next;
        });
        setHealthHistory((current) => {
          if (!(target.id in current)) {
            return current;
          }
          const next = { ...current };
          delete next[target.id];
          return next;
        });
        setHealthErrors((current) => {
          if (!(target.id in current)) {
            return current;
          }
          const next = { ...current };
          delete next[target.id];
          return next;
        });
        setPingStatus((current) => {
          if (!(target.id in current)) {
            return current;
          }
          const next = { ...current };
          delete next[target.id];
          return next;
        });
        const actionController = actionControllers.current.get(target.id);
        actionController?.abort();
        actionControllers.current.delete(target.id);
        const pingController = pingControllers.current.get(target.id);
        pingController?.abort();
        pingControllers.current.delete(target.id);
        setDeleteState({ isOpen: false, provider: null, isSubmitting: false, error: null });
      })
      .catch((error) => {
        if (!isMountedRef.current) {
          return;
        }
        const message = error instanceof ApiError ? error.message : 'Falha ao remover servidor MCP.';
        setDeleteState((current) => ({ ...current, isSubmitting: false, error: message }));
      });
  }, [deleteState.provider]);

  const hasProviders = visibleProviders.length > 0;

  const statusSummary = useMemo(() => {
    let running = 0;
    let offline = 0;
    for (const provider of visibleProviders) {
      const status = processStates[provider.id]?.status ?? 'stopped';
      if (status === 'running') {
        running += 1;
      } else {
        offline += 1;
      }
    }
    return { running, offline, total: visibleProviders.length };
  }, [processStates, visibleProviders]);

  const healthSummary = useMemo(() => {
    let healthy = 0;
    let degraded = 0;
    let errorCount = 0;
    let unchecked = 0;
    for (const provider of visibleProviders) {
      const history = healthHistory[provider.id];
      if (!history || history.length === 0) {
        unchecked += 1;
        continue;
      }
      switch (history[0].status) {
        case 'healthy':
          healthy += 1;
          break;
        case 'degraded':
          degraded += 1;
          break;
        default:
          errorCount += 1;
          break;
      }
    }
    return { healthy, degraded, error: errorCount, unchecked };
  }, [healthHistory, visibleProviders]);

  return (
    <main className="servers">
      <section className="servers__hero">
        <h1>Servidores MCP · operações</h1>
        <p>Gerencie o ciclo de vida dos servidores MCP diretamente pela console. Acompanhe status em tempo real, uptime, health-checks recentes e eventos relevantes.</p>
      </section>

      <section className="servers__diagnostics" aria-labelledby="servers-diagnostics-title">
        <header>
          <h2 id="servers-diagnostics-title">Diagnóstico rápido</h2>
          <p>Combine health check, inventário de providers e invoke de agent para validar a stack MCP.</p>
        </header>
        <form className="servers__diagnostics-form" onSubmit={handleDiagnosticsSubmit}>
          <label htmlFor="servers-diagnostics-agent">Agent para invoke</label>
          <div className="servers__diagnostics-controls">
            <input
              id="servers-diagnostics-agent"
              type="text"
              value={diagnosticsAgent}
              onChange={(event) => setDiagnosticsAgent(event.target.value)}
              placeholder="catalog-search"
              autoComplete="off"
            />
            <button type="submit" disabled={diagnosticsState.isRunning || diagnosticsAgent.trim() === ''}>
              {diagnosticsState.isRunning ? 'Executando…' : 'Executar diagnóstico'}
            </button>
          </div>
        </form>
        {diagnosticsState.error && (
          <p className="servers__diagnostics-error" role="alert">
            {diagnosticsState.error}
          </p>
        )}
        {diagnosticsState.result && (
          <>
            <p className="servers__diagnostics-meta">
              {diagnosticsState.result.summary.failures === 0
                ? 'Todas as verificações passaram.'
                : `${diagnosticsState.result.summary.failures} verificação(ões) falharam.`}
            </p>
            <div className="servers__diagnostics-grid">
              {(() => {
                const { health, providers, invoke } = diagnosticsState.result!;
                const providerCount = resolveProviderCountFromData(providers.data);
                const healthMessage = describeDiagnosticsComponent(
                  health,
                  'Backend respondeu com sucesso.',
                  'Falha ao consultar /healthz.',
                );
                const providersMessage = describeDiagnosticsComponent(
                  providers,
                  providerCount != null
                    ? `${providerCount} provider(s) carregado(s).`
                    : 'Catálogo de providers carregado.',
                  'Falha ao carregar providers.',
                );
                const invokeMessage = describeDiagnosticsComponent(
                  invoke,
                  'Invoke concluído sem erros.',
                  'Falha ao invocar o agent informado.',
                );
                return (
                  <>
                    <article
                      className={
                        health.ok
                          ? 'servers__diagnostics-metric servers__diagnostics-metric--ok'
                          : 'servers__diagnostics-metric servers__diagnostics-metric--error'
                      }
                    >
                      <h3>Health check do backend</h3>
                      <p>{healthMessage}</p>
                    </article>
                    <article
                      className={
                        providers.ok
                          ? 'servers__diagnostics-metric servers__diagnostics-metric--ok'
                          : 'servers__diagnostics-metric servers__diagnostics-metric--error'
                      }
                    >
                      <h3>Inventário de providers</h3>
                      <p>{providersMessage}</p>
                    </article>
                    <article
                      className={
                        invoke.ok
                          ? 'servers__diagnostics-metric servers__diagnostics-metric--ok'
                          : 'servers__diagnostics-metric servers__diagnostics-metric--error'
                      }
                    >
                      <h3>Invoke de {diagnosticsAgent.trim() || 'agent'}</h3>
                      <p>{invokeMessage}</p>
                    </article>
                  </>
                );
              })()}
            </div>
          </>
        )}
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
          <strong>{statusSummary.total}</strong>
          <span>total</span>
        </div>
      </section>

      <section className="servers__health" aria-label="Resumo de health-checks">
        <div className="status-pill status-pill--healthy">
          <span className="status-pill__dot status-pill__dot--healthy" />
          <strong>{healthSummary.healthy}</strong>
          <span>saudáveis</span>
        </div>
        <div className="status-pill status-pill--degraded">
          <span className="status-pill__dot status-pill__dot--degraded" />
          <strong>{healthSummary.degraded}</strong>
          <span>instáveis</span>
        </div>
        <div className="status-pill status-pill--error">
          <span className="status-pill__dot status-pill__dot--error" />
          <strong>{healthSummary.error}</strong>
          <span>falhas</span>
        </div>
        <div className="status-pill status-pill--unknown">
          <span className="status-pill__dot status-pill__dot--unknown" />
          <strong>{healthSummary.unchecked}</strong>
          <span>sem ping</span>
        </div>
      </section>

      {(isLoading || isSyncing) && <p className="info">Sincronizando informações dos servidores…</p>}
      {initialError && <p className="error">{initialError}</p>}
      {syncError && <p className="error">{syncError}</p>}

      {!isLoading && !initialError && !hasProviders && (
        <p className="info">Cadastre servidores MCP para acompanhar ações de start/stop por aqui.</p>
      )}

      <section className="server-grid" aria-live="polite">
        {visibleProviders.map((provider) => {
          const state = processStates[provider.id] ?? createFallbackState(provider);
          const pendingForProvider =
            pendingAction && pendingAction.providerId === provider.id ? pendingAction.action : null;
          const actionMessage = actionErrors[provider.id] ?? state.lastError ?? null;
          const history = healthHistory[provider.id] ?? [];
          const latestHealth = history.length > 0 ? history[0] : null;
          const pingState = pingStatus[provider.id];
          const healthError = healthErrors[provider.id];

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
                onStart={() => openActionConfirmation(provider, 'start')}
                onStop={() => openActionConfirmation(provider, 'stop')}
                onRestart={() => openActionConfirmation(provider, 'restart')}
              >
                {actionMessage && <p className="server-actions__feedback">{actionMessage}</p>}
              </ServerActions>

              <div className="server-card__health">
                <div className="server-card__health-header">
                  <h3>Saúde operacional</h3>
                  <div className="server-card__health-controls">
                    <span className={getHealthBadgeClass(latestHealth?.status)}>
                      {latestHealth ? formatHealthStatus(latestHealth.status) : 'Sem dados'}
                    </span>
                    <button
                      type="button"
                      className="server-card__health-button"
                      onClick={() => handlePing(provider.id)}
                      disabled={pingState?.isLoading}
                    >
                      {pingState?.isLoading ? 'Pingando…' : 'Ping agora'}
                    </button>
                  </div>
                </div>
                <p className="server-health__meta">
                  {latestHealth
                    ? `Último ping: ${formatCheckedAt(latestHealth.checkedAt)}${
                        latestHealth.latencyMs != null ? ` · ${latestHealth.latencyMs} ms` : ''
                      }`
                    : 'Nenhum ping registrado.'}
                </p>
                {healthError && (
                  <p className="server-health__error" role="alert">{healthError}</p>
                )}
                {pingState?.error && (
                  <p className="server-health__error" role="alert">{pingState.error}</p>
                )}
                <ul className="server-health__list">
                  {history.length === 0 ? (
                    <li className="server-health__empty">Sem histórico recente.</li>
                  ) : (
                    history.map((entry, index) => (
                      <li
                        key={`${entry.checkedAt}-${index}`}
                        className={`server-health__item server-health__item--${entry.status}`}
                      >
                        <div className="server-health__item-header">
                          <span className="server-health__timestamp">{formatCheckedAt(entry.checkedAt)}</span>
                          <span className="server-health__status">{formatHealthStatus(entry.status)}</span>
                          {entry.latencyMs != null && (
                            <span className="server-health__latency">{entry.latencyMs} ms</span>
                          )}
                        </div>
                        {entry.message && <p className="server-health__note">{entry.message}</p>}
                        {entry.actor && <p className="server-health__actor">Ação registrada por {entry.actor}</p>}
                      </li>
                    ))
                  )}
                </ul>
              </div>

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

              <div className="server-card__actions-panel">
                <button type="button" className="server-card__action" onClick={() => openEditDialog(provider)}>
                  Editar servidor
                </button>
                <button
                  type="button"
                  className="server-card__action server-card__action--danger"
                  onClick={() => openDeleteDialog(provider)}
                >
                  Remover servidor
                </button>
              </div>
            </article>
          );
        })}
      </section>

      <EditServerDialog
        provider={editState.provider}
        isOpen={editState.isOpen}
        isSubmitting={editState.isSubmitting}
        error={editState.error}
        onCancel={closeEditDialog}
        onSubmit={submitEdit}
      />
      <ConfirmDeleteDialog
        provider={deleteState.provider}
        isOpen={deleteState.isOpen}
        isSubmitting={deleteState.isSubmitting}
        error={deleteState.error}
        onCancel={closeDeleteDialog}
        onConfirm={confirmDelete}
      />
      <ConfirmationModal
        isOpen={Boolean(actionConfirmation)}
        title={
          actionConfirmation
            ? `${SERVER_ACTION_COPY[actionConfirmation.action].title} · ${actionConfirmation.provider.name}`
            : 'Confirmar ação'
        }
        description={
          actionConfirmation
            ? SERVER_ACTION_COPY[actionConfirmation.action].description(actionConfirmation.provider.name)
            : undefined
        }
        confirmLabel={
          actionConfirmation ? SERVER_ACTION_COPY[actionConfirmation.action].confirm : 'Confirmar'
        }
        confirmArmedLabel={
          actionConfirmation ? SERVER_ACTION_COPY[actionConfirmation.action].armed : 'Confirmar agora'
        }
        onConfirm={confirmServerAction}
        onCancel={closeActionConfirmation}
        isLoading={isActionConfirming}
      />
    </main>
  );
}

