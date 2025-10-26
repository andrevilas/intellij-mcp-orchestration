export const DASHBOARD_TEST_IDS = {
  hero: 'dashboard-hero',
  compliance: 'dashboard-compliance',
  sections: {
    kpis: 'dashboard-kpis',
    insights: 'dashboard-insights',
    alerts: 'dashboard-alerts',
    heatmap: 'dashboard-heatmap',
    providers: 'dashboard-providers',
    sessions: 'dashboard-sessions',
  },
  insightCards: 'dashboard-insight-cards',
  insightCard: (id: string) => `dashboard-insight-${id}`,
  alert: (index: number | string) => `dashboard-alert-${index}`,
  providerGrid: 'dashboard-provider-grid',
  providerCard: (id: string) => `dashboard-provider-${id}`,
  costBreakdown: 'dashboard-cost-breakdown',
  errorBreakdown: 'dashboard-error-breakdown',
} as const;

export const FINOPS_TEST_IDS = {
  exports: {
    csvButton: 'finops-export-csv',
    htmlButton: 'finops-export-html',
  },
  policy: {
    section: 'finops-policy-section',
    form: 'finops-policy-form',
    budgets: 'finops-policy-budgets',
    alerts: 'finops-policy-alerts',
  },
  plan: {
    section: 'finops-plan-section',
    summary: 'finops-plan-summary',
    diffs: 'finops-plan-diffs',
    diffPrefix: 'finops-plan-diff',
  },
  alerts: {
    section: 'finops-alerts',
    item: (id: string) => `finops-alert-${id}`,
  },
  hotspots: {
    section: 'finops-hotspots',
    empty: 'finops-hotspots-empty',
    item: (id: string) => `finops-hotspot-${id}`,
  },
} as const;

export const SERVERS_TEST_IDS = {
  status: {
    section: 'servers-status-summary',
    online: 'servers-status-online',
    offline: 'servers-status-offline',
    total: 'servers-status-total',
  },
  health: {
    section: 'servers-health-summary',
    healthy: 'servers-health-healthy',
    degraded: 'servers-health-degraded',
    error: 'servers-health-error',
    unknown: 'servers-health-unknown',
  },
  grid: 'servers-grid',
  card: (id: string) => `server-card-${id}`,
  pingButton: (id: string) => `server-health-ping-${id}`,
  riskNotice: (id: string) => `server-risk-${id}`,
} as const;

export const POLICIES_TEST_IDS = {
  planForm: 'policies-plan-form',
  main: 'policies-main',
  hero: 'policies-hero',
  status: 'policies-status',
  templates: 'policies-templates',
  templateRisk: 'policies-template-risk',
  actions: 'policies-actions',
  plan: 'policies-plan',
  planDiffs: 'policies-plan-diffs',
  planDiffPrefix: 'policies-plan-diff',
  rolloutChart: 'policies-rollout-chart',
  runtime: {
    section: 'policies-runtime',
    form: 'policies-runtime-form',
    hitlSettings: 'policies-hitl-settings',
  },
  hitlQueue: 'policies-hitl',
  history: 'policies-history',
} as const;

export const ROUTING_TEST_IDS = {
  planForm: 'routing-plan-form',
  lab: 'routing-lab',
  manifest: {
    section: 'routing-manifest',
    form: 'routing-manifest-form',
  },
  intentsSection: 'routing-intents-section',
  rulesSection: 'routing-rules-section',
  configPanel: 'routing-config-panel',
  focus: 'routing-focus',
  volumeValue: 'routing-volume-value',
  metricsPanel: 'routing-metrics-panel',
  totalCost: 'routing-total-cost',
  savings: 'routing-savings',
  latency: 'routing-latency',
  reliability: 'routing-reliability',
} as const;

export const AGENTS_TEST_IDS = {
  page: 'agents-page',
  filters: 'agents-filters',
  search: 'agents-search',
  statusFilter: 'agents-status-filter',
  createButton: 'agents-create-button',
  toast: 'agents-toast',
  error: 'agents-error',
  loading: 'agents-loading',
  empty: 'agents-empty',
  table: 'agents-table',
  row: (slug: string) => `agent-row-${slug}`,
  detailButton: (slug: string) => `agent-detail-${slug}`,
  smokeButton: (slug: string) => `agent-smoke-${slug}`,
  cards: 'agents-cards',
  card: (slug: string) => `agent-card-${slug}`,
} as const;

export const AGENT_DETAIL_TEST_IDS = {
  root: 'agent-detail',
  tabs: 'agent-detail-tabs',
  playground: 'agent-detail-playground',
  run: 'agent-detail-run',
  reset: 'agent-detail-reset',
  results: 'agent-detail-results',
  snippet: 'agent-detail-snippet',
  summary: 'agent-detail-summary',
} as const;

export const NEW_AGENT_WIZARD_TEST_IDS = {
  root: 'new-agent-wizard',
  panel: 'new-agent-panel',
  planForm: 'new-agent-plan-form',
  generatePlan: 'new-agent-generate-plan',
  applyForm: 'new-agent-apply-form',
  applyPlan: 'new-agent-apply-plan',
} as const;
