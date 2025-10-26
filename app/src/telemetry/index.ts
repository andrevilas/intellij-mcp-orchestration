import { useMemo } from 'react';
import { telemetryClient, TelemetryClient } from './client';

export function useTelemetry(): TelemetryClient {
  return useMemo(() => telemetryClient, []);
}

export type { TelemetryClient } from './client';
