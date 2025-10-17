import { fetchFromApi, fetchFromAgents, getApiBaseUrl } from './services/httpClient';

export type BudgetPeriod = 'daily' | 'weekly' | 'monthly';
export type RoutingTierId = 'economy' | 'balanced' | 'turbo';
export type HitlEscalationChannel = 'email' | 'slack' | 'pagerduty';
export type HitlRequestStatus = 'pending' | 'approved' | 'rejected';
export type HitlResolution = 'approved' | 'rejected';

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

export interface FinOpsPolicyConfig {
  costCenter: string;
  budgets: FinOpsBudget[];
  alerts: FinOpsAlertThreshold[];
  abHistory: FinOpsAbExperiment[];
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

interface PolicyOverridePayload {
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

interface FinOpsConfigPayload {
  cost_center?: string;
  budgets?: FinOpsBudgetPayload[];
  alerts?: FinOpsAlertPayload[];
  ab_history?: FinOpsAbExperimentPayload[];
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

interface PolicyOverridesPayload {
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

export interface RoutingSimulationResult {
  totalCost: number;
  costPerMillion: number;
  avgLatency: number;
  reliabilityScore: number;
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

interface RoutingSimulationResponsePayload {
  total_cost: number;
  cost_per_million: number;
  avg_latency: number;
  reliability_score: number;
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
    totalCost: payload.total_cost,
    costPerMillion: payload.cost_per_million,
    avgLatency: payload.avg_latency,
    reliabilityScore: payload.reliability_score,
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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetchFromApi(path, init);

  if (!response) {
    throw new Error('Empty response from fetch');
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

async function requestAgents<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetchFromAgents(path, init);

  if (!response) {
    throw new Error('Empty response from fetch');
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
  return {
    costCenter: payload?.cost_center ?? 'default',
    budgets: (payload?.budgets ?? []).map(mapFinOpsBudgetPayload),
    alerts: (payload?.alerts ?? []).map((alert) => ({
      threshold: clampZeroOne(alert.threshold, 0.5),
      channel: alert.channel,
    })),
    abHistory: (payload?.ab_history ?? []).map(mapAbExperimentPayload),
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
    const finops: { costCenter?: string; budgets?: FinOpsBudget[]; alerts?: FinOpsAlertThreshold[] } = {};
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

interface ReloadRequestPayload {
  artifact_type: string;
  target_path: string;
  parameters?: Record<string, unknown>;
}

interface ReloadResponsePayload {
  message: string;
  plan: ConfigPlanPayload;
  patch: string;
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

export interface ApplyPolicyPlanRequest {
  planId: string;
  plan: ConfigPlanPayload;
  patch: string;
  mode?: ConfigPlanExecutionMode;
  actor: string;
  actorEmail: string;
  commitMessage?: string;
}

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

export interface ConfigOnboardResponse {
  plan: AdminPlanSummary;
  diffs: AdminPlanDiff[];
  risks: AdminRiskItem[];
  message: string;
}

export async function postConfigMcpOnboard(
  payload: ConfigOnboardRequest,
  signal?: AbortSignal,
): Promise<ConfigOnboardResponse> {
  return request<ConfigOnboardResponse>('/config/mcp/onboard', {
    method: 'POST',
    body: JSON.stringify(payload),
    signal,
  });
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

interface ConfigPlanPayload {
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
    .map((reviewer) => {
      const name = typeof reviewer?.name === 'string' ? reviewer?.name.trim() : '';
      if (!name) {
        return null;
      }
      const idSource = reviewer?.id ?? name;
      return {
        id: String(idSource ?? name),
        name,
        status: typeof reviewer?.status === 'string' ? reviewer.status : null,
      };
    })
    .filter((item): item is PlanExecutionReviewer => item !== null);

  const ciSource = Array.isArray(payload.ci_results) ? payload.ci_results : [];
  const ciResults: PlanExecutionCiResult[] = ciSource
    .map((result) => {
      const name = typeof result?.name === 'string' ? result.name.trim() : '';
      const status = typeof result?.status === 'string' ? result.status.trim() : '';
      if (!name || !status) {
        return null;
      }
      return {
        name,
        status,
        detailsUrl:
          typeof result?.details_url === 'string' && result.details_url.length > 0
            ? result.details_url
            : null,
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
