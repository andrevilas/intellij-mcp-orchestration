export interface AgentInvokeMetadata extends Record<string, unknown> {
  requestId?: string;
  caller?: string;
  traceId?: string;
}

export interface AgentInvokeConfig extends Record<string, unknown> {
  metadata?: AgentInvokeMetadata;
  parameters?: Record<string, unknown>;
}

export interface AgentInvokeRequest<
  Input extends Record<string, unknown>,
  Config extends AgentInvokeConfig,
> {
  input?: Input;
  config?: Config;
}

export interface InvokeOptions<
  Input extends Record<string, unknown>,
  Config extends AgentInvokeConfig,
> extends AgentInvokeRequest<Input, Config> {
  requestId?: string;
  signal?: AbortSignal;
}

export interface AgentInvokeResult<
  Result = unknown,
  Input extends Record<string, unknown> = Record<string, unknown>,
  Config extends AgentInvokeConfig = AgentInvokeConfig,
> {
  requestId: string;
  status: number;
  result: Result;
  trace?: unknown;
  raw?: unknown;
  request: AgentInvokeRequest<Input, Config>;
}

export interface AgentError {
  status: number;
  message: string;
  details?: Record<string, unknown>;
  cause?: unknown;
}

export interface UseAgentOptions<
  Input extends Record<string, unknown>,
  Config extends AgentInvokeConfig,
> {
  defaultInput?: Input;
  defaultConfig?: Config;
}

export interface ResetOptions {
  preserveFallback?: boolean;
}
