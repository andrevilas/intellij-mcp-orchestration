import { useCallback, useEffect, useMemo, useState } from 'react';

import './App.css';
import type { ProviderSummary, Session } from './api';
import { createSession, fetchProviders, fetchSessions } from './api';
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
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [initialError, setInitialError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [provisioningId, setProvisioningId] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<ViewId>('dashboard');
  const [isPaletteOpen, setPaletteOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [isNotificationOpen, setNotificationOpen] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    async function bootstrap() {
      try {
        setIsLoading(true);
        const [providerList, sessionList] = await Promise.all([
          fetchProviders(controller.signal),
          fetchSessions(controller.signal),
        ]);

        setProviders(providerList);
        setSessions(
          sessionList
            .slice()
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
        );
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

  const handleNavigate = useCallback((view: ViewId) => {
    setActiveView(view);
    setPaletteOpen(false);
    setNotificationOpen(false);
  }, []);

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
      <header className="app-shell__header">
        <div>
          <span className="app-shell__eyebrow">MCP Console</span>
          <h1>Operações unificadas</h1>
        </div>
        <div className="app-shell__actions">
          <nav aria-label="Navegação principal" className="app-shell__nav">
            {VIEW_DEFINITIONS.map((view) => (
              <button
                key={view.id}
                type="button"
                className={activeView === view.id ? 'nav-button nav-button--active' : 'nav-button'}
                aria-pressed={activeView === view.id}
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
          >
            <span className="command-button__text">Command palette</span>
            <kbd aria-hidden="true">⌘K</kbd>
          </button>
        </div>
      </header>
      <div className="app-shell__content" role="region" aria-live="polite">
        {activeView === 'dashboard' && (
          <Dashboard
            providers={providers}
            sessions={sessions}
            isLoading={isLoading}
            initialError={initialError}
            feedback={feedback}
            provisioningId={provisioningId}
            onProvision={handleProvision}
          />
        )}
        {activeView === 'servers' && (
          <Servers providers={providers} sessions={sessions} isLoading={isLoading} initialError={initialError} />
        )}
        {activeView === 'keys' && <Keys providers={providers} isLoading={isLoading} initialError={initialError} />}
        {activeView === 'policies' && (
          <Policies providers={providers} isLoading={isLoading} initialError={initialError} />
        )}
        {activeView === 'routing' && (
          <Routing providers={providers} isLoading={isLoading} initialError={initialError} />
        )}
        {activeView === 'finops' && (
          <FinOps providers={providers} isLoading={isLoading} initialError={initialError} />
        )}
      </div>
      <NotificationCenter
        isOpen={isNotificationOpen}
        notifications={notifications}
        onClose={() => setNotificationOpen(false)}
        onToggleRead={handleToggleNotification}
        onMarkAllRead={handleMarkAllRead}
      />
      <CommandPalette
        isOpen={isPaletteOpen}
        onClose={() => setPaletteOpen(false)}
        commands={commandOptions}
      />
    </div>
  );
}

export default App;
