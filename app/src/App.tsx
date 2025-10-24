import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { IconProp } from '@fortawesome/fontawesome-svg-core';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import clsx from 'clsx';

import './icons/app-shell';

import './styles/app-shell.scss';
import type {
  NotificationSummary,
  ProviderSummary,
  SecretMetadata,
  SecretTestResult,
  SecretValue,
  Session,
  TelemetryHeatmapBucket,
  TelemetryMetrics,
  PolicyComplianceSummary,
} from './api';
import {
  createSession,
  deleteSecret,
  fetchNotifications,
  fetchProviders,
  fetchSecrets,
  fetchSessions,
  fetchTelemetryHeatmap,
  fetchTelemetryMetrics,
  fetchPolicyCompliance,
  readSecret,
  testSecret,
  upsertSecret,
} from './api';
import CommandPalette from './components/CommandPalette';
import NotificationCenter, { type NotificationItem } from './components/NotificationCenter';
import ProvisioningDialog, { type ProvisioningSubmission } from './components/ProvisioningDialog';
import { ToastProvider } from './components/feedback/ToastProvider';
import Breadcrumbs, { type BreadcrumbItem } from './components/navigation/Breadcrumbs';
import type { AppFixtureSnapshot } from './utils/appFixtures';
import { createAppFixtureSnapshot } from './utils/appFixtures';
import { getFixtureStatus } from './utils/fixtureStatus';
import ThemeSwitch from './theme/ThemeSwitch';

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

function buildInitialNotificationState(
  snapshot: AppFixtureSnapshot | null,
): { readState: Record<string, boolean>; items: NotificationItem[] } {
  const baseState = loadNotificationReadState();

  if (!snapshot) {
    return { readState: baseState, items: [] };
  }

  const nextState: Record<string, boolean> = { ...baseState };
  let changed = false;

  for (const notification of snapshot.notifications) {
    if (!(notification.id in nextState)) {
      nextState[notification.id] = false;
      changed = true;
    }
  }

  if (changed) {
    persistNotificationReadState(nextState);
  }

  const items: NotificationItem[] = snapshot.notifications
    .map((notification) => ({
      ...notification,
      isRead: nextState[notification.id] ?? false,
    }))
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return { readState: nextState, items };
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
    id: 'observability',
    label: 'Observabilidade',
    description: 'Tracing, métricas e evals em um único painel',
    keywords: ['telemetria', 'tracing', 'metrics', 'evals'],
  },
  {
    id: 'servers',
    label: 'Servidores',
    description: 'Controle de lifecycle e telemetria dos MCP servers',
    keywords: ['start', 'stop', 'restart', 'logs'],
  },
  {
    id: 'agents',
    label: 'Agents',
    description: 'Catálogo de agents com owners, status e smoke tests',
    keywords: ['catalogo', 'agents', 'smoke'],
  },
  {
    id: 'keys',
    label: 'Chaves',
    description: 'Gestão de credenciais e testes de conectividade',
    keywords: ['credentials', 'access', 'tokens'],
  },
  {
    id: 'security',
    label: 'Segurança',
    description: 'Identidades, papéis e auditorias em tempo real',
    keywords: ['iam', 'roles', 'auditoria', 'mfa'],
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
    id: 'flows',
    label: 'Flows',
    description: 'Editor LangGraph com checkpoints HITL e versionamento',
    keywords: ['langgraph', 'hitl', 'versão'],
  },
  {
    id: 'finops',
    label: 'FinOps',
    description: 'Análises de custo, séries temporais e pareto',
    keywords: ['custos', 'financeiro', 'pareto'],
  },
  {
    id: 'marketplace',
    label: 'Marketplace',
    description: 'Catálogo filtrável com importação assistida e verificação de assinatura',
    keywords: ['marketplace', 'agente', 'importação', 'assinatura'],
  },
  {
    id: 'admin-chat',
    label: 'Admin Chat',
    description: 'Assistente para gerar e aplicar planos de configuração',
    keywords: ['chat', 'config', 'plano', 'hitl'],
  },
] as const;

type ViewId = (typeof VIEW_DEFINITIONS)[number]['id'];

type ViewLoader = () => Promise<{ default: ComponentType<any> }>;

const VIEW_COMPONENT_LOADERS: Record<ViewId, ViewLoader> = {
  dashboard: () => import('./pages/Dashboard'),
  observability: () => import('./pages/Observability'),
  servers: () => import('./pages/Servers'),
  agents: () => import('./pages/Agents'),
  keys: () => import('./pages/Keys'),
  security: () => import('./pages/Security'),
  policies: () => import('./pages/Policies'),
  routing: () => import('./pages/Routing'),
  flows: () => import('./pages/Flows'),
  finops: () => import('./pages/FinOps'),
  marketplace: () => import('./pages/Marketplace'),
  'admin-chat': () => import('./pages/AdminChat'),
};

const VIEW_ID_SET = new Set<ViewId>(VIEW_DEFINITIONS.map((definition) => definition.id));

function resolveInitialView(): ViewId {
  if (typeof window === 'undefined') {
    return 'dashboard';
  }

  const url = new URL(window.location.href);
  const viewParam = url.searchParams.get('view');
  if (viewParam && VIEW_ID_SET.has(viewParam as ViewId)) {
    return viewParam as ViewId;
  }

  const hashValue = url.hash.replace(/^#/, '');
  if (hashValue && VIEW_ID_SET.has(hashValue as ViewId)) {
    return hashValue as ViewId;
  }

  return 'dashboard';
}

const Dashboard = lazy(VIEW_COMPONENT_LOADERS.dashboard);
const Observability = lazy(VIEW_COMPONENT_LOADERS.observability);
const Servers = lazy(VIEW_COMPONENT_LOADERS.servers);
const Agents = lazy(VIEW_COMPONENT_LOADERS.agents);
const Keys = lazy(VIEW_COMPONENT_LOADERS.keys);
const Security = lazy(VIEW_COMPONENT_LOADERS.security);
const Policies = lazy(VIEW_COMPONENT_LOADERS.policies);
const Routing = lazy(VIEW_COMPONENT_LOADERS.routing);
const Flows = lazy(VIEW_COMPONENT_LOADERS.flows);
const FinOps = lazy(VIEW_COMPONENT_LOADERS.finops);
const Marketplace = lazy(VIEW_COMPONENT_LOADERS.marketplace);
const AdminChat = lazy(VIEW_COMPONENT_LOADERS['admin-chat']);
const UiKitShowcase = lazy(() => import('./components/UiKitShowcase'));

const preloadedViews = new Set<ViewId>();

function preloadView(view: ViewId): void {
  if (preloadedViews.has(view)) {
    return;
  }
  const loader = VIEW_COMPONENT_LOADERS[view];
  if (!loader) {
    return;
  }
  preloadedViews.add(view);
  void loader();
}

preloadView('dashboard');

const VIEW_ICON_MAP: Record<ViewId, IconProp> = {
  dashboard: 'gauge-high',
  observability: 'satellite-dish',
  servers: 'server',
  agents: 'robot',
  keys: 'key',
  security: 'shield-halved',
  policies: 'users-gear',
  routing: 'shuffle',
  flows: 'diagram-project',
  finops: 'table-columns',
  marketplace: 'store',
  'admin-chat': 'message',
};

function App() {
  const initialViewRef = useRef<ViewId>(resolveInitialView());
  const fixtureStatus = getFixtureStatus();
  const fixtureSnapshot = useMemo(() => {
    if (fixtureStatus !== 'ready') {
      return null;
    }
    try {
      return createAppFixtureSnapshot();
    } catch (error) {
      console.warn('Falha ao construir snapshot de fixtures iniciais', error);
      return null;
    }
  }, [fixtureStatus]);
  const hasFixtureBootstrap = fixtureSnapshot !== null;
  const initialNotificationState = useMemo(
    () => buildInitialNotificationState(fixtureSnapshot),
    [fixtureSnapshot],
  );

  const [providers, setProviders] = useState<ProviderSummary[]>(
    () => fixtureSnapshot?.providers ?? [],
  );
  const [sessions, setSessions] = useState<Session[]>(() => {
    const snapshotSessions = fixtureSnapshot?.sessions ?? [];
    return snapshotSessions
      .slice()
      .sort(
        (a: Session, b: Session) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );
  });
  const [secrets, setSecrets] = useState<SecretMetadata[]>(() => fixtureSnapshot?.secrets ?? []);
  const [telemetryMetrics, setTelemetryMetrics] = useState<TelemetryMetrics | null>(
    () => fixtureSnapshot?.telemetryMetrics ?? null,
  );
  const [telemetryHeatmap, setTelemetryHeatmap] = useState<TelemetryHeatmapBucket[]>(
    () => fixtureSnapshot?.telemetryHeatmap ?? [],
  );
  const [isLoading, setIsLoading] = useState<boolean>(() => !hasFixtureBootstrap);
  const [initialError, setInitialError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [provisioningId, setProvisioningId] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<ViewId>(initialViewRef.current);
  const [isPaletteOpen, setPaletteOpen] = useState(false);
  const [, setNotificationReadState] = useState<Record<string, boolean>>(
    () => initialNotificationState.readState,
  );
  const [notifications, setNotifications] = useState<NotificationItem[]>(
    () => initialNotificationState.items,
  );
  const [isNotificationOpen, setNotificationOpen] = useState(false);
  const [complianceSummary, setComplianceSummary] = useState<PolicyComplianceSummary | null>(
    () => fixtureSnapshot?.compliance ?? null,
  );
  const [pendingProvider, setPendingProvider] = useState<ProviderSummary | null>(null);
  const [isProvisionDialogOpen, setProvisionDialogOpen] = useState(false);
  const [isProvisionSubmitting, setProvisionSubmitting] = useState(false);
  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const mainRef = useRef<HTMLElement | null>(null);
  const navRef = useRef<HTMLElement | null>(null);
  const notificationButtonRef = useRef<HTMLButtonElement | null>(null);
  const commandButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    preloadView('observability');
    preloadView('finops');
    preloadView('agents');
    preloadView('admin-chat');
    preloadView(initialViewRef.current);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const url = new URL(window.location.href);
    url.searchParams.set('view', activeView);
    url.hash = `#${activeView}`;
    window.history.replaceState(null, '', url.toString());
  }, [activeView]);

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
        if (!hasFixtureBootstrap) {
          setIsLoading(true);
        }
        const now = new Date();
        const metricsStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        const heatmapStart = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);

        const [
          providerResult,
          sessionResult,
          secretResult,
          notificationResult,
          metricsResult,
          heatmapResult,
          complianceResult,
        ] = await Promise.allSettled([
          fetchProviders(controller.signal),
          fetchSessions(controller.signal),
          fetchSecrets(controller.signal),
          fetchNotifications(controller.signal),
          fetchTelemetryMetrics({ start: metricsStart }, controller.signal),
          fetchTelemetryHeatmap({ start: heatmapStart, end: now }, controller.signal),
          fetchPolicyCompliance(controller.signal),
        ]);

        let bootstrapError: unknown = null;
        if (providerResult.status === 'rejected') {
          bootstrapError = providerResult.reason;
        } else if (sessionResult.status === 'rejected') {
          bootstrapError = sessionResult.reason;
        } else if (secretResult.status === 'rejected') {
          bootstrapError = secretResult.reason;
        }

        if (bootstrapError) {
          throw bootstrapError;
        }

        if (controller.signal.aborted) {
          return;
        }

        const providerList = providerResult.status === 'fulfilled' ? providerResult.value ?? [] : [];
        const sessionList = sessionResult.status === 'fulfilled' ? sessionResult.value ?? [] : [];
        const secretList = secretResult.status === 'fulfilled' ? secretResult.value ?? [] : [];

        setProviders(providerList);
        setSessions(
          sessionList
            .slice()
            .sort((a: Session, b: Session) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
        );
        setSecrets(secretList);
        setInitialError(null);

        if (metricsResult.status === 'fulfilled') {
          setTelemetryMetrics(metricsResult.value);
        } else {
          setTelemetryMetrics(null);
          if (metricsResult.status === 'rejected' && !controller.signal.aborted) {
            console.error('Falha ao carregar métricas de telemetria', metricsResult.reason);
          }
        }

        if (heatmapResult.status === 'fulfilled') {
          setTelemetryHeatmap(heatmapResult.value);
        } else {
          setTelemetryHeatmap([]);
          if (heatmapResult.status === 'rejected' && !controller.signal.aborted) {
            console.error('Falha ao carregar heatmap de telemetria', heatmapResult.reason);
          }
        }

        if (complianceResult.status === 'fulfilled') {
          setComplianceSummary(complianceResult.value);
        } else {
          setComplianceSummary(null);
          if (complianceResult.status === 'rejected' && !controller.signal.aborted) {
            console.error('Falha ao carregar checklist de conformidade', complianceResult.reason);
          }
        }

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
  }, [applyNotifications, hasFixtureBootstrap]);

  const handleProvisionRequest = useCallback((provider: ProviderSummary) => {
    setPendingProvider(provider);
    setProvisionDialogOpen(true);
    setPaletteOpen(false);
    setNotificationOpen(false);
    setFeedback(null);
  }, []);

  const handleProvisionDialogCancel = useCallback(() => {
    setProvisionDialogOpen(false);
    setPendingProvider(null);
  }, []);

  const handleProvisionDialogConfirm = useCallback(
    async ({ reason, overrides }: ProvisioningSubmission) => {
      if (!pendingProvider) {
        return;
      }

      const controller = new AbortController();
      setProvisionDialogOpen(false);
      setProvisionSubmitting(true);
      setProvisioningId(pendingProvider.id);
      setFeedback(null);

      try {
        const response = await createSession(
          pendingProvider.id,
          {
            reason: reason.trim() ? reason.trim() : 'Provisionamento manual pela Console MCP',
            client: DEFAULT_CLIENT,
            overrides,
          },
          controller.signal,
        );

        setSessions((current) => [response.session, ...current]);
        setFeedback({
          kind: 'success',
          text: `Sessão ${response.session.id} criada para ${pendingProvider.name}.`,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Falha ao criar sessão';
        setFeedback({ kind: 'error', text: message });
      } finally {
        setProvisionSubmitting(false);
        setProvisioningId(null);
        setPendingProvider(null);
      }
    },
    [pendingProvider],
  );

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

  const handleSecretTest = useCallback(
    async (providerId: string): Promise<SecretTestResult> => {
      return testSecret(providerId);
    },
    [],
  );

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

  const handleToggleSidebar = useCallback(() => {
    setSidebarOpen((current) => !current);
  }, []);

  const handleNavigate = useCallback(
    (view: ViewId, options: { focusContent?: boolean } = {}) => {
      preloadView(view);
      setActiveView(view);
      setPaletteOpen(false);
      setNotificationOpen(false);
      setSidebarOpen(false);
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
        preloadView(nextView.id);
        handleNavigate(nextView.id, { focusContent: false });
      }
    },
    [handleNavigate],
  );

  const commandOptions = useMemo(() => {
    const viewCommands = VIEW_DEFINITIONS.map((view) => ({
      id: view.id,
      title: view.label,
      subtitle: view.description,
      keywords: view.keywords,
      onSelect: () => handleNavigate(view.id),
    }));

    const providerCommands = providers.map((provider) => ({
      id: `provision-${provider.id}`,
      title: `Provisionar ${provider.name}`,
      subtitle: 'Criar sessão com overrides táticos',
      keywords: ['provisionar', 'override', provider.id],
      onSelect: () => handleProvisionRequest(provider),
    }));

    return [...viewCommands, ...providerCommands];
  }, [handleNavigate, handleProvisionRequest, providers]);

  const breadcrumbs = useMemo<BreadcrumbItem[]>(() => {
    const active = VIEW_DEFINITIONS.find((view) => view.id === activeView);
    return [
      { label: 'Console MCP', href: '#main-content' },
      { label: active?.label ?? 'Visão atual', isCurrent: true },
    ];
  }, [activeView]);

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

  const renderFallbackPanel = (viewId: ViewId): JSX.Element => {
    const view = VIEW_DEFINITIONS.find((definition) => definition.id === viewId);
    return (
      <section
        role="tabpanel"
        id={`panel-${viewId}`}
        aria-labelledby={`nav-${viewId}`}
        aria-busy="true"
        data-view-loading
      >
        <div className="route-fallback" role="status" aria-live="polite">
          Carregando {view?.label ?? 'painel'}…
        </div>
      </section>
    );
  };

  const renderActivePanel = (): JSX.Element | null => {
    switch (activeView) {
      case 'dashboard':
        return (
          <section role="tabpanel" id="panel-dashboard" aria-labelledby="nav-dashboard">
            <Dashboard
              providers={providers}
              sessions={sessions}
              metrics={telemetryMetrics}
              heatmapBuckets={telemetryHeatmap}
              isLoading={isLoading}
              initialError={initialError}
              feedback={feedback}
              provisioningId={provisioningId}
              compliance={complianceSummary}
              onProvision={handleProvisionRequest}
            />
          </section>
        );
      case 'observability':
        return (
          <section role="tabpanel" id="panel-observability" aria-labelledby="nav-observability">
            <Observability
              providers={providers}
              metrics={telemetryMetrics}
              isLoading={isLoading}
              initialError={initialError}
            />
          </section>
        );
      case 'servers':
        return (
          <section role="tabpanel" id="panel-servers" aria-labelledby="nav-servers">
            <Servers providers={providers} isLoading={isLoading} initialError={initialError} />
          </section>
        );
      case 'agents':
        return (
          <section role="tabpanel" id="panel-agents" aria-labelledby="nav-agents">
            <Agents />
          </section>
        );
      case 'keys':
        return (
          <section role="tabpanel" id="panel-keys" aria-labelledby="nav-keys">
            <Keys
              providers={providers}
              secrets={secrets}
              isLoading={isLoading}
              initialError={initialError}
              onSecretSave={handleSecretSave}
              onSecretDelete={handleSecretDelete}
              onSecretReveal={handleSecretReveal}
              onSecretTest={handleSecretTest}
            />
          </section>
        );
      case 'security':
        return (
          <section role="tabpanel" id="panel-security" aria-labelledby="nav-security">
            <Security />
          </section>
        );
      case 'policies':
        return (
          <section role="tabpanel" id="panel-policies" aria-labelledby="nav-policies">
            <Policies providers={providers} isLoading={isLoading} initialError={initialError} />
          </section>
        );
      case 'routing':
        return (
          <section role="tabpanel" id="panel-routing" aria-labelledby="nav-routing">
            <Routing providers={providers} isLoading={isLoading} initialError={initialError} />
          </section>
        );
      case 'flows':
        return (
          <section role="tabpanel" id="panel-flows" aria-labelledby="nav-flows">
            <Flows />
          </section>
        );
      case 'finops':
        return (
          <section role="tabpanel" id="panel-finops" aria-labelledby="nav-finops">
            <FinOps providers={providers} isLoading={isLoading} initialError={initialError} />
          </section>
        );
      case 'admin-chat':
        return (
          <section role="tabpanel" id="panel-admin-chat" aria-labelledby="nav-admin-chat">
            <AdminChat onNotificationsUpdate={applyNotifications} />
          </section>
        );
      case 'marketplace':
        return (
          <section role="tabpanel" id="panel-marketplace" aria-labelledby="nav-marketplace">
            <Marketplace />
          </section>
        );
      default:
        return null;
    }
  };

  return (
    <ToastProvider>
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
          <div className="app-shell__branding">
            <button
              type="button"
              className="app-shell__sidebar-toggle app-shell__sidebar-toggle--mobile-only"
              aria-expanded={isSidebarOpen}
              aria-controls="primary-navigation"
              onClick={handleToggleSidebar}
            >
              <FontAwesomeIcon icon="bars" className="icon-leading" fixedWidth aria-hidden="true" />
              Menu
            </button>
            <div>
              <span className="app-shell__eyebrow">Promenade Agent Hub</span>
              <h1>Operações unificadas</h1>
            </div>
          </div>
          <div className="app-shell__actions">
            <ThemeSwitch className="app-shell__theme-switch app-shell__theme-switch--desktop" />
            <nav
              aria-label="Navegação principal"
              id="primary-navigation"
              className={clsx('app-shell__nav', isSidebarOpen && 'app-shell__nav--open')}
              data-open={isSidebarOpen}
              ref={navRef}
              onKeyDown={handleNavKeyDown}
            >
              {VIEW_DEFINITIONS.map((view) => (
                <button
                  key={view.id}
                  type="button"
                  className={clsx('nav-button', {
                    'nav-button--active': activeView === view.id,
                  })}
                  id={`nav-${view.id}`}
                  tabIndex={activeView === view.id ? 0 : -1}
                  aria-current={activeView === view.id ? 'page' : undefined}
                  onFocus={() => {
                    preloadView(view.id);
                    handleNavigate(view.id, { focusContent: false });
                  }}
                  onClick={() => {
                    preloadView(view.id);
                    handleNavigate(view.id);
                  }}
                >
                  <FontAwesomeIcon
                    icon={VIEW_ICON_MAP[view.id]}
                    fixedWidth
                    className="icon-leading"
                    aria-hidden="true"
                  />
                  <span className="nav-button__label">{view.label}</span>
                </button>
              ))}
              <ThemeSwitch className="app-shell__theme-switch app-shell__theme-switch--mobile" />
            </nav>
            <div className="app-shell__quick-actions">
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
                <FontAwesomeIcon icon="bell" className="icon-leading" fixedWidth aria-hidden="true" />
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
                <FontAwesomeIcon icon="circle-half-stroke" className="icon-leading" fixedWidth aria-hidden="true" />
                <span className="command-button__text">Command palette</span>
                <kbd aria-hidden="true">⌘K</kbd>
              </button>
            </div>
          </div>
        </header>
      <div className="app-shell__breadcrumbs">
        <Breadcrumbs items={breadcrumbs} />
      </div>
      <main
        className="app-shell__content"
        role="main"
        aria-live="polite"
        tabIndex={-1}
        id="main-content"
        ref={mainRef}
      >
        <Suspense fallback={renderFallbackPanel(activeView)}>
          {renderActivePanel()}
        </Suspense>
      </main>
      <aside className="app-shell__ui-kit" aria-label="Mostruário UI Kit">
        <Suspense
          fallback={
            <div className="ui-kit-loading" role="status" aria-live="polite">
              Carregando catálogo de componentes…
            </div>
          }
        >
          <UiKitShowcase />
        </Suspense>
      </aside>
      <footer className="app-shell__footer">
        © {new Date().getFullYear()} Promenade Agent Hub. Todos os direitos reservados.
      </footer>
      <ProvisioningDialog
        isOpen={isProvisionDialogOpen && pendingProvider !== null}
        provider={pendingProvider}
        isSubmitting={isProvisionSubmitting}
        onCancel={handleProvisionDialogCancel}
        onConfirm={handleProvisionDialogConfirm}
      />
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
    </ToastProvider>
  );
}

export default App;
