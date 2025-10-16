import type { AgentInvokeConfig } from '../types/agent';

export function createAgentRequestId(): string {
  if (typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `req_${Math.random().toString(36).slice(2, 12)}`;
}

export function mergeAgentInputs<Input extends Record<string, unknown>>(
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

export function mergeAgentConfigs(
  base?: AgentInvokeConfig,
  override?: AgentInvokeConfig,
): AgentInvokeConfig {
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
