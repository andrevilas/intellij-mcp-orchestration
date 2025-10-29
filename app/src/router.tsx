import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

export interface ViewDefinition {
  id: string;
  label: string;
  description: string;
  keywords: readonly string[];
}

export const VIEW_DEFINITIONS = [
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
] as const satisfies readonly ViewDefinition[];

export type ViewId = (typeof VIEW_DEFINITIONS)[number]['id'];

export interface ViewGroupDefinition {
  id: string;
  label: string;
  description?: string;
  items: readonly ViewId[];
}

export const VIEW_GROUPS = [
  {
    id: 'monitoring-insights',
    label: 'Monitoramento & Insights',
    description: 'KPIs, observabilidade e custos consolidados',
    items: ['dashboard', 'observability', 'finops'],
  },
  {
    id: 'infrastructure',
    label: 'Infraestrutura MCP',
    description: 'Provisionamento de servidores, agents e chaves',
    items: ['servers', 'agents', 'keys'],
  },
  {
    id: 'governance',
    label: 'Governança & Controles',
    description: 'Segurança e políticas aplicadas',
    items: ['security', 'policies'],
  },
  {
    id: 'orchestration',
    label: 'Orquestração & Automação',
    description: 'Roteamento, fluxos e automações guiadas',
    items: ['routing', 'flows', 'admin-chat', 'marketplace'],
  },
] as const satisfies readonly ViewGroupDefinition[];

export type ViewGroupId = (typeof VIEW_GROUPS)[number]['id'];

type ViewModule = { default: ComponentType<any> };
export type ViewLoader = () => Promise<ViewModule>;

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

const COMPONENT_CACHE = new Map<ViewId, LazyExoticComponent<ComponentType<any>>>();
const VIEW_ID_SET = new Set<ViewId>(VIEW_DEFINITIONS.map((definition) => definition.id));
const PRELOADED_VIEWS = new Set<ViewId>();

export const CRITICAL_VIEWS: readonly ViewId[] = ['dashboard', 'observability', 'servers', 'agents'] as const;

export function getViewComponent(view: ViewId): LazyExoticComponent<ComponentType<any>> {
  const cached = COMPONENT_CACHE.get(view);
  if (cached) {
    return cached;
  }

  const loader = VIEW_COMPONENT_LOADERS[view];
  const component = lazy(loader);
  COMPONENT_CACHE.set(view, component);
  return component;
}

export function preloadView(view: ViewId): void {
  if (PRELOADED_VIEWS.has(view)) {
    return;
  }

  const loader = VIEW_COMPONENT_LOADERS[view];
  if (!loader) {
    return;
  }

  PRELOADED_VIEWS.add(view);
  void loader();
}

export function preloadCriticalViews(): void {
  for (const view of CRITICAL_VIEWS) {
    preloadView(view);
  }
}

export function isViewId(candidate: string | null | undefined): candidate is ViewId {
  if (!candidate) {
    return false;
  }

  return VIEW_ID_SET.has(candidate as ViewId);
}

export function resolveInitialView(): ViewId {
  if (typeof window === 'undefined') {
    return 'dashboard';
  }

  const url = new URL(window.location.href);
  const viewParam = url.searchParams.get('view');

  if (isViewId(viewParam)) {
    return viewParam;
  }

  const hashValue = url.hash.replace(/^#/, '');
  if (isViewId(hashValue)) {
    return hashValue;
  }

  return 'dashboard';
}

export function getViewDefinition(view: ViewId): ViewDefinition | undefined {
  return VIEW_DEFINITIONS.find((definition) => definition.id === view);
}

export function getViewLoader(view: ViewId): ViewLoader | undefined {
  return VIEW_COMPONENT_LOADERS[view];
}
