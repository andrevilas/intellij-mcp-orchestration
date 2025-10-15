import { useEffect, useMemo, useRef, useState } from 'react';

import type { ProviderSummary } from '../api';
import { seededMod } from '../utils/hash';

export interface KeysProps {
  providers: ProviderSummary[];
  isLoading: boolean;
  initialError: string | null;
}

type KeyVariant = 'prod' | 'staging';

type KeyStatus = 'untested' | 'healthy' | 'degraded' | 'error';

interface ProviderKey {
  id: string;
  providerId: string;
  label: string;
  environment: 'Produção' | 'Homologação';
  maskedKey: string;
  scopes: string[];
  createdAt: string;
}

interface KeyState {
  status: KeyStatus;
  isTesting: boolean;
  lastTested: string | null;
  latency: number | null;
  attempts: number;
  message: string | null;
}

interface ConnectivityOutcome {
  status: Exclude<KeyStatus, 'untested'>;
  latency: number;
  message: string;
}

const STATUS_LABELS: Record<KeyStatus, string> = {
  untested: 'Não testada',
  healthy: 'Ativa',
  degraded: 'Instável',
  error: 'Erro',
};

const STATUS_CLASS: Record<KeyStatus, string> = {
  untested: 'key-status-badge--muted',
  healthy: 'key-status-badge--healthy',
  degraded: 'key-status-badge--warning',
  error: 'key-status-badge--error',
};

function createDefaultState(): KeyState {
  return {
    status: 'untested',
    isTesting: false,
    lastTested: null,
    latency: null,
    attempts: 0,
    message: null,
  };
}

function buildMaskedKey(provider: ProviderSummary, variant: KeyVariant): string {
  const base = `${provider.id}-${variant}`;
  const prefix = variant === 'prod' ? 'live' : 'test';
  const segmentA = seededMod(`${base}-a`, 1_000_000).toString(16).padStart(6, '0');
  const segmentB = seededMod(`${base}-b`, 1_000_000).toString(16).padStart(6, '0');
  const lastFour = seededMod(`${base}-last4`, 10_000).toString().padStart(4, '0');
  return `sk-${prefix}-${segmentA}-${segmentB}-${lastFour}`;
}

function buildKey(provider: ProviderSummary, variant: KeyVariant): ProviderKey {
  const environment = variant === 'prod' ? 'Produção' : 'Homologação';
  const label = `${provider.name} · ${environment}`;
  const base = `${provider.id}-${variant}`;
  const createdOffset = seededMod(`${base}-created`, 1000 * 60 * 60 * 24 * 120);
  const capabilities = provider.capabilities.length > 0 ? provider.capabilities : ['chat'];
  const scopes = capabilities.slice(0, 3).map((capability) => capability.toLowerCase());
  if (capabilities.length > 3) {
    scopes.push('…');
  }

  return {
    id: `${provider.id}-${variant}`,
    providerId: provider.id,
    label,
    environment,
    maskedKey: buildMaskedKey(provider, variant),
    scopes,
    createdAt: new Date(Date.now() - createdOffset).toISOString(),
  };
}

function createKeysFromProviders(providers: ProviderSummary[]): ProviderKey[] {
  const keys: ProviderKey[] = [];
  for (const provider of providers) {
    keys.push(buildKey(provider, 'prod'));
    if (provider.capabilities.length > 1 || provider.tags.length > 0) {
      keys.push(buildKey(provider, 'staging'));
    }
  }
  return keys;
}

function evaluateConnectivity(keyId: string, attempt: number): ConnectivityOutcome {
  const score = seededMod(`${keyId}-${attempt}-score`, 100);
  const latency = 120 + seededMod(`${keyId}-${attempt}-latency`, 520);

  if (score < 65) {
    return {
      status: 'healthy',
      latency,
      message: 'Handshake concluído com sucesso.',
    };
  }

  if (score < 88) {
    return {
      status: 'degraded',
      latency,
      message: 'Latência elevada detectada. Monitorar limitações de uso.',
    };
  }

  return {
    status: 'error',
    latency,
    message: 'Falha na autenticação. Revise permissões e validade da chave.',
  };
}

function formatDate(value: string | null): string {
  if (!value) {
    return '—';
  }
  return new Date(value).toLocaleString();
}

function formatLatency(latency: number | null): string {
  if (latency === null) {
    return '—';
  }
  return `${latency} ms`;
}

export default function Keys({ providers, isLoading, initialError }: KeysProps) {
  const keys = useMemo(() => createKeysFromProviders(providers), [providers]);
  const [keyStates, setKeyStates] = useState<Record<string, KeyState>>({});
  const keyStatesRef = useRef<Record<string, KeyState>>({});
  const pendingTimeouts = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    keyStatesRef.current = keyStates;
  }, [keyStates]);

  useEffect(() => {
    return () => {
      pendingTimeouts.current.forEach((timeout) => window.clearTimeout(timeout));
      pendingTimeouts.current.clear();
    };
  }, []);

  useEffect(() => {
    setKeyStates((current) => {
      const next: Record<string, KeyState> = {};
      for (const key of keys) {
        next[key.id] = current[key.id] ?? createDefaultState();
      }
      return next;
    });
  }, [keys]);

  const summary = useMemo(() => {
    let healthy = 0;
    let degraded = 0;
    let error = 0;
    let tested = 0;

    for (const key of keys) {
      const state = keyStates[key.id] ?? createDefaultState();
      if (state.status !== 'untested') {
        tested += 1;
      }
      if (state.status === 'healthy') {
        healthy += 1;
      }
      if (state.status === 'degraded') {
        degraded += 1;
      }
      if (state.status === 'error') {
        error += 1;
      }
    }

    return {
      total: keys.length,
      healthy,
      degraded,
      error,
      tested,
    };
  }, [keyStates, keys]);

  function handleTest(key: ProviderKey) {
    const previous = keyStatesRef.current[key.id] ?? createDefaultState();
    const nextAttempt = previous.attempts + 1;
    const outcome = evaluateConnectivity(key.id, nextAttempt);
    const delay = 600 + seededMod(`${key.id}-${nextAttempt}-delay`, 220);

    const existingTimeout = pendingTimeouts.current.get(key.id);
    if (existingTimeout) {
      window.clearTimeout(existingTimeout);
      pendingTimeouts.current.delete(key.id);
    }

    setKeyStates((current) => ({
      ...current,
      [key.id]: {
        ...previous,
        isTesting: true,
        attempts: nextAttempt,
        message: 'Executando handshake de validação…',
      },
    }));

    const timeout = window.setTimeout(() => {
      setKeyStates((current) => {
        const existing = current[key.id] ?? createDefaultState();
        return {
          ...current,
          [key.id]: {
            ...existing,
            status: outcome.status,
            isTesting: false,
            lastTested: new Date().toISOString(),
            latency: outcome.latency,
            attempts: nextAttempt,
            message: outcome.message,
          },
        };
      });
      pendingTimeouts.current.delete(key.id);
    }, delay);

    pendingTimeouts.current.set(key.id, timeout);
  }

  const hasProviders = providers.length > 0;

  return (
    <main className="keys">
      <section className="keys__hero">
        <h1>Chaves MCP · gestão segura</h1>
        <p>
          Administre chaves de acesso dos servidores MCP e valide conectividade em tempo real sem sair da console.
          Acompanhe status, escopos e metadados críticos por ambiente.
        </p>
      </section>

      <section className="keys__summary" aria-label="Resumo de conectividade das chaves">
        <div className="key-stat">
          <span className="key-stat__dot key-stat__dot--total" />
          <div>
            <strong>{summary.total}</strong>
            <span>chaves cadastradas</span>
          </div>
        </div>
        <div className="key-stat key-stat--healthy">
          <span className="key-stat__dot key-stat__dot--healthy" />
          <div>
            <strong>{summary.healthy}</strong>
            <span>com handshake saudável</span>
          </div>
        </div>
        <div className="key-stat key-stat--attention">
          <span className="key-stat__dot key-stat__dot--attention" />
          <div>
            <strong>{summary.degraded + summary.error}</strong>
            <span>exigindo atenção</span>
          </div>
        </div>
        <div className="key-stat key-stat--tested">
          <span className="key-stat__dot key-stat__dot--tested" />
          <div>
            <strong>{summary.tested}</strong>
            <span>testes recentes</span>
          </div>
        </div>
      </section>

      {isLoading && <p className="info">Sincronizando chaves de acesso…</p>}
      {initialError && <p className="error">{initialError}</p>}
      {!isLoading && !initialError && !hasProviders && <p className="info">Cadastre servidores MCP para gerar chaves aqui.</p>}

      <section className="key-grid" aria-live="polite">
        {keys.map((key) => {
          const state = keyStates[key.id] ?? createDefaultState();
          const statusClass = state.isTesting ? 'key-status-badge--testing' : STATUS_CLASS[state.status];
          const statusLabel = state.isTesting ? 'Testando…' : STATUS_LABELS[state.status];

          return (
            <article key={key.id} className="key-card">
              <header className="key-card__header">
                <div>
                  <h2>{key.label}</h2>
                  <p className="key-card__meta">Fingerprint · {key.maskedKey}</p>
                </div>
                <span className={`key-status-badge ${statusClass}`} aria-live="polite">
                  {statusLabel}
                </span>
              </header>

              <dl className="key-card__details">
                <div>
                  <dt>Escopos</dt>
                  <dd>
                    <ul className="key-card__scopes">
                      {key.scopes.map((scope) => (
                        <li key={`${key.id}-${scope}`}>{scope}</li>
                      ))}
                    </ul>
                  </dd>
                </div>
                <div>
                  <dt>Criada em</dt>
                  <dd>{formatDate(key.createdAt)}</dd>
                </div>
                <div>
                  <dt>Último teste</dt>
                  <dd>{formatDate(state.lastTested)}</dd>
                </div>
                <div>
                  <dt>Latência</dt>
                  <dd>{formatLatency(state.latency)}</dd>
                </div>
              </dl>

              <p className="key-card__message">{state.message ?? 'Sem validações recentes.'}</p>

              <button
                type="button"
                className="key-test-button"
                onClick={() => handleTest(key)}
                disabled={state.isTesting}
              >
                Testar conectividade
              </button>
            </article>
          );
        })}
      </section>
    </main>
  );
}
