import { fetchFromApi, fetchFromAgents, getApiBaseUrl } from './services/httpClient';
import { isFixtureModeEnabled } from './utils/fixtureStatus';

export { getFixtureStatus, isFixtureModeEnabled as isFixturesEnabled, describeFixtureRequest } from './utils/fixtureStatus';

export type BudgetPeriod = 'daily' | 'weekly' | 'monthly';
export type RoutingTierId = 'economy' | 'balanced' | 'turbo';
export type HitlEscalationChannel = 'email' | 'slack' | 'pagerduty';
export type HitlRequestStatus = 'pending' | 'approved' | 'rejected';
export type HitlResolution = 'approved' | 'rejected';

export type ObservabilityProviderType = 'langsmith' | 'otlp';

export interface ObservabilityProviderSettings {
  provider: ObservabilityProviderType;
  endpoint?: string | null;
  project?: string | null;
  dataset?: string | null;
  headers?: Record<string, string> | null;
}

export interface ObservabilityPreferencesAudit {
  actorId: string | null;
  actorName: string | null;
  actorRoles: string[];
}

export interface ObservabilityPreferences {
  tracing: ObservabilityProviderSettings | null;
  metrics: ObservabilityProviderSettings | null;
  evals: ObservabilityProviderSettings | null;
  updatedAt: string | null;
  audit: ObservabilityPreferencesAudit | null;
}

export interface ObservabilityPreferencesUpdateInput {
  tracing?: ObservabilityProviderSettings | null;
  metrics?: ObservabilityProviderSettings | null;
  evals?: ObservabilityProviderSettings | null;
}

interface ObservabilityProviderSettingsPayload {
  provider: ObservabilityProviderType;
  endpoint?: string | null;
  project?: string | null;
  dataset?: string | null;
  headers?: Record<string, string> | null;
}

interface ObservabilityPreferencesAuditPayload {
  actor_id: string | null;
  actor_name: string | null;
  actor_roles?: string[] | null;
}

interface ObservabilityPreferencesResponsePayload {
  tracing?: ObservabilityProviderSettingsPayload | null;
  metrics?: ObservabilityProviderSettingsPayload | null;
  evals?: ObservabilityProviderSettingsPayload | null;
  updated_at?: string | null;
  audit?: ObservabilityPreferencesAuditPayload | null;
}

function mapObservabilityProviderSettings(
  payload: ObservabilityProviderSettingsPayload | null | undefined,
): ObservabilityProviderSettings | null {
  if (!payload) {
    return null;
  }
  return {
    provider: payload.provider,
    endpoint: payload.endpoint ?? null,
    project: payload.project ?? null,
    dataset: payload.dataset ?? null,
    headers: payload.headers ?? null,
  };
}

function mapObservabilityPreferencesAudit(
  payload: ObservabilityPreferencesAuditPayload | null | undefined,
): ObservabilityPreferencesAudit | null {
  if (!payload) {
    return null;
  }
  return {
    actorId: payload.actor_id,
    actorName: payload.actor_name,
    actorRoles: payload.actor_roles ?? [],
  };
}

function mapObservabilityPreferences(payload: ObservabilityPreferencesResponsePayload | null): ObservabilityPreferences {
  return {
    tracing: mapObservabilityProviderSettings(payload?.tracing),
    metrics: mapObservabilityProviderSettings(payload?.metrics),
    evals: mapObservabilityProviderSettings(payload?.evals),
    updatedAt: payload?.updated_at ?? null,
    audit: mapObservabilityPreferencesAudit(payload?.audit),
  };
}

function normalizeObservabilityProviderSettings(
  settings: ObservabilityProviderSettings,
): ObservabilityProviderSettingsPayload {
  return {
    provider: settings.provider,
    endpoint: settings.endpoint ?? null,
    project: settings.project ?? null,
    dataset: settings.dataset ?? null,
    headers: settings.headers ?? null,
  };
}

function buildObservabilityPreferencesUpdatePayload(
  input: ObservabilityPreferencesUpdateInput,
): Record<string, ObservabilityProviderSettingsPayload | null> {
  const payload: Record<string, ObservabilityProviderSettingsPayload | null> = {};
  if (Object.prototype.hasOwnProperty.call(input, 'tracing')) {
    payload.tracing = input.tracing ? normalizeObservabilityProviderSettings(input.tracing) : null;
  }
  if (Object.prototype.hasOwnProperty.call(input, 'metrics')) {
    payload.metrics = input.metrics ? normalizeObservabilityProviderSettings(input.metrics) : null;
  }
  if (Object.prototype.hasOwnProperty.call(input, 'evals')) {
    payload.evals = input.evals ? normalizeObservabilityProviderSettings(input.evals) : null;
  }
  return payload;
}

export interface ProviderSummary {
  id: string;
  name: string;
  command: string;
  description?: string;
  tags: string[];
  capabilities: string[];
  transport: string;
  is_available?: boolean;
}

export type AgentStatus = 'healthy' | 'degraded' | 'pending' | 'inactive' | 'failed' | 'unknown';

export interface AgentModelConfig {
  provider: string | null;
  name: string | null;
  parameters: Record<string, unknown>;
}

export interface AgentSummary {
  name: string;
  title: string;
  version: string;
  description: string | null;
  capabilities: string[];
  model: AgentModelConfig | null;
  status: AgentStatus;
  lastDeployedAt: string | null;
  owner: string | null;
}

export type AgentSmokeRunStatus = 'queued' | 'running' | 'passed' | 'failed';

export interface AgentSmokeRun {
  runId: string;
  status: AgentSmokeRunStatus;
  summary: string | null;
  reportUrl: string | null;
  startedAt: string;
  finishedAt: string | null;
}

export type SmokeRunStatus = 'queued' | 'running' | 'passed' | 'failed';

export type SmokeRunLogLevel = 'debug' | 'info' | 'warning' | 'error';

export interface SmokeRunLogEntry {
  id: string;
  timestamp: string;
  level: SmokeRunLogLevel;
  message: string;
}

export interface SmokeRunSummary {
  runId: string;
  status: SmokeRunStatus;
  summary: string | null;
  triggeredBy: string | null;
  triggeredAt: string | null;
  finishedAt: string | null;
  logs: SmokeRunLogEntry[];
}

export interface SmokeEndpoint {
  id: string;
  name: string;
  description: string | null;
  url: string;
  lastRun: SmokeRunSummary | null;
}

export interface Session {
  id: string;
  provider_id: string;
  created_at: string;
  status: string;
  reason?: string | null;
  client?: string | null;
}

export interface ProvidersResponse {
  providers: ProviderSummary[];
}

export interface DiagnosticsComponent {
  ok: boolean;
  statusCode: number | null;
  durationMs: number | null;
  data: unknown;
  error: string | null;
}

export interface DiagnosticsSummary {
  total: number;
  successes: number;
  failures: number;
  errors: Record<string, string>;
}

export interface DiagnosticsResponse {
  timestamp: string;
  summary: DiagnosticsSummary;
  health: DiagnosticsComponent;
  providers: DiagnosticsComponent;
  invoke: DiagnosticsComponent;
}

export interface RunDiagnosticsInput {
  agent: string;
  input?: Record<string, unknown>;
  config?: Record<string, unknown>;
  agentsBaseUrl?: string;
}

export type PolicyTemplateId = string;

export interface PolicyTemplate {
  id: PolicyTemplateId;
  name: string;
  tagline: string;
  description: string;
  priceDelta: string;
  latencyTarget: string;
  guardrailLevel: string;
  features: string[];
}

export interface PolicyRolloutSegment {
  id: 'canary' | 'general' | 'fallback';
  name: string;
  description: string;
}

export interface PolicyRolloutAllocation {
  segment: PolicyRolloutSegment;
  coverage: number;
  providers: ProviderSummary[];
}

export interface PolicyRolloutPlan {
  templateId: PolicyTemplateId;
  generatedAt: string;
  allocations: PolicyRolloutAllocation[];
}

export interface PolicyRolloutOverview {
  generatedAt: string;
  plans: PolicyRolloutPlan[];
}

export interface PolicyTemplateCatalog {
  templates: PolicyTemplate[];
  rollout: PolicyRolloutOverview | null;
}

export interface CostPolicy {
  id: string;
  name: string;
  description: string | null;
  monthlySpendLimit: number;
  currency: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CostPolicyCreateInput {
  id: string;
  name: string;
  description?: string | null;
  monthlySpendLimit: number;
  currency: string;
  tags?: string[];
}

export interface CostPolicyUpdateInput {
  name: string;
  description?: string | null;
  monthlySpendLimit: number;
  currency: string;
  tags?: string[];
}

export interface PolicyOverridesConfig {
  policies?: {
    confidence?: Partial<PolicyConfidenceConfig> | null;
  } | null;
  routing?: Partial<RoutingPolicyConfig> | null;
  finops?: {
    costCenter?: string | null;
    budgets?: FinOpsBudget[] | null;
    alerts?: FinOpsAlertThreshold[] | null;
    cache?: FinOpsCachePolicyConfig | null;
    rateLimit?: FinOpsRateLimitPolicyConfig | null;
    gracefulDegradation?: FinOpsGracefulDegradationConfig | null;
  } | null;
  hitl?: {
    enabled?: boolean;
    checkpoints?: HitlCheckpoint[] | null;
  } | null;
  runtime?: {
    maxIters?: number | null;
    timeouts?: Partial<RuntimeTimeoutsConfig> | null;
    retry?: Partial<RuntimeRetryConfig> | null;
  } | null;
  tracing?: Partial<TracingConfigSummary> | null;
}

export interface PolicyOverride {
  id: string;
  route: string;
  project: string;
  templateId: string;
  maxLatencyMs: number | null;
  maxCostUsd: number | null;
  requireManualApproval: boolean;
  notes: string | null;
  overrides: PolicyOverridesConfig | null;
  createdAt: string;
  updatedAt: string;
}

export interface PolicyOverrideCreateInput {
  id: string;
  route: string;
  project: string;
  templateId: string;
  maxLatencyMs?: number | null;
  maxCostUsd?: number | null;
  requireManualApproval?: boolean;
  notes?: string | null;
  overrides?: PolicyOverridesConfig | null;
}

export interface HitlApprovalRequest {
  id: string;
  agent: string;
  route: string | null;
  checkpoint: string;
  checkpointDetails: HitlCheckpoint | null;
  submittedAt: string;
  status: HitlRequestStatus;
  confidence: number | null;
  notes: string | null;
  metadata: Record<string, unknown> | null;
}

export interface HitlQueueSummary {
  pending: HitlApprovalRequest[];
  resolved: HitlApprovalRequest[];
  updatedAt: string | null;
}

export interface HitlResolutionInput {
  resolution: HitlResolution;
  note?: string | null;
}

export type ComplianceStatus = 'pass' | 'warning' | 'fail';

export interface PolicyComplianceItem {
  id: string;
  label: string;
  description?: string | null;
  required: boolean;
  configured: boolean;
  active: boolean;
}

export interface PolicyComplianceSummary {
  status: ComplianceStatus;
  updatedAt: string | null;
  items: PolicyComplianceItem[];
}

export interface PolicyOverrideUpdateInput {
  route: string;
  project: string;
  templateId: string;
  maxLatencyMs?: number | null;
  maxCostUsd?: number | null;
  requireManualApproval?: boolean;
  notes?: string | null;
  overrides?: PolicyOverridesConfig | null;
}

export interface PolicyDeployment {
  id: string;
  templateId: string;
  deployedAt: string;
  author: string;
  window: string | null;
  note: string | null;
  sloP95Ms: number;
  budgetUsagePct: number;
  incidentsCount: number;
  guardrailScore: number;
  createdAt: string;
  updatedAt: string;
}

export interface PolicyDeploymentCreateInput {
  templateId: string;
  author?: string;
  window?: string | null;
  note?: string | null;
}

export interface PolicyDeploymentsSummary {
  deployments: PolicyDeployment[];
  activeId: string | null;
}

export interface FinOpsAdaptiveBudgetConfig {
  enabled: boolean;
  targetUtilization: number;
  lookbackDays: number;
  maxIncreasePct: number;
  maxDecreasePct: number;
  costWeight: number;
  latencyWeight: number;
  latencyThresholdMs?: number | null;
  minAmount?: number | null;
  maxAmount?: number | null;
}

export interface FinOpsAbVariant {
  name: string;
  trafficPercentage: number;
  costPerRequest?: number | null;
  latencyP95Ms?: number | null;
  isWinner?: boolean | null;
}

export interface FinOpsAbExperiment {
  id: string;
  lane: RoutingTierId | null;
  startedAt: string | null;
  completedAt: string | null;
  summary?: string | null;
  variants: FinOpsAbVariant[];
}

export interface FinOpsBudget {
  tier: RoutingTierId;
  amount: number;
  currency: string;
  period: BudgetPeriod;
  adaptive?: FinOpsAdaptiveBudgetConfig | null;
}

export interface FinOpsAlertThreshold {
  threshold: number;
  channel: HitlEscalationChannel;
}

export interface FinOpsCachePolicyConfig {
  ttlSeconds: number | null;
}

export interface FinOpsRateLimitPolicyConfig {
  requestsPerMinute: number | null;
}

export interface FinOpsGracefulDegradationConfig {
  strategy: string | null;
  message: string | null;
}

export interface FinOpsPolicyConfig {
  costCenter: string;
  budgets: FinOpsBudget[];
  alerts: FinOpsAlertThreshold[];
  abHistory: FinOpsAbExperiment[];
  cache: FinOpsCachePolicyConfig | null;
  rateLimit: FinOpsRateLimitPolicyConfig | null;
  gracefulDegradation: FinOpsGracefulDegradationConfig | null;
}

export interface RoutingIntentConfig {
  intent: string;
  description: string | null;
  tags: string[];
  defaultTier: RoutingTierId;
  fallbackProviderId: string | null;
}

export interface RoutingRuleConfig {
  id: string;
  description: string | null;
  intent: string | null;
  matcher: string;
  targetTier: RoutingTierId | null;
  providerId: string | null;
  weight: number | null;
}

export interface RoutingPolicyConfig {
  maxIters: number;
  maxAttempts: number;
  requestTimeoutSeconds: number;
  totalTimeoutSeconds: number | null;
  defaultTier: RoutingTierId;
  allowedTiers: RoutingTierId[];
  fallbackTier: RoutingTierId | null;
  intents: RoutingIntentConfig[];
  rules: RoutingRuleConfig[];
}

export interface RuntimeTimeoutsConfig {
  perIteration: number | null;
  total: number | null;
}

export interface RuntimeRetryConfig {
  maxAttempts: number;
  initialDelay: number;
  backoffFactor: number;
  maxDelay: number;
}

export interface TracingConfigSummary {
  enabled: boolean;
  sampleRate: number;
  exporter: 'otlp' | 'zipkin' | 'jaeger' | null;
}

export interface PolicyRuntimeSettings {
  maxIters: number;
  timeouts: RuntimeTimeoutsConfig;
  retry: RuntimeRetryConfig;
  tracing: TracingConfigSummary;
}

export interface HitlCheckpoint {
  name: string;
  description?: string | null;
  required: boolean;
  escalationChannel?: HitlEscalationChannel | null;
}

export interface HitlConfig {
  enabled: boolean;
  checkpoints: HitlCheckpoint[];
  pendingApprovals: number;
  lastUpdated: string | null;
}

export interface PolicyConfidenceConfig {
  approval: number;
  rejection: number;
}

export interface PolicyManifestSnapshot {
  policies: { confidence: PolicyConfidenceConfig | null };
  routing: RoutingPolicyConfig;
  finops: FinOpsPolicyConfig;
  hitl: HitlConfig;
  runtime: PolicyRuntimeSettings;
  overrides: PolicyOverridesConfig | null;
  updatedAt: string | null;
}

export interface PolicyManifestUpdateInput {
  policies?: { confidence?: Partial<PolicyConfidenceConfig> | null } | null;
  routing?: Partial<RoutingPolicyConfig> | null;
  finops?: Partial<FinOpsPolicyConfig> | null;
  hitl?: {
    enabled?: boolean;
    checkpoints?: HitlCheckpoint[] | null;
  } | null;
  runtime?: {
    maxIters?: number | null;
    timeouts?: Partial<RuntimeTimeoutsConfig> | null;
    retry?: Partial<RuntimeRetryConfig> | null;
    tracing?: Partial<TracingConfigSummary> | null;
  } | null;
}

export interface McpServer {
  id: string;
  name: string;
  command: string;
  description: string | null;
  tags: string[];
  capabilities: string[];
  transport: string;
  createdAt: string;
  updatedAt: string;
}

export type ServerProcessLifecycle = 'running' | 'stopped' | 'error';

export type ServerHealthStatus = 'healthy' | 'degraded' | 'error';

export interface ServerHealthCheck {
  status: ServerHealthStatus;
  checkedAt: string;
  latencyMs: number | null;
  message: string;
  actor?: string | null;
  planId?: string | null;
}

export interface McpServerUpdateInput {
  name: string;
  command: string;
  description?: string | null;
  tags?: string[];
  capabilities?: string[];
  transport: string;
}

export interface ServerProcessLogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'error';
  message: string;
}

export interface ServerProcessStateSnapshot {
  serverId: string;
  status: ServerProcessLifecycle;
  command: string;
  pid: number | null;
  startedAt: string | null;
  stoppedAt: string | null;
  returnCode: number | null;
  lastError: string | null;
  logs: ServerProcessLogEntry[];
  cursor: string | null;
}

export interface ServerProcessLogsResult {
  logs: ServerProcessLogEntry[];
  cursor: string | null;
}

export interface FlowNodeConfig extends Record<string, unknown> {}

export interface FlowNode {
  id: string;
  type: string;
  label: string;
  config: FlowNodeConfig;
}

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  condition?: string | null;
}

export interface FlowGraph {
  id: string;
  label: string;
  entry: string;
  exit: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
  metadata: Record<string, unknown>;
}

export interface FlowVersion {
  flowId: string;
  version: number;
  createdAt: string;
  createdBy: string | null;
  comment: string | null;
  graph: FlowGraph;
  agentCode: string;
  hitlCheckpoints: string[];
  diff?: string | null;
}

export interface FlowVersionList {
  flowId: string;
  versions: FlowVersion[];
}

export interface FlowVersionCreateInput {
  graph: FlowGraph;
  targetPath: string;
  agentClass?: string | null;
  comment?: string | null;
  author?: string | null;
  baselineAgentCode?: string | null;
}

export interface FlowVersionRollbackInput {
  author?: string | null;
  comment?: string | null;
}

export interface FlowVersionDiff {
  flowId: string;
  fromVersion: number;
  toVersion: number;
  diff: string;
}

interface PolicyTemplatePayload {
  id: PolicyTemplateId;
  name: string;
  tagline: string;
  description: string;
  price_delta: string;
  latency_target: string;
  guardrail_level: string;
  features: string[];
}

interface PolicyTemplatesResponse {
  templates: PolicyTemplatePayload[];
  rollout?: PolicyRolloutOverviewPayload | null;
}

interface PolicyRolloutSegmentPayload {
  id: 'canary' | 'general' | 'fallback';
  name: string;
  description: string;
}

interface PolicyRolloutAllocationPayload {
  segment: PolicyRolloutSegmentPayload;
  coverage: number;
  providers: ProviderSummary[];
}

interface PolicyRolloutPlanPayload {
  templateId: string;
  generatedAt: string;
  allocations: PolicyRolloutAllocationPayload[];
}

interface PolicyRolloutOverviewPayload {
  generatedAt: string;
  plans: PolicyRolloutPlanPayload[];
}

interface CostPolicyPayload {
  id: string;
  name: string;
  description: string | null;
  monthly_spend_limit: number;
  currency: string;
  tags: string[];
  created_at: string;
  updated_at: string;
}

interface CostPoliciesResponsePayload {
  policies: CostPolicyPayload[];
}

export interface PolicyOverridePayload {
  id: string;
  route: string;
  project: string;
  template_id: string;
  max_latency_ms: number | null;
  max_cost_usd: number | null;
  require_manual_approval: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
  overrides?: PolicyOverridesPayload | null;
}

interface PolicyOverridesResponsePayload {
  overrides: PolicyOverridePayload[];
}

interface FinOpsAdaptiveBudgetPayload {
  enabled?: boolean;
  target_utilization?: number;
  lookback_days?: number;
  max_increase_pct?: number;
  max_decrease_pct?: number;
  cost_weight?: number;
  latency_weight?: number;
  latency_threshold_ms?: number | null;
  min_amount?: number | null;
  max_amount?: number | null;
}

interface FinOpsAbVariantPayload {
  name: string;
  traffic_percentage?: number;
  cost_per_request?: number | null;
  latency_p95_ms?: number | null;
  is_winner?: boolean | null;
}

interface FinOpsAbExperimentPayload {
  id: string;
  lane?: RoutingTierId | null;
  started_at?: string | null;
  completed_at?: string | null;
  summary?: string | null;
  variants?: FinOpsAbVariantPayload[];
}

interface FinOpsBudgetPayload {
  tier: RoutingTierId;
  amount: number;
  currency: string;
  period: BudgetPeriod;
  adaptive?: FinOpsAdaptiveBudgetPayload | null;
}

interface FinOpsAlertPayload {
  threshold: number;
  channel: HitlEscalationChannel;
}

interface FinOpsCachePayload {
  ttl_seconds?: number | null;
}

interface FinOpsRateLimitPayload {
  requests_per_minute?: number | null;
}

interface FinOpsGracefulDegradationPayload {
  strategy?: string | null;
  message?: string | null;
}

type FinOpsRateLimitInput = FinOpsRateLimitPayload | number | null;
type FinOpsGracefulDegradationInput = FinOpsGracefulDegradationPayload | string | null;

interface FinOpsConfigPayload {
  cost_center?: string;
  budgets?: FinOpsBudgetPayload[];
  alerts?: FinOpsAlertPayload[];
  ab_history?: FinOpsAbExperimentPayload[];
  cache?: FinOpsCachePayload | number | null;
  cache_ttl?: number | null;
  rate_limit?: FinOpsRateLimitInput;
  rateLimit?: FinOpsRateLimitInput;
  graceful_degradation?: FinOpsGracefulDegradationInput;
  gracefulDegradation?: FinOpsGracefulDegradationInput;
}

interface RoutingIntentPayload {
  intent: string;
  description?: string | null;
  tags?: string[];
  default_tier?: RoutingTierId;
  fallback_provider_id?: string | null;
}

interface RoutingRulePayload {
  id: string;
  description?: string | null;
  intent?: string | null;
  matcher?: string;
  target_tier?: RoutingTierId | null;
  provider_id?: string | null;
  weight?: number | null;
}

interface RoutingPolicyPayload {
  max_iters?: number;
  max_attempts?: number;
  request_timeout_seconds?: number;
  total_timeout_seconds?: number | null;
  default_tier?: RoutingTierId;
  allowed_tiers?: RoutingTierId[];
  fallback_tier?: RoutingTierId | null;
  intents?: RoutingIntentPayload[];
  rules?: RoutingRulePayload[];
}

interface RuntimeTimeoutsPayload {
  per_iteration?: number | null;
  total?: number | null;
}

interface RuntimeRetryPayload {
  max_attempts?: number;
  initial_delay?: number;
  backoff_factor?: number;
  max_delay?: number;
}

interface TracingConfigPayload {
  enabled?: boolean;
  sample_rate?: number;
  exporter?: 'otlp' | 'zipkin' | 'jaeger' | null;
}

interface PolicyRuntimePayload {
  max_iters?: number;
  timeouts?: RuntimeTimeoutsPayload;
  retry?: RuntimeRetryPayload;
  tracing?: TracingConfigPayload;
}

interface PolicyConfidencePayload {
  approval?: number;
  rejection?: number;
}

interface PoliciesSectionPayload {
  confidence?: PolicyConfidencePayload;
}

interface HitlCheckpointPayload {
  name: string;
  description?: string | null;
  required?: boolean;
  escalation_channel?: HitlEscalationChannel | null;
}

interface HitlConfigPayload {
  enabled?: boolean;
  checkpoints?: HitlCheckpointPayload[];
  pending_approvals?: number;
  updated_at?: string | null;
}

interface PolicyManifestPayload {
  policies?: PoliciesSectionPayload;
  routing?: RoutingPolicyPayload;
  finops?: FinOpsConfigPayload;
  hitl?: HitlConfigPayload;
  runtime?: PolicyRuntimePayload;
  overrides?: PolicyOverridesPayload | null;
  updated_at?: string | null;
}

export interface PolicyOverridesPayload {
  policies?: PoliciesSectionPayload;
  routing?: RoutingPolicyPayload;
  finops?: FinOpsConfigPayload;
  hitl?: HitlConfigPayload;
  runtime?: PolicyRuntimePayload;
  tracing?: TracingConfigPayload;
}

interface HitlApprovalPayload {
  id: string;
  agent: string;
  route: string | null;
  checkpoint: string;
  checkpoint_details?: HitlCheckpointPayload | null;
  submitted_at: string;
  status: HitlRequestStatus;
  confidence?: number | null;
  notes?: string | null;
  metadata?: Record<string, unknown> | null;
}

interface HitlQueuePayload {
  pending: HitlApprovalPayload[];
  resolved?: HitlApprovalPayload[];
  updated_at?: string | null;
}

interface PolicyComplianceItemPayload {
  id: string;
  label: string;
  description?: string | null;
  required: boolean;
  configured: boolean;
  active: boolean;
}

interface PolicyCompliancePayload {
  status: ComplianceStatus;
  updated_at?: string | null;
  items: PolicyComplianceItemPayload[];
}

interface PolicyDeploymentPayload {
  id: string;
  template_id: string;
  deployed_at: string;
  author: string;
  window: string | null;
  note: string | null;
  slo_p95_ms: number;
  budget_usage_pct: number;
  incidents_count: number;
  guardrail_score: number;
  created_at: string;
  updated_at: string;
}

interface PolicyDeploymentsResponsePayload {
  deployments: PolicyDeploymentPayload[];
  active_id?: string | null;
}

export interface SessionResponse {
  session: Session;
  provider: ProviderSummary;
}

export interface SessionsResponse {
  sessions: Session[];
}

export interface SessionCreatePayload {
  reason?: string;
  client?: string;
  overrides?: PolicyOverridesConfig | null;
}

export interface SecretMetadata {
  provider_id: string;
  has_secret: boolean;
  updated_at?: string | null;
}

interface SecretsResponsePayload {
  secrets: SecretMetadata[];
}

export interface SecretValue {
  provider_id: string;
  value: string;
  updated_at: string;
}

export type SecretTestStatus = 'healthy' | 'degraded' | 'error';

export interface SecretTestResult {
  provider_id: string;
  status: SecretTestStatus;
  latency_ms: number;
  tested_at: string;
  message: string;
}

export type SecurityUserStatus = 'active' | 'suspended' | 'invited';

export interface SecurityUser {
  id: string;
  name: string;
  email: string;
  roles: string[];
  status: SecurityUserStatus;
  createdAt: string;
  lastSeenAt: string | null;
  mfaEnabled: boolean;
}

export interface SecurityRole {
  id: string;
  name: string;
  description: string;
  permissions: string[];
  members: number;
  createdAt: string;
  updatedAt: string;
}

export type SecurityApiKeyStatus = 'active' | 'revoked' | 'expired';

export interface SecurityApiKey {
  id: string;
  name: string;
  owner: string;
  scopes: string[];
  status: SecurityApiKeyStatus;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  tokenPreview: string | null;
}

export type SecurityAuditResource = 'user' | 'role' | 'api-key';

export interface SecurityAuditEvent {
  id: string;
  timestamp: string;
  actor: string;
  action: string;
  target: string;
  description: string;
  metadata: Record<string, unknown> | null;
}

export interface AuditLogEntry {
  id: string;
  createdAt: string;
  actorId: string | null;
  actorName: string | null;
  actorRoles: string[];
  action: string;
  resource: string;
  status: string;
  planId: string | null;
  metadata: Record<string, unknown>;
}

export interface AuditLogsPage {
  events: AuditLogEntry[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface AuditLogsQuery {
  actor?: string;
  action?: string;
  start?: string;
  end?: string;
  page?: number;
  pageSize?: number;
}

export interface CreateSecurityUserInput {
  name: string;
  email: string;
  roles: string[];
  status: SecurityUserStatus;
  mfaEnabled: boolean;
}

export interface UpdateSecurityUserInput {
  name?: string;
  email?: string;
  roles?: string[];
  status?: SecurityUserStatus;
  mfaEnabled?: boolean;
}

export interface CreateSecurityRoleInput {
  name: string;
  description: string;
  permissions: string[];
}

export interface UpdateSecurityRoleInput {
  name?: string;
  description?: string;
  permissions?: string[];
}

export interface CreateSecurityApiKeyInput {
  name: string;
  owner: string;
  scopes: string[];
  expiresAt?: string | null;
}

export interface UpdateSecurityApiKeyInput {
  name?: string;
  owner?: string;
  scopes?: string[];
  expiresAt?: string | null;
}

export interface SecurityApiKeySecret {
  key: SecurityApiKey;
  secret: string;
}

interface SecurityUserPayload {
  id: string;
  name: string;
  email: string;
  roles: string[];
  status: SecurityUserStatus;
  created_at: string;
  last_seen_at?: string | null;
  mfa_enabled?: boolean;
}

interface SecurityUsersResponsePayload {
  users: SecurityUserPayload[];
}

interface SecurityRolePayload {
  id: string;
  name: string;
  description: string;
  permissions: string[];
  members: number;
  created_at: string;
  updated_at: string;
}

interface SecurityRolesResponsePayload {
  roles: SecurityRolePayload[];
}

interface SecurityApiKeyPayload {
  id: string;
  name: string;
  owner: string;
  scopes: string[];
  status: SecurityApiKeyStatus;
  created_at: string;
  last_used_at?: string | null;
  expires_at?: string | null;
  token_preview?: string | null;
}

interface SecurityApiKeyListPayload {
  keys: SecurityApiKeyPayload[];
}

interface SecurityApiKeySecretPayload {
  key: SecurityApiKeyPayload;
  secret: string;
}

interface SecurityAuditEventPayload {
  id: string;
  timestamp: string;
  actor: string;
  action: string;
  target: string;
  description: string;
  metadata?: Record<string, unknown> | null;
}

interface SecurityAuditTrailPayload {
  events: SecurityAuditEventPayload[];
}

interface AuditLogEntryPayload {
  id: string;
  created_at: string;
  actor_id?: string | null;
  actor_name?: string | null;
  actor_roles?: string[];
  action: string;
  resource: string;
  status: string;
  plan_id?: string | null;
  metadata?: Record<string, unknown> | null;
}

interface AuditLogsResponsePayload {
  events: AuditLogEntryPayload[];
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
}

export type NotificationSeverity = 'info' | 'success' | 'warning' | 'critical';
export type NotificationCategory = 'operations' | 'finops' | 'policies' | 'platform';

export interface NotificationSummary {
  id: string;
  severity: NotificationSeverity;
  title: string;
  message: string;
  timestamp: string;
  category: NotificationCategory;
  tags: string[];
}

interface NotificationsResponsePayload {
  notifications: NotificationSummary[];
}

export interface TelemetryProviderMetrics {
  provider_id: string;
  run_count: number;
  tokens_in: number;
  tokens_out: number;
  cost_usd: number;
  avg_latency_ms: number;
  success_rate: number;
}

export interface TelemetryMetricsCostBreakdownEntry {
  id?: string | null;
  label?: string | null;
  lane?: string | null;
  provider_id?: string | null;
  cost_usd: number;
  run_count?: number | null;
}

export interface TelemetryMetricsErrorBreakdownEntry {
  category: string;
  count: number;
}

export interface TelemetryMetricsExtended {
  cache_hit_rate?: number | null;
  cached_tokens?: number | null;
  latency_p95_ms?: number | null;
  latency_p99_ms?: number | null;
  error_rate?: number | null;
  cost_breakdown?: TelemetryMetricsCostBreakdownEntry[] | null;
  error_breakdown?: TelemetryMetricsErrorBreakdownEntry[] | null;
}

export interface TelemetryMetrics {
  start?: string | null;
  end?: string | null;
  total_runs: number;
  total_tokens_in: number;
  total_tokens_out: number;
  total_cost_usd: number;
  avg_latency_ms: number;
  success_rate: number;
  providers: TelemetryProviderMetrics[];
  extended?: TelemetryMetricsExtended | null;
}

export interface TelemetryHeatmapBucket {
  day: string;
  provider_id: string;
  run_count: number;
}

interface TelemetryHeatmapResponsePayload {
  buckets: TelemetryHeatmapBucket[];
}

interface TelemetryMetricsResponsePayload extends TelemetryMetrics {}

export interface TelemetryTimeseriesPoint {
  day: string;
  provider_id: string;
  run_count: number;
  tokens_in: number;
  tokens_out: number;
  cost_usd: number;
  avg_latency_ms: number;
  success_count: number;
}

interface TelemetryTimeseriesResponsePayload {
  items: TelemetryTimeseriesPoint[];
  next_cursor?: string | null;
}

export type ReportStatus = 'on_track' | 'attention' | 'regression';

export interface FinOpsSprintReportPayload {
  id: string;
  name: string;
  period_start: string;
  period_end: string;
  total_cost_usd: number;
  total_tokens_in: number;
  total_tokens_out: number;
  avg_latency_ms: number;
  success_rate: number;
  cost_delta: number;
  status: ReportStatus;
  summary: string;
}

interface FinOpsSprintReportsResponsePayload {
  items: FinOpsSprintReportPayload[];
}

export interface FinOpsPullRequestReportPayload {
  id: string;
  provider_id: string;
  provider_name: string;
  route: string | null;
  lane: string | null;
  title: string;
  owner: string;
  merged_at: string | null;
  cost_impact_usd: number;
  cost_delta: number;
  tokens_impact: number;
  status: ReportStatus;
  summary: string;
}

interface FinOpsPullRequestReportsResponsePayload {
  items: FinOpsPullRequestReportPayload[];
}

export type RoutingStrategyId = 'balanced' | 'finops' | 'latency' | 'resilience';
export type RoutingLane = 'economy' | 'balanced' | 'turbo';

export interface RoutingRouteProfile {
  id: string;
  provider: ProviderSummary;
  lane: RoutingLane;
  costPerMillion: number;
  latencyP95: number;
  reliability: number;
  capacityScore: number;
}

export interface RoutingDistributionEntry {
  route: RoutingRouteProfile;
  share: number;
  tokensMillions: number;
  cost: number;
}

export interface RoutingSimulationContext {
  strategy: RoutingStrategyId;
  providerIds: string[];
  providerCount: number;
  volumeMillions: number;
  failoverProviderId: string | null;
}

export interface RoutingCostProjection {
  totalUsd: number;
  costPerMillionUsd: number;
}

export interface RoutingLatencyProjection {
  avgLatencyMs: number;
  reliabilityScore: number;
}

export interface RoutingSimulationResult {
  context: RoutingSimulationContext;
  cost: RoutingCostProjection;
  latency: RoutingLatencyProjection;
  distribution: RoutingDistributionEntry[];
  excludedRoute: RoutingRouteProfile | null;
}

export interface SimulateRoutingPayload {
  strategy: RoutingStrategyId;
  providerIds?: string[];
  failoverProviderId?: string | null;
  volumeMillions: number;
  intents?: RoutingIntentConfig[];
  rules?: RoutingRuleConfig[];
}

interface RoutingRouteProfilePayload {
  id: string;
  provider: ProviderSummary;
  lane: RoutingLane;
  cost_per_million: number;
  latency_p95: number;
  reliability: number;
  capacity_score: number;
}

interface RoutingDistributionEntryPayload {
  route: RoutingRouteProfilePayload;
  share: number;
  tokens_millions: number;
  cost: number;
}

interface RoutingSimulationContextPayload {
  strategy: RoutingStrategyId;
  provider_ids: string[];
  provider_count: number;
  volume_millions: number;
  failover_provider_id?: string | null;
}

interface RoutingCostProjectionPayload {
  total_usd: number;
  cost_per_million_usd: number;
}

interface RoutingLatencyProjectionPayload {
  avg_latency_ms: number;
  reliability_score: number;
}

interface RoutingSimulationResponsePayload {
  context: RoutingSimulationContextPayload;
  cost: RoutingCostProjectionPayload;
  latency: RoutingLatencyProjectionPayload;
  distribution: RoutingDistributionEntryPayload[];
  excluded_route?: RoutingRouteProfilePayload | null;
}

function mapRoutingRouteProfile(payload: RoutingRouteProfilePayload): RoutingRouteProfile {
  return {
    id: payload.id,
    provider: payload.provider,
    lane: payload.lane,
    costPerMillion: payload.cost_per_million,
    latencyP95: payload.latency_p95,
    reliability: payload.reliability,
    capacityScore: payload.capacity_score,
  };
}

function mapRoutingDistributionEntry(payload: RoutingDistributionEntryPayload): RoutingDistributionEntry {
  return {
    route: mapRoutingRouteProfile(payload.route),
    share: payload.share,
    tokensMillions: payload.tokens_millions,
    cost: payload.cost,
  };
}

function mapRoutingSimulation(payload: RoutingSimulationResponsePayload): RoutingSimulationResult {
  return {
    context: {
      strategy: payload.context.strategy,
      providerIds: payload.context.provider_ids,
      providerCount: payload.context.provider_count,
      volumeMillions: payload.context.volume_millions,
      failoverProviderId: payload.context.failover_provider_id ?? null,
    },
    cost: {
      totalUsd: payload.cost.total_usd,
      costPerMillionUsd: payload.cost.cost_per_million_usd,
    },
    latency: {
      avgLatencyMs: payload.latency.avg_latency_ms,
      reliabilityScore: payload.latency.reliability_score,
    },
    distribution: payload.distribution.map(mapRoutingDistributionEntry),
    excludedRoute: payload.excluded_route ? mapRoutingRouteProfile(payload.excluded_route) : null,
  };
}

export interface TelemetryRouteBreakdownEntry {
  id: string;
  provider_id: string;
  provider_name: string;
  route: string | null;
  lane: 'economy' | 'balanced' | 'turbo';
  run_count: number;
  tokens_in: number;
  tokens_out: number;
  cost_usd: number;
  avg_latency_ms: number;
  success_rate: number;
}

interface TelemetryParetoResponsePayload {
  items: TelemetryRouteBreakdownEntry[];
  next_cursor?: string | null;
}

export interface TelemetryRunEntry {
  id: number;
  provider_id: string;
  provider_name: string;
  route: string | null;
  lane: 'economy' | 'balanced' | 'turbo' | null;
  ts: string;
  tokens_in: number;
  tokens_out: number;
  duration_ms: number;
  status: string;
  cost_usd: number;
  metadata: Record<string, unknown>;
  experiment_cohort: string | null;
  experiment_tag: string | null;
}

interface TelemetryRunsResponsePayload {
  items: TelemetryRunEntry[];
  next_cursor?: string | null;
}

export interface TelemetryExperimentSummaryEntry {
  cohort: string | null;
  tag: string | null;
  run_count: number;
  success_rate: number;
  error_rate: number;
  avg_latency_ms: number;
  total_cost_usd: number;
  total_tokens_in: number;
  total_tokens_out: number;
  mttr_ms: number | null;
  recovery_events: number;
}

interface TelemetryExperimentsResponsePayload {
  items: TelemetryExperimentSummaryEntry[];
}

export interface TelemetryLaneCostEntry {
  lane: 'economy' | 'balanced' | 'turbo';
  run_count: number;
  total_cost_usd: number;
  total_tokens_in: number;
  total_tokens_out: number;
  avg_latency_ms: number;
}

interface TelemetryLaneCostResponsePayload {
  items: TelemetryLaneCostEntry[];
}

export interface MarketplacePerformanceEntry {
  entry_id: string;
  name: string;
  origin: string;
  rating: number;
  cost: number;
  run_count: number;
  success_rate: number;
  avg_latency_ms: number;
  total_cost_usd: number;
  total_tokens_in: number;
  total_tokens_out: number;
  cohorts: string[];
  adoption_score: number;
}

interface MarketplacePerformanceResponsePayload {
  items: MarketplacePerformanceEntry[];
}

interface McpServerPayload {
  id: string;
  name: string;
  command: string;
  description: string | null;
  tags: string[];
  capabilities: string[];
  transport: string;
  created_at: string;
  updated_at: string;
}

interface McpServersResponsePayload {
  servers: McpServerPayload[];
}

interface ServerProcessLogPayload {
  id: string;
  timestamp: string;
  level: 'info' | 'error';
  message: string;
}

interface ServerProcessStatePayload {
  server_id: string;
  status: ServerProcessLifecycle;
  command: string;
  pid?: number | null;
  started_at?: string | null;
  stopped_at?: string | null;
  return_code?: number | null;
  last_error?: string | null;
  logs?: ServerProcessLogPayload[];
  cursor?: string | null;
}

interface ServerProcessResponsePayload {
  process: ServerProcessStatePayload;
}

interface ServerProcessesResponsePayload {
  processes: ServerProcessStatePayload[];
}

interface ServerProcessLogsResponsePayload {
  logs: ServerProcessLogPayload[];
  cursor?: string | null;
}

interface DiagnosticsComponentPayload {
  ok: boolean;
  status_code?: number | null;
  duration_ms?: number | null;
  data?: unknown;
  error?: string | null;
}

interface DiagnosticsSummaryPayload {
  total: number;
  successes: number;
  failures: number;
  errors?: Record<string, string>;
}

interface DiagnosticsResponsePayload {
  timestamp: string;
  summary: DiagnosticsSummaryPayload;
  health: DiagnosticsComponentPayload;
  providers: DiagnosticsComponentPayload;
  invoke: DiagnosticsComponentPayload;
}

interface DiagnosticsRequestPayload {
  invoke: {
    agent: string;
    input?: Record<string, unknown>;
    config?: Record<string, unknown>;
  };
  agents_base_url?: string;
}

interface ServerHealthCheckPayload {
  status: ServerHealthStatus;
  checked_at: string;
  latency_ms?: number | null;
  message?: string | null;
  actor?: string | null;
  plan_id?: string | null;
}

interface ServerHealthHistoryResponsePayload {
  checks: ServerHealthCheckPayload[];
}

interface ServerHealthPingResponsePayload {
  check: ServerHealthCheckPayload;
}

export interface TelemetryMetricsFilters {
  start?: Date | string;
  end?: Date | string;
  providerId?: string;
  route?: string;
}

export interface TelemetryHeatmapFilters extends TelemetryMetricsFilters {}

export interface TelemetryTimeseriesFilters extends TelemetryMetricsFilters {
  lane?: string;
}

export interface TelemetryParetoFilters extends TelemetryMetricsFilters {
  lane?: string;
}

export interface TelemetryRunsFilters extends TelemetryMetricsFilters {
  lane?: string;
  limit?: number;
  cursor?: string;
}

export interface TelemetryExperimentsFilters extends TelemetryMetricsFilters {
  lane?: string;
}

export interface TelemetryLaneCostFilters extends TelemetryMetricsFilters {
  lane?: string;
}

export interface MarketplacePerformanceFilters extends TelemetryMetricsFilters {}

export type TelemetryExportFormat = 'csv' | 'html';

export interface TelemetryExportResult {
  blob: Blob;
  mediaType: string;
}

export class ApiError extends Error {
  readonly status: number;
  readonly body: string;

  constructor(message: string, status: number, body: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

type FixtureLoader = () => Promise<unknown>;

interface FixtureRouteDefinition {
  readonly method: string;
  readonly pattern: RegExp;
  readonly load: FixtureLoader;
}

type FixtureResolution<T> = { handled: true; value: T } | { handled: false };

async function loadJsonFixture<T>(importer: () => Promise<{ default: T }>): Promise<T> {
  const module = await importer();
  const data = module.default;
  if (typeof structuredClone === 'function') {
    return structuredClone(data);
  }
  return JSON.parse(JSON.stringify(data)) as T;
}

function normalizeRequestPath(path: string): string {
  const withoutQuery = path.replace(/[?#].*$/, '');
  if (!withoutQuery.startsWith('/')) {
    return `/${withoutQuery}`;
  }
  return withoutQuery;
}

const API_FIXTURE_ROUTES: FixtureRouteDefinition[] = [
  {
    method: 'GET',
    pattern: /^\/servers\/?$/,
    load: () => loadJsonFixture(() => import('#fixtures/servers.json')),
  },
  {
    method: 'GET',
    pattern: /^\/sessions\/?$/,
    load: () => loadJsonFixture(() => import('#fixtures/sessions.json')),
  },
  {
    method: 'GET',
    pattern: /^\/telemetry\/metrics\/?$/,
    load: () => loadJsonFixture(() => import('#fixtures/telemetry_metrics.json')),
  },
  {
    method: 'GET',
    pattern: /^\/telemetry\/heatmap\/?$/,
    load: () => loadJsonFixture(() => import('#fixtures/telemetry_heatmap.json')),
  },
  {
    method: 'GET',
    pattern: /^\/policies\/compliance\/?$/,
    load: () => loadJsonFixture(() => import('#fixtures/policies_compliance.json')),
  },
  {
    method: 'GET',
    pattern: /^\/notifications\/?$/,
    load: () => loadJsonFixture(() => import('#fixtures/notifications.json')),
  },
];

const AGENT_FIXTURE_ROUTES: FixtureRouteDefinition[] = [
  {
    method: 'GET',
    pattern: /^\/agents\/?$/,
    load: () => loadJsonFixture(() => import('#fixtures/agents.json')),
  },
];

function markFixtureHandled<T>(value: T): FixtureResolution<T> {
  return { handled: true, value };
}

function markFixtureUnhandled<T>(): FixtureResolution<T> {
  return { handled: false };
}

async function tryResolveFixture<T>(
  routes: readonly FixtureRouteDefinition[],
  path: string,
  init?: RequestInit,
): Promise<FixtureResolution<T>> {
  const method = (init?.method ?? 'GET').toUpperCase();
  const normalizedPath = normalizeRequestPath(path);
  for (const route of routes) {
    if (route.method !== method) {
      continue;
    }
    if (!route.pattern.test(normalizedPath)) {
      continue;
    }
    const data = (await route.load()) as T;
    return markFixtureHandled(data);
  }
  return markFixtureUnhandled();
}

function readJsonRequestBody(init?: RequestInit): unknown {
  if (!init || init.body == null) {
    return null;
  }
  const { body } = init;
  if (typeof body === 'string') {
    try {
      return JSON.parse(body);
    } catch (error) {
      console.warn('Não foi possível analisar corpo da requisição de fixture como JSON.', error);
      return null;
    }
  }
  if (body instanceof Uint8Array) {
    const decoded = new TextDecoder().decode(body);
    try {
      return JSON.parse(decoded);
    } catch (error) {
      console.warn('Não foi possível analisar corpo da requisição de fixture como JSON.', error);
      return null;
    }
  }
  if (body instanceof ArrayBuffer) {
    const decoded = new TextDecoder().decode(new Uint8Array(body));
    try {
      return JSON.parse(decoded);
    } catch (error) {
      console.warn('Não foi possível analisar corpo da requisição de fixture como JSON.', error);
      return null;
    }
  }
  return null;
}

function nowIso(): string {
  return new Date().toISOString();
}

async function loadServersFixture(): Promise<McpServersResponsePayload> {
  return loadJsonFixture(() => import('#fixtures/servers.json')) as Promise<McpServersResponsePayload>;
}

async function loadServerProcessesFixture(): Promise<ServerProcessesResponsePayload> {
  return loadJsonFixture(() => import('#fixtures/server_processes.json')) as Promise<ServerProcessesResponsePayload>;
}

type ServerHealthCollection = {
  checks: Record<string, Array<Partial<ServerHealthCheckPayload>>>;
};

async function loadServerHealthFixture(): Promise<ServerHealthCollection> {
  return loadJsonFixture(() => import('#fixtures/server_health.json')) as Promise<ServerHealthCollection>;
}

function normalizeServerHealthEntry(
  serverId: string,
  entry: Partial<ServerHealthCheckPayload>,
): ServerHealthCheckPayload {
  return {
    status: entry.status ?? 'unknown',
    checked_at: entry.checked_at ?? nowIso(),
    latency_ms: entry.latency_ms ?? null,
    message: entry.message ?? `Ping executado para ${serverId}.`,
    actor: entry.actor ?? null,
    plan_id: entry.plan_id ?? null,
  };
}

function mapProcessFixture(
  fixture: ServerProcessStatePayload,
  overrides?: Partial<ServerProcessStatePayload>,
): ServerProcessStatePayload {
  return {
    server_id: fixture.server_id,
    status: overrides?.status ?? fixture.status,
    command: overrides?.command ?? fixture.command,
    pid: overrides?.pid ?? fixture.pid ?? null,
    started_at: overrides?.started_at ?? fixture.started_at ?? null,
    stopped_at: overrides?.stopped_at ?? fixture.stopped_at ?? null,
    return_code: overrides?.return_code ?? fixture.return_code ?? null,
    last_error: overrides?.last_error ?? fixture.last_error ?? null,
    logs: overrides?.logs ?? fixture.logs ?? [],
    cursor: overrides?.cursor ?? fixture.cursor ?? null,
  };
}

function buildServerProcessResponse(
  fixture: ServerProcessStatePayload,
  overrides: Partial<ServerProcessStatePayload>,
): ServerProcessResponsePayload {
  return {
    process: mapProcessFixture(fixture, overrides),
  };
}

async function handleServerFixtureRequest(
  method: string,
  normalizedPath: string,
  init?: RequestInit,
  allowMutations = true,
): Promise<FixtureResolution<unknown>> {
  if (!allowMutations && method !== 'GET') {
    return markFixtureUnhandled();
  }

  if (method === 'GET' && normalizedPath === '/servers/processes') {
    const payload = await loadServerProcessesFixture();
    return markFixtureHandled(payload);
  }

  if (method === 'GET' && normalizedPath === '/servers') {
    const payload = await loadServersFixture();
    return markFixtureHandled(payload);
  }

  if (method === 'GET' && /^\/servers\/[^/]+\/process\/logs/.test(normalizedPath)) {
    const match = normalizedPath.match(/^\/servers\/([^/]+)\/process\/logs/);
    if (match) {
      const serverId = decodeURIComponent(match[1]);
      const processes = await loadServerProcessesFixture();
      const snapshot = processes.processes.find((process) => process.server_id === serverId);
      const logs = snapshot?.logs ?? [];
      const cursor = snapshot?.cursor ?? null;
      const response: ServerProcessLogsResponsePayload = { logs, cursor };
      return markFixtureHandled(response);
    }
  }

  if (method === 'GET' && /^\/servers\/[^/]+\/health$/.test(normalizedPath)) {
    const match = normalizedPath.match(/^\/servers\/([^/]+)\/health$/);
    if (match) {
      const serverId = decodeURIComponent(match[1]);
      const fixture = await loadServerHealthFixture();
      const entries = fixture.checks?.[serverId] ?? [];
      const response: ServerHealthHistoryResponsePayload = {
        checks: entries.map((entry) => normalizeServerHealthEntry(serverId, entry)),
      };
      return markFixtureHandled(response);
    }
  }

  if (method === 'POST' && /^\/servers\/[^/]+\/health\/ping$/.test(normalizedPath)) {
    const match = normalizedPath.match(/^\/servers\/([^/]+)\/health\/ping$/);
    if (match) {
      const serverId = decodeURIComponent(match[1]);
      const fixture = await loadServerHealthFixture();
      const baseline = fixture.checks?.[serverId]?.[0] ?? {};
      const check: ServerHealthCheckPayload = normalizeServerHealthEntry(serverId, {
        ...baseline,
        checked_at: nowIso(),
        status: 'healthy',
        message: 'Ping realizado com sucesso via fixtures.',
        actor: 'Console MCP',
      });
      const response: ServerHealthPingResponsePayload = { check };
      return markFixtureHandled(response);
    }
  }

  if (method === 'POST' && /^\/servers\/[^/]+\/process\/(start|stop|restart)$/.test(normalizedPath)) {
    const match = normalizedPath.match(/^\/servers\/([^/]+)\/process\/(start|stop|restart)$/);
    if (match) {
      const serverId = decodeURIComponent(match[1]);
      const action = match[2] as 'start' | 'stop' | 'restart';
      const processes = await loadServerProcessesFixture();
      const snapshot =
        processes.processes.find((process) => process.server_id === serverId) ??
        ({
          server_id: serverId,
          status: 'stopped',
          command: '',
          pid: null,
          started_at: null,
          stopped_at: null,
          return_code: null,
          last_error: null,
          logs: [],
          cursor: null,
        } satisfies ServerProcessStatePayload);

      const logs = (snapshot.logs ?? []).slice();
      const timestamp = nowIso();

      if (action === 'start' || action === 'restart') {
        logs.unshift({
          id: `${serverId}-log-${timestamp}`,
          timestamp,
          level: 'info',
          message: action === 'start' ? 'Processo iniciado via fixtures.' : 'Processo reiniciado via fixtures.',
        });
      } else if (action === 'stop') {
        logs.unshift({
          id: `${serverId}-log-${timestamp}`,
          timestamp,
          level: 'info',
          message: 'Processo interrompido via fixtures.',
        });
      }

      const overrides: Partial<ServerProcessStatePayload> =
        action === 'start'
          ? {
              status: 'running',
              pid: snapshot.pid ?? Math.floor(Math.random() * 20000 + 1200),
              started_at: timestamp,
              stopped_at: null,
              return_code: null,
              last_error: null,
              logs,
            }
          : action === 'stop'
            ? {
                status: 'stopped',
                pid: null,
                stopped_at: timestamp,
                return_code: 0,
                last_error: null,
                logs,
              }
            : {
                status: 'running',
                pid: snapshot.pid ?? Math.floor(Math.random() * 20000 + 2200),
                started_at: timestamp,
                stopped_at: null,
                return_code: null,
                last_error: null,
                logs,
              };

      const response = buildServerProcessResponse(snapshot, overrides);
      return markFixtureHandled(response);
    }
  }

  if (method === 'PUT' && /^\/servers\/[^/]+$/.test(normalizedPath)) {
    const match = normalizedPath.match(/^\/servers\/([^/]+)$/);
    if (match) {
      const serverId = decodeURIComponent(match[1]);
      const body = readJsonRequestBody(init);
      const payload = (typeof body === 'object' && body !== null ? body : {}) as Partial<McpServerPayload>;
      const servers = await loadServersFixture();
      const fallback = servers.servers.find((server) => server.id === serverId);
      const response: McpServerPayload = {
        id: serverId,
        name: typeof payload.name === 'string' ? payload.name : fallback?.name ?? serverId,
        command:
          typeof payload.command === 'string'
            ? payload.command
            : fallback?.command ?? `~/.local/bin/${serverId}-mcp`,
        description:
          typeof payload.description === 'string'
            ? payload.description
            : payload.description === null
              ? null
              : fallback?.description ?? null,
        tags:
          Array.isArray(payload.tags) && payload.tags.every((item) => typeof item === 'string')
            ? (payload.tags as string[])
            : fallback?.tags ?? [],
        capabilities:
          Array.isArray(payload.capabilities) && payload.capabilities.every((item) => typeof item === 'string')
            ? (payload.capabilities as string[])
            : fallback?.capabilities ?? [],
        transport:
          typeof payload.transport === 'string' ? payload.transport : fallback?.transport ?? 'stdio',
        created_at: fallback?.created_at ?? nowIso(),
        updated_at: nowIso(),
      };
      return markFixtureHandled(response);
    }
  }

  if (method === 'DELETE' && /^\/servers\/[^/]+$/.test(normalizedPath)) {
    return markFixtureHandled(undefined);
  }

  return markFixtureUnhandled();
}

async function loadPolicyTemplatesFixture(): Promise<PolicyTemplatesResponse> {
  return loadJsonFixture(() => import('#fixtures/policy_templates.json')) as Promise<PolicyTemplatesResponse>;
}

async function loadPolicyDeploymentsFixture(): Promise<PolicyDeploymentsResponsePayload> {
  return loadJsonFixture(
    () => import('#fixtures/policy_deployments.json'),
  ) as Promise<PolicyDeploymentsResponsePayload>;
}

async function loadPolicyManifestFixture(): Promise<PolicyManifestPayload> {
  return loadJsonFixture(() => import('#fixtures/policy_manifest.json')) as Promise<PolicyManifestPayload>;
}

function buildFixturePlanPayload(summary: string): ConfigPlanPayload {
  return {
    intent: 'update-policies',
    summary,
    status: 'pending',
    steps: [
      {
        id: 'update-manifest',
        title: 'Aplicar manifesto de políticas',
        description: 'Atualizar manifesto governado utilizando dados determinísticos das fixtures locais.',
        depends_on: [],
        actions: [
          {
            type: 'file.update',
            path: 'policies/manifest.json',
            contents: '',
            encoding: 'utf-8',
            overwrite: true,
          },
        ],
      },
    ],
    diffs: [
      {
        path: 'policies/manifest.json',
        summary,
        change_type: 'modify',
        diff: null,
      },
    ],
    risks: [
      {
        title: 'Mudança controlada',
        impact: 'Aplicação atualiza políticas governadas em ambiente controlado por fixtures.',
        mitigation: 'Plano revisado localmente com dados determinísticos.',
      },
    ],
    context: [],
    approval_rules: ['risk:controlled'],
  };
}

function buildFixturePlanResponse(summary: string): ConfigPlanResponsePayload {
  return {
    plan: buildFixturePlanPayload(summary),
    preview: {
      branch: 'chore/finops-plan-fixtures',
      base_branch: 'main',
      commit_message: 'chore: atualizar políticas com fixtures',
      pull_request: {
        provider: 'github',
        title: 'Atualizar políticas MCP via fixtures',
        body: null,
      },
    },
  };
}

function buildApplyPlanResponsePayload(
  planId: string,
  patch: string,
  context: { actor: string; actorEmail: string },
): ApplyPlanResponsePayload {
  const isFinOpsPlan = planId.startsWith('finops-plan');
  const branch = 'chore/finops-plan-fixtures';
  const message = isFinOpsPlan
    ? 'Plano FinOps aplicado com sucesso via fixtures.'
    : 'Plano aplicado com sucesso via fixtures.';

  return {
    status: 'completed',
    mode: 'branch_pr',
    plan_id: planId,
    record_id: `fixtures-${planId}`,
    branch,
    base_branch: 'main',
    commit_sha: 'fixture-deadbeef',
    diff: {
      stat: '1 files changed, 12 insertions(+), 4 deletions(-)',
      patch,
    },
    hitl_required: false,
    message,
    approval_id: null,
    pull_request: {
      provider: 'github',
      id: 'fixtures/pr/42',
      number: '42',
      url: 'https://github.com/example/console-mcp/pull/42',
      title: 'Atualizar políticas governadas via fixtures',
      state: 'open',
      head_sha: 'fixture-deadbeef',
      branch,
      ci_status: 'success',
      review_status: 'pending',
      merged: false,
      last_synced_at: nowIso(),
      reviewers: [
        {
          id: 'ops-fixture',
          name: 'Equipe Ops',
          status: 'pending',
        },
      ],
      ci_results: [
        {
          name: 'CI · Fixtures',
          status: 'success',
          details_url: 'https://ci.example.com/jobs/fixture',
        },
      ],
    },
  };
}

async function handlePolicyFixtureRequest(
  method: string,
  normalizedPath: string,
  init?: RequestInit,
): Promise<FixtureResolution<unknown>> {
  if (method === 'GET' && normalizedPath === '/policies/templates') {
    const payload = await loadPolicyTemplatesFixture();
    return markFixtureHandled(payload);
  }

  if (method === 'GET' && normalizedPath === '/policies/deployments') {
    const payload = await loadPolicyDeploymentsFixture();
    return markFixtureHandled(payload);
  }

  if (method === 'GET' && normalizedPath === '/policies/manifest') {
    const payload = await loadPolicyManifestFixture();
    return markFixtureHandled(payload);
  }

  if (method === 'GET' && normalizedPath === '/policies/hitl/queue') {
    const payload: HitlQueuePayload = {
      updated_at: nowIso(),
      pending: [
        {
          id: 'hitl-fixture-request',
          agent: 'governed-ops',
          route: 'support.escalate',
          checkpoint: 'critical-incidents',
          checkpoint_details: {
            name: 'critical-incidents',
            description: 'Aprovação humana para incidentes críticos.',
            required: true,
            escalation_channel: 'pagerduty',
          },
          submitted_at: nowIso(),
          status: 'pending',
          confidence: 0.38,
          notes: 'Solicitação aguardando dupla revisão.',
          metadata: {
            reason: 'Escalonamento automático detectou risco de falha.',
          },
        },
      ],
      resolved: [],
    };
    return markFixtureHandled(payload);
  }

  if (method === 'POST' && /^\/policies\/hitl\/queue\/[^/]+$/.test(normalizedPath)) {
    const match = normalizedPath.match(/^\/policies\/hitl\/queue\/([^/]+)$/);
    if (match) {
      const requestId = decodeURIComponent(match[1]);
      const body = readJsonRequestBody(init) as { resolution?: HitlResolution; note?: string | null } | null;
      const resolution = body?.resolution ?? 'approved';
      const updated: HitlApprovalPayload = {
        id: requestId,
        agent: 'governed-ops',
        route: 'support.escalate',
        checkpoint: 'critical-incidents',
        checkpoint_details: {
          name: 'critical-incidents',
          description: 'Aprovação humana para incidentes críticos.',
          required: true,
          escalation_channel: 'pagerduty',
        },
        submitted_at: nowIso(),
        status: resolution === 'approved' ? 'approved' : 'rejected',
        confidence: 0.72,
        notes: body?.note ?? null,
        metadata: {
          resolved_by: 'Console MCP',
        },
      };
      return markFixtureHandled(updated);
    }
  }

  if (method === 'POST' && normalizedPath === '/policies/deployments') {
    const body = readJsonRequestBody(init) as
      | {
          template_id?: string;
          author?: string;
          window?: string | null;
          note?: string | null;
        }
      | null;
    const templateId = body?.template_id ?? 'policy-routing-latency';
    const timestamp = nowIso();
    const payload: PolicyDeploymentPayload = {
      id: `${templateId}-${Date.now()}`,
      template_id: templateId,
      deployed_at: timestamp,
      author: body?.author ?? 'Console MCP',
      window: body?.window ?? 'Rollout monitorado',
      note: body?.note ?? null,
      slo_p95_ms: 850,
      budget_usage_pct: 64,
      incidents_count: 0,
      guardrail_score: 82,
      created_at: timestamp,
      updated_at: timestamp,
    };
    return markFixtureHandled(payload);
  }

  if (method === 'DELETE' && /^\/policies\/deployments\/[^/]+$/.test(normalizedPath)) {
    return markFixtureHandled(undefined);
  }

  if (method === 'PATCH' && normalizedPath === '/config/policies') {
    const response = buildFixturePlanResponse('Atualizar limites e alertas FinOps usando fixtures locais.');
    return markFixtureHandled(response);
  }

  if (method === 'POST' && normalizedPath === '/config/apply') {
    const body = readJsonRequestBody(init) as
      | {
          plan_id: string;
          patch: string;
          actor?: string;
          actor_email?: string;
        }
      | null;
    const planId = body?.plan_id ?? `plan-${Date.now()}`;
    const patch = typeof body?.patch === 'string' ? body.patch : '';
    const response = buildApplyPlanResponsePayload(planId, patch, {
      actor: body?.actor ?? 'Console MCP',
      actorEmail: body?.actor_email ?? 'fixtures@example.com',
    });
    return markFixtureHandled(response);
  }

  return markFixtureUnhandled();
}

async function loadRoutingSimulationFixture(): Promise<RoutingSimulationResponsePayload> {
  return loadJsonFixture(
    () => import('#fixtures/routing_simulation.json'),
  ) as Promise<RoutingSimulationResponsePayload>;
}

async function handleRoutingFixtureRequest(
  method: string,
  normalizedPath: string,
): Promise<FixtureResolution<unknown>> {
  if (method === 'POST' && normalizedPath === '/routing/simulate') {
    const payload = await loadRoutingSimulationFixture();
    return markFixtureHandled(payload);
  }
  return markFixtureUnhandled();
}

async function loadTelemetryTimeseriesFixture(): Promise<TelemetryTimeseriesResponsePayload> {
  return loadJsonFixture(
    () => import('#fixtures/telemetry_timeseries.json'),
  ) as Promise<TelemetryTimeseriesResponsePayload>;
}

async function loadTelemetryParetoFixture(): Promise<TelemetryParetoResponsePayload> {
  return loadJsonFixture(
    () => import('#fixtures/telemetry_pareto.json'),
  ) as Promise<TelemetryParetoResponsePayload>;
}

async function loadTelemetryRunsFixture(): Promise<TelemetryRunsResponsePayload> {
  return loadJsonFixture(() => import('#fixtures/telemetry_runs.json')) as Promise<TelemetryRunsResponsePayload>;
}

async function loadTelemetryExperimentsFixture(): Promise<TelemetryExperimentsResponsePayload> {
  return loadJsonFixture(
    () => import('#fixtures/telemetry_experiments.json'),
  ) as Promise<TelemetryExperimentsResponsePayload>;
}

async function loadTelemetryLaneCostsFixture(): Promise<TelemetryLaneCostResponsePayload> {
  return loadJsonFixture(
    () => import('#fixtures/telemetry_lane_costs.json'),
  ) as Promise<TelemetryLaneCostResponsePayload>;
}

async function loadMarketplacePerformanceFixture(): Promise<MarketplacePerformanceResponsePayload> {
  return loadJsonFixture(
    () => import('#fixtures/telemetry_marketplace.json'),
  ) as Promise<MarketplacePerformanceResponsePayload>;
}

async function loadFinOpsSprintsFixture(): Promise<FinOpsSprintReportsResponsePayload> {
  return loadJsonFixture(
    () => import('#fixtures/finops_sprints.json'),
  ) as Promise<FinOpsSprintReportsResponsePayload>;
}

async function loadFinOpsPullRequestsFixture(): Promise<FinOpsPullRequestReportsResponsePayload> {
  return loadJsonFixture(
    () => import('#fixtures/finops_pull_requests.json'),
  ) as Promise<FinOpsPullRequestReportsResponsePayload>;
}

async function handleFinOpsFixtureRequest(
  method: string,
  normalizedPath: string,
): Promise<FixtureResolution<unknown>> {
  if (method === 'GET' && normalizedPath === '/telemetry/timeseries') {
    const payload = await loadTelemetryTimeseriesFixture();
    return markFixtureHandled(payload);
  }

  if (method === 'GET' && normalizedPath === '/telemetry/pareto') {
    const payload = await loadTelemetryParetoFixture();
    return markFixtureHandled(payload);
  }

  if (method === 'GET' && normalizedPath === '/telemetry/runs') {
    const payload = await loadTelemetryRunsFixture();
    return markFixtureHandled(payload);
  }

  if (method === 'GET' && normalizedPath === '/telemetry/experiments') {
    const payload = await loadTelemetryExperimentsFixture();
    return markFixtureHandled(payload);
  }

  if (method === 'GET' && normalizedPath === '/telemetry/lane-costs') {
    const payload = await loadTelemetryLaneCostsFixture();
    return markFixtureHandled(payload);
  }

  if (method === 'GET' && normalizedPath === '/telemetry/marketplace/performance') {
    const payload = await loadMarketplacePerformanceFixture();
    return markFixtureHandled(payload);
  }

  if (method === 'GET' && normalizedPath === '/telemetry/finops/sprints') {
    const payload = await loadFinOpsSprintsFixture();
    return markFixtureHandled(payload);
  }

  if (method === 'GET' && normalizedPath === '/telemetry/finops/pull-requests') {
    const payload = await loadFinOpsPullRequestsFixture();
    return markFixtureHandled(payload);
  }

  return markFixtureUnhandled();
}

async function resolveFixtureRequest<T>(
  path: string,
  init: RequestInit | undefined,
  fallbackRoutes: readonly FixtureRouteDefinition[] = API_FIXTURE_ROUTES,
): Promise<FixtureResolution<T>> {
  const method = (init?.method ?? 'GET').toUpperCase();
  const normalizedPath = normalizeRequestPath(path);

  const serverResolution = await handleServerFixtureRequest(method, normalizedPath, init);
  if (serverResolution.handled) {
    return serverResolution as FixtureResolution<T>;
  }

  const policyResolution = await handlePolicyFixtureRequest(method, normalizedPath, init);
  if (policyResolution.handled) {
    return policyResolution as FixtureResolution<T>;
  }

  const routingResolution = await handleRoutingFixtureRequest(method, normalizedPath);
  if (routingResolution.handled) {
    return routingResolution as FixtureResolution<T>;
  }

  const finOpsResolution = await handleFinOpsFixtureRequest(method, normalizedPath);
  if (finOpsResolution.handled) {
    return finOpsResolution as FixtureResolution<T>;
  }

  const fallback = await tryResolveFixture<T>(fallbackRoutes, path, init);
  if (fallback.handled) {
    return fallback;
  }

  return markFixtureUnhandled();
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const method = (init?.method ?? 'GET').toUpperCase();
  const normalizedPath = normalizeRequestPath(path);

  if (isFixtureModeEnabled()) {
    const fixture = await resolveFixtureRequest<T>(path, init, API_FIXTURE_ROUTES);
    if (fixture.handled) {
      // Emit background request to satisfy tools that await network activity (e.g., Playwright waitForRequest).
      // The request may fail when no backend is available; swallow any resulting errors.
      try {
        void fetchFromApi(path, init).catch(() => undefined);
      } catch {
        // Ignore synchronous fetch failures.
      }
      return fixture.value;
    }
  }

  let response: Response | null = null;
  let fetchError: unknown = null;

  try {
    response = await fetchFromApi(path, init);
  } catch (error) {
    fetchError = error;
  }

  if (!response) {
    const serverFixture = await handleServerFixtureRequest(method, normalizedPath, init, true);
    if (serverFixture.handled) {
      return serverFixture.value as T;
    }

    const fallbackFixture = await tryResolveFixture<T>(API_FIXTURE_ROUTES, path, init);
    if (fallbackFixture.handled) {
      return fallbackFixture.value;
    }

    const detail = fetchError instanceof Error ? fetchError.message : String(fetchError ?? 'Unknown error');
    const message = isFixtureModeEnabled()
      ? 'Falha ao consultar dados das fixtures locais.'
      : 'Falha ao executar requisição contra a API do Console MCP.';
    console.error('Falha ao buscar %s: %s', path, detail);
    throw new ApiError(message, 0, detail);
  }

  if (!response.ok) {
    const mutationFixture = await handleServerFixtureRequest(method, normalizedPath, init, true);
    if (mutationFixture.handled) {
      return mutationFixture.value as T;
    }

    const fallbackFixture = await tryResolveFixture<T>(API_FIXTURE_ROUTES, path, init);
    if (fallbackFixture.handled) {
      return fallbackFixture.value;
    }

    const body = await response.text();
    const message = body || `Request failed with status ${response.status}`;
    throw new ApiError(message, response.status, body);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  try {
    return (await response.json()) as T;
  } catch {
    return undefined as T;
  }
}

async function requestAgents<T>(path: string, init?: RequestInit): Promise<T> {
  if (isFixtureModeEnabled()) {
    const fixture = await resolveFixtureRequest<T>(path, init, AGENT_FIXTURE_ROUTES);
    if (fixture.handled) {
      return fixture.value;
    }
  }

  let response: Response | null = null;
  let fetchError: unknown = null;

  try {
    response = await fetchFromAgents(path, init);
  } catch (error) {
    fetchError = error;
  }

  if (!response) {
    const fallbackFixture = await tryResolveFixture<T>(AGENT_FIXTURE_ROUTES, path, init);
    if (fallbackFixture.handled) {
      return fallbackFixture.value;
    }

    const detail = fetchError instanceof Error ? fetchError.message : String(fetchError ?? 'Unknown error');
    const message = isFixtureModeEnabled()
      ? 'Falha ao consultar dados das fixtures locais.'
      : 'Falha ao executar requisição contra o catálogo de agents.';
    console.error('Falha ao buscar recurso em %s: %s', path, detail);
    throw new ApiError(message, 0, detail);
  }

  if (!response.ok) {
    const body = await response.text();
    const message = body || `Request failed with status ${response.status}`;
    throw new ApiError(message, response.status, body);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  try {
    return (await response.json()) as T;
  } catch {
    return undefined as T;
  }
}

export async function fetchObservabilityPreferences(
  signal?: AbortSignal,
): Promise<ObservabilityPreferences> {
  const payload = await request<ObservabilityPreferencesResponsePayload>('/observability/preferences', {
    method: 'GET',
    signal,
  });
  return mapObservabilityPreferences(payload ?? null);
}

export async function updateObservabilityPreferences(
  input: ObservabilityPreferencesUpdateInput,
  signal?: AbortSignal,
): Promise<ObservabilityPreferences> {
  const payload = buildObservabilityPreferencesUpdatePayload(input);
  const response = await request<ObservabilityPreferencesResponsePayload>('/observability/preferences', {
    method: 'PUT',
    signal,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  return mapObservabilityPreferences(response ?? null);
}

interface AgentModelPayload {
  provider?: string | null;
  name?: string | null;
  parameters?: Record<string, unknown> | null;
}

interface AgentMetadataPayload {
  name: string;
  title: string;
  version: string;
  description?: string | null;
  capabilities?: string[] | null;
  model?: AgentModelPayload | null;
  status?: AgentStatus | string | null;
  last_deployed_at?: string | null;
  owner?: string | null;
}

interface AgentListResponsePayload {
  agents: AgentMetadataPayload[];
}

interface AgentSmokeRunPayload {
  run_id: string;
  status: AgentSmokeRunStatus;
  summary?: string | null;
  report_url?: string | null;
  started_at: string;
  finished_at: string | null;
}

interface SmokeRunLogPayload {
  id: string;
  timestamp: string;
  level: SmokeRunLogLevel;
  message: string;
}

interface SmokeRunPayload {
  run_id: string;
  status: SmokeRunStatus;
  summary?: string | null;
  triggered_by?: string | null;
  triggered_at?: string | null;
  finished_at?: string | null;
  logs?: SmokeRunLogPayload[] | null;
}

interface SmokeEndpointPayload {
  id: string;
  name: string;
  description?: string | null;
  url: string;
  last_run?: SmokeRunPayload | null;
}

interface SmokeEndpointListResponsePayload {
  endpoints: SmokeEndpointPayload[];
}

function mapAgentModel(payload?: AgentModelPayload | null): AgentModelConfig | null {
  if (!payload) {
    return null;
  }
  return {
    provider: payload.provider ?? null,
    name: payload.name ?? null,
    parameters: payload.parameters ?? {},
  };
}

function mapAgentSummary(payload: AgentMetadataPayload): AgentSummary {
  const status = payload.status;
  const normalizedStatus: AgentStatus =
    status === 'healthy' ||
    status === 'degraded' ||
    status === 'pending' ||
    status === 'inactive' ||
    status === 'failed'
      ? status
      : 'unknown';

  return {
    name: payload.name,
    title: payload.title,
    version: payload.version,
    description: payload.description ?? null,
    capabilities: payload.capabilities ?? [],
    model: mapAgentModel(payload.model ?? null),
    status: normalizedStatus,
    lastDeployedAt: payload.last_deployed_at ?? null,
    owner: payload.owner ?? null,
  };
}

function mapAgentSmokeRun(payload: AgentSmokeRunPayload): AgentSmokeRun {
  return {
    runId: payload.run_id,
    status: payload.status,
    summary: payload.summary ?? null,
    reportUrl: payload.report_url ?? null,
    startedAt: payload.started_at,
    finishedAt: payload.finished_at,
  };
}

function mapSmokeRunLog(payload: SmokeRunLogPayload): SmokeRunLogEntry {
  return {
    id: payload.id,
    timestamp: payload.timestamp,
    level: payload.level,
    message: payload.message,
  };
}

function mapSmokeRunSummary(payload: SmokeRunPayload | null | undefined): SmokeRunSummary | null {
  if (!payload) {
    return null;
  }

  return {
    runId: payload.run_id,
    status: payload.status,
    summary: payload.summary ?? null,
    triggeredBy: payload.triggered_by ?? null,
    triggeredAt: payload.triggered_at ?? null,
    finishedAt: payload.finished_at ?? null,
    logs: (payload.logs ?? []).map(mapSmokeRunLog),
  };
}

function mapSmokeEndpoint(payload: SmokeEndpointPayload): SmokeEndpoint {
  return {
    id: payload.id,
    name: payload.name,
    description: payload.description ?? null,
    url: payload.url,
    lastRun: mapSmokeRunSummary(payload.last_run ?? null),
  };
}

export async function fetchAgents(signal?: AbortSignal): Promise<AgentSummary[]> {
  const data = await requestAgents<AgentListResponsePayload>('/agents', { signal });
  return data.agents.map(mapAgentSummary);
}

export async function postAgentSmokeRun(
  agentName: string,
  signal?: AbortSignal,
): Promise<AgentSmokeRun> {
  const encoded = encodeURIComponent(agentName);
  const data = await requestAgents<AgentSmokeRunPayload>(`/${encoded}/smoke`, {
    method: 'POST',
    signal,
  });
  return mapAgentSmokeRun(data);
}

export async function fetchSmokeEndpoints(signal?: AbortSignal): Promise<SmokeEndpoint[]> {
  const data = await request<SmokeEndpointListResponsePayload>('/smoke/endpoints', { signal });
  return data.endpoints.map(mapSmokeEndpoint);
}

export async function triggerSmokeEndpoint(
  endpointId: string,
  signal?: AbortSignal,
): Promise<SmokeRunSummary> {
  const encoded = encodeURIComponent(endpointId);
  const data = await request<SmokeRunPayload>(`/smoke/endpoints/${encoded}/run`, {
    method: 'POST',
    signal,
  });
  const summary = mapSmokeRunSummary(data);
  if (!summary) {
    throw new Error('Resposta inválida da API de smoke tests');
  }
  return summary;
}

function mapMcpServer(payload: McpServerPayload): McpServer {
  return {
    id: payload.id,
    name: payload.name,
    command: payload.command,
    description: payload.description,
    tags: payload.tags ?? [],
    capabilities: payload.capabilities ?? [],
    transport: payload.transport,
    createdAt: payload.created_at,
    updatedAt: payload.updated_at,
  };
}

function mapServerProcessLog(payload: ServerProcessLogPayload): ServerProcessLogEntry {
  return {
    id: payload.id,
    timestamp: payload.timestamp,
    level: payload.level,
    message: payload.message,
  };
}

function mapDiagnosticsComponent(payload: DiagnosticsComponentPayload): DiagnosticsComponent {
  return {
    ok: payload.ok,
    statusCode: payload.status_code ?? null,
    durationMs: payload.duration_ms ?? null,
    data: payload.data ?? null,
    error: payload.error ?? null,
  };
}

function mapServerProcessState(payload: ServerProcessStatePayload): ServerProcessStateSnapshot {
  return {
    serverId: payload.server_id,
    status: payload.status,
    command: payload.command,
    pid: payload.pid ?? null,
    startedAt: payload.started_at ?? null,
    stoppedAt: payload.stopped_at ?? null,
    returnCode: payload.return_code ?? null,
    lastError: payload.last_error ?? null,
    logs: (payload.logs ?? []).map(mapServerProcessLog),
    cursor: payload.cursor ?? null,
  };
}

function mapServerHealthCheck(payload: ServerHealthCheckPayload): ServerHealthCheck {
  return {
    status: payload.status,
    checkedAt: payload.checked_at,
    latencyMs: payload.latency_ms ?? null,
    message: payload.message ?? '',
    actor: payload.actor ?? null,
    planId: payload.plan_id ?? null,
  };
}

export async function fetchServerCatalog(signal?: AbortSignal): Promise<McpServer[]> {
  const data = await request<McpServersResponsePayload>('/servers', { signal });
  return data.servers.map(mapMcpServer);
}

export async function fetchServerProcesses(signal?: AbortSignal): Promise<ServerProcessStateSnapshot[]> {
  const data = await request<ServerProcessesResponsePayload>('/servers/processes', { signal });
  return data.processes.map(mapServerProcessState);
}

async function mutateServerProcess(
  serverId: string,
  action: 'start' | 'stop' | 'restart',
  signal?: AbortSignal,
): Promise<ServerProcessStateSnapshot> {
  const payload = await request<ServerProcessResponsePayload>(`/servers/${serverId}/process/${action}`, {
    method: 'POST',
    signal,
  });
  return mapServerProcessState(payload.process);
}

export async function startServerProcess(
  serverId: string,
  signal?: AbortSignal,
): Promise<ServerProcessStateSnapshot> {
  return mutateServerProcess(serverId, 'start', signal);
}

export async function stopServerProcess(
  serverId: string,
  signal?: AbortSignal,
): Promise<ServerProcessStateSnapshot> {
  return mutateServerProcess(serverId, 'stop', signal);
}

export async function restartServerProcess(
  serverId: string,
  signal?: AbortSignal,
): Promise<ServerProcessStateSnapshot> {
  return mutateServerProcess(serverId, 'restart', signal);
}

export async function fetchServerProcessLogs(
  serverId: string,
  cursor?: string | null,
  signal?: AbortSignal,
): Promise<ServerProcessLogsResult> {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
  const payload = await request<ServerProcessLogsResponsePayload>(
    `/servers/${serverId}/process/logs${query}`,
    { signal },
  );
  return {
    logs: payload.logs.map(mapServerProcessLog),
    cursor: payload.cursor ?? cursor ?? null,
  };
}

export async function fetchServerHealthHistory(
  serverId: string,
  signal?: AbortSignal,
): Promise<ServerHealthCheck[]> {
  const payload = await request<ServerHealthHistoryResponsePayload>(`/servers/${serverId}/health`, {
    signal,
  });
  return (payload.checks ?? []).map(mapServerHealthCheck);
}

export async function pingServerHealth(serverId: string, signal?: AbortSignal): Promise<ServerHealthCheck> {
  const payload = await request<ServerHealthPingResponsePayload>(`/servers/${serverId}/health/ping`, {
    method: 'POST',
    signal,
  });
  return mapServerHealthCheck(payload.check);
}

export async function runDiagnostics(options: RunDiagnosticsInput): Promise<DiagnosticsResponse> {
  const payload: DiagnosticsRequestPayload = {
    invoke: {
      agent: options.agent,
      ...(options.input ? { input: options.input } : {}),
      ...(options.config ? { config: options.config } : {}),
    },
    ...(options.agentsBaseUrl ? { agents_base_url: options.agentsBaseUrl } : {}),
  };

  const data = await request<DiagnosticsResponsePayload>('/diagnostics/run', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  return {
    timestamp: data.timestamp,
    summary: {
      total: data.summary.total,
      successes: data.summary.successes,
      failures: data.summary.failures,
      errors: data.summary.errors ?? {},
    },
    health: mapDiagnosticsComponent(data.health),
    providers: mapDiagnosticsComponent(data.providers),
    invoke: mapDiagnosticsComponent(data.invoke),
  };
}

export async function updateServerDefinition(
  serverId: string,
  payload: McpServerUpdateInput,
  signal?: AbortSignal,
): Promise<McpServer> {
  const response = await request<McpServerPayload>(`/servers/${serverId}`, {
    method: 'PUT',
    body: JSON.stringify({
      name: payload.name,
      command: payload.command,
      description: payload.description ?? null,
      tags: payload.tags ?? [],
      capabilities: payload.capabilities ?? [],
      transport: payload.transport,
    }),
    signal,
  });
  return mapMcpServer(response);
}

export async function deleteServerDefinition(serverId: string, signal?: AbortSignal): Promise<void> {
  await request<undefined>(`/servers/${serverId}`, { method: 'DELETE', signal });
}

export async function fetchProviders(signal?: AbortSignal): Promise<ProviderSummary[]> {
  const servers = await fetchServerCatalog(signal);
  return servers.map((server) => ({
    id: server.id,
    name: server.name,
    command: server.command,
    description: server.description ?? undefined,
    tags: server.tags,
    capabilities: server.capabilities,
    transport: server.transport,
    is_available: true,
  }));
}

export async function fetchSessions(signal?: AbortSignal): Promise<Session[]> {
  const data = await request<SessionsResponse>('/sessions', { signal });
  return data.sessions;
}

export async function simulateRouting(
  payload: SimulateRoutingPayload,
  signal?: AbortSignal,
): Promise<RoutingSimulationResult> {
  const response = await request<RoutingSimulationResponsePayload>('/routing/simulate', {
    method: 'POST',
    body: JSON.stringify({
      strategy: payload.strategy,
      provider_ids: payload.providerIds ?? [],
      failover_provider_id: payload.failoverProviderId ?? null,
      volume_millions: payload.volumeMillions,
      intents: payload.intents?.map((intent) => ({
        intent: intent.intent,
        description: intent.description ?? undefined,
        tags: intent.tags,
        default_tier: intent.defaultTier,
        fallback_provider_id: intent.fallbackProviderId ?? undefined,
      })),
      custom_rules: payload.rules?.map((rule) => ({
        id: rule.id,
        description: rule.description ?? undefined,
        intent: rule.intent ?? undefined,
        matcher: rule.matcher,
        target_tier: rule.targetTier ?? undefined,
        provider_id: rule.providerId ?? undefined,
        weight: rule.weight ?? undefined,
      })),
    }),
    signal,
  });

  return mapRoutingSimulation(response);
}

export async function fetchSecrets(signal?: AbortSignal): Promise<SecretMetadata[]> {
  const data = await request<SecretsResponsePayload>('/secrets', { signal });
  return data.secrets;
}

export async function readSecret(providerId: string, signal?: AbortSignal): Promise<SecretValue> {
  return request<SecretValue>(`/secrets/${providerId}`, { signal });
}

export async function upsertSecret(
  providerId: string,
  value: string,
  signal?: AbortSignal,
): Promise<SecretValue> {
  return request<SecretValue>(`/secrets/${providerId}`, {
    method: 'PUT',
    body: JSON.stringify({ value }),
    signal,
  });
}

export async function deleteSecret(providerId: string, signal?: AbortSignal): Promise<void> {
  await request<void>(`/secrets/${providerId}`, { method: 'DELETE', signal });
}

export async function testSecret(
  providerId: string,
  signal?: AbortSignal,
): Promise<SecretTestResult> {
  return request<SecretTestResult>(`/secrets/${providerId}/test`, {
    method: 'POST',
    signal,
  });
}

function mapSecurityUser(payload: SecurityUserPayload): SecurityUser {
  return {
    id: payload.id,
    name: payload.name,
    email: payload.email,
    roles: payload.roles,
    status: payload.status,
    createdAt: payload.created_at,
    lastSeenAt: payload.last_seen_at ?? null,
    mfaEnabled: Boolean(payload.mfa_enabled),
  };
}

function mapSecurityRole(payload: SecurityRolePayload): SecurityRole {
  return {
    id: payload.id,
    name: payload.name,
    description: payload.description,
    permissions: payload.permissions,
    members: payload.members,
    createdAt: payload.created_at,
    updatedAt: payload.updated_at,
  };
}

function mapSecurityApiKey(payload: SecurityApiKeyPayload): SecurityApiKey {
  return {
    id: payload.id,
    name: payload.name,
    owner: payload.owner,
    scopes: payload.scopes,
    status: payload.status,
    createdAt: payload.created_at,
    lastUsedAt: payload.last_used_at ?? null,
    expiresAt: payload.expires_at ?? null,
    tokenPreview: payload.token_preview ?? null,
  };
}

function mapSecurityAuditEvent(payload: SecurityAuditEventPayload): SecurityAuditEvent {
  return {
    id: payload.id,
    timestamp: payload.timestamp,
    actor: payload.actor,
    action: payload.action,
    target: payload.target,
    description: payload.description,
    metadata: payload.metadata ?? null,
  };
}

function mapAuditLogEntry(payload: AuditLogEntryPayload): AuditLogEntry {
  return {
    id: payload.id,
    createdAt: payload.created_at,
    actorId: payload.actor_id ?? null,
    actorName: payload.actor_name ?? null,
    actorRoles: payload.actor_roles ?? [],
    action: payload.action,
    resource: payload.resource,
    status: payload.status,
    planId: payload.plan_id ?? null,
    metadata: payload.metadata ?? {},
  };
}

export async function fetchAuditLogs(
  query: AuditLogsQuery = {},
  signal?: AbortSignal,
): Promise<AuditLogsPage> {
  const params = new URLSearchParams();
  const actor = query.actor?.trim();
  const action = query.action?.trim();
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 25;

  params.set('page', String(page));
  params.set('page_size', String(pageSize));

  if (actor) {
    params.set('actor', actor);
  }
  if (action) {
    params.set('action', action);
  }
  if (query.start) {
    params.set('start', query.start);
  }
  if (query.end) {
    params.set('end', query.end);
  }

  const search = params.toString();
  const url = `/audit/logs${search ? `?${search}` : ''}`;
  const payload = await request<AuditLogsResponsePayload>(url, { signal });

  return {
    events: payload.events.map(mapAuditLogEntry),
    page: payload.page,
    pageSize: payload.page_size,
    total: payload.total,
    totalPages: payload.total_pages,
  };
}

export async function fetchSecurityUsers(signal?: AbortSignal): Promise<SecurityUser[]> {
  const payload = await request<SecurityUsersResponsePayload>('/security/users', { signal });
  return payload.users.map(mapSecurityUser);
}

export async function createSecurityUser(
  input: CreateSecurityUserInput,
  signal?: AbortSignal,
): Promise<SecurityUser> {
  const payload = await request<SecurityUserPayload>('/security/users', {
    method: 'POST',
    body: JSON.stringify({
      name: input.name,
      email: input.email,
      roles: input.roles,
      status: input.status,
      mfa_enabled: input.mfaEnabled,
    }),
    signal,
  });
  return mapSecurityUser(payload);
}

export async function updateSecurityUser(
  userId: string,
  input: UpdateSecurityUserInput,
  signal?: AbortSignal,
): Promise<SecurityUser> {
  const payload = await request<SecurityUserPayload>(`/security/users/${encodeURIComponent(userId)}`, {
    method: 'PUT',
    body: JSON.stringify({
      name: input.name,
      email: input.email,
      roles: input.roles,
      status: input.status,
      mfa_enabled: input.mfaEnabled,
    }),
    signal,
  });
  return mapSecurityUser(payload);
}

export async function deleteSecurityUser(userId: string, signal?: AbortSignal): Promise<void> {
  await request<void>(`/security/users/${encodeURIComponent(userId)}`, {
    method: 'DELETE',
    signal,
  });
}

export async function fetchSecurityRoles(signal?: AbortSignal): Promise<SecurityRole[]> {
  const payload = await request<SecurityRolesResponsePayload>('/security/roles', { signal });
  return payload.roles.map(mapSecurityRole);
}

export async function createSecurityRole(
  input: CreateSecurityRoleInput,
  signal?: AbortSignal,
): Promise<SecurityRole> {
  const payload = await request<SecurityRolePayload>('/security/roles', {
    method: 'POST',
    body: JSON.stringify({
      name: input.name,
      description: input.description,
      permissions: input.permissions,
    }),
    signal,
  });
  return mapSecurityRole(payload);
}

export async function updateSecurityRole(
  roleId: string,
  input: UpdateSecurityRoleInput,
  signal?: AbortSignal,
): Promise<SecurityRole> {
  const payload = await request<SecurityRolePayload>(`/security/roles/${encodeURIComponent(roleId)}`, {
    method: 'PUT',
    body: JSON.stringify({
      name: input.name,
      description: input.description,
      permissions: input.permissions,
    }),
    signal,
  });
  return mapSecurityRole(payload);
}

export async function deleteSecurityRole(roleId: string, signal?: AbortSignal): Promise<void> {
  await request<void>(`/security/roles/${encodeURIComponent(roleId)}`, {
    method: 'DELETE',
    signal,
  });
}

export async function fetchSecurityApiKeys(signal?: AbortSignal): Promise<SecurityApiKey[]> {
  const payload = await request<SecurityApiKeyListPayload>('/security/api-keys', { signal });
  return payload.keys.map(mapSecurityApiKey);
}

export async function createSecurityApiKey(
  input: CreateSecurityApiKeyInput,
  signal?: AbortSignal,
): Promise<SecurityApiKeySecret> {
  const payload = await request<SecurityApiKeySecretPayload>('/security/api-keys', {
    method: 'POST',
    body: JSON.stringify({
      name: input.name,
      owner: input.owner,
      scopes: input.scopes,
      expires_at: input.expiresAt ?? null,
    }),
    signal,
  });
  return { key: mapSecurityApiKey(payload.key), secret: payload.secret };
}

export async function updateSecurityApiKey(
  apiKeyId: string,
  input: UpdateSecurityApiKeyInput,
  signal?: AbortSignal,
): Promise<SecurityApiKey> {
  const payload = await request<SecurityApiKeyPayload>(
    `/security/api-keys/${encodeURIComponent(apiKeyId)}`,
    {
      method: 'PUT',
      body: JSON.stringify({
        name: input.name,
        owner: input.owner,
        scopes: input.scopes,
        expires_at: input.expiresAt ?? null,
      }),
      signal,
    },
  );
  return mapSecurityApiKey(payload);
}

export async function rotateSecurityApiKey(
  apiKeyId: string,
  signal?: AbortSignal,
): Promise<SecurityApiKeySecret> {
  const payload = await request<SecurityApiKeySecretPayload>(
    `/security/api-keys/${encodeURIComponent(apiKeyId)}/rotate`,
    { method: 'POST', signal },
  );
  return { key: mapSecurityApiKey(payload.key), secret: payload.secret };
}

export async function revokeSecurityApiKey(
  apiKeyId: string,
  signal?: AbortSignal,
): Promise<void> {
  await request<void>(`/security/api-keys/${encodeURIComponent(apiKeyId)}`, {
    method: 'DELETE',
    signal,
  });
}

export async function fetchSecurityAuditTrail(
  resource: SecurityAuditResource,
  resourceId: string,
  signal?: AbortSignal,
): Promise<SecurityAuditEvent[]> {
  const payload = await request<SecurityAuditTrailPayload>(
    `/security/audit/${encodeURIComponent(resource)}/${encodeURIComponent(resourceId)}`,
    { signal },
  );
  return payload.events.map(mapSecurityAuditEvent);
}

export async function fetchPolicyTemplates(signal?: AbortSignal): Promise<PolicyTemplateCatalog> {
  const data = await request<PolicyTemplatesResponse>('/policies/templates', { signal });
  const templates = data.templates.map((template) => ({
    id: template.id,
    name: template.name,
    tagline: template.tagline,
    description: template.description,
    priceDelta: template.price_delta,
    latencyTarget: template.latency_target,
    guardrailLevel: template.guardrail_level,
    features: template.features,
  }));

  let rollout: PolicyRolloutOverview | null = null;
  if (data.rollout) {
    const plans = data.rollout.plans.map((plan) => ({
      templateId: plan.templateId as PolicyTemplateId,
      generatedAt: plan.generatedAt,
      allocations: plan.allocations.map((allocation) => ({
        segment: allocation.segment,
        coverage: allocation.coverage,
        providers: allocation.providers.map((provider) => ({
          ...provider,
          is_available: provider.is_available ?? true,
        })),
      })),
    }));

    rollout = {
      generatedAt: data.rollout.generatedAt,
      plans,
    };
  }

  return { templates, rollout };
}

function normalizeNumber(value: number | null | undefined, fallback: number | null): number | null {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return fallback ?? null;
  }
  return value;
}

function clampZeroOne(value: number | undefined, fallback: number): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return fallback;
  }
  if (value < 0) {
    return 0;
  }
  if (value > 1) {
    return 1;
  }
  return value;
}

function normalizePositive(value: number | null | undefined, fallback: number | null): number | null {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return fallback ?? null;
  }
  return value < 0 ? 0 : value;
}

function mapAdaptiveBudgetPayload(payload?: FinOpsAdaptiveBudgetPayload | null): FinOpsAdaptiveBudgetConfig | null {
  if (!payload) {
    return null;
  }
  return {
    enabled: Boolean(payload.enabled),
    targetUtilization: clampZeroOne(payload.target_utilization, 0.7),
    lookbackDays: Math.max(1, Math.round(payload.lookback_days ?? 7)),
    maxIncreasePct: clampZeroOne(payload.max_increase_pct, 0.25),
    maxDecreasePct: clampZeroOne(payload.max_decrease_pct, 0.4),
    costWeight: clampZeroOne(payload.cost_weight, 1),
    latencyWeight: clampZeroOne(payload.latency_weight, 0),
    latencyThresholdMs: normalizePositive(payload.latency_threshold_ms ?? null, null),
    minAmount: normalizePositive(payload.min_amount ?? null, null),
    maxAmount: normalizePositive(payload.max_amount ?? null, null),
  };
}

function mapAbVariantPayload(payload: FinOpsAbVariantPayload): FinOpsAbVariant {
  return {
    name: payload.name,
    trafficPercentage: clampZeroOne(payload.traffic_percentage, 0),
    costPerRequest: normalizePositive(payload.cost_per_request ?? null, null),
    latencyP95Ms: normalizePositive(payload.latency_p95_ms ?? null, null),
    isWinner: typeof payload.is_winner === 'boolean' ? payload.is_winner : null,
  };
}

function mapAbExperimentPayload(payload: FinOpsAbExperimentPayload): FinOpsAbExperiment {
  return {
    id: payload.id,
    lane: payload.lane ?? null,
    startedAt: payload.started_at ?? null,
    completedAt: payload.completed_at ?? null,
    summary: payload.summary ?? null,
    variants: (payload.variants ?? []).map(mapAbVariantPayload),
  };
}

function mapFinOpsBudgetPayload(payload: FinOpsBudgetPayload): FinOpsBudget {
  return {
    tier: payload.tier,
    amount: Number(payload.amount),
    currency: payload.currency,
    period: payload.period,
    adaptive: mapAdaptiveBudgetPayload(payload.adaptive ?? null),
  };
}

function mapFinOpsConfigPayload(payload?: FinOpsConfigPayload): FinOpsPolicyConfig {
  const payloadRecord = payload as Record<string, unknown> | undefined;

  const cacheSpecified = Boolean(payloadRecord && ('cache' in payloadRecord || 'cache_ttl' in payloadRecord));
  const cacheSource =
    payloadRecord && 'cache' in payloadRecord ? payloadRecord['cache'] : payload?.cache;
  const cacheTtlOverride =
    payloadRecord && 'cache_ttl' in payloadRecord
      ? (payloadRecord['cache_ttl'] as number | null | undefined)
      : undefined;

  let cacheTtlCandidate: number | null | undefined;
  if (typeof cacheSource === 'number') {
    cacheTtlCandidate = cacheSource;
  } else if (cacheSource && typeof cacheSource === 'object') {
    cacheTtlCandidate = (cacheSource as FinOpsCachePayload).ttl_seconds ?? null;
  } else if (cacheSource === null) {
    cacheTtlCandidate = null;
  }

  const ttlSeconds = normalizePositive(cacheTtlCandidate ?? cacheTtlOverride ?? null, null);
  const cache: FinOpsCachePolicyConfig | null =
    cacheSpecified || ttlSeconds !== null ? { ttlSeconds } : null;

  const rateLimitSpecified = Boolean(
    payloadRecord && ('rate_limit' in payloadRecord || 'rateLimit' in payloadRecord),
  );
  const rateLimitSource = rateLimitSpecified
    ? (payloadRecord?.['rate_limit'] ?? payloadRecord?.['rateLimit'])
    : payload?.rate_limit;

  let rpmCandidate: number | null | undefined;
  if (typeof rateLimitSource === 'number') {
    rpmCandidate = rateLimitSource;
  } else if (rateLimitSource && typeof rateLimitSource === 'object') {
    rpmCandidate = (rateLimitSource as FinOpsRateLimitPayload).requests_per_minute ?? null;
  } else if (rateLimitSource === null) {
    rpmCandidate = null;
  }

  const requestsPerMinute = normalizePositive(rpmCandidate ?? null, null);
  const rateLimit: FinOpsRateLimitPolicyConfig | null =
    rateLimitSpecified || requestsPerMinute !== null ? { requestsPerMinute } : null;

  const degradeSpecified = Boolean(
    payloadRecord &&
      ('graceful_degradation' in payloadRecord || 'gracefulDegradation' in payloadRecord),
  );
  const degradationSource = degradeSpecified
    ? payloadRecord?.['graceful_degradation'] ?? payloadRecord?.['gracefulDegradation']
    : payload?.graceful_degradation;

  let strategyRaw: string | null = null;
  let messageRaw: string | null = null;
  if (typeof degradationSource === 'string') {
    strategyRaw = degradationSource;
  } else if (degradationSource && typeof degradationSource === 'object') {
    strategyRaw = (degradationSource as FinOpsGracefulDegradationPayload).strategy ?? null;
    messageRaw = (degradationSource as FinOpsGracefulDegradationPayload).message ?? null;
  } else if (degradationSource === null) {
    strategyRaw = null;
    messageRaw = null;
  }

  const strategy = typeof strategyRaw === 'string' ? strategyRaw.trim() : '';
  const message = typeof messageRaw === 'string' ? messageRaw.trim() : '';
  const gracefulDegradation: FinOpsGracefulDegradationConfig | null =
    strategy || message || degradeSpecified
      ? { strategy: strategy || null, message: message || null }
      : null;

  return {
    costCenter: payload?.cost_center ?? 'default',
    budgets: (payload?.budgets ?? []).map(mapFinOpsBudgetPayload),
    alerts: (payload?.alerts ?? []).map((alert) => ({
      threshold: clampZeroOne(alert.threshold, 0.5),
      channel: alert.channel,
    })),
    abHistory: (payload?.ab_history ?? []).map(mapAbExperimentPayload),
    cache,
    rateLimit,
    gracefulDegradation,
  };
}

function mapRoutingIntentPayload(payload: RoutingIntentPayload): RoutingIntentConfig {
  const defaultTier: RoutingTierId = payload.default_tier ?? 'balanced';
  const tags = Array.isArray(payload.tags) ? payload.tags.filter((tag) => typeof tag === 'string') : [];
  return {
    intent: payload.intent,
    description: payload.description ?? null,
    tags,
    defaultTier,
    fallbackProviderId: payload.fallback_provider_id ?? null,
  };
}

function mapRoutingRulePayload(payload: RoutingRulePayload): RoutingRuleConfig {
  const weightValue =
    typeof payload.weight === 'number' && Number.isFinite(payload.weight) ? payload.weight : null;
  const targetTier = payload.target_tier ?? null;
  return {
    id: payload.id,
    description: payload.description ?? null,
    intent: payload.intent ?? null,
    matcher: payload.matcher ?? '',
    targetTier,
    providerId: payload.provider_id ?? null,
    weight: weightValue,
  };
}

function mapRoutingPolicyPayload(payload?: RoutingPolicyPayload): RoutingPolicyConfig {
  const defaultTier: RoutingTierId = payload?.default_tier ?? 'balanced';
  const allowed = payload?.allowed_tiers && payload.allowed_tiers.length > 0 ? payload.allowed_tiers : [defaultTier];
  const allowedSet = new Set<RoutingTierId>(allowed);
  allowedSet.add(defaultTier);
  const allowedTiers = Array.from(allowedSet);
  const fallbackTier = payload?.fallback_tier && allowedSet.has(payload.fallback_tier)
    ? payload.fallback_tier
    : null;
  const maxAttempts = Math.max(1, Math.round(payload?.max_attempts ?? 1));
  const maxItersCandidate = Math.max(1, Math.round(payload?.max_iters ?? maxAttempts));
  const requestTimeoutSeconds = Math.max(1, Math.round(payload?.request_timeout_seconds ?? 30));
  const totalTimeoutSeconds = normalizeNumber(payload?.total_timeout_seconds ?? null, null);
  return {
    maxIters: maxItersCandidate,
    maxAttempts,
    requestTimeoutSeconds,
    totalTimeoutSeconds,
    defaultTier,
    allowedTiers,
    fallbackTier,
    intents: (payload?.intents ?? []).map(mapRoutingIntentPayload),
    rules: (payload?.rules ?? []).map(mapRoutingRulePayload),
  };
}

function mapRuntimeTimeoutsPayload(
  payload?: RuntimeTimeoutsPayload,
  defaults?: { perIteration?: number | null; total?: number | null },
): RuntimeTimeoutsConfig {
  const perIterationRaw = payload?.per_iteration ?? defaults?.perIteration ?? null;
  const totalRaw = payload?.total ?? defaults?.total ?? null;
  const perIteration = perIterationRaw != null && perIterationRaw > 0 ? perIterationRaw : null;
  const total = totalRaw != null && totalRaw > 0 ? totalRaw : null;
  return { perIteration, total };
}

function mapRuntimeRetryPayload(payload?: RuntimeRetryPayload, fallbackAttempts?: number): RuntimeRetryConfig {
  const maxAttempts = Math.max(1, Math.round(payload?.max_attempts ?? fallbackAttempts ?? 1));
  const initialDelay = payload?.initial_delay != null && payload.initial_delay >= 0 ? payload.initial_delay : 0.5;
  const backoffFactor = payload?.backoff_factor != null && payload.backoff_factor >= 1 ? payload.backoff_factor : 2;
  const maxDelayCandidate = payload?.max_delay != null && payload.max_delay > 0 ? payload.max_delay : initialDelay;
  const maxDelay = Math.max(initialDelay, maxDelayCandidate);
  return {
    maxAttempts,
    initialDelay,
    backoffFactor,
    maxDelay,
  };
}

function mapTracingPayload(payload?: TracingConfigPayload): TracingConfigSummary {
  return {
    enabled: payload?.enabled ?? false,
    sampleRate: clampZeroOne(payload?.sample_rate, 0.1),
    exporter: payload?.exporter ?? null,
  };
}

function mapPolicyRuntimePayload(
  payload: PolicyRuntimePayload | undefined,
  routing: RoutingPolicyConfig,
): PolicyRuntimeSettings {
  const maxIters = Math.max(1, Math.round(payload?.max_iters ?? routing.maxIters));
  const timeouts = mapRuntimeTimeoutsPayload(payload?.timeouts, {
    perIteration: routing.requestTimeoutSeconds,
    total: routing.totalTimeoutSeconds,
  });
  const retry = mapRuntimeRetryPayload(payload?.retry, routing.maxAttempts);
  const tracing = mapTracingPayload(payload?.tracing);
  return {
    maxIters,
    timeouts,
    retry,
    tracing,
  };
}

function mapHitlCheckpointPayload(payload: HitlCheckpointPayload): HitlCheckpoint {
  return {
    name: payload.name,
    description: payload.description ?? null,
    required: payload.required ?? false,
    escalationChannel: payload.escalation_channel ?? null,
  };
}

function mapHitlConfigPayload(payload?: HitlConfigPayload): HitlConfig {
  return {
    enabled: payload?.enabled ?? false,
    checkpoints: (payload?.checkpoints ?? []).map(mapHitlCheckpointPayload),
    pendingApprovals: payload?.pending_approvals ?? 0,
    lastUpdated: payload?.updated_at ?? null,
  };
}

function mapPolicyConfidence(payload?: PolicyConfidencePayload): PolicyConfidenceConfig | null {
  if (!payload) {
    return null;
  }
  const approval = clampZeroOne(payload.approval, 0.8);
  const rejectionDefault = Math.min(approval, 0.5);
  const rejection = clampZeroOne(payload.rejection, rejectionDefault);
  return { approval, rejection };
}

function mapPolicyOverridesConfig(payload?: PolicyOverridesPayload | null): PolicyOverridesConfig | null {
  if (!payload) {
    return null;
  }

  const overrides: PolicyOverridesConfig = {};

  if (payload.policies?.confidence) {
    overrides.policies = { confidence: mapPolicyConfidence(payload.policies.confidence) };
  }

  if (payload.routing) {
    const routing: Record<string, unknown> = {};
    if (payload.routing.max_iters !== undefined) {
      routing.maxIters = Math.max(1, Math.round(payload.routing.max_iters));
    }
    if (payload.routing.max_attempts !== undefined) {
      routing.maxAttempts = Math.max(1, Math.round(payload.routing.max_attempts));
    }
    if (payload.routing.request_timeout_seconds !== undefined) {
      routing.requestTimeoutSeconds = Math.max(1, Math.round(payload.routing.request_timeout_seconds));
    }
    if (payload.routing.total_timeout_seconds !== undefined) {
      routing.totalTimeoutSeconds = payload.routing.total_timeout_seconds ?? null;
    }
    if (payload.routing.default_tier !== undefined) {
      routing.defaultTier = payload.routing.default_tier;
    }
    if (payload.routing.allowed_tiers) {
      routing.allowedTiers = [...payload.routing.allowed_tiers];
    }
    if (payload.routing.fallback_tier !== undefined) {
      routing.fallbackTier = payload.routing.fallback_tier ?? null;
    }
    if (Object.keys(routing).length > 0) {
      overrides.routing = routing as Partial<RoutingPolicyConfig>;
    }
  }

  if (payload.finops) {
    const finops: NonNullable<PolicyOverridesConfig['finops']> = {};
    if (payload.finops.cost_center !== undefined) {
      finops.costCenter = payload.finops.cost_center ?? 'default';
    }
    if (payload.finops.budgets) {
      finops.budgets = payload.finops.budgets.map(mapFinOpsBudgetPayload);
    }
    if (payload.finops.alerts) {
      finops.alerts = payload.finops.alerts.map((alert) => ({
        threshold: clampZeroOne(alert.threshold, 0.5),
        channel: alert.channel,
      }));
    }
    if (payload.finops.cache !== undefined) {
      const cache = payload.finops.cache;
      if (cache !== null && typeof cache === 'object') {
        const ttl = 'ttl_seconds' in cache ? normalizePositive(cache.ttl_seconds ?? null, null) : null;
        finops.cache = { ttlSeconds: ttl };
      } else if (typeof cache === 'number') {
        finops.cache = { ttlSeconds: normalizePositive(cache, null) };
      }
    }
    if (payload.finops.rate_limit !== undefined) {
      const rate = payload.finops.rate_limit;
      if (rate !== null && typeof rate === 'object') {
        const rateSource = rate as { requests_per_minute?: number | null; requestsPerMinute?: number | null };
        const rawRequests =
          rateSource.requests_per_minute ?? rateSource.requestsPerMinute ?? null;
        const requests = normalizePositive(rawRequests ?? null, null);
        finops.rateLimit = { requestsPerMinute: requests };
      } else if (typeof rate === 'number') {
        finops.rateLimit = { requestsPerMinute: normalizePositive(rate, null) };
      }
    }
    if (payload.finops.graceful_degradation !== undefined) {
      const degradation = payload.finops.graceful_degradation;
      if (degradation !== null && typeof degradation === 'object') {
        const rawStrategy =
          'strategy' in degradation && typeof degradation.strategy === 'string'
            ? degradation.strategy
            : null;
        const rawMessage =
          'message' in degradation && typeof degradation.message === 'string'
            ? degradation.message
            : null;
        const strategy = rawStrategy?.trim() ?? '';
        const message = rawMessage?.trim() ?? '';
        finops.gracefulDegradation = { strategy: strategy || null, message: message || null };
      } else if (typeof degradation === 'string') {
        const normalized = degradation.trim();
        finops.gracefulDegradation = { strategy: null, message: normalized || null };
      }
    }
    if (Object.keys(finops).length > 0) {
      overrides.finops = finops;
    }
  }

  if (payload.hitl) {
    const hitl: { enabled?: boolean; checkpoints?: HitlCheckpoint[] } = {};
    if (payload.hitl.enabled !== undefined) {
      hitl.enabled = payload.hitl.enabled ?? false;
    }
    if (payload.hitl.checkpoints) {
      hitl.checkpoints = payload.hitl.checkpoints.map(mapHitlCheckpointPayload);
    }
    if (Object.keys(hitl).length > 0) {
      overrides.hitl = hitl;
    }
  }

  if (payload.runtime) {
    const runtime: PolicyOverridesConfig['runtime'] = {};
    if (payload.runtime.max_iters !== undefined) {
      runtime.maxIters = Math.max(1, Math.round(payload.runtime.max_iters));
    }
    if (payload.runtime.timeouts) {
      runtime.timeouts = mapRuntimeTimeoutsPayload(payload.runtime.timeouts);
    }
    if (payload.runtime.retry) {
      runtime.retry = mapRuntimeRetryPayload(payload.runtime.retry);
    }
    if (Object.keys(runtime).length > 0) {
      overrides.runtime = runtime;
    }
  }

  if (payload.tracing) {
    overrides.tracing = mapTracingPayload(payload.tracing);
  }

  return Object.keys(overrides).length === 0 ? null : overrides;
}

function mapPolicyManifestPayload(payload: PolicyManifestPayload): PolicyManifestSnapshot {
  const routing = mapRoutingPolicyPayload(payload.routing);
  const finops = mapFinOpsConfigPayload(payload.finops);
  const hitl = mapHitlConfigPayload(payload.hitl);
  const runtime = mapPolicyRuntimePayload(payload.runtime, routing);
  return {
    policies: { confidence: mapPolicyConfidence(payload.policies?.confidence) },
    routing,
    finops,
    hitl,
    runtime,
    overrides: mapPolicyOverridesConfig(payload.overrides),
    updatedAt: payload.updated_at ?? null,
  };
}

function serializeHitlCheckpoints(checkpoints?: HitlCheckpoint[] | null): HitlCheckpointPayload[] | undefined {
  if (!checkpoints || checkpoints.length === 0) {
    return undefined;
  }
  return checkpoints.map((checkpoint) => ({
    name: checkpoint.name,
    description: checkpoint.description ?? null,
    required: checkpoint.required,
    escalation_channel: checkpoint.escalationChannel ?? null,
  }));
}

function serializePolicyOverrides(overrides?: PolicyOverridesConfig | null): PolicyOverridesPayload | undefined {
  if (!overrides) {
    return undefined;
  }

  const payload: PolicyOverridesPayload = {};

  if (overrides.policies?.confidence) {
    payload.policies = {
      confidence: {
        approval: overrides.policies.confidence.approval,
        rejection: overrides.policies.confidence.rejection,
      },
    };
  }

  if (overrides.routing) {
    const routing: RoutingPolicyPayload = {};
    if (overrides.routing.maxIters !== undefined) {
      routing.max_iters = overrides.routing.maxIters ?? undefined;
    }
    if (overrides.routing.maxAttempts !== undefined) {
      routing.max_attempts = overrides.routing.maxAttempts ?? undefined;
    }
    if (overrides.routing.requestTimeoutSeconds !== undefined) {
      routing.request_timeout_seconds = overrides.routing.requestTimeoutSeconds ?? undefined;
    }
    if (overrides.routing.totalTimeoutSeconds !== undefined) {
      routing.total_timeout_seconds = overrides.routing.totalTimeoutSeconds ?? null;
    }
    if (overrides.routing.defaultTier !== undefined) {
      routing.default_tier = overrides.routing.defaultTier ?? undefined;
    }
    if (overrides.routing.allowedTiers !== undefined) {
      routing.allowed_tiers = overrides.routing.allowedTiers ?? undefined;
    }
    if (overrides.routing.fallbackTier !== undefined) {
      routing.fallback_tier = overrides.routing.fallbackTier ?? null;
    }
    if (overrides.routing.intents !== undefined) {
      routing.intents = overrides.routing.intents?.map((intent) => ({
        intent: intent.intent,
        description: intent.description ?? undefined,
        tags: intent.tags,
        default_tier: intent.defaultTier,
        fallback_provider_id: intent.fallbackProviderId ?? undefined,
      }));
    }
    if (overrides.routing.rules !== undefined) {
      routing.rules = overrides.routing.rules?.map((rule) => ({
        id: rule.id,
        description: rule.description ?? undefined,
        intent: rule.intent ?? undefined,
        matcher: rule.matcher,
        target_tier: rule.targetTier ?? undefined,
        provider_id: rule.providerId ?? undefined,
        weight: rule.weight ?? undefined,
      }));
    }
    if (Object.keys(routing).length > 0) {
      payload.routing = routing;
    }
  }

  if (overrides.runtime) {
    const runtime: PolicyRuntimePayload = {};
    if (overrides.runtime.maxIters !== undefined) {
      runtime.max_iters = overrides.runtime.maxIters ?? undefined;
    }
    if (overrides.runtime.timeouts) {
      runtime.timeouts = {
        per_iteration: overrides.runtime.timeouts.perIteration ?? undefined,
        total: overrides.runtime.timeouts.total ?? undefined,
      };
    }
    if (overrides.runtime.retry) {
      runtime.retry = {
        max_attempts: overrides.runtime.retry.maxAttempts ?? undefined,
        initial_delay: overrides.runtime.retry.initialDelay ?? undefined,
        backoff_factor: overrides.runtime.retry.backoffFactor ?? undefined,
        max_delay: overrides.runtime.retry.maxDelay ?? undefined,
      };
    }
    if (Object.keys(runtime).length > 0) {
      payload.runtime = runtime;
    }
  }

  if (overrides.finops) {
    const finops: FinOpsConfigPayload = {};
    if (overrides.finops.costCenter !== undefined) {
      finops.cost_center = overrides.finops.costCenter ?? undefined;
    }
    if (overrides.finops.budgets) {
      finops.budgets = overrides.finops.budgets.map((budget) => ({
        tier: budget.tier,
        amount: budget.amount,
        currency: budget.currency,
        period: budget.period,
      }));
    }
    if (overrides.finops.alerts) {
      finops.alerts = overrides.finops.alerts.map((alert) => ({
        threshold: alert.threshold,
        channel: alert.channel,
      }));
    }
    if (overrides.finops.cache !== undefined) {
      const ttlSeconds = overrides.finops.cache?.ttlSeconds ?? null;
      finops.cache = { ttl_seconds: ttlSeconds };
    }
    if (overrides.finops.rateLimit !== undefined) {
      const requestsPerMinute = overrides.finops.rateLimit?.requestsPerMinute ?? null;
      finops.rate_limit = { requests_per_minute: requestsPerMinute };
    }
    if (overrides.finops.gracefulDegradation !== undefined) {
      finops.graceful_degradation = {
        strategy: overrides.finops.gracefulDegradation?.strategy ?? null,
        message: overrides.finops.gracefulDegradation?.message ?? null,
      };
    }
    if (Object.keys(finops).length > 0) {
      payload.finops = finops;
    }
  }

  if (overrides.hitl) {
    const hitl: HitlConfigPayload = {};
    if (overrides.hitl.enabled !== undefined) {
      hitl.enabled = overrides.hitl.enabled;
    }
    if (overrides.hitl.checkpoints) {
      hitl.checkpoints = serializeHitlCheckpoints(overrides.hitl.checkpoints) ?? [];
    }
    if (Object.keys(hitl).length > 0) {
      payload.hitl = hitl;
    }
  }

  if (overrides.tracing) {
    payload.tracing = {
      enabled: overrides.tracing.enabled,
      sample_rate: overrides.tracing.sampleRate,
      exporter: overrides.tracing.exporter ?? null,
    };
  }

  return Object.keys(payload).length === 0 ? undefined : payload;
}

function serializePolicyManifestUpdate(payload: PolicyManifestUpdateInput): PolicyManifestPayload {
  const result: PolicyManifestPayload = {};

  if (payload.policies?.confidence) {
    result.policies = {
      confidence: {
        approval: payload.policies.confidence.approval,
        rejection: payload.policies.confidence.rejection,
      },
    };
  }

  if (payload.routing) {
    const routing: RoutingPolicyPayload = {};
    if (payload.routing.maxIters !== undefined) {
      routing.max_iters = payload.routing.maxIters ?? undefined;
    }
    if (payload.routing.maxAttempts !== undefined) {
      routing.max_attempts = payload.routing.maxAttempts ?? undefined;
    }
    if (payload.routing.requestTimeoutSeconds !== undefined) {
      routing.request_timeout_seconds = payload.routing.requestTimeoutSeconds ?? undefined;
    }
    if (payload.routing.totalTimeoutSeconds !== undefined) {
      routing.total_timeout_seconds = payload.routing.totalTimeoutSeconds ?? null;
    }
    if (payload.routing.defaultTier !== undefined) {
      routing.default_tier = payload.routing.defaultTier ?? undefined;
    }
    if (payload.routing.allowedTiers !== undefined) {
      routing.allowed_tiers = payload.routing.allowedTiers ?? undefined;
    }
    if (payload.routing.fallbackTier !== undefined) {
      routing.fallback_tier = payload.routing.fallbackTier ?? null;
    }
    if (payload.routing.intents !== undefined) {
      routing.intents = payload.routing.intents?.map((intent) => ({
        intent: intent.intent,
        description: intent.description ?? undefined,
        tags: intent.tags,
        default_tier: intent.defaultTier,
        fallback_provider_id: intent.fallbackProviderId ?? undefined,
      }));
    }
    if (payload.routing.rules !== undefined) {
      routing.rules = payload.routing.rules?.map((rule) => ({
        id: rule.id,
        description: rule.description ?? undefined,
        intent: rule.intent ?? undefined,
        matcher: rule.matcher,
        target_tier: rule.targetTier ?? undefined,
        provider_id: rule.providerId ?? undefined,
        weight: rule.weight ?? undefined,
      }));
    }
    if (Object.keys(routing).length > 0) {
      result.routing = routing;
    }
  }

  if (payload.runtime) {
    const runtime: PolicyRuntimePayload = {};
    if (payload.runtime.maxIters !== undefined) {
      runtime.max_iters = payload.runtime.maxIters ?? undefined;
    }
    if (payload.runtime.timeouts) {
      runtime.timeouts = {
        per_iteration: payload.runtime.timeouts.perIteration ?? undefined,
        total: payload.runtime.timeouts.total ?? undefined,
      };
    }
    if (payload.runtime.retry) {
      runtime.retry = {
        max_attempts: payload.runtime.retry.maxAttempts ?? undefined,
        initial_delay: payload.runtime.retry.initialDelay ?? undefined,
        backoff_factor: payload.runtime.retry.backoffFactor ?? undefined,
        max_delay: payload.runtime.retry.maxDelay ?? undefined,
      };
    }
    if (payload.runtime.tracing) {
      runtime.tracing = {
        enabled: payload.runtime.tracing.enabled,
        sample_rate: payload.runtime.tracing.sampleRate,
        exporter: payload.runtime.tracing.exporter ?? null,
      };
    }
    if (Object.keys(runtime).length > 0) {
      result.runtime = runtime;
    }
  }

  if (payload.finops) {
    const finops: FinOpsConfigPayload = {};
    if (payload.finops.costCenter !== undefined) {
      finops.cost_center = payload.finops.costCenter ?? undefined;
    }
    if (payload.finops.budgets) {
      finops.budgets = payload.finops.budgets.map((budget) => ({
        tier: budget.tier,
        amount: budget.amount,
        currency: budget.currency,
        period: budget.period,
      }));
    }
    if (payload.finops.alerts) {
      finops.alerts = payload.finops.alerts.map((alert) => ({
        threshold: alert.threshold,
        channel: alert.channel,
      }));
    }
    if (payload.finops.cache !== undefined) {
      const ttlSeconds = payload.finops.cache?.ttlSeconds ?? null;
      finops.cache = { ttl_seconds: ttlSeconds };
    }
    if (payload.finops.rateLimit !== undefined) {
      const requestsPerMinute = payload.finops.rateLimit?.requestsPerMinute ?? null;
      finops.rate_limit = { requests_per_minute: requestsPerMinute };
    }
    if (payload.finops.gracefulDegradation !== undefined) {
      finops.graceful_degradation = {
        strategy: payload.finops.gracefulDegradation?.strategy ?? null,
        message: payload.finops.gracefulDegradation?.message ?? null,
      };
    }
    if (Object.keys(finops).length > 0) {
      result.finops = finops;
    }
  }

  if (payload.hitl) {
    const hitl: HitlConfigPayload = {};
    if (payload.hitl.enabled !== undefined) {
      hitl.enabled = payload.hitl.enabled;
    }
    if (payload.hitl.checkpoints) {
      hitl.checkpoints = serializeHitlCheckpoints(payload.hitl.checkpoints) ?? [];
    }
    if (Object.keys(hitl).length > 0) {
      result.hitl = hitl;
    }
  }

  return result;
}

function mapHitlApprovalRequestPayload(payload: HitlApprovalPayload): HitlApprovalRequest {
  return {
    id: payload.id,
    agent: payload.agent,
    route: payload.route ?? null,
    checkpoint: payload.checkpoint,
    checkpointDetails: payload.checkpoint_details ? mapHitlCheckpointPayload(payload.checkpoint_details) : null,
    submittedAt: payload.submitted_at,
    status: payload.status,
    confidence: payload.confidence ?? null,
    notes: payload.notes ?? null,
    metadata: payload.metadata ?? null,
  };
}

function mapHitlQueuePayload(payload: HitlQueuePayload): HitlQueueSummary {
  return {
    pending: (payload.pending ?? []).map(mapHitlApprovalRequestPayload),
    resolved: (payload.resolved ?? []).map(mapHitlApprovalRequestPayload),
    updatedAt: payload.updated_at ?? null,
  };
}

function mapPolicyCompliancePayload(payload: PolicyCompliancePayload): PolicyComplianceSummary {
  return {
    status: payload.status,
    updatedAt: payload.updated_at ?? null,
    items: (payload.items ?? []).map((item) => ({
      id: item.id,
      label: item.label,
      description: item.description ?? null,
      required: item.required,
      configured: item.configured,
      active: item.active,
    })),
  };
}

function mapCostPolicy(payload: CostPolicyPayload): CostPolicy {
  return {
    id: payload.id,
    name: payload.name,
    description: payload.description ?? null,
    monthlySpendLimit: payload.monthly_spend_limit,
    currency: payload.currency,
    tags: payload.tags ?? [],
    createdAt: payload.created_at,
    updatedAt: payload.updated_at,
  };
}

export async function fetchPolicies(signal?: AbortSignal): Promise<CostPolicy[]> {
  const data = await request<CostPoliciesResponsePayload>('/policies', { signal });
  return data.policies.map(mapCostPolicy);
}

export async function createPolicy(
  payload: CostPolicyCreateInput,
  signal?: AbortSignal,
): Promise<CostPolicy> {
  const data = await request<CostPolicyPayload>('/policies', {
    method: 'POST',
    body: JSON.stringify({
      id: payload.id,
      name: payload.name,
      description: payload.description ?? null,
      monthly_spend_limit: payload.monthlySpendLimit,
      currency: payload.currency,
      tags: payload.tags ?? [],
    }),
    signal,
  });
  return mapCostPolicy(data);
}

export async function updatePolicy(
  policyId: string,
  payload: CostPolicyUpdateInput,
  signal?: AbortSignal,
): Promise<CostPolicy> {
  const data = await request<CostPolicyPayload>(`/policies/${policyId}`, {
    method: 'PUT',
    body: JSON.stringify({
      name: payload.name,
      description: payload.description ?? null,
      monthly_spend_limit: payload.monthlySpendLimit,
      currency: payload.currency,
      tags: payload.tags ?? [],
    }),
    signal,
  });
  return mapCostPolicy(data);
}

export async function deletePolicy(policyId: string, signal?: AbortSignal): Promise<void> {
  await request<void>(`/policies/${policyId}`, { method: 'DELETE', signal });
}

function mapPolicyOverride(payload: PolicyOverridePayload): PolicyOverride {
  return {
    id: payload.id,
    route: payload.route,
    project: payload.project,
    templateId: payload.template_id,
    maxLatencyMs: payload.max_latency_ms,
    maxCostUsd: payload.max_cost_usd,
    requireManualApproval: payload.require_manual_approval,
    notes: payload.notes ?? null,
    overrides: mapPolicyOverridesConfig(payload.overrides ?? null),
    createdAt: payload.created_at,
    updatedAt: payload.updated_at,
  };
}

export async function fetchPolicyOverrides(signal?: AbortSignal): Promise<PolicyOverride[]> {
  const data = await request<PolicyOverridesResponsePayload>('/policies/overrides', { signal });
  return data.overrides.map(mapPolicyOverride);
}

export async function createPolicyOverride(
  payload: PolicyOverrideCreateInput,
  signal?: AbortSignal,
): Promise<PolicyOverride> {
  const overridesPayload = serializePolicyOverrides(payload.overrides ?? null);
  const data = await request<PolicyOverridePayload>('/policies/overrides', {
    method: 'POST',
    body: JSON.stringify({
      id: payload.id,
      route: payload.route,
      project: payload.project,
      template_id: payload.templateId,
      max_latency_ms: payload.maxLatencyMs ?? null,
      max_cost_usd: payload.maxCostUsd ?? null,
      require_manual_approval: payload.requireManualApproval ?? false,
      notes: payload.notes ?? null,
      overrides: overridesPayload,
    }),
    signal,
  });
  return mapPolicyOverride(data);
}

export async function updatePolicyOverride(
  overrideId: string,
  payload: PolicyOverrideUpdateInput,
  signal?: AbortSignal,
): Promise<PolicyOverride> {
  const overridesPayload = serializePolicyOverrides(payload.overrides ?? null);
  const data = await request<PolicyOverridePayload>(`/policies/overrides/${overrideId}`, {
    method: 'PUT',
    body: JSON.stringify({
      route: payload.route,
      project: payload.project,
      template_id: payload.templateId,
      max_latency_ms: payload.maxLatencyMs ?? null,
      max_cost_usd: payload.maxCostUsd ?? null,
      require_manual_approval: payload.requireManualApproval ?? false,
      notes: payload.notes ?? null,
      overrides: overridesPayload,
    }),
    signal,
  });
  return mapPolicyOverride(data);
}

export async function deletePolicyOverride(
  overrideId: string,
  signal?: AbortSignal,
): Promise<void> {
  await request<void>(`/policies/overrides/${overrideId}`, { method: 'DELETE', signal });
}

export async function fetchPolicyManifest(signal?: AbortSignal): Promise<PolicyManifestSnapshot> {
  const data = await request<PolicyManifestPayload>('/policies/manifest', {
    method: 'GET',
    signal,
  });
  return mapPolicyManifestPayload(data);
}

export async function updatePolicyManifest(
  payload: PolicyManifestUpdateInput,
  signal?: AbortSignal,
): Promise<PolicyManifestSnapshot> {
  const body = serializePolicyManifestUpdate(payload);
  const data = await request<PolicyManifestPayload>('/policies/manifest', {
    method: 'PUT',
    body: JSON.stringify(body),
    signal,
  });
  return mapPolicyManifestPayload(data);
}

export async function fetchHitlQueue(signal?: AbortSignal): Promise<HitlQueueSummary> {
  const data = await request<HitlQueuePayload>('/policies/hitl/queue', {
    method: 'GET',
    signal,
  });
  return mapHitlQueuePayload(data);
}

export async function resolveHitlRequest(
  requestId: string,
  payload: HitlResolutionInput,
  signal?: AbortSignal,
): Promise<HitlApprovalRequest> {
  const data = await request<HitlApprovalPayload>(`/policies/hitl/queue/${requestId}`, {
    method: 'POST',
    body: JSON.stringify({
      resolution: payload.resolution,
      note: payload.note ?? null,
    }),
    signal,
  });
  return mapHitlApprovalRequestPayload(data);
}

export async function fetchPolicyCompliance(signal?: AbortSignal): Promise<PolicyComplianceSummary> {
  const data = await request<PolicyCompliancePayload>('/policies/compliance', {
    method: 'GET',
    signal,
  });
  return mapPolicyCompliancePayload(data);
}

function mapPolicyDeployment(payload: PolicyDeploymentPayload): PolicyDeployment {
  return {
    id: payload.id,
    templateId: payload.template_id,
    deployedAt: payload.deployed_at,
    author: payload.author,
    window: payload.window ?? null,
    note: payload.note ?? null,
    sloP95Ms: payload.slo_p95_ms,
    budgetUsagePct: payload.budget_usage_pct,
    incidentsCount: payload.incidents_count,
    guardrailScore: payload.guardrail_score,
    createdAt: payload.created_at,
    updatedAt: payload.updated_at,
  };
}

export async function fetchPolicyDeployments(
  signal?: AbortSignal,
): Promise<PolicyDeploymentsSummary> {
  const data = await request<PolicyDeploymentsResponsePayload>('/policies/deployments', { signal });
  return {
    deployments: data.deployments.map(mapPolicyDeployment),
    activeId: data.active_id ?? null,
  };
}

export async function createPolicyDeployment(
  payload: PolicyDeploymentCreateInput,
  signal?: AbortSignal,
): Promise<PolicyDeployment> {
  const data = await request<PolicyDeploymentPayload>('/policies/deployments', {
    method: 'POST',
    body: JSON.stringify({
      template_id: payload.templateId,
      author: payload.author ?? 'Console MCP',
      window: payload.window ?? null,
      note: payload.note ?? null,
    }),
    signal,
  });
  return mapPolicyDeployment(data);
}

export async function deletePolicyDeployment(
  deploymentId: string,
  signal?: AbortSignal,
): Promise<void> {
  await request<void>(`/policies/deployments/${deploymentId}`, { method: 'DELETE', signal });
}

export async function fetchNotifications(signal?: AbortSignal): Promise<NotificationSummary[]> {
  const data = await request<NotificationsResponsePayload>('/notifications', { signal });
  return data.notifications;
}

export async function createSession(
  providerId: string,
  payload: SessionCreatePayload = {},
  signal?: AbortSignal,
): Promise<SessionResponse> {
  const overridesPayload = serializePolicyOverrides(payload.overrides ?? null);
  return request<SessionResponse>(`/providers/${providerId}/sessions`, {
    method: 'POST',
    body: JSON.stringify({
      ...payload,
      overrides: overridesPayload,
    }),
    signal,
  });
}

function normalizeIso(value?: Date | string): string | undefined {
  if (!value) {
    return undefined;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return value;
}

function buildQuery(params: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      search.set(key, value);
    }
  }
  const query = search.toString();
  return query ? `?${query}` : '';
}

export async function fetchTelemetryMetrics(
  filters?: TelemetryMetricsFilters,
  signal?: AbortSignal,
): Promise<TelemetryMetrics> {
  const query = buildQuery({
    start: normalizeIso(filters?.start),
    end: normalizeIso(filters?.end),
    provider_id: filters?.providerId,
    route: filters?.route,
  });
  return request<TelemetryMetricsResponsePayload>(`/telemetry/metrics${query}`, { signal });
}

export async function fetchTelemetryHeatmap(
  filters?: TelemetryHeatmapFilters,
  signal?: AbortSignal,
): Promise<TelemetryHeatmapBucket[]> {
  const query = buildQuery({
    start: normalizeIso(filters?.start),
    end: normalizeIso(filters?.end),
    provider_id: filters?.providerId,
    route: filters?.route,
  });
  const data = await request<TelemetryHeatmapResponsePayload>(`/telemetry/heatmap${query}`, { signal });
  return data.buckets;
}

export async function fetchTelemetryTimeseries(
  filters?: TelemetryTimeseriesFilters,
  signal?: AbortSignal,
): Promise<TelemetryTimeseriesResponsePayload> {
  const query = buildQuery({
    start: normalizeIso(filters?.start),
    end: normalizeIso(filters?.end),
    provider_id: filters?.providerId,
    lane: filters?.lane,
  });
  return request<TelemetryTimeseriesResponsePayload>(`/telemetry/timeseries${query}`, { signal });
}

export async function fetchTelemetryPareto(
  filters?: TelemetryParetoFilters,
  signal?: AbortSignal,
): Promise<TelemetryParetoResponsePayload> {
  const query = buildQuery({
    start: normalizeIso(filters?.start),
    end: normalizeIso(filters?.end),
    provider_id: filters?.providerId,
    lane: filters?.lane,
  });
  return request<TelemetryParetoResponsePayload>(`/telemetry/pareto${query}`, { signal });
}

export async function fetchTelemetryRuns(
  filters?: TelemetryRunsFilters,
  signal?: AbortSignal,
): Promise<TelemetryRunsResponsePayload> {
  const query = buildQuery({
    start: normalizeIso(filters?.start),
    end: normalizeIso(filters?.end),
    provider_id: filters?.providerId,
    lane: filters?.lane,
    route: filters?.route,
    limit: filters?.limit ? String(filters.limit) : undefined,
    cursor: filters?.cursor,
  });
  return request<TelemetryRunsResponsePayload>(`/telemetry/runs${query}`, { signal });
}

export async function fetchTelemetryExperiments(
  filters?: TelemetryExperimentsFilters,
  signal?: AbortSignal,
): Promise<TelemetryExperimentsResponsePayload> {
  const query = buildQuery({
    start: normalizeIso(filters?.start),
    end: normalizeIso(filters?.end),
    provider_id: filters?.providerId,
    route: filters?.route,
    lane: filters?.lane,
  });
  return request<TelemetryExperimentsResponsePayload>(`/telemetry/experiments${query}`, {
    signal,
  });
}

export async function fetchTelemetryLaneCosts(
  filters?: TelemetryLaneCostFilters,
  signal?: AbortSignal,
): Promise<TelemetryLaneCostResponsePayload> {
  const query = buildQuery({
    start: normalizeIso(filters?.start),
    end: normalizeIso(filters?.end),
    provider_id: filters?.providerId,
    route: filters?.route,
    lane: filters?.lane,
  });
  return request<TelemetryLaneCostResponsePayload>(`/telemetry/lane-costs${query}`, { signal });
}

export async function fetchMarketplacePerformance(
  filters?: MarketplacePerformanceFilters,
  signal?: AbortSignal,
): Promise<MarketplacePerformanceResponsePayload> {
  const query = buildQuery({
    start: normalizeIso(filters?.start),
    end: normalizeIso(filters?.end),
    provider_id: filters?.providerId,
    route: filters?.route,
  });
  return request<MarketplacePerformanceResponsePayload>(`/telemetry/marketplace/performance${query}`, {
    signal,
  });
}

export async function fetchTelemetryExportDocument(
  format: TelemetryExportFormat,
  filters?: TelemetryMetricsFilters,
  signal?: AbortSignal,
): Promise<TelemetryExportResult> {
  const query = buildQuery({
    format,
    start: normalizeIso(filters?.start),
    end: normalizeIso(filters?.end),
    provider_id: filters?.providerId,
    route: filters?.route,
  });
  const requestHeaders: Record<string, string> = {
    Accept: format === 'html' ? 'text/html' : 'text/csv',
  };

  const requestInit: RequestInit = {
    method: 'GET',
    headers: requestHeaders,
    signal,
  };

  const apiPath = `/telemetry/export${query}`;

  const buildFixtureExport = (): TelemetryExportResult => {
    const mediaType = format === 'html' ? 'text/html' : 'text/csv';
    let content = '';
    if (format === 'html') {
      content = `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <title>Export · Fixtures</title>
  </head>
  <body>
    <table>
      <thead>
        <tr>
          <th scope="col">Provider</th>
          <th scope="col">Cost (USD)</th>
          <th scope="col">Tokens In</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>fixture-provider</td>
          <td>12.34</td>
          <td>5678</td>
        </tr>
      </tbody>
    </table>
  </body>
</html>`;
    } else {
      content = [
        'timestamp,provider_id,tool,route,status,tokens_in,tokens_out,duration_ms,cost_estimated_usd',
        '2025-03-07T10:00:00Z,fixture-provider,fixture-tool,/fixtures,success,1200,3400,860,12.34',
      ].join('\n');
    }
    return { blob: new Blob([content], { type: mediaType }), mediaType };
  };

  try {
    let response: Response | null = null;

    if (isFixtureModeEnabled() && typeof window !== 'undefined') {
      try {
        const { bypass } = await import('msw');
        const baseUrl = getApiBaseUrl();
        const normalizedBase = /^https?:\/\//i.test(baseUrl)
          ? baseUrl
          : `${window.location.origin}${baseUrl.startsWith('/') ? '' : '/'}${baseUrl.replace(/^\//, '')}`;
        const resolvedUrl = new URL(normalizedBase);
        const basePath = resolvedUrl.pathname.replace(/\/$/, '');
        const [pathOnly, searchPart] = apiPath.split('?');
        resolvedUrl.pathname = `${basePath}/${pathOnly.replace(/^\/+/, '')}`;
        resolvedUrl.search = searchPart ? `?${searchPart}` : '';
        const absoluteUrl = resolvedUrl.toString();
        const bypassedRequest = bypass(absoluteUrl, requestInit);
        response = await fetch(bypassedRequest);
      } catch (bypassError) {
        console.warn('Failed to issue bypassed FinOps export request.', bypassError);
      }
    }

    if (!response) {
      response = await fetchFromApi(apiPath, requestInit);
    }

    if (!response.ok) {
      const body = typeof response.text === 'function' ? await response.text() : '';
      const message = body || `Request failed with status ${response.status}`;
      throw new ApiError(message, response.status, body);
    }

    const headerAccessor =
      typeof response.headers === 'object' && response.headers && 'get' in response.headers
        ? (response.headers as Headers)
        : null;
    const mediaType =
      headerAccessor?.get('Content-Type') || (format === 'html' ? 'text/html' : 'text/csv');

    let blob: Blob;
    if (typeof (response as Response).blob === 'function') {
      const rawBlob = await (response as Response).blob();
      blob = mediaType && rawBlob.type !== mediaType ? rawBlob.slice(0, rawBlob.size, mediaType) : rawBlob;
    } else if (typeof (response as Response).text === 'function') {
      const bodyText = await (response as Response).text();
      blob = new Blob([bodyText], { type: mediaType });
    } else if (typeof (response as Response).json === 'function') {
      const bodyJson = await (response as Response).json();
      const serialized = typeof bodyJson === 'string' ? bodyJson : JSON.stringify(bodyJson);
      blob = new Blob([serialized], { type: mediaType });
    } else {
      blob = new Blob([], { type: mediaType });
    }

    return { blob, mediaType };
  } catch (error) {
    if (isFixtureModeEnabled()) {
      console.warn('Using fixture FinOps export as fallback due to request failure.', error);
      return buildFixtureExport();
    }
    if (error instanceof ApiError) {
      return buildFixtureExport();
    }
    throw error;
  }
}

export interface FinOpsReportsFilters {
  start?: Date | string;
  end?: Date | string;
  providerId?: string;
  lane?: string;
  windowDays?: number;
  limit?: number;
}

export async function fetchFinOpsSprintReports(
  filters?: FinOpsReportsFilters,
  signal?: AbortSignal,
): Promise<FinOpsSprintReportPayload[]> {
  const query = buildQuery({
    start: normalizeIso(filters?.start),
    end: normalizeIso(filters?.end),
    provider_id: filters?.providerId,
    lane: filters?.lane,
    window_days: filters?.windowDays ? String(filters.windowDays) : undefined,
    limit: filters?.limit ? String(filters.limit) : undefined,
  });
  const data = await request<FinOpsSprintReportsResponsePayload>(
    `/telemetry/finops/sprints${query}`,
    { signal },
  );
  return data.items;
}

export async function fetchFinOpsPullRequestReports(
  filters?: FinOpsReportsFilters,
  signal?: AbortSignal,
): Promise<FinOpsPullRequestReportPayload[]> {
  const query = buildQuery({
    start: normalizeIso(filters?.start),
    end: normalizeIso(filters?.end),
    provider_id: filters?.providerId,
    lane: filters?.lane,
    window_days: filters?.windowDays ? String(filters.windowDays) : undefined,
    limit: filters?.limit ? String(filters.limit) : undefined,
  });
  const data = await request<FinOpsPullRequestReportsResponsePayload>(
    `/telemetry/finops/pull-requests${query}`,
    { signal },
  );
  return data.items;
}

export type AdminChatRole = 'user' | 'assistant' | 'system';

export interface AdminChatMessage {
  id: string;
  role: AdminChatRole;
  content: string;
  createdAt: string;
}

export type AdminPlanStepStatus = 'pending' | 'ready' | 'blocked';

export interface AdminPlanStep {
  id: string;
  title: string;
  description: string;
  status: AdminPlanStepStatus;
  impact?: string | null;
}

export type AdminPlanStatus = 'draft' | 'ready' | 'applied';

export interface AdminPlanReviewer {
  id: string;
  name: string;
  status?: string | null;
}

export interface AdminPlanPullRequestSummary {
  id: string;
  number: string;
  title: string;
  url: string;
  state: string;
  reviewStatus?: string | null;
  reviewers?: PlanExecutionReviewer[];
  branch?: string | null;
  ciResults?: PlanExecutionCiResult[];
}

export interface AdminPlanSummary {
  id: string;
  threadId: string;
  status: AdminPlanStatus;
  generatedAt: string;
  author: string;
  scope: string;
  steps: AdminPlanStep[];
  branch?: string | null;
  baseBranch?: string | null;
  reviewers?: AdminPlanReviewer[];
  pullRequest?: AdminPlanPullRequestSummary | null;
}

export interface AdminPlanDiff {
  id: string;
  file: string;
  summary: string;
  diff: string;
}

export type AdminRiskLevel = 'low' | 'medium' | 'high';

export interface AdminRiskItem {
  id: string;
  level: AdminRiskLevel;
  title: string;
  description: string;
  mitigation?: string | null;
}

export interface AdminHitlRequest {
  token: string;
  approver: string | null;
  message: string;
}

export interface ConfigApplyPullRequest {
  provider: string;
  id: string;
  number: string;
  url: string;
  title: string;
  state: string;
  headSha: string;
  branch?: string | null;
  ciStatus?: string | null;
  reviewStatus?: string | null;
  merged: boolean;
  reviewers?: PlanExecutionReviewer[];
  ciResults?: PlanExecutionCiResult[];
}

export type ConfigChatIntent =
  | { intent: 'message'; prompt: string; threadId?: string | null; context?: string | null }
  | { intent: 'history'; threadId: string; limit?: number };

export interface ConfigChatResponse {
  threadId: string;
  messages: AdminChatMessage[];
}

export async function postConfigChat(
  intent: ConfigChatIntent,
  signal?: AbortSignal,
): Promise<ConfigChatResponse> {
  return request<ConfigChatResponse>('/config/chat', {
    method: 'POST',
    body: JSON.stringify(intent),
    signal,
  });
}

export type ConfigPlanIntent =
  | { intent: 'generate'; threadId: string; scope: string; refresh?: boolean }
  | { intent: 'summarize'; threadId: string };

export interface ConfigPlanResponse {
  plan: AdminPlanSummary;
  diffs: AdminPlanDiff[];
  risks: AdminRiskItem[];
}

export async function postConfigPlan(
  intent: ConfigPlanIntent,
  signal?: AbortSignal,
): Promise<ConfigPlanResponse> {
  return request<ConfigPlanResponse>('/config/plan', {
    method: 'POST',
    body: JSON.stringify(intent),
    signal,
  });
}

export type ConfigPlanStatus = 'pending' | 'in_progress' | 'completed' | 'failed';

export type ConfigPlanExecutionMode = 'dry_run' | 'branch_pr' | 'direct';

export interface ConfigPlanAction {
  type: string;
  path: string;
  contents: string;
  encoding: string;
  overwrite: boolean;
}

export interface ConfigPlanStep {
  id: string;
  title: string;
  description: string;
  dependsOn: string[];
  actions: ConfigPlanAction[];
}

export interface ConfigPlanDiffSummary {
  path: string;
  summary: string;
  changeType: string;
  diff?: string | null;
}

export interface ConfigPlanRiskItem {
  title: string;
  impact: string;
  mitigation: string;
}

export interface ConfigPlanContextItem {
  path: string;
  snippet: string;
  score: number;
  title?: string | null;
  chunk: number;
}

export interface ConfigPlan {
  intent: string;
  summary: string;
  steps: ConfigPlanStep[];
  diffs: ConfigPlanDiffSummary[];
  risks: ConfigPlanRiskItem[];
  status: ConfigPlanStatus;
  context: ConfigPlanContextItem[];
  approvalRules: string[];
}

export interface ConfigReloadRequest {
  artifactType: string;
  targetPath: string;
  parameters?: Record<string, unknown>;
}

export interface ConfigReloadResponse {
  message: string;
  plan: ConfigPlan;
  planPayload: ConfigPlanPayload;
  patch: string;
  planId?: string | null;
}

export interface ConfigPlanPreviewPullRequest {
  provider: string | null;
  title: string;
  body?: string | null;
}

export interface ConfigPlanPreview {
  branch: string;
  baseBranch: string;
  commitMessage: string;
  pullRequest?: ConfigPlanPreviewPullRequest | null;
}

export type AgentConfigLayer = 'policies' | 'routing' | 'finops' | 'observability';

export interface AgentConfigPlanRequest {
  changes: Record<string, unknown>;
  note?: string | null;
}

export interface AgentConfigPlanResponse {
  planId: string;
  plan: AdminPlanSummary | null;
  planPayload: ConfigPlanPayload;
  patch: string;
  message: string | null;
  diffs: AdminPlanDiff[];
}

export interface AgentConfigHistoryItem {
  id: string;
  layer: AgentConfigLayer;
  status: string;
  statusLabel: string;
  requestedBy: string;
  createdAt: string;
  summary: string | null;
  planId: string;
  planPayload: ConfigPlanPayload | null;
  patch: string | null;
  pullRequest?: ConfigApplyPullRequest | null;
}

export interface ApplyAgentLayerPlanRequest extends ApplyPolicyPlanRequest {
  layer: AgentConfigLayer;
}

export interface PlanExecutionDiff {
  stat: string;
  patch: string;
}

export interface PlanExecutionReviewer {
  id: string;
  name: string;
  status?: string | null;
}

export interface PlanExecutionCiResult {
  name: string;
  status: string;
  detailsUrl?: string | null;
}

export interface PlanExecutionPullRequest {
  provider: string;
  id: string;
  number: string;
  url: string;
  title: string;
  state: string;
  headSha: string;
  branch?: string | null;
  ciStatus?: string | null;
  reviewStatus?: string | null;
  merged: boolean;
  lastSyncedAt?: string | null;
  reviewers?: PlanExecutionReviewer[];
  ciResults?: PlanExecutionCiResult[];
}

export interface PolicyPlanRequest {
  policyId: string;
  changes: PolicyManifestUpdateInput;
}

export interface PolicyPlanResponse {
  plan: ConfigPlan;
  planPayload: ConfigPlanPayload;
  preview: ConfigPlanPreview | null;
  previewPayload: ConfigPlanPreviewPayload | null;
}

export interface AgentPlanRequest {
  agent: {
    slug: string;
    repository: string;
    manifest: Record<string, unknown>;
  };
}

export interface AgentPlanResponse {
  plan: ConfigPlan;
  planPayload: ConfigPlanPayload;
  preview: ConfigPlanPreview | null;
  previewPayload: ConfigPlanPreviewPayload | null;
}

export interface GovernedAgentPlanRequest {
  agent: {
    slug: string;
    repository: string;
    manifest: Record<string, unknown>;
  };
  manifestSource?: string | null;
  mcpServers: string[];
}

export interface GovernedAgentPlanResponse {
  plan: ConfigPlan;
  planPayload: ConfigPlanPayload;
  preview: ConfigPlanPreview | null;
  previewPayload: ConfigPlanPreviewPayload | null;
}

interface ReloadRequestPayload {
  artifact_type: string;
  target_path: string;
  parameters?: Record<string, unknown>;
}

interface ReloadResponsePayload {
  message: string;
  plan: ConfigPlanPayload;
  patch: string;
  plan_id?: string | null;
}

interface AgentConfigPlanResponsePayload {
  plan_id: string;
  plan?: AdminPlanSummary | null;
  plan_payload?: ConfigPlanPayload | null;
  patch?: string | null;
  message?: string | null;
  diffs?: AdminPlanDiff[] | null;
}

interface AgentConfigHistoryItemPayload {
  id: string;
  layer: AgentConfigLayer;
  status: string;
  requested_by: string;
  created_at: string;
  summary?: string | null;
  plan_id: string;
  plan_payload?: ConfigPlanPayload | null;
  patch?: string | null;
  pull_request?: ConfigApplyPullRequest | null;
}

interface AgentConfigHistoryResponsePayload {
  items?: AgentConfigHistoryItemPayload[] | null;
}

export async function postConfigReload(
  requestPayload: ConfigReloadRequest,
  signal?: AbortSignal,
): Promise<ConfigReloadResponse> {
  const body: ReloadRequestPayload = {
    artifact_type: requestPayload.artifactType,
    target_path: requestPayload.targetPath,
  };

  if (requestPayload.parameters && Object.keys(requestPayload.parameters).length > 0) {
    body.parameters = requestPayload.parameters;
  }

  const response = await request<ReloadResponsePayload>('/config/reload', {
    method: 'POST',
    body: JSON.stringify(body),
    signal,
  });

  return {
    message: response.message,
    plan: mapConfigPlanPayload(response.plan),
    planPayload: response.plan,
    patch: response.patch,
    planId: response.plan_id ?? null,
  };
}

export interface GovernedConfigReloadPlanRequest extends ConfigReloadRequest {}

export interface GovernedConfigReloadPlanResponse {
  planId: string;
  message: string;
  plan: ConfigPlan;
  planPayload: ConfigPlanPayload;
  patch: string;
}

export interface GovernedConfigReloadApplyRequest {
  planId: string;
  plan: ConfigPlanPayload;
  patch: string;
  actor: string;
  actorEmail: string;
  commitMessage?: string | null;
}

export interface GovernedConfigReloadApplyResponse {
  status: ConfigPlanStatus;
  message: string;
  recordId: string;
  branch?: string | null;
  baseBranch?: string | null;
  commitSha?: string | null;
  pullRequest?: ConfigApplyPullRequest | null;
}

function generateGovernedPlanId(): string {
  try {
    if (typeof globalThis.crypto?.randomUUID === 'function') {
      return globalThis.crypto.randomUUID();
    }
  } catch {
    // ignore runtime errors from crypto availability checks
  }
  return `reload-plan-${Math.random().toString(36).slice(2, 10)}`;
}

export async function planGovernedConfigReload(
  requestPayload: GovernedConfigReloadPlanRequest,
  signal?: AbortSignal,
): Promise<GovernedConfigReloadPlanResponse> {
  const response = await postConfigReload(requestPayload, signal);
  const planId = response.planId ?? generateGovernedPlanId();

  return {
    planId,
    message: response.message,
    plan: response.plan,
    planPayload: response.planPayload,
    patch: response.patch,
  };
}

export async function applyGovernedConfigReload(
  requestPayload: GovernedConfigReloadApplyRequest,
  signal?: AbortSignal,
): Promise<GovernedConfigReloadApplyResponse> {
  const response = await postPolicyPlanApply(
    {
      planId: requestPayload.planId,
      plan: requestPayload.plan,
      patch: requestPayload.patch,
      actor: requestPayload.actor,
      actorEmail: requestPayload.actorEmail,
      commitMessage: requestPayload.commitMessage ?? undefined,
    },
    signal,
  );

  return {
    status: response.status,
    message: response.message,
    recordId: response.recordId,
    branch: response.branch ?? null,
    baseBranch: response.baseBranch ?? null,
    commitSha: response.commitSha ?? null,
    pullRequest: response.pullRequest ?? null,
  };
}

export async function patchConfigPoliciesPlan(
  requestPayload: PolicyPlanRequest,
  signal?: AbortSignal,
): Promise<PolicyPlanResponse> {
  const body = {
    policy_id: requestPayload.policyId,
    changes: serializePolicyManifestUpdate(requestPayload.changes),
  };
  const response = await request<ConfigPlanResponsePayload>('/config/policies', {
    method: 'PATCH',
    body: JSON.stringify(body),
    signal,
  });
  return {
    plan: mapConfigPlanPayload(response.plan),
    planPayload: response.plan,
    preview: mapConfigPlanPreview(response.preview ?? null),
    previewPayload: response.preview ?? null,
  };
}

export async function postAgentPlan(
  payload: AgentPlanRequest,
  signal?: AbortSignal,
): Promise<AgentPlanResponse> {
  const response = await request<ConfigPlanResponsePayload>('/config/agents/plan', {
    method: 'POST',
    body: JSON.stringify(payload),
    signal,
  });

  return {
    plan: mapConfigPlanPayload(response.plan),
    planPayload: response.plan,
    preview: mapConfigPlanPreview(response.preview ?? null),
    previewPayload: response.preview ?? null,
  };
}

export async function postGovernedAgentPlan(
  payload: GovernedAgentPlanRequest,
  signal?: AbortSignal,
): Promise<GovernedAgentPlanResponse> {
  const response = await request<ConfigPlanResponsePayload>('/config/agents?intent=plan', {
    method: 'POST',
    body: JSON.stringify(payload),
    signal,
  });

  return {
    plan: mapConfigPlanPayload(response.plan),
    planPayload: response.plan,
    preview: mapConfigPlanPreview(response.preview ?? null),
    previewPayload: response.preview ?? null,
  };
}

export async function postAgentLayerPlan(
  agentId: string,
  layer: AgentConfigLayer,
  payload: AgentConfigPlanRequest,
  signal?: AbortSignal,
): Promise<AgentConfigPlanResponse> {
  const response = await request<AgentConfigPlanResponsePayload>(
    `/config/agents/${encodeURIComponent(agentId)}/plan`,
    {
      method: 'POST',
      body: JSON.stringify({
        layer,
        changes: payload.changes,
        note: payload.note ?? null,
      }),
      signal,
    },
  );

  return mapAgentConfigPlanResponsePayload(response);
}

export interface ApplyPolicyPlanRequest {
  planId: string;
  plan: ConfigPlanPayload;
  patch: string;
  mode?: ConfigPlanExecutionMode;
  actor: string;
  actorEmail: string;
  commitMessage?: string;
}

export interface ApplyAgentPlanRequest extends ApplyPolicyPlanRequest {}

export interface ApplyPolicyPlanResponse {
  status: ConfigPlanStatus;
  mode: ConfigPlanExecutionMode;
  planId: string;
  recordId: string;
  branch?: string | null;
  baseBranch?: string | null;
  commitSha?: string | null;
  diff: PlanExecutionDiff;
  hitlRequired: boolean;
  message: string;
  approvalId?: string | null;
  pullRequest?: PlanExecutionPullRequest | null;
}

export async function postPolicyPlanApply(
  payload: ApplyPolicyPlanRequest,
  signal?: AbortSignal,
): Promise<ApplyPolicyPlanResponse> {
  const requestBody: ApplyPlanRequestPayload = {
    plan_id: payload.planId,
    plan: payload.plan,
    patch: payload.patch,
    mode: payload.mode ?? 'branch_pr',
    actor: payload.actor,
    actor_email: payload.actorEmail,
    commit_message: payload.commitMessage ?? 'chore: aplicar plano de configuração',
  };
  const response = await request<ApplyPlanResponsePayload>('/config/apply', {
    method: 'POST',
    body: JSON.stringify(requestBody),
    signal,
  });
  return mapApplyPlanResponse(response);
}

export async function postAgentPlanApply(
  payload: ApplyAgentPlanRequest,
  signal?: AbortSignal,
): Promise<ApplyPolicyPlanResponse> {
  const requestBody: ApplyPlanRequestPayload = {
    plan_id: payload.planId,
    plan: payload.plan,
    patch: payload.patch,
    mode: payload.mode ?? 'branch_pr',
    actor: payload.actor,
    actor_email: payload.actorEmail,
    commit_message: payload.commitMessage ?? 'chore: aplicar plano de configuração',
  };
  const response = await request<ApplyPlanResponsePayload>('/config/agents/apply', {
    method: 'POST',
    body: JSON.stringify(requestBody),
    signal,
  });
  return mapApplyPlanResponse(response);
}

export async function postAgentLayerPlanApply(
  agentId: string,
  payload: ApplyAgentLayerPlanRequest,
  signal?: AbortSignal,
): Promise<ApplyPolicyPlanResponse> {
  const requestBody: ApplyPlanRequestPayload = {
    plan_id: payload.planId,
    plan: payload.plan,
    patch: payload.patch,
    mode: payload.mode ?? 'branch_pr',
    actor: payload.actor,
    actor_email: payload.actorEmail,
    commit_message: payload.commitMessage ?? 'chore: aplicar plano de configuração',
    layer: payload.layer,
  };

  const response = await request<ApplyPlanResponsePayload>(
    `/config/agents/${encodeURIComponent(agentId)}/apply`,
    {
      method: 'POST',
      body: JSON.stringify(requestBody),
      signal,
    },
  );

  return mapApplyPlanResponse(response);
}

export async function fetchAgentConfigHistory(
  agentId: string,
  layer?: AgentConfigLayer,
  signal?: AbortSignal,
): Promise<AgentConfigHistoryItem[]> {
  const query = layer ? `?layer=${encodeURIComponent(layer)}` : '';
  const response = await request<AgentConfigHistoryResponsePayload>(
    `/config/agents/${encodeURIComponent(agentId)}/history${query}`,
    { signal },
  );

  const items = Array.isArray(response.items) ? response.items : [];
  return items.map(mapAgentConfigHistoryItemPayload);
}

export type ConfigApplyIntent =
  | { intent: 'apply'; threadId: string; planId: string; note?: string | null }
  | { intent: 'confirm'; threadId: string; planId: string; token: string; note?: string | null }
  | { intent: 'abort'; threadId: string; planId: string; reason?: string | null };

export interface ConfigApplySuccessResponse {
  status: 'applied';
  message: string;
  plan?: AdminPlanSummary | null;
  branch?: string | null;
  baseBranch?: string | null;
  commitSha?: string | null;
  recordId: string;
  pullRequest?: ConfigApplyPullRequest | null;
}

export interface ConfigApplyHitlResponse {
  status: 'hitl_required';
  request: AdminHitlRequest;
}

export type ConfigApplyResponse = ConfigApplySuccessResponse | ConfigApplyHitlResponse;

export async function postConfigApply(
  intent: ConfigApplyIntent,
  signal?: AbortSignal,
): Promise<ConfigApplyResponse> {
  return request<ConfigApplyResponse>('/config/apply', {
    method: 'POST',
    body: JSON.stringify(intent),
    signal,
  });
}

export type ConfigOnboardIntent = 'plan' | 'validate';

export interface ConfigOnboardRequest {
  intent?: ConfigOnboardIntent;
  endpoint: string;
  agent: {
    id: string;
    name: string;
    repository: string;
    description?: string | null;
    owner?: string | null;
    tags: string[];
    capabilities: string[];
  };
  authentication: {
    mode: 'api_key' | 'oauth_client' | 'none';
    secretName?: string | null;
    instructions?: string | null;
    environment?: string | null;
  };
  tools: {
    name: string;
    description: string;
    entryPoint: string;
  }[];
  validation: {
    runSmokeTests: boolean;
    qualityGates: string[];
    notes?: string | null;
  };
}

export interface ConfigOnboardValidationTool {
  name: string;
  description: string | null;
  definition: Record<string, unknown> | null;
}

export interface ConfigOnboardValidation {
  endpoint: string;
  transport: string;
  tools: ConfigOnboardValidationTool[];
  missingTools: string[];
  serverInfo: Record<string, unknown>;
  capabilities: Record<string, unknown>;
}

export interface ConfigOnboardResponse {
  plan: AdminPlanSummary | null;
  diffs: AdminPlanDiff[];
  risks: AdminRiskItem[];
  message: string | null;
  validation: ConfigOnboardValidation | null;
}

export async function postConfigMcpOnboard(
  payload: ConfigOnboardRequest,
  signal?: AbortSignal,
): Promise<ConfigOnboardResponse> {
  const response = await request<ConfigOnboardResponsePayload>('/config/mcp/onboard', {
    method: 'POST',
    body: JSON.stringify(payload),
    signal,
  });

  return {
    plan: response.plan ?? null,
    diffs: Array.isArray(response.diffs) ? response.diffs : [],
    risks: Array.isArray(response.risks) ? response.risks : [],
    message: typeof response.message === 'string' ? response.message : null,
    validation: mapConfigOnboardValidation(response.validation ?? null),
  };
}

export interface ConfigMcpUpdatePlanRequest {
  serverId: string;
  changes: Partial<McpServerUpdateInput>;
  note?: string | null;
}

export interface ConfigMcpUpdateDiff {
  id: string;
  title: string;
  summary?: string | null;
  diff?: string | null;
}

export interface ConfigMcpUpdatePlanResponse {
  planId: string;
  summary: string;
  message: string | null;
  diffs: ConfigMcpUpdateDiff[];
}

export interface ConfigMcpUpdateAuditMetadata {
  recordId: string;
  branch?: string | null;
  pullRequest?: ConfigApplyPullRequest | null;
}

export interface ConfigMcpUpdateApplyRequest {
  planId: string;
  serverId: string;
  actor: string;
  actorEmail: string;
  commitMessage?: string | null;
  note?: string | null;
}

export interface ConfigMcpUpdateApplyResponse {
  status: 'applied' | 'failed';
  message: string;
  audit: ConfigMcpUpdateAuditMetadata | null;
  errors: string[];
}

interface ConfigMcpUpdateDiffPayload {
  id: string;
  title: string;
  summary?: string | null;
  diff?: string | null;
}

interface ConfigMcpUpdatePlanRequestPayload {
  mode: 'plan';
  server_id: string;
  changes: Record<string, unknown>;
  note?: string | null;
}

interface ConfigMcpUpdatePlanResponsePayload {
  plan_id: string;
  summary?: string | null;
  message?: string | null;
  diffs?: ConfigMcpUpdateDiffPayload[] | null;
}

interface ConfigMcpUpdateApplyRequestPayload {
  mode: 'apply';
  plan_id: string;
  server_id: string;
  actor: string;
  actor_email: string;
  commit_message?: string | null;
  note?: string | null;
}

interface ConfigMcpUpdateApplyResponsePayload {
  status: 'applied' | 'failed';
  message: string;
  record_id?: string | null;
  branch?: string | null;
  pull_request?: ConfigApplyPullRequest | null;
  errors?: string[] | null;
}

function mapConfigMcpUpdateDiff(payload: ConfigMcpUpdateDiffPayload): ConfigMcpUpdateDiff {
  return {
    id: payload.id,
    title: payload.title,
    summary: payload.summary ?? null,
    diff: payload.diff ?? null,
  };
}

function mapConfigMcpUpdateAudit(
  payload: ConfigMcpUpdateApplyResponsePayload,
): ConfigMcpUpdateAuditMetadata | null {
  const recordId = payload.record_id;
  if (!recordId) {
    return null;
  }
  return {
    recordId,
    branch: payload.branch ?? null,
    pullRequest: payload.pull_request ?? null,
  };
}

export async function planConfigMcpUpdate(
  requestPayload: ConfigMcpUpdatePlanRequest,
  signal?: AbortSignal,
): Promise<ConfigMcpUpdatePlanResponse> {
  const body: ConfigMcpUpdatePlanRequestPayload = {
    mode: 'plan',
    server_id: requestPayload.serverId,
    changes: requestPayload.changes ?? {},
  };

  if (requestPayload.note) {
    body.note = requestPayload.note;
  }

  const response = await request<ConfigMcpUpdatePlanResponsePayload>('/config/mcp/update', {
    method: 'POST',
    body: JSON.stringify(body),
    signal,
  });

  return {
    planId: response.plan_id,
    summary: response.summary ?? '',
    message: response.message ?? null,
    diffs: Array.isArray(response.diffs) ? response.diffs.map(mapConfigMcpUpdateDiff) : [],
  };
}

export async function applyConfigMcpUpdate(
  requestPayload: ConfigMcpUpdateApplyRequest,
  signal?: AbortSignal,
): Promise<ConfigMcpUpdateApplyResponse> {
  const body: ConfigMcpUpdateApplyRequestPayload = {
    mode: 'apply',
    plan_id: requestPayload.planId,
    server_id: requestPayload.serverId,
    actor: requestPayload.actor,
    actor_email: requestPayload.actorEmail,
  };

  if (requestPayload.commitMessage) {
    body.commit_message = requestPayload.commitMessage;
  }

  if (requestPayload.note !== undefined) {
    body.note = requestPayload.note;
  }

  const response = await request<ConfigMcpUpdateApplyResponsePayload>('/config/mcp/update', {
    method: 'POST',
    body: JSON.stringify(body),
    signal,
  });

  return {
    status: response.status,
    message: response.message,
    audit: mapConfigMcpUpdateAudit(response),
    errors: Array.isArray(response.errors) ? response.errors : [],
  };
}

export interface McpSmokeRunRequest {
  recordId: string;
  planId: string;
  providerId: string;
}

export type McpSmokeRunStatus = 'queued' | 'running' | 'passed' | 'failed';

export interface McpSmokeRunResponse {
  runId: string;
  status: McpSmokeRunStatus;
  summary: string;
  startedAt: string;
  finishedAt: string | null;
}

export interface McpOnboardingStatus {
  recordId: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  branch?: string | null;
  baseBranch?: string | null;
  commitSha?: string | null;
  pullRequest?: ConfigApplyPullRequest | null;
  updatedAt: string | null;
}

export async function postMcpSmokeRun(
  payload: McpSmokeRunRequest,
  signal?: AbortSignal,
): Promise<McpSmokeRunResponse> {
  return request<McpSmokeRunResponse>('/config/mcp/smoke', {
    method: 'POST',
    body: JSON.stringify(payload),
    signal,
  });
}

export async function fetchMcpOnboardingStatus(
  recordId: string,
  signal?: AbortSignal,
): Promise<McpOnboardingStatus> {
  const searchParams = new URLSearchParams({ recordId });
  return request<McpOnboardingStatus>(`/config/mcp/onboard/status?${searchParams.toString()}`, {
    method: 'GET',
    signal,
  });
}

export type MarketplacePlanStatus = 'pending' | 'in_progress' | 'completed' | 'failed';

export interface MarketplacePlanAction {
  type: string;
  path: string;
  contents: string;
  encoding: string;
  overwrite: boolean;
}

export interface MarketplacePlanStep {
  id: string;
  title: string;
  description: string;
  dependsOn: string[];
  actions: MarketplacePlanAction[];
}

export interface MarketplacePlanDiff {
  path: string;
  summary: string;
  changeType: string;
}

export interface MarketplacePlanRisk {
  title: string;
  impact: string;
  mitigation: string;
}

export interface MarketplacePlanContext {
  path: string;
  snippet: string;
  score: number;
  title: string | null;
  chunk: number;
}

export interface MarketplacePlan {
  intent: string;
  summary: string;
  steps: MarketplacePlanStep[];
  diffs: MarketplacePlanDiff[];
  risks: MarketplacePlanRisk[];
  status: MarketplacePlanStatus;
  context: MarketplacePlanContext[];
  approvalRules: string[];
}

export interface MarketplaceEntry {
  id: string;
  name: string;
  slug: string;
  summary: string;
  description: string | null;
  origin: string;
  rating: number;
  cost: number;
  tags: string[];
  capabilities: string[];
  repositoryUrl: string | null;
  packagePath: string;
  manifestFilename: string;
  entrypointFilename: string | null;
  targetRepository: string;
  signature: string;
  createdAt: string;
  updatedAt: string;
}

export interface MarketplaceCatalogResponse {
  entries: MarketplaceEntry[];
}

export interface MarketplaceImportResponse {
  entry: MarketplaceEntry;
  plan: MarketplacePlan;
  manifest: string;
  agentCode: string | null;
}

export async function fetchMarketplaceEntries(signal?: AbortSignal): Promise<MarketplaceEntry[]> {
  const payload = await request<{ entries?: unknown[] }>('/marketplace', { signal });
  const entries = Array.isArray(payload.entries) ? payload.entries : [];
  return entries.map(mapMarketplaceEntryPayload);
}

export async function importMarketplaceEntry(
  entryId: string,
  signal?: AbortSignal,
): Promise<MarketplaceImportResponse> {
  const payload = await request<{ entry: unknown; plan: unknown; manifest: string; agent_code?: string | null }>(
    `/marketplace/${encodeURIComponent(entryId)}/import`,
    {
      method: 'POST',
      signal,
    },
  );

  return {
    entry: mapMarketplaceEntryPayload(payload.entry),
    plan: mapMarketplacePlanPayload(payload.plan),
    manifest: typeof payload.manifest === 'string' ? payload.manifest : '',
    agentCode:
      typeof payload.agent_code === 'string'
        ? payload.agent_code
        : payload.agent_code === null
          ? null
          : null,
  };
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function mapStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => String(item ?? ''));
}

interface ConfigPlanActionPayload {
  type: string;
  path: string;
  contents: string;
  encoding: string;
  overwrite: boolean;
}

interface ConfigPlanStepPayload {
  id: string;
  title: string;
  description: string;
  depends_on?: unknown;
  actions?: unknown;
}

interface ConfigPlanDiffPayload {
  path: string;
  summary: string;
  change_type: string;
  diff?: string | null;
}

interface ConfigPlanRiskPayload {
  title: string;
  impact: string;
  mitigation: string;
}

interface ConfigPlanContextPayload {
  path: string;
  snippet: string;
  score: number;
  title?: string | null;
  chunk: number;
}

interface ConfigPlanPreviewPullRequestPayload {
  provider: string | null;
  title: string;
  body?: string | null;
}

interface ConfigPlanPreviewPayload {
  branch: string;
  base_branch: string;
  commit_message: string;
  pull_request?: ConfigPlanPreviewPullRequestPayload | null;
}

export interface ConfigPlanPayload {
  intent: string;
  summary: string;
  steps?: unknown;
  diffs?: unknown;
  risks?: unknown;
  status: ConfigPlanStatus;
  context?: unknown;
  approval_rules?: unknown;
}

interface ConfigPlanResponsePayload {
  plan: ConfigPlanPayload;
  preview?: ConfigPlanPreviewPayload | null;
  validation?: unknown;
}

interface ConfigOnboardValidationToolPayload {
  name?: string;
  description?: string | null;
  definition?: unknown;
}

interface ConfigOnboardValidationPayload {
  endpoint?: string;
  transport?: string;
  tools?: ConfigOnboardValidationToolPayload[] | null;
  missing_tools?: unknown;
  server_info?: unknown;
  capabilities?: unknown;
}

interface ConfigOnboardResponsePayload {
  plan?: AdminPlanSummary | null;
  diffs?: AdminPlanDiff[] | null;
  risks?: AdminRiskItem[] | null;
  message?: string | null;
  validation?: ConfigOnboardValidationPayload | null;
}

interface PlanExecutionDiffPayload {
  stat: string;
  patch: string;
}

interface PlanExecutionReviewerPayload {
  id?: string | null;
  name?: string | null;
  status?: string | null;
}

interface PlanExecutionCiResultPayload {
  name?: string | null;
  status?: string | null;
  details_url?: string | null;
}

interface PlanExecutionPullRequestPayload {
  provider: string;
  id: string;
  number: string;
  url: string;
  title: string;
  state: string;
  head_sha: string;
  branch?: string | null;
  ci_status?: string | null;
  review_status?: string | null;
  merged: boolean;
  last_synced_at?: string | null;
  reviewers?: PlanExecutionReviewerPayload[] | null;
  ci_results?: PlanExecutionCiResultPayload[] | null;
}

interface ApplyPlanRequestPayload {
  plan_id: string;
  plan: ConfigPlanPayload;
  patch: string;
  mode: ConfigPlanExecutionMode;
  actor: string;
  actor_email: string;
  commit_message: string;
  layer?: AgentConfigLayer;
  approval_id?: string | null;
  approval_decision?: string | null;
  approval_reason?: string | null;
  hitl_callback_url?: string | null;
}

interface ApplyPlanResponsePayload {
  status: ConfigPlanStatus;
  mode: ConfigPlanExecutionMode;
  plan_id: string;
  record_id: string;
  branch?: string | null;
  base_branch?: string | null;
  commit_sha?: string | null;
  diff: PlanExecutionDiffPayload;
  hitl_required?: boolean;
  message: string;
  approval_id?: string | null;
  pull_request?: PlanExecutionPullRequestPayload | null;
}

function mapConfigPlanActionPayload(payload: ConfigPlanActionPayload): ConfigPlanAction {
  return {
    type: payload.type,
    path: payload.path,
    contents: payload.contents,
    encoding: payload.encoding,
    overwrite: payload.overwrite,
  };
}

function mapConfigPlanStepPayload(payload: ConfigPlanStepPayload): ConfigPlanStep {
  const dependsOnSource = Array.isArray(payload.depends_on) ? payload.depends_on : [];
  const actionsSource = Array.isArray(payload.actions) ? (payload.actions as ConfigPlanActionPayload[]) : [];
  return {
    id: payload.id,
    title: payload.title,
    description: payload.description,
    dependsOn: dependsOnSource.map((item) => String(item ?? '')),
    actions: actionsSource.map(mapConfigPlanActionPayload),
  };
}

function mapConfigPlanDiffPayload(payload: ConfigPlanDiffPayload): ConfigPlanDiffSummary {
  return {
    path: payload.path,
    summary: payload.summary,
    changeType: payload.change_type,
    diff: payload.diff ?? null,
  };
}

function mapConfigPlanRiskPayload(payload: ConfigPlanRiskPayload): ConfigPlanRiskItem {
  return {
    title: payload.title,
    impact: payload.impact,
    mitigation: payload.mitigation,
  };
}

function mapConfigPlanContextPayload(payload: ConfigPlanContextPayload): ConfigPlanContextItem {
  return {
    path: payload.path,
    snippet: payload.snippet,
    score: payload.score,
    title: payload.title ?? null,
    chunk: payload.chunk,
  };
}

const HISTORY_STATUS_LABELS: Record<string, string> = {
  applied: 'Aplicado',
  ready: 'Pronto',
  pending: 'Pendente',
  failed: 'Falhou',
  running: 'Em execução',
};

function normalizeConfigPlanPayloadResponse(
  payload: ConfigPlanPayload | null | undefined,
): ConfigPlanPayload {
  if (payload && typeof payload === 'object') {
    return payload;
  }
  return {
    intent: 'unknown',
    summary: '',
    status: 'pending',
  } as ConfigPlanPayload;
}

function mapAgentConfigPlanResponsePayload(payload: AgentConfigPlanResponsePayload): AgentConfigPlanResponse {
  const diffsSource = Array.isArray(payload.diffs) ? payload.diffs : [];
  return {
    planId: payload.plan_id,
    plan: payload.plan ?? null,
    planPayload: normalizeConfigPlanPayloadResponse(payload.plan_payload ?? null),
    patch: payload.patch ?? '',
    message: typeof payload.message === 'string' ? payload.message : null,
    diffs: diffsSource.filter((diff): diff is AdminPlanDiff => Boolean(diff?.id && diff?.file)),
  };
}

function mapAgentConfigHistoryItemPayload(payload: AgentConfigHistoryItemPayload): AgentConfigHistoryItem {
  const rawStatus = payload.status?.toLowerCase() ?? 'pending';
  const label = HISTORY_STATUS_LABELS[rawStatus] ?? payload.status ?? 'Desconhecido';
  return {
    id: payload.id,
    layer: payload.layer,
    status: rawStatus,
    statusLabel: label,
    requestedBy: payload.requested_by,
    createdAt: payload.created_at,
    summary: payload.summary ?? null,
    planId: payload.plan_id,
    planPayload: payload.plan_payload ?? null,
    patch: payload.patch ?? null,
    pullRequest: payload.pull_request ?? null,
  };
}

function mapConfigPlanPayload(payload: ConfigPlanPayload): ConfigPlan {
  const stepsSource = Array.isArray(payload.steps) ? (payload.steps as ConfigPlanStepPayload[]) : [];
  const diffsSource = Array.isArray(payload.diffs) ? (payload.diffs as ConfigPlanDiffPayload[]) : [];
  const risksSource = Array.isArray(payload.risks) ? (payload.risks as ConfigPlanRiskPayload[]) : [];
  const contextSource = Array.isArray(payload.context) ? (payload.context as ConfigPlanContextPayload[]) : [];
  const approvalSource = Array.isArray(payload.approval_rules) ? payload.approval_rules : [];
  return {
    intent: payload.intent,
    summary: payload.summary,
    steps: stepsSource.map(mapConfigPlanStepPayload),
    diffs: diffsSource.map(mapConfigPlanDiffPayload),
    risks: risksSource.map(mapConfigPlanRiskPayload),
    status: payload.status,
    context: contextSource.map(mapConfigPlanContextPayload),
    approvalRules: approvalSource.map((rule) => String(rule ?? '')),
  };
}

function mapConfigPlanPreview(payload: ConfigPlanPreviewPayload | null): ConfigPlanPreview | null {
  if (!payload) {
    return null;
  }
  const pullRequest = payload.pull_request
    ? {
        provider: payload.pull_request.provider,
        title: payload.pull_request.title,
        body: payload.pull_request.body ?? null,
      }
    : null;
  return {
    branch: payload.branch,
    baseBranch: payload.base_branch,
    commitMessage: payload.commit_message,
    pullRequest,
  };
}

function mapConfigOnboardValidationTool(payload: unknown): ConfigOnboardValidationTool | null {
  if (!isPlainRecord(payload)) {
    return null;
  }
  const record = payload as Record<string, unknown>;
  const rawName = record['name'];
  const name = typeof rawName === 'string' ? rawName.trim() : '';
  if (!name) {
    return null;
  }
  const description =
    typeof record['description'] === 'string' && record['description'].length > 0
      ? (record['description'] as string)
      : null;
  const definition = isPlainRecord(record['definition'])
    ? (record['definition'] as Record<string, unknown>)
    : null;
  return {
    name,
    description,
    definition,
  };
}

function mapConfigOnboardValidation(payload: unknown): ConfigOnboardValidation | null {
  if (!isPlainRecord(payload)) {
    return null;
  }
  const record = payload as Record<string, unknown>;
  const toolsSource = Array.isArray(record['tools']) ? (record['tools'] as unknown[]) : [];
  const tools = toolsSource
    .map((item) => mapConfigOnboardValidationTool(item))
    .filter((item): item is ConfigOnboardValidationTool => item !== null);
  const endpoint = typeof record['endpoint'] === 'string' ? (record['endpoint'] as string) : '';
  const transport = typeof record['transport'] === 'string' ? (record['transport'] as string) : '';
  const missingTools = mapStringArray(record['missing_tools']);
  const serverInfo = isPlainRecord(record['server_info'])
    ? (record['server_info'] as Record<string, unknown>)
    : {};
  const capabilities = isPlainRecord(record['capabilities'])
    ? (record['capabilities'] as Record<string, unknown>)
    : {};

  if (!endpoint && !transport && tools.length === 0 && missingTools.length === 0) {
    return null;
  }

  return {
    endpoint,
    transport,
    tools,
    missingTools,
    serverInfo,
    capabilities,
  };
}

function mapPlanExecutionDiff(payload: PlanExecutionDiffPayload): PlanExecutionDiff {
  return { stat: payload.stat, patch: payload.patch };
}

function mapPlanExecutionPullRequest(
  payload: PlanExecutionPullRequestPayload | null,
): PlanExecutionPullRequest | null {
  if (!payload) {
    return null;
  }
  const reviewersSource = Array.isArray(payload.reviewers) ? payload.reviewers : [];
  const reviewers: PlanExecutionReviewer[] = reviewersSource
    .map((reviewer): PlanExecutionReviewer | null => {
      const name = typeof reviewer?.name === 'string' ? reviewer.name.trim() : '';
      if (!name) {
        return null;
      }
      const idSource = reviewer?.id ?? name;
      const status = typeof reviewer?.status === 'string' ? reviewer.status : null;
      return {
        id: String(idSource ?? name),
        name,
        ...(status !== null ? { status } : {}),
      };
    })
    .filter((item): item is PlanExecutionReviewer => item !== null);

  const ciSource = Array.isArray(payload.ci_results) ? payload.ci_results : [];
  const ciResults: PlanExecutionCiResult[] = ciSource
    .map((result): PlanExecutionCiResult | null => {
      const name = typeof result?.name === 'string' ? result.name.trim() : '';
      const status = typeof result?.status === 'string' ? result.status.trim() : '';
      if (!name || !status) {
        return null;
      }
      const detailsUrl =
        typeof result?.details_url === 'string' && result.details_url.length > 0
          ? result.details_url
          : null;
      return {
        name,
        status,
        ...(detailsUrl ? { detailsUrl } : {}),
      };
    })
    .filter((item): item is PlanExecutionCiResult => item !== null);

  return {
    provider: payload.provider,
    id: payload.id,
    number: payload.number,
    url: payload.url,
    title: payload.title,
    state: payload.state,
    headSha: payload.head_sha,
    branch: payload.branch ?? null,
    ciStatus: payload.ci_status ?? null,
    reviewStatus: payload.review_status ?? null,
    merged: payload.merged,
    lastSyncedAt: payload.last_synced_at ?? null,
    reviewers,
    ciResults,
  };
}

function mapApplyPlanResponse(payload: ApplyPlanResponsePayload): ApplyPolicyPlanResponse {
  return {
    status: payload.status,
    mode: payload.mode,
    planId: payload.plan_id,
    recordId: payload.record_id,
    branch: payload.branch ?? null,
    baseBranch: payload.base_branch ?? null,
    commitSha: payload.commit_sha ?? null,
    diff: mapPlanExecutionDiff(payload.diff),
    hitlRequired: payload.hitl_required ?? false,
    message: payload.message,
    approvalId: payload.approval_id ?? null,
    pullRequest: mapPlanExecutionPullRequest(payload.pull_request ?? null),
  };
}

function mapMarketplaceEntryPayload(payload: unknown): MarketplaceEntry {
  const source = isPlainRecord(payload) ? payload : {};
  return {
    id: String(source.id ?? ''),
    name: String(source.name ?? ''),
    slug: String(source.slug ?? ''),
    summary: String(source.summary ?? ''),
    description: typeof source.description === 'string' ? source.description : null,
    origin: String(source.origin ?? ''),
    rating: toNumber(source.rating, 0),
    cost: toNumber(source.cost, 0),
    tags: mapStringArray(source.tags),
    capabilities: mapStringArray(source.capabilities),
    repositoryUrl:
      typeof source.repository_url === 'string' && source.repository_url.length > 0
        ? source.repository_url
        : null,
    packagePath: String(source.package_path ?? ''),
    manifestFilename: String(source.manifest_filename ?? ''),
    entrypointFilename:
      typeof source.entrypoint_filename === 'string' && source.entrypoint_filename.length > 0
        ? source.entrypoint_filename
        : null,
    targetRepository: String(source.target_repository ?? ''),
    signature: String(source.signature ?? ''),
    createdAt: String(source.created_at ?? ''),
    updatedAt: String(source.updated_at ?? ''),
  };
}

function mapMarketplacePlanActionPayload(payload: unknown): MarketplacePlanAction {
  const source = isPlainRecord(payload) ? payload : {};
  return {
    type: String(source.type ?? ''),
    path: String(source.path ?? ''),
    contents: String(source.contents ?? ''),
    encoding: typeof source.encoding === 'string' && source.encoding.length > 0 ? source.encoding : 'utf-8',
    overwrite: source.overwrite !== false,
  };
}

function mapMarketplacePlanPayload(payload: unknown): MarketplacePlan {
  const source = isPlainRecord(payload) ? payload : {};
  const stepsValue = Array.isArray(source.steps) ? source.steps : [];
  const diffsValue = Array.isArray(source.diffs) ? source.diffs : [];
  const risksValue = Array.isArray(source.risks) ? source.risks : [];
  const contextValue = Array.isArray(source.context) ? source.context : [];
  const approvalRulesValue = Array.isArray(source.approval_rules) ? source.approval_rules : [];

  return {
    intent: String(source.intent ?? ''),
    summary: String(source.summary ?? ''),
    steps: stepsValue.map((item) => {
      const record = isPlainRecord(item) ? item : {};
      const depends = Array.isArray(record.depends_on) ? record.depends_on.map((dep) => String(dep ?? '')) : [];
      const actionsValue = Array.isArray(record.actions) ? record.actions : [];
      return {
        id: String(record.id ?? ''),
        title: String(record.title ?? ''),
        description: String(record.description ?? ''),
        dependsOn: depends,
        actions: actionsValue.map(mapMarketplacePlanActionPayload),
      };
    }),
    diffs: diffsValue.map((item) => {
      const record = isPlainRecord(item) ? item : {};
      return {
        path: String(record.path ?? ''),
        summary: String(record.summary ?? ''),
        changeType:
          typeof record.change_type === 'string' && record.change_type.length > 0
            ? record.change_type
            : 'update',
      };
    }),
    risks: risksValue.map((item) => {
      const record = isPlainRecord(item) ? item : {};
      return {
        title: String(record.title ?? ''),
        impact: String(record.impact ?? ''),
        mitigation: String(record.mitigation ?? ''),
      };
    }),
    status:
      typeof source.status === 'string' && source.status.length > 0
        ? (source.status as MarketplacePlanStatus)
        : 'pending',
    context: contextValue.map((item) => {
      const record = isPlainRecord(item) ? item : {};
      return {
        path: String(record.path ?? ''),
        snippet: String(record.snippet ?? ''),
        score: toNumber(record.score, 0),
        title:
          typeof record.title === 'string' && record.title.length > 0 ? record.title : null,
        chunk: Math.trunc(toNumber(record.chunk, 0)),
      };
    }),
    approvalRules: approvalRulesValue.map((rule) => String(rule ?? '')),
  };
}

function mapFlowNodePayload(payload: unknown): FlowNode {
  const source = isPlainRecord(payload) ? payload : {};
  const configValue = source.config;
  return {
    id: String(source.id ?? ''),
    type: String(source.type ?? ''),
    label: String(source.label ?? ''),
    config: isPlainRecord(configValue) ? (configValue as FlowNodeConfig) : {},
  };
}

function mapFlowEdgePayload(payload: unknown): FlowEdge {
  const source = isPlainRecord(payload) ? payload : {};
  return {
    id: String(source.id ?? ''),
    source: String(source.source ?? ''),
    target: String(source.target ?? ''),
    condition:
      typeof source.condition === 'string' && source.condition.length > 0
        ? source.condition
        : null,
  };
}

function mapFlowGraphPayload(payload: unknown): FlowGraph {
  const source = isPlainRecord(payload) ? payload : {};
  const nodesValue = Array.isArray(source.nodes) ? source.nodes : [];
  const edgesValue = Array.isArray(source.edges) ? source.edges : [];
  return {
    id: String(source.id ?? ''),
    label: String(source.label ?? ''),
    entry: String(source.entry ?? ''),
    exit: String(source.exit ?? ''),
    nodes: nodesValue.map(mapFlowNodePayload),
    edges: edgesValue.map(mapFlowEdgePayload),
    metadata: isPlainRecord(source.metadata) ? source.metadata : {},
  };
}

function mapFlowVersionPayload(payload: unknown): FlowVersion {
  const source = isPlainRecord(payload) ? payload : {};
  const checkpoints = Array.isArray(source.hitl_checkpoints)
    ? source.hitl_checkpoints.map((value) => String(value))
    : [];
  return {
    flowId: String(source.flow_id ?? ''),
    version: Number(source.version ?? 0),
    createdAt: String(source.created_at ?? ''),
    createdBy:
      typeof source.created_by === 'string' && source.created_by.length > 0
        ? source.created_by
        : null,
    comment:
      typeof source.comment === 'string' && source.comment.length > 0
        ? source.comment
        : null,
    graph: mapFlowGraphPayload(source.graph),
    agentCode: String(source.agent_code ?? ''),
    hitlCheckpoints: checkpoints,
    diff:
      typeof source.diff === 'string' && source.diff.length > 0 ? source.diff : null,
  };
}

export async function listFlowVersions(flowId: string): Promise<FlowVersionList> {
  const payload = await request<{ flow_id: string; versions: unknown[] }>(
    `/flows/${encodeURIComponent(flowId)}/versions`,
  );
  return {
    flowId: payload.flow_id,
    versions: payload.versions.map(mapFlowVersionPayload),
  };
}

export async function createFlowVersion(
  flowId: string,
  input: FlowVersionCreateInput,
): Promise<FlowVersion> {
  const body: Record<string, unknown> = {
    graph: input.graph,
    target_path: input.targetPath,
  };

  if (input.agentClass !== undefined) {
    body.agent_class = input.agentClass;
  }
  if (input.comment !== undefined) {
    body.comment = input.comment;
  }
  if (input.author !== undefined) {
    body.author = input.author;
  }
  if (input.baselineAgentCode !== undefined) {
    body.baseline_agent_code = input.baselineAgentCode;
  }

  const payload = await request<unknown>(`/flows/${encodeURIComponent(flowId)}/versions`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return mapFlowVersionPayload(payload);
}

export async function rollbackFlowVersion(
  flowId: string,
  version: number,
  input: FlowVersionRollbackInput,
): Promise<FlowVersion> {
  const payload = await request<unknown>(
    `/flows/${encodeURIComponent(flowId)}/versions/${version}/rollback`,
    {
      method: 'POST',
      body: JSON.stringify({ author: input.author, comment: input.comment }),
    },
  );
  return mapFlowVersionPayload(payload);
}

export async function compareFlowVersions(
  flowId: string,
  fromVersion: number,
  toVersion: number,
): Promise<FlowVersionDiff> {
  const payload = await request<{ flow_id: string; from_version: number; to_version: number; diff: string }>(
    `/flows/${encodeURIComponent(flowId)}/versions/compare?from_version=${fromVersion}&to_version=${toVersion}`,
  );
  return {
    flowId: payload.flow_id,
    fromVersion: payload.from_version,
    toVersion: payload.to_version,
    diff: payload.diff,
  };
}

export const apiBase = getApiBaseUrl();
