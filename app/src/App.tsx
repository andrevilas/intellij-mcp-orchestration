import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';

import './App.css';
import type { ProviderSummary, SecretMetadata, SecretValue, Session } from './api';
import {
  createSession,
  deleteSecret,
  fetchProviders,
  fetchSecrets,
  fetchSessions,
  readSecret,
  upsertSecret,
} from './api';
import CommandPalette from './components/CommandPalette';
import NotificationCenter, {
  type NotificationItem,
  type NotificationSeverity,
} from './components/NotificationCenter';
import Dashboard from './pages/Dashboard';
import FinOps from './pages/FinOps';
import Keys from './pages/Keys';
import Policies from './pages/Policies';
import Routing from './pages/Routing';
import Servers from './pages/Servers';
import { seededMod } from './utils/hash';

export interface Feedback {
  kind: 'success' | 'error';
  text: string;
}

const DEFAULT_CLIENT = 'console-web';

type NotificationSeed = Omit<NotificationItem, 'isRead'>;

function minutesAgo(offset: number): string {
  const date = new Date();
  date.setMinutes(date.getMinutes() - offset);
  return date.toISOString();
}

function toTitleCase(value: string): string {
  if (!value) {
    return '';
  }
  return value
    .split(/[\s_-]+/)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase())
    .join(' ');
}

function findLatestSession(providerId: string, allSessions: Session[]): Session | undefined {
  let latest: Session | undefined;
  for (const session of allSessions) {
    if (session.provider_id !== providerId) {
      continue;
    }
    if (!latest) {
      latest = session;
      continue;
    }
    if (new Date(session.created_at).getTime() > new Date(latest.created_at).getTime()) {
      latest = session;
    }
  }
  return latest;
}

function resolveSessionSeverity(status: string): NotificationSeverity {
  const normalized = status.toLowerCase();
  if (normalized.includes('error') || normalized.includes('fail')) {
    return 'critical';
  }
  if (normalized.includes('warn') || normalized.includes('degraded')) {
    return 'warning';
  }
  if (normalized.includes('ready') || normalized.includes('active') || normalized.includes('success')) {
    return 'success';
  }
  return 'info';
}

function buildNotificationSeeds(providers: ProviderSummary[], sessions: Session[]): NotificationSeed[] {
  const seeds: NotificationSeed[] = [];

  providers.forEach((provider) => {
    const baseSeed = seededMod(`${provider.id}-status`, 100);
    const latency = 700 + seededMod(`${provider.id}-latency`, 420);
    let severity: NotificationSeverity;
    let title: string;
    let message: string;

    if (provider.is_available === false || baseSeed < 15) {
      severity = 'critical';
      title = `Failover ativo para ${provider.name}`;
      message = `Tráfego de ${provider.name} foi movido para rotas secundárias após instabilidade detectada pelo orquestrador.`;
    } else if (baseSeed < 45) {
      severity = 'warning';
      title = `Latência elevada em ${provider.name}`;
      message = `A média das últimas 2h alcançou ${latency} ms. Considere rebalancear o mix ou executar um warmup adicional.`;
    } else if (baseSeed < 70) {
      severity = 'success';
      title = `Failover revertido para ${provider.name}`;
      message = `${provider.name} voltou ao plano primário após verificação completa dos health-checks.`;
    } else {
      severity = 'info';
      title = `Provisionamento estável em ${provider.name}`;
      message = `As rotas de ${provider.name} seguem atendendo requisições com SLA nominal.`;
    }

    seeds.push({
      id: `${provider.id}-status`,
      severity,
      title,
      message,
      timestamp: minutesAgo(20 + seededMod(`${provider.id}-minutes`, 120)),
      category: 'operations',
      tags: [provider.name, provider.transport.toUpperCase()],
    });

    const latestSession = findLatestSession(provider.id, sessions);
    if (latestSession) {
      const sessionSeverity = resolveSessionSeverity(latestSession.status);
      const createdAt = new Date(latestSession.created_at);
      const formattedTime = new Intl.DateTimeFormat('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
      }).format(createdAt);
      let sessionMessage: string;

      if (sessionSeverity === 'success') {
        sessionMessage = `Provisionamento finalizado às ${formattedTime}. O tráfego já está sendo roteado.`;
      } else if (sessionSeverity === 'critical') {
        sessionMessage = `Falha relatada no provisioning às ${formattedTime}. Execute diagnóstico antes de liberar novas sessões.`;
      } else if (sessionSeverity === 'warning') {
        sessionMessage = `Sessão reportou degradação às ${formattedTime}. Monitore métricas de tokens e latência.`;
      } else {
        sessionMessage = `Sessão criada às ${formattedTime}. Guardando readiness check para liberar operações.`;
      }

      seeds.push({
        id: `${provider.id}-${latestSession.id}`,
        severity: sessionSeverity,
        title: `Sessão ${latestSession.id} — ${toTitleCase(latestSession.status)}`,
        message: sessionMessage,
        timestamp: latestSession.created_at,
        category: 'operations',
        tags: [provider.name, 'Provisioning'],
      });
    }
  });

  if (providers.length > 0) {
    const target = providers[seededMod('finops-target', providers.length)];
    const delta = 6 + seededMod('finops-delta', 9);
    seeds.push({
      id: 'finops-anomaly',
      severity: 'warning',
      title: `Custo ↑ ${delta}% no lane Balanced`,
      message: `O lane Balanced para ${target.name} aumentou ${delta}% versus a semana anterior. Revise o mix de modelos antes do fechamento.`,
      timestamp: minutesAgo(90 + seededMod('finops-minutes', 120)),
      category: 'finops',
      tags: ['FinOps', target.name],
    });

    const savings = 4 + seededMod('finops-savings', 8);
    seeds.push({
      id: 'finops-savings',
      severity: 'success',
      title: `Economia estimada de ${savings}% este mês`,
      message: `Os ajustes de roteamento economizaram ${savings}% em spend acumulado. Exporte o relatório para compartilhar com o time.`,
      timestamp: minutesAgo(240 + seededMod('finops-savings-minutes', 200)),
      category: 'finops',
      tags: ['FinOps', 'Relatórios'],
    });
  }

  if (providers.length > 1) {
    const focusProvider = providers[seededMod('policy-provider', providers.length)];
    seeds.push({
      id: 'policy-rollout',
      severity: 'success',
      title: 'Rollout Balanced concluído',
      message: `O template Balanced foi aplicado em ${focusProvider.name} e rotas dependentes sem incidentes.`,
      timestamp: minutesAgo(180 + seededMod('policy-minutes', 160)),
      category: 'policies',
      tags: ['Policies', focusProvider.name],
    });
  }

  seeds.push({
    id: 'platform-release',
    severity: 'info',
    title: 'Release 2024.09.1 publicado',
    message: 'Novos alertas em tempo real e central de notificações disponíveis na console MCP.',
    timestamp: minutesAgo(360 + seededMod('platform-minutes', 240)),
    category: 'platform',
    tags: ['Release', 'DX'],
  });

  if (seeds.length === 0) {
    seeds.push({
      id: 'platform-placeholder',
      severity: 'info',
      title: 'Nenhum evento recente',
      message: 'As integrações MCP permanecem estáveis. Novas notificações aparecerão aqui automaticamente.',
      timestamp: new Date().toISOString(),
      category: 'platform',
      tags: ['Status'],
    });
  }

  return seeds;
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
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [isNotificationOpen, setNotificationOpen] = useState(false);
  const mainRef = useRef<HTMLElement | null>(null);
  const navRef = useRef<HTMLElement | null>(null);
  const notificationButtonRef = useRef<HTMLButtonElement | null>(null);
  const commandButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function bootstrap() {
      try {
        setIsLoading(true);
        const [providerList, sessionList, secretList] = await Promise.all([
          fetchProviders(controller.signal),
          fetchSessions(controller.signal),
          fetchSecrets(controller.signal),
        ]);

        setProviders(providerList);
        setSessions(
          sessionList
            .slice()
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
        );
        setSecrets(secretList);
        setInitialError(null);
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
  }, []);

  useEffect(() => {
    const seeds = buildNotificationSeeds(providers, sessions);
    setNotifications((current) => {
      const previous = new Map(current.map((item) => [item.id, item]));
      return seeds
        .map((seed) => {
          const existing = previous.get(seed.id);
          return { ...seed, isRead: existing?.isRead ?? false };
        })
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    });
  }, [providers, sessions]);

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
    setNotifications((current) =>
      current.map((notification) =>
        notification.id === id ? { ...notification, isRead: nextValue } : notification,
      ),
    );
  }, []);

  const handleMarkAllRead = useCallback(() => {
    setNotifications((current) =>
      current.map((notification) =>
        notification.isRead ? notification : { ...notification, isRead: true },
      ),
    );
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
