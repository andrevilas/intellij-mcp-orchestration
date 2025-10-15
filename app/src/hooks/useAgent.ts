import { useCallback, useEffect, useRef, useState } from 'react';

import { fetchFromAgents } from '../services/httpClient';

export interface AgentInvokeMetadata extends Record<string, unknown> {
  requestId?: string;
  caller?: string;
  traceId?: string;
}

export interface AgentInvokeConfig extends Record<string, unknown> {
  metadata?: AgentInvokeMetadata;
  parameters?: Record<string, unknown>;
}

export interface AgentInvokeRequest<Input extends Record<string, unknown>, Config extends AgentInvokeConfig> {
  input?: Input;
  config?: Config;
}

export interface InvokeOptions<Input extends Record<string, unknown>, Config extends AgentInvokeConfig>
  extends AgentInvokeRequest<Input, Config> {
  requestId?: string;
  signal?: AbortSignal;
}

export interface AgentInvokeResult<Result = unknown> {
  requestId: string;
  status: number;
  result: Result;
}

export interface AgentError {
  status: number;
  message: string;
  details?: Record<string, unknown>;
  cause?: unknown;
}

export interface UseAgentOptions<Input extends Record<string, unknown>, Config extends AgentInvokeConfig> {
  defaultInput?: Input;
  defaultConfig?: Config;
}

export interface ResetOptions {
  preserveFallback?: boolean;
}

interface AgentState<Result> {
  data: AgentInvokeResult<Result> | null;
  error: AgentError | null;
  isLoading: boolean;
  isFallback: boolean;
}

export interface UseAgentResult<Result, Input extends Record<string, unknown>, Config extends AgentInvokeConfig>
  extends AgentState<Result> {
  invoke: (options?: InvokeOptions<Input, Config>) => Promise<AgentInvokeResult<Result> | null>;
  reset: (options?: ResetOptions) => void;
}

function createRequestId(): string {
  if (typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `req_${Math.random().toString(36).slice(2, 12)}`;
}

function mergeInputs<Input extends Record<string, unknown>>(
  base?: Input,
  override?: Input,
): Input | undefined {
  if (!base && !override) {
    return undefined;
  }
  if (!base) {
    return override;
  }
  if (!override) {
    return base;
  }
  return { ...base, ...override } as Input;
}

function mergeConfigs(base?: AgentInvokeConfig, override?: AgentInvokeConfig): AgentInvokeConfig {
  const merged: AgentInvokeConfig = { ...(base ?? {}) };

  if (base?.metadata) {
    merged.metadata = { ...base.metadata };
  }

  if (base?.parameters) {
    merged.parameters = { ...base.parameters };
  }

  if (override) {
    for (const [key, value] of Object.entries(override)) {
      if (key === 'metadata' || key === 'parameters') {
        continue;
      }
      (merged as Record<string, unknown>)[key] = value;
    }

    if (override.metadata) {
      merged.metadata = { ...(merged.metadata ?? {}), ...override.metadata };
    }

    if (override.parameters) {
      merged.parameters = { ...(merged.parameters ?? {}), ...override.parameters };
    }
  }

  if (merged.metadata && Object.keys(merged.metadata).length === 0) {
    delete merged.metadata;
  }

  if (merged.parameters && Object.keys(merged.parameters).length === 0) {
    delete merged.parameters;
  }

  return merged;
}

async function parseAgentError(response: Response): Promise<AgentError> {
  let message = `Request failed with status ${response.status}`;
  let details: Record<string, unknown> | undefined;

  try {
    const body = await response.clone().json();
    if (body && typeof body === 'object') {
      if (typeof (body as { error?: unknown }).error === 'string') {
        message = (body as { error: string }).error;
      }
      const rawDetails = (body as { details?: unknown }).details;
      if (rawDetails && typeof rawDetails === 'object' && !Array.isArray(rawDetails)) {
        details = rawDetails as Record<string, unknown>;
      }
    }
  } catch {
    try {
      const text = await response.clone().text();
      if (text) {
        message = text;
      }
    } catch {
      // ignore parsing failure fallback
    }
  }

  return { status: response.status, message, details };
}

function normalizeUnknownError(error: unknown): AgentError {
  if (error && typeof error === 'object' && 'status' in error && 'message' in error) {
    const typed = error as AgentError;
    return {
      status: typed.status,
      message: typed.message,
      details: typed.details,
      cause: typed.cause,
    };
  }

  if (error instanceof Error) {
    return {
      status: 0,
      message: error.message,
      cause: error,
    };
  }

  return {
    status: 0,
    message: 'Unknown agent error',
    cause: error,
  };
}

export function useAgent<
  Result = unknown,
  Input extends Record<string, unknown> = Record<string, unknown>,
  Config extends AgentInvokeConfig = AgentInvokeConfig,
>(agentName: string, options?: UseAgentOptions<Input, Config>): UseAgentResult<Result, Input, Config> {
  const [state, setState] = useState<AgentState<Result>>({
    data: null,
    error: null,
    isLoading: false,
    isFallback: false,
  });
  const defaultsRef = useRef<UseAgentOptions<Input, Config> | undefined>(options);
  const requestSeq = useRef(0);

  useEffect(() => {
    defaultsRef.current = options;
  }, [options]);

  const invoke = useCallback(
    async (invokeOptions?: InvokeOptions<Input, Config>): Promise<AgentInvokeResult<Result> | null> => {
      const currentDefaults = defaultsRef.current;
      const callId = requestSeq.current + 1;
      requestSeq.current = callId;

      const payloadInput = mergeInputs(currentDefaults?.defaultInput, invokeOptions?.input) ?? ({} as Input);
      const mergedConfig = mergeConfigs(
        currentDefaults?.defaultConfig as AgentInvokeConfig | undefined,
        invokeOptions?.config as AgentInvokeConfig | undefined,
      );

      const metadata = { ...(mergedConfig.metadata ?? {}) } as AgentInvokeMetadata;
      const requestId =
        invokeOptions?.requestId ?? (typeof metadata.requestId === 'string' ? metadata.requestId : undefined) ?? createRequestId();
      metadata.requestId = requestId;
      mergedConfig.metadata = metadata;

      setState((current) => ({ ...current, isLoading: true, error: null }));

      try {
        const response = await fetchFromAgents(`/${agentName}/invoke`, {
          method: 'POST',
          body: JSON.stringify({ input: payloadInput, config: mergedConfig }),
          signal: invokeOptions?.signal,
        });

        if (requestSeq.current !== callId) {
          return null;
        }

        if (response.status === 404) {
          const fallbackError = await parseAgentError(response);
          setState({ data: null, error: fallbackError, isLoading: false, isFallback: true });
          return null;
        }

        if (!response.ok) {
          const agentError = await parseAgentError(response);
          setState({ data: null, error: agentError, isLoading: false, isFallback: false });
          throw agentError;
        }

        const body = (await response.json()) as { result: Result } | Result;
        const resultPayload: Result = (body && typeof body === 'object' && 'result' in body
          ? (body as { result: Result }).result
          : (body as Result));

        const result: AgentInvokeResult<Result> = {
          requestId,
          status: response.status,
          result: resultPayload,
        };

        setState({ data: result, error: null, isLoading: false, isFallback: false });
        return result;
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          if (requestSeq.current === callId) {
            setState((current) => ({ ...current, isLoading: false }));
          }
          return null;
        }

        const normalized = normalizeUnknownError(error);
        if (requestSeq.current === callId) {
          setState({ data: null, error: normalized, isLoading: false, isFallback: false });
        }
        throw normalized;
      }
    },
    [agentName],
  );

  const reset = useCallback((resetOptions?: ResetOptions) => {
    setState((current) => ({
      data: null,
      error: null,
      isLoading: false,
      isFallback: resetOptions?.preserveFallback === false ? false : current.isFallback,
    }));
  }, []);

  return {
    ...state,
    invoke,
    reset,
  };
}
