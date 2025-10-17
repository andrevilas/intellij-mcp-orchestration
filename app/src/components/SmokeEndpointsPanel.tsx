import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  ApiError,
  fetchSmokeEndpoints,
  triggerSmokeEndpoint,
  type SmokeEndpoint,
  type SmokeRunSummary,
} from '../api';
import { formatAgentTimestamp } from '../utils/agents';

interface SmokeMetadataEntry {
  triggeredAt: string | null;
  triggeredBy: string | null;
  status: SmokeRunSummary['status'] | null;
  summary: string | null;
}

const METADATA_STORAGE_KEY = 'mcp-smoke-endpoints-metadata';

const STATUS_LABELS: Record<SmokeRunSummary['status'], string> = {
  queued: 'Na fila',
  running: 'Em execução',
  passed: 'Aprovado',
  failed: 'Falhou',
};

const LEVEL_LABELS = {
  debug: 'Depuração',
  info: 'Info',
  warning: 'Aviso',
  error: 'Erro',
} as const;

interface FeedbackState {
  kind: 'success' | 'error';
  title: string;
  description: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function loadMetadata(): Record<string, SmokeMetadataEntry> {
  if (typeof window === 'undefined' || !window.localStorage) {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(METADATA_STORAGE_KEY);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw);
    if (!isRecord(parsed)) {
      return {};
    }

    const entries: Record<string, SmokeMetadataEntry> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (!isRecord(value)) {
        continue;
      }

      const triggeredAt = typeof value.triggeredAt === 'string' ? value.triggeredAt : null;
      const triggeredBy = typeof value.triggeredBy === 'string' ? value.triggeredBy : null;
      const status =
        value.status === 'queued' ||
        value.status === 'running' ||
        value.status === 'passed' ||
        value.status === 'failed'
          ? value.status
          : null;
      const summary = typeof value.summary === 'string' ? value.summary : null;
      entries[key] = { triggeredAt, triggeredBy, status, summary };
    }

    return entries;
  } catch (error) {
    console.error('Falha ao carregar metadados de smoke endpoints', error);
    return {};
  }
}

function persistMetadata(entries: Record<string, SmokeMetadataEntry>): void {
  if (typeof window === 'undefined' || !window.localStorage) {
    return;
  }

  try {
    window.localStorage.setItem(METADATA_STORAGE_KEY, JSON.stringify(entries));
  } catch (error) {
    console.error('Falha ao persistir metadados de smoke endpoints', error);
  }
}

function mergeMetadata(endpoints: SmokeEndpoint[], metadata: Record<string, SmokeMetadataEntry>): SmokeEndpoint[] {
  return endpoints.map((endpoint) => {
    const entry = metadata[endpoint.id];
    if (!entry) {
      return endpoint;
    }

    if (endpoint.lastRun) {
      return {
        ...endpoint,
        lastRun: {
          ...endpoint.lastRun,
          triggeredAt: endpoint.lastRun.triggeredAt ?? entry.triggeredAt,
          triggeredBy: endpoint.lastRun.triggeredBy ?? entry.triggeredBy,
          summary: endpoint.lastRun.summary ?? entry.summary,
        },
      };
    }

    return {
      ...endpoint,
      lastRun: {
        runId: `${endpoint.id}-local`,
        status: entry.status ?? 'passed',
        summary: entry.summary,
        triggeredAt: entry.triggeredAt,
        triggeredBy: entry.triggeredBy,
        finishedAt: entry.triggeredAt,
        logs: [],
      },
    };
  });
}

function rememberRun(endpointId: string, run: SmokeRunSummary): void {
  if (typeof window === 'undefined' || !window.localStorage) {
    return;
  }

  const metadata = loadMetadata();
  metadata[endpointId] = {
    triggeredAt: run.triggeredAt ?? run.finishedAt ?? null,
    triggeredBy: run.triggeredBy ?? null,
    status: run.status,
    summary: run.summary ?? null,
  };
  persistMetadata(metadata);
}

function formatStatus(status: SmokeRunSummary['status']): string {
  return STATUS_LABELS[status] ?? status;
}

function formatLogs(run: SmokeRunSummary | null): string {
  if (!run || run.logs.length === 0) {
    return '—';
  }

  return run.logs
    .map((log) => {
      const timestamp = formatAgentTimestamp(log.timestamp);
      const level = LEVEL_LABELS[log.level] ?? log.level;
      return `[${timestamp}] (${level}) ${log.message}`;
    })
    .join('\n');
}

function SmokeEndpointsPanel(): JSX.Element {
  const [endpoints, setEndpoints] = useState<SmokeEndpoint[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const [runningId, setRunningId] = useState<string | null>(null);
  const metadataRef = useRef<Record<string, SmokeMetadataEntry>>({});

  useEffect(() => {
    const controller = new AbortController();
    setIsLoading(true);
    setError(null);

    metadataRef.current = loadMetadata();

    fetchSmokeEndpoints(controller.signal)
      .then((response) => {
        setEndpoints(mergeMetadata(response, metadataRef.current));
      })
      .catch((cause) => {
        if (cause instanceof DOMException && cause.name === 'AbortError') {
          return;
        }
        if (cause instanceof ApiError) {
          setError(cause.message);
        } else {
          setError('Falha ao carregar endpoints de smoke.');
        }
      })
      .finally(() => {
        setIsLoading(false);
      });

    return () => controller.abort();
  }, []);

  const sortedEndpoints = useMemo(() => {
    return [...endpoints].sort((a, b) => a.name.localeCompare(b.name));
  }, [endpoints]);

  const handleTrigger = useCallback(async (endpoint: SmokeEndpoint) => {
    setRunningId(endpoint.id);
    setFeedback(null);

    try {
      const run = await triggerSmokeEndpoint(endpoint.id);
      rememberRun(endpoint.id, run);
      metadataRef.current = {
        ...metadataRef.current,
        [endpoint.id]: {
          triggeredAt: run.triggeredAt ?? run.finishedAt ?? null,
          triggeredBy: run.triggeredBy ?? null,
          status: run.status,
          summary: run.summary ?? null,
        },
      };
      setEndpoints((current) =>
        current.map((candidate) => (candidate.id === endpoint.id ? { ...candidate, lastRun: run } : candidate)),
      );
      setFeedback({
        kind: 'success',
        title: `Smoke ${run.runId}`,
        description: `Status: ${formatStatus(run.status)}.`,
      });
    } catch (cause) {
      if (cause instanceof ApiError) {
        setFeedback({ kind: 'error', title: 'Falha ao executar smoke', description: cause.message });
      } else {
        setFeedback({
          kind: 'error',
          title: 'Falha ao executar smoke',
          description: 'Não foi possível iniciar o smoke test.',
        });
      }
    } finally {
      setRunningId(null);
    }
  }, []);

  return (
    <section className="smoke-panel" aria-labelledby="smoke-panel-title">
      <header className="smoke-panel__header">
        <div>
          <h3 id="smoke-panel-title">Smoke endpoints</h3>
          <p>Execute smoke tests para endpoints críticos e acompanhe os logs retornados pela nova API.</p>
        </div>
      </header>

      {feedback ? (
        <div
          className={
            feedback.kind === 'success' ? 'smoke-panel__alert smoke-panel__alert--success' : 'smoke-panel__alert smoke-panel__alert--error'
          }
          role="status"
          aria-live="polite"
        >
          <strong>{feedback.title}</strong>
          {feedback.description ? <p>{feedback.description}</p> : null}
        </div>
      ) : null}

      {error ? (
        <div className="smoke-panel__empty" role="alert">
          {error}
        </div>
      ) : isLoading ? (
        <p className="smoke-panel__empty">Carregando endpoints de smoke…</p>
      ) : sortedEndpoints.length === 0 ? (
        <div className="smoke-panel__empty" role="status">
          Nenhum endpoint de smoke cadastrado.
        </div>
      ) : (
        <div className="smoke-panel__table-wrapper">
          <table className="smoke-panel__table">
            <thead>
              <tr>
                <th scope="col">Endpoint</th>
                <th scope="col">URL</th>
                <th scope="col">Status</th>
                <th scope="col">Último run</th>
                <th scope="col">Autor</th>
                <th scope="col">Logs</th>
                <th scope="col" aria-label="Ações" />
              </tr>
            </thead>
            <tbody>
              {sortedEndpoints.map((endpoint) => {
                const lastRun = endpoint.lastRun ?? null;
                const logs = formatLogs(lastRun);
                return (
                  <tr key={endpoint.id} data-testid={`smoke-row-${endpoint.id}`}>
                    <th scope="row">
                      <div className="smoke-panel__endpoint">
                        <span className="smoke-panel__endpoint-name">{endpoint.name}</span>
                        <span className="smoke-panel__endpoint-description">
                          {endpoint.description ?? 'Sem descrição'}
                        </span>
                      </div>
                    </th>
                    <td>
                      <code className="smoke-panel__code" title={endpoint.url}>
                        {endpoint.url}
                      </code>
                    </td>
                    <td>
                      {lastRun ? <span className={`smoke-panel__status smoke-panel__status--${lastRun.status}`}>{formatStatus(lastRun.status)}</span> : '—'}
                    </td>
                    <td>
                      {lastRun?.triggeredAt ? (
                        <time dateTime={lastRun.triggeredAt}>{formatAgentTimestamp(lastRun.triggeredAt)}</time>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>{lastRun?.triggeredBy ?? '—'}</td>
                    <td>
                      <pre className="smoke-panel__logs" aria-label={`Logs de ${endpoint.name}`}>
                        {logs}
                      </pre>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="smoke-panel__run"
                        onClick={() => handleTrigger(endpoint)}
                        disabled={runningId === endpoint.id}
                      >
                        {runningId === endpoint.id ? 'Executando…' : 'Executar smoke'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default SmokeEndpointsPanel;
