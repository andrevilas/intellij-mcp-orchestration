import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';

import './App.css';
import type {
  NotificationSummary,
  ProviderSummary,
  SecretMetadata,
  SecretValue,
  Session,
} from './api';
import {
  createSession,
  deleteSecret,
  fetchNotifications,
  fetchProviders,
  fetchSecrets,
  fetchSessions,
  readSecret,
  upsertSecret,
} from './api';
import CommandPalette from './components/CommandPalette';
import NotificationCenter, { type NotificationItem } from './components/NotificationCenter';
import Dashboard from './pages/Dashboard';
import FinOps from './pages/FinOps';
import Keys from './pages/Keys';
import Policies from './pages/Policies';
import Routing from './pages/Routing';
import Servers from './pages/Servers';

export interface Feedback {
  kind: 'success' | 'error';
  text: string;
}

const DEFAULT_CLIENT = 'console-web';
export const NOTIFICATION_READ_STATE_KEY = 'mcp-notification-read-state';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function loadNotificationReadState(): Record<string, boolean> {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return {};
  }

  try {
    const rawValue = window.localStorage.getItem(NOTIFICATION_READ_STATE_KEY);
    if (!rawValue) {
      return {};
    }

    const parsed = JSON.parse(rawValue);
    if (!isRecord(parsed)) {
      return {};
    }

    const normalized: Record<string, boolean> = {};
    for (const [key, value] of Object.entries(parsed)) {
      normalized[key] = value === true;
    }
    return normalized;
  } catch (error) {
    console.error('Falha ao carregar estado de notificações do armazenamento local', error);
    return {};
  }
}

function persistNotificationReadState(map: Record<string, boolean>): void {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(NOTIFICATION_READ_STATE_KEY, JSON.stringify(map));
  } catch (error) {
    console.error('Falha ao persistir estado de notificações no armazenamento local', error);
  }
}

function buildFallbackNotifications(): NotificationSummary[] {
  return [
    {
      id: 'platform-placeholder',
      severity: 'info',
      title: 'Nenhum evento recente',
      message:
        'As integrações MCP permanecem estáveis. Novas notificações aparecerão aqui automaticamente.',
      timestamp: new Date().toISOString(),
      category: 'platform',
      tags: ['Status'],
    },
  ];
}

const VIEW_DEFINITIONS = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    description: 'Visão executiva com KPIs e alertas operacionais',
    keywords: ['home', 'overview', 'resumo'],
  },
  {
    id: 'servers',
    label: 'Servidores',
    description: 'Controle de lifecycle e telemetria dos MCP servers',
    keywords: ['start', 'stop', 'restart', 'logs'],
  },
  {
    id: 'keys',
    label: 'Chaves',
    description: 'Gestão de credenciais e testes de conectividade',
    keywords: ['credentials', 'access', 'tokens'],
  },
  {
    id: 'policies',
    label: 'Políticas',
    description: 'Templates, rollouts e histórico de políticas',
    keywords: ['guardrails', 'templates', 'rollback'],
  },
  {
    id: 'routing',
    label: 'Routing',
    description: 'Simulações what-if e gestão de estratégias de roteamento',
    keywords: ['rota', 'failover', 'latência'],
  },
  {
    id: 'finops',
    label: 'FinOps',
    description: 'Análises de custo, séries temporais e pareto',
    keywords: ['custos', 'financeiro', 'pareto'],
  },
] as const;

type ViewId = (typeof VIEW_DEFINITIONS)[number]['id'];

function App() {
  const [providers, setProviders] = useState<ProviderSummary[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [secrets, setSecrets] = useState<SecretMetadata[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [initialError, setInitialError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [provisioningId, setProvisioningId] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<ViewId>('dashboard');
  const [isPaletteOpen, setPaletteOpen] = useState(false);
  const [, setNotificationReadState] = useState<Record<string, boolean>>(() =>
    loadNotificationReadState(),
  );
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [isNotificationOpen, setNotificationOpen] = useState(false);
  const mainRef = useRef<HTMLElement | null>(null);
  const navRef = useRef<HTMLElement | null>(null);
  const notificationButtonRef = useRef<HTMLButtonElement | null>(null);
  const commandButtonRef = useRef<HTMLButtonElement | null>(null);

  const applyNotifications = useCallback(
    (items: NotificationSummary[]) => {
      setNotificationReadState((current) => {
        const next = { ...current };
        let hasNewEntries = false;

        for (const item of items) {
          if (!(item.id in next)) {
            next[item.id] = false;
            hasNewEntries = true;
          }
        }

        setNotifications(
          items
            .map((item) => ({ ...item, isRead: next[item.id] ?? false }))
            .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()),
        );

        if (hasNewEntries) {
          persistNotificationReadState(next);
          return next;
        }

        return current;
      });
    },
    [],
  );

  useEffect(() => {
    const controller = new AbortController();

    async function bootstrap() {
      try {
        setIsLoading(true);
        const [providerResult, sessionResult, secretResult, notificationResult] =
          await Promise.allSettled([
            fetchProviders(controller.signal),
            fetchSessions(controller.signal),
            fetchSecrets(controller.signal),
            fetchNotifications(controller.signal),
          ]);

        if (
          providerResult.status !== 'fulfilled' ||
          sessionResult.status !== 'fulfilled' ||
          secretResult.status !== 'fulfilled'
        ) {
          throw providerResult.status === 'rejected'
            ? providerResult.reason
            : sessionResult.status === 'rejected'
              ? sessionResult.reason
              : secretResult.reason;
        }

        if (controller.signal.aborted) {
          return;
        }

        setProviders(providerResult.value);
        setSessions(
          sessionResult.value
            .slice()
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
        );
        setSecrets(secretResult.value);
        setInitialError(null);

        let notificationsPayload: NotificationSummary[] = [];
        if (notificationResult.status === 'fulfilled') {
          notificationsPayload = notificationResult.value;
        } else if (!controller.signal.aborted) {
          console.error('Falha ao carregar notificações remotas', notificationResult.reason);
        }

        if (notificationsPayload.length === 0) {
          notificationsPayload = buildFallbackNotifications();
        }

        if (!controller.signal.aborted) {
          applyNotifications(notificationsPayload);
        }
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }
        const message = error instanceof Error ? error.message : 'Falha ao carregar dados iniciais';
        setInitialError(message);
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }

    void bootstrap();

    return () => controller.abort();
  }, [applyNotifications]);

  async function handleProvision(provider: ProviderSummary) {
    const controller = new AbortController();
    setProvisioningId(provider.id);
    setFeedback(null);

    try {
      const response = await createSession(
        provider.id,
        {
          reason: 'Provisionamento disparado pela Console MCP',
          client: DEFAULT_CLIENT,
        },
        controller.signal,
      );

      setSessions((current) => [response.session, ...current]);
      setFeedback({
        kind: 'success',
        text: `Sessão ${response.session.id} criada para ${provider.name}.`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha ao criar sessão';
      setFeedback({ kind: 'error', text: message });
    } finally {
      setProvisioningId(null);
    }
  }

  const handleSecretSave = useCallback(
    async (providerId: string, value: string): Promise<SecretValue> => {
      const record = await upsertSecret(providerId, value);
      setSecrets((current) => {
        const next = current.filter((item) => item.provider_id !== providerId);
        next.push({ provider_id: record.provider_id, has_secret: true, updated_at: record.updated_at });
        return next;
      });
      return record;
    },
    [],
  );

  const handleSecretDelete = useCallback(async (providerId: string): Promise<void> => {
    await deleteSecret(providerId);
    setSecrets((current) => current.filter((item) => item.provider_id !== providerId));
  }, []);

  const handleSecretReveal = useCallback(async (providerId: string): Promise<SecretValue> => {
    return readSecret(providerId);
  }, []);

  const handleCloseNotification = useCallback(() => {
    setNotificationOpen(false);
    requestAnimationFrame(() => {
      notificationButtonRef.current?.focus({ preventScroll: true });
    });
  }, []);

  const handleClosePalette = useCallback(() => {
    setPaletteOpen(false);
    requestAnimationFrame(() => {
      commandButtonRef.current?.focus({ preventScroll: true });
    });
  }, []);

  const handleNavigate = useCallback(
    (view: ViewId, options: { focusContent?: boolean } = {}) => {
      setActiveView(view);
      setPaletteOpen(false);
      setNotificationOpen(false);
      if (options.focusContent !== false) {
        requestAnimationFrame(() => {
          mainRef.current?.focus({ preventScroll: true });
        });
      }
    },
    [],
  );

  const handleNavKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLElement>) => {
      if (!navRef.current) {
        return;
      }

      const keysToHandle = ['ArrowRight', 'ArrowLeft', 'Home', 'End'];
      if (!keysToHandle.includes(event.key)) {
        return;
      }

      const buttons = Array.from(
        navRef.current.querySelectorAll<HTMLButtonElement>('button.nav-button'),
      );

      if (buttons.length === 0) {
        return;
      }

      const targetElement = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>(
        'button.nav-button',
      );
      const activeElement =
        document.activeElement instanceof HTMLButtonElement ? document.activeElement : null;
      let currentIndex = targetElement ? buttons.indexOf(targetElement) : -1;

      if (currentIndex === -1 && activeElement) {
        currentIndex = buttons.indexOf(activeElement);
      }

      if (currentIndex === -1) {
        return;
      }

      event.preventDefault();

      let nextIndex = currentIndex;

      if (event.key === 'ArrowRight') {
        nextIndex = (currentIndex + 1) % buttons.length;
      } else if (event.key === 'ArrowLeft') {
        nextIndex = (currentIndex - 1 + buttons.length) % buttons.length;
      } else if (event.key === 'Home') {
        nextIndex = 0;
      } else if (event.key === 'End') {
        nextIndex = buttons.length - 1;
      }

      const nextButton = buttons[nextIndex];

      if (nextButton) {
        nextButton.focus();
      }

      const nextView = VIEW_DEFINITIONS[nextIndex];
      if (nextView) {
        handleNavigate(nextView.id, { focusContent: false });
      }
    },
    [handleNavigate],
  );

  const commandOptions = useMemo(
    () =>
      VIEW_DEFINITIONS.map((view) => ({
        id: view.id,
        title: view.label,
        subtitle: view.description,
        keywords: view.keywords,
        onSelect: () => handleNavigate(view.id),
      })),
    [handleNavigate],
  );

  const unreadCount = useMemo(
    () => notifications.filter((notification) => !notification.isRead).length,
    [notifications],
  );

  const notificationButtonLabel = useMemo(
    () =>
      unreadCount > 0
        ? `Abrir central de notificações (${unreadCount} não lidas)`
        : 'Abrir central de notificações (sem pendências)',
    [unreadCount],
  );

  const handleToggleNotification = useCallback((id: string, nextValue: boolean) => {
    setNotifications((current) => {
      const nextNotifications = current.map((notification) =>
        notification.id === id ? { ...notification, isRead: nextValue } : notification,
      );

      setNotificationReadState((currentState) => {
        if (currentState[id] === nextValue) {
          return currentState;
        }
        const nextState = { ...currentState, [id]: nextValue };
        persistNotificationReadState(nextState);
        return nextState;
      });

      return nextNotifications;
    });
  }, []);

  const handleMarkAllRead = useCallback(() => {
    setNotifications((current) => {
      const nextNotifications = current.map((notification) =>
        notification.isRead ? notification : { ...notification, isRead: true },
      );

      setNotificationReadState((currentState) => {
        const nextState = { ...currentState };
        let changed = false;

        for (const notification of nextNotifications) {
          if (nextState[notification.id] !== true) {
            nextState[notification.id] = true;
            changed = true;
          }
        }

        if (changed) {
          persistNotificationReadState(nextState);
          return nextState;
        }

        return currentState;
      });

      return nextNotifications;
    });
  }, []);

  useEffect(() => {
    function handleGlobalShortcut(event: KeyboardEvent) {
      const key = event.key.toLowerCase();
      if ((event.ctrlKey || event.metaKey) && !event.shiftKey && key === 'k') {
        event.preventDefault();
        setPaletteOpen((current) => {
          const nextValue = !current;
          if (nextValue) {
            setNotificationOpen(false);
          } else {
            requestAnimationFrame(() => {
              commandButtonRef.current?.focus({ preventScroll: true });
            });
          }
          return nextValue;
        });
      }

      if ((event.ctrlKey || event.metaKey) && event.shiftKey && key === 'n') {
        event.preventDefault();
        setNotificationOpen((current) => {
          const nextValue = !current;
          if (nextValue) {
            setPaletteOpen(false);
          } else {
            requestAnimationFrame(() => {
              notificationButtonRef.current?.focus({ preventScroll: true });
            });
          }
          return nextValue;
        });
      }
    }

    window.addEventListener('keydown', handleGlobalShortcut);
    return () => window.removeEventListener('keydown', handleGlobalShortcut);
  }, []);

  return (
    <div className="app-shell">
      <a
        href="#main-content"
        className="skip-link"
        onClick={(event) => {
          event.preventDefault();
          mainRef.current?.focus({ preventScroll: true });
        }}
      >
        Ir para o conteúdo principal
      </a>
      <header className="app-shell__header">
        <div>
          <span className="app-shell__eyebrow">MCP Console</span>
          <h1>Operações unificadas</h1>
        </div>
        <div className="app-shell__actions">
          <nav
            aria-label="Navegação principal"
            className="app-shell__nav"
            ref={navRef}
            onKeyDown={handleNavKeyDown}
          >
            {VIEW_DEFINITIONS.map((view) => (
              <button
                key={view.id}
                type="button"
                className={activeView === view.id ? 'nav-button nav-button--active' : 'nav-button'}
                aria-current={activeView === view.id ? 'page' : undefined}
                tabIndex={activeView === view.id ? 0 : -1}
                id={`tab-${view.id}`}
                aria-controls={`panel-${view.id}`}
                onClick={() => handleNavigate(view.id)}
              >
                {view.label}
              </button>
            ))}
          </nav>
          <button
            type="button"
            className="notification-button"
            aria-haspopup="dialog"
            aria-expanded={isNotificationOpen}
            aria-controls="notification-center-panel"
            onClick={() => {
              setNotificationOpen(true);
              setPaletteOpen(false);
            }}
            aria-label={notificationButtonLabel}
            ref={notificationButtonRef}
          >
            <span className="notification-button__text">Notificações</span>
            <span
              className={
                unreadCount > 0
                  ? 'notification-button__badge'
                  : 'notification-button__badge notification-button__badge--muted'
              }
              aria-hidden={unreadCount === 0}
            >
              {unreadCount}
            </span>
            <kbd aria-hidden="true">⇧⌘N</kbd>
          </button>
          <button
            type="button"
            className="command-button"
            aria-haspopup="dialog"
            aria-expanded={isPaletteOpen}
            onClick={() => {
              setPaletteOpen(true);
              setNotificationOpen(false);
            }}
            ref={commandButtonRef}
          >
            <span className="command-button__text">Command palette</span>
            <kbd aria-hidden="true">⌘K</kbd>
          </button>
        </div>
      </header>
      <main
        className="app-shell__content"
        role="main"
        aria-live="polite"
        tabIndex={-1}
        id="main-content"
        ref={mainRef}
      >
        {activeView === 'dashboard' && (
          <section role="tabpanel" id="panel-dashboard" aria-labelledby="tab-dashboard">
            <Dashboard
              providers={providers}
              sessions={sessions}
              isLoading={isLoading}
              initialError={initialError}
              feedback={feedback}
              provisioningId={provisioningId}
              onProvision={handleProvision}
            />
          </section>
        )}
        {activeView === 'servers' && (
          <section role="tabpanel" id="panel-servers" aria-labelledby="tab-servers">
            <Servers providers={providers} sessions={sessions} isLoading={isLoading} initialError={initialError} />
          </section>
        )}
        {activeView === 'keys' && (
          <section role="tabpanel" id="panel-keys" aria-labelledby="tab-keys">
            <Keys
              providers={providers}
              secrets={secrets}
              isLoading={isLoading}
              initialError={initialError}
              onSecretSave={handleSecretSave}
              onSecretDelete={handleSecretDelete}
              onSecretReveal={handleSecretReveal}
            />
          </section>
        )}
        {activeView === 'policies' && (
          <section role="tabpanel" id="panel-policies" aria-labelledby="tab-policies">
            <Policies providers={providers} isLoading={isLoading} initialError={initialError} />
          </section>
        )}
        {activeView === 'routing' && (
          <section role="tabpanel" id="panel-routing" aria-labelledby="tab-routing">
            <Routing providers={providers} isLoading={isLoading} initialError={initialError} />
          </section>
        )}
        {activeView === 'finops' && (
          <section role="tabpanel" id="panel-finops" aria-labelledby="tab-finops">
            <FinOps providers={providers} isLoading={isLoading} initialError={initialError} />
          </section>
        )}
      </main>
      <NotificationCenter
        isOpen={isNotificationOpen}
        notifications={notifications}
        onClose={handleCloseNotification}
        onToggleRead={handleToggleNotification}
        onMarkAllRead={handleMarkAllRead}
      />
      <CommandPalette
        isOpen={isPaletteOpen}
        onClose={handleClosePalette}
        commands={commandOptions}
      />
    </div>
  );
}

export default App;
