import { useCallback, useEffect, useRef, useState } from 'react';

import { fetchFromAgents } from '../services/httpClient';
import type {
  AgentError,
  AgentInvokeConfig,
  AgentInvokeMetadata,
  AgentInvokeRequest,
  AgentInvokeResult,
  InvokeOptions,
  ResetOptions,
  UseAgentOptions,
} from '../types/agent';
import { createAgentRequestId, mergeAgentConfigs, mergeAgentInputs } from '../utils/agentRequest';

interface AgentState<
  Result,
  Input extends Record<string, unknown>,
  Config extends AgentInvokeConfig,
> {
  data: AgentInvokeResult<Result, Input, Config> | null;
  error: AgentError | null;
  isLoading: boolean;
  isFallback: boolean;
}

export interface UseAgentResult<
  Result,
  Input extends Record<string, unknown>,
  Config extends AgentInvokeConfig,
> extends AgentState<Result, Input, Config> {
  invoke: (
    options?: InvokeOptions<Input, Config>,
  ) => Promise<AgentInvokeResult<Result, Input, Config> | null>;
  reset: (options?: ResetOptions) => void;
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
  const [state, setState] = useState<AgentState<Result, Input, Config>>({
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
    async (
      invokeOptions?: InvokeOptions<Input, Config>,
    ): Promise<AgentInvokeResult<Result, Input, Config> | null> => {
      const currentDefaults = defaultsRef.current;
      const callId = requestSeq.current + 1;
      requestSeq.current = callId;

      const payloadInput =
        mergeAgentInputs(currentDefaults?.defaultInput, invokeOptions?.input) ?? ({} as Input);
      const mergedConfig = mergeAgentConfigs(
        currentDefaults?.defaultConfig as AgentInvokeConfig | undefined,
        invokeOptions?.config as AgentInvokeConfig | undefined,
      );

      const metadata = { ...(mergedConfig.metadata ?? {}) } as AgentInvokeMetadata;
      const requestId =
        invokeOptions?.requestId ??
        (typeof metadata.requestId === 'string' ? metadata.requestId : undefined) ??
        createAgentRequestId();
      metadata.requestId = requestId;
      mergedConfig.metadata = metadata;

      const requestPayload: AgentInvokeRequest<Input, AgentInvokeConfig> = {
        input: payloadInput,
        config: mergedConfig,
      };

      setState((current) => ({ ...current, isLoading: true, error: null }));

      try {
        const response = await fetchFromAgents(`/${agentName}/invoke`, {
          method: 'POST',
          body: JSON.stringify(requestPayload),
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

        const rawBody = (await response.json()) as { result?: Result; trace?: unknown } | Result;
        const hasResultProperty =
          rawBody && typeof rawBody === 'object' && 'result' in rawBody && rawBody.result !== undefined;
        const resultPayload: Result = hasResultProperty
          ? ((rawBody as { result: Result }).result as Result)
          : (rawBody as Result);
        const tracePayload =
          rawBody && typeof rawBody === 'object' && 'trace' in rawBody
            ? (rawBody as { trace?: unknown }).trace
            : undefined;

        const result: AgentInvokeResult<Result, Input, Config> = {
          requestId,
          status: response.status,
          result: resultPayload,
          trace: tracePayload,
          raw: rawBody,
          request: requestPayload as AgentInvokeRequest<Input, Config>,
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

export type {
  AgentError,
  AgentInvokeConfig,
  AgentInvokeMetadata,
  AgentInvokeRequest,
  AgentInvokeResult,
  InvokeOptions,
  ResetOptions,
  UseAgentOptions,
} from '../types/agent';
