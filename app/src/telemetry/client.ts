import { isFixtureModeEnabled } from '../utils/fixtureStatus';

type TelemetryEventType = 'app_loaded' | 'view_changed' | 'panel_opened';

interface TelemetryPayload {
  type: TelemetryEventType;
  timestamp: string;
  attributes: Record<string, unknown>;
}

const UI_TELEMETRY_ENDPOINT = '/api/v1/telemetry/ui-events';
const MAX_BUFFERED_EVENTS = 50;

export class TelemetryClient {
  private readonly queue: TelemetryPayload[] = [];

  appLoaded(attributes: Record<string, unknown>): void {
    this.send({
      type: 'app_loaded',
      timestamp: new Date().toISOString(),
      attributes: {
        fixture_mode: isFixtureModeEnabled() ? 'fixtures' : 'api',
        ...attributes,
      },
    });
  }

  viewChanged(attributes: Record<string, unknown>): void {
    this.send({
      type: 'view_changed',
      timestamp: new Date().toISOString(),
      attributes,
    });
  }

  panelOpened(panel: string, attributes: Record<string, unknown>): void {
    this.send({
      type: 'panel_opened',
      timestamp: new Date().toISOString(),
      attributes: {
        panel,
        ...attributes,
      },
    });
  }

  private send(payload: TelemetryPayload): void {
    if (typeof window === 'undefined') {
      return;
    }

    const serialized = JSON.stringify(payload);
    const beaconPayload = new Blob([serialized], { type: 'application/json' });

    try {
      if (typeof navigator.sendBeacon === 'function') {
        const result = navigator.sendBeacon(UI_TELEMETRY_ENDPOINT, beaconPayload);
        if (result) {
          return;
        }
      }
    } catch {
      // ignore beacon failures and fallback to fetch
    }

    fetch(UI_TELEMETRY_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: serialized,
      keepalive: true,
    }).catch(() => {
      if (this.queue.length >= MAX_BUFFERED_EVENTS) {
        this.queue.shift();
      }
      this.queue.push(payload);
    });
  }
}

export const telemetryClient = new TelemetryClient();
