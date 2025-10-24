import { useMemo } from 'react';

export type FixtureStatus = 'ready' | 'disabled' | 'error';

const FIXTURE_FLAG = '__CONSOLE_MCP_FIXTURES__';

declare global {
  // eslint-disable-next-line no-var
  var __CONSOLE_MCP_FIXTURES__: FixtureStatus | undefined;
}

function readGlobalFlag(): FixtureStatus | undefined {
  if (typeof globalThis === 'undefined') {
    return undefined;
  }

  const globalObject = globalThis as typeof globalThis & {
    [FIXTURE_FLAG]?: FixtureStatus;
  };

  const flag = globalObject[FIXTURE_FLAG];
  if (flag === 'ready' || flag === 'disabled' || flag === 'error') {
    return flag;
  }
  return undefined;
}

function writeGlobalFlag(status: FixtureStatus): void {
  if (typeof globalThis === 'undefined') {
    return;
  }

  const globalObject = globalThis as typeof globalThis & {
    [FIXTURE_FLAG]?: FixtureStatus;
  };

  globalObject[FIXTURE_FLAG] = status;
}

function coerceBoolean(value: unknown): boolean {
  if (value === true || value === 'true') {
    return true;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized === '1' || normalized === 'yes' || normalized === 'on';
  }
  if (typeof value === 'number') {
    return value !== 0;
  }
  return false;
}

export function getFixtureStatus(): FixtureStatus {
  const globalStatus = readGlobalFlag();
  if (globalStatus) {
    return globalStatus;
  }

  const envValue = import.meta.env?.VITE_CONSOLE_USE_FIXTURES;
  if (coerceBoolean(envValue)) {
    writeGlobalFlag('ready');
    return 'ready';
  }

  writeGlobalFlag('disabled');
  return 'disabled';
}

export function isFixtureModeEnabled(): boolean {
  return getFixtureStatus() === 'ready';
}

export function useFixtureStatus(): { status: FixtureStatus; isEnabled: boolean } {
  return useMemo(() => {
    const status = getFixtureStatus();
    return { status, isEnabled: status === 'ready' };
  }, []);
}

export interface FixtureRequestMessages {
  loading: string;
  error: string;
}

interface FixtureRequestOptions {
  action?: string;
  errorPrefix?: string;
}

export function describeFixtureRequest(
  resource: string,
  options?: FixtureRequestOptions,
): FixtureRequestMessages {
  const trimmedResource = resource.trim();
  const action = options?.action ?? 'Carregando';
  const errorPrefix = options?.errorPrefix ?? 'carregar';

  const baseLoading = `${action} ${trimmedResource}…`;
  const baseError = `Falha ao ${errorPrefix} ${trimmedResource}.`;

  if (!isFixtureModeEnabled()) {
    return { loading: baseLoading, error: baseError };
  }

  const loading = `${action} ${trimmedResource} via fixtures…`;
  const error = `Falha ao ${errorPrefix} ${trimmedResource} a partir dos fixtures locais.`;

  return { loading, error };
}

