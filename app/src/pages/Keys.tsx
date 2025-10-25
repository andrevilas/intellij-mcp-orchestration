import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';

import type { ProviderSummary, SecretMetadata, SecretTestResult, SecretValue } from '../api';
import { FileUploadControl, type UploadProgressHandler } from '../components/forms';
import { readFileAsText } from '../utils/readFile';

export interface KeysProps {
  providers: ProviderSummary[];
  secrets: SecretMetadata[];
  isLoading: boolean;
  initialError: string | null;
  onSecretSave: (providerId: string, value: string) => Promise<SecretValue>;
  onSecretDelete: (providerId: string) => Promise<void>;
  onSecretReveal: (providerId: string) => Promise<SecretValue>;
  onSecretTest: (providerId: string) => Promise<SecretTestResult>;
}

type KeyStatus = 'untested' | 'healthy' | 'degraded' | 'error';

type ConnectivityStatus = Exclude<KeyStatus, 'untested'>;

interface KeyState {
  status: KeyStatus;
  isTesting: boolean;
  lastTested: string | null;
  latency: number | null;
  attempts: number;
  message: string | null;
}

interface ProviderFormState {
  isEditing: boolean;
  isLoadingValue: boolean;
  isSaving: boolean;
  isDeleting: boolean;
  hasLoadedValue: boolean;
  inputValue: string;
  error: string | null;
}

const STATUS_CLASS: Record<ConnectivityStatus, string> = {
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

function createFormState(): ProviderFormState {
  return {
    isEditing: false,
    isLoadingValue: false,
    isSaving: false,
    isDeleting: false,
    hasLoadedValue: false,
    inputValue: '',
    error: null,
  };
}

function formatDate(value: string | null | undefined): string {
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

export default function Keys({
  providers,
  secrets,
  isLoading,
  initialError,
  onSecretSave,
  onSecretDelete,
  onSecretReveal,
  onSecretTest,
}: KeysProps) {
  const metadataByProvider = useMemo(() => {
    const map = new Map<string, SecretMetadata>();
    secrets.forEach((item) => map.set(item.provider_id, item));
    return map;
  }, [secrets]);

  const [keyStates, setKeyStates] = useState<Record<string, KeyState>>({});
  const keyStatesRef = useRef<Record<string, KeyState>>({});
  const [formStates, setFormStates] = useState<Record<string, ProviderFormState>>({});
  const formStatesRef = useRef<Record<string, ProviderFormState>>({});

  useEffect(() => {
    keyStatesRef.current = keyStates;
  }, [keyStates]);

  useEffect(() => {
    formStatesRef.current = formStates;
  }, [formStates]);

  useEffect(() => {
    setKeyStates((current) => {
      const next: Record<string, KeyState> = {};
      for (const provider of providers) {
        next[provider.id] = current[provider.id] ?? createDefaultState();
      }
      return next;
    });
  }, [providers]);

  useEffect(() => {
    setFormStates((current) => {
      const next: Record<string, ProviderFormState> = {};
      for (const provider of providers) {
        if (current[provider.id]) {
          next[provider.id] = current[provider.id];
        }
      }
      return next;
    });
  }, [providers]);

  const summary = useMemo(() => {
    const total = providers.length;
    let configured = 0;
    let attention = 0;
    let tested = 0;

    for (const provider of providers) {
      const metadata = metadataByProvider.get(provider.id);
      const hasSecret = metadata?.has_secret ?? false;
      const state = keyStates[provider.id] ?? createDefaultState();

      if (hasSecret) {
        configured += 1;
      } else {
        attention += 1;
      }

      if (state.status !== 'untested') {
        tested += 1;
        if (state.status === 'degraded' || state.status === 'error') {
          attention += 1;
        }
      }
    }

    return { total, configured, attention, tested };
  }, [providers, metadataByProvider, keyStates]);

  function ensureFormState(providerId: string): ProviderFormState {
    return formStatesRef.current[providerId] ?? createFormState();
  }

  async function handleEdit(providerId: string, hasSecret: boolean) {
    const snapshot = ensureFormState(providerId);

    setFormStates((current) => {
      const existing = current[providerId] ?? createFormState();
      return {
        ...current,
        [providerId]: {
          ...existing,
          isEditing: true,
          error: null,
        },
      };
    });

    if (hasSecret && !snapshot.hasLoadedValue) {
      setFormStates((current) => {
        const existing = current[providerId] ?? createFormState();
        return {
          ...current,
          [providerId]: {
            ...existing,
            isLoadingValue: true,
            error: null,
          },
        };
      });

      try {
        const secret = await onSecretReveal(providerId);
        setFormStates((current) => {
          const existing = current[providerId] ?? createFormState();
          return {
            ...current,
            [providerId]: {
              ...existing,
              inputValue: secret.value,
              isLoadingValue: false,
              hasLoadedValue: true,
              error: null,
            },
          };
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Não foi possível carregar a chave.';
        setFormStates((current) => {
          const existing = current[providerId] ?? createFormState();
          return {
            ...current,
            [providerId]: {
              ...existing,
              isLoadingValue: false,
              error: message,
            },
          };
        });
      }
    }

    if (!hasSecret) {
      setFormStates((current) => {
        const existing = current[providerId] ?? createFormState();
        return {
          ...current,
          [providerId]: {
            ...existing,
            inputValue: '',
            hasLoadedValue: true,
            isLoadingValue: false,
            error: null,
          },
        };
      });
    }
  }

  function handleCancel(providerId: string) {
    setFormStates((current) => {
      const existing = current[providerId] ?? createFormState();
      return {
        ...current,
        [providerId]: {
          ...existing,
          isEditing: false,
          isLoadingValue: false,
          isSaving: false,
          isDeleting: false,
          error: null,
        },
      };
    });
  }

  function handleInputChange(providerId: string, value: string) {
    setFormStates((current) => {
      const existing = current[providerId] ?? createFormState();
      return {
        ...current,
        [providerId]: {
          ...existing,
          inputValue: value,
          hasLoadedValue: true,
          error: null,
        },
      };
    });
  }

  const handleSecretFileUpload = useCallback(
    async (providerId: string, file: File, onProgress: UploadProgressHandler) => {
      const content = await readFileAsText(file, onProgress);
      const normalized = content.replace(/\r\n?/g, '\n').trim();
      if (!normalized) {
        throw new Error('Arquivo não contém credencial para registrar.');
      }

      setFormStates((current) => {
        const existing = current[providerId] ?? createFormState();
        return {
          ...current,
          [providerId]: {
            ...existing,
            isEditing: true,
            hasLoadedValue: true,
            inputValue: normalized,
            error: null,
          },
        };
      });

      if (typeof window !== 'undefined') {
        window.requestAnimationFrame(() => {
          const input = document.getElementById(`secret-${providerId}`);
          if (input instanceof HTMLInputElement) {
            input.focus();
            input.select();
          }
        });
      }
    },
    [setFormStates],
  );

  async function handleSave(providerId: string) {
    const snapshot = ensureFormState(providerId);
    const trimmed = snapshot.inputValue.trim();

    if (!trimmed) {
      setFormStates((current) => {
        const existing = current[providerId] ?? createFormState();
        return {
          ...current,
          [providerId]: {
            ...existing,
            error: 'Informe uma chave válida.',
          },
        };
      });
      return;
    }

    setFormStates((current) => {
      const existing = current[providerId] ?? createFormState();
      return {
        ...current,
        [providerId]: {
          ...existing,
          isSaving: true,
          error: null,
        },
      };
    });

    try {
      const record = await onSecretSave(providerId, trimmed);
      setFormStates((current) => {
        const existing = current[providerId] ?? createFormState();
        return {
          ...current,
          [providerId]: {
            ...existing,
            inputValue: record.value,
            isSaving: false,
            isEditing: false,
            hasLoadedValue: true,
            error: null,
          },
        };
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha ao salvar a chave.';
      setFormStates((current) => {
        const existing = current[providerId] ?? createFormState();
        return {
          ...current,
          [providerId]: {
            ...existing,
            isSaving: false,
            error: message,
          },
        };
      });
    }
  }

  async function handleRemove(providerId: string) {
    setFormStates((current) => {
      const existing = current[providerId] ?? createFormState();
      return {
        ...current,
        [providerId]: {
          ...existing,
          isDeleting: true,
          error: null,
        },
      };
    });

    try {
      await onSecretDelete(providerId);
      setFormStates((current) => ({
        ...current,
        [providerId]: {
          ...createFormState(),
        },
      }));
      setKeyStates((current) => ({
        ...current,
        [providerId]: createDefaultState(),
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha ao remover a chave.';
      setFormStates((current) => {
        const existing = current[providerId] ?? createFormState();
        return {
          ...current,
          [providerId]: {
            ...existing,
            isDeleting: false,
            error: message,
          },
        };
      });
    }
  }

  async function handleTest(provider: ProviderSummary) {
    const previous = keyStatesRef.current[provider.id] ?? createDefaultState();
    const nextAttempt = previous.attempts + 1;

    setKeyStates((current) => ({
      ...current,
      [provider.id]: {
        ...previous,
        isTesting: true,
        attempts: nextAttempt,
        message: 'Executando handshake de validação…',
      },
    }));

    try {
      const result = await onSecretTest(provider.id);
      setKeyStates((current) => {
        const existing = current[provider.id] ?? createDefaultState();
        return {
          ...current,
          [provider.id]: {
            ...existing,
            status: result.status,
            isTesting: false,
            lastTested: result.tested_at,
            latency: result.latency_ms,
            attempts: nextAttempt,
            message: result.message,
          },
        };
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Falha ao validar credencial.';
      setKeyStates((current) => {
        const existing = current[provider.id] ?? createDefaultState();
        return {
          ...current,
          [provider.id]: {
            ...existing,
            status: 'error',
            isTesting: false,
            lastTested: new Date().toISOString(),
            latency: null,
            attempts: nextAttempt,
            message,
          },
        };
      });
    }
  }

  const hasProviders = providers.length > 0;

  return (
    <main className="keys">
      <section className="keys__hero">
        <h1>Chaves MCP · gestão segura</h1>
        <p>
          Administre chaves de acesso dos servidores MCP e valide conectividade em tempo real sem sair da console.
          Acompanhe status, escopos e metadados críticos por agente.
        </p>
      </section>

      <section className="keys__summary" aria-label="Resumo de credenciais por provedor">
        <div className="key-stat">
          <span className="key-stat__dot key-stat__dot--total" />
          <div>
            <strong>{summary.total}</strong>
            <span>provedores cadastrados</span>
          </div>
        </div>
        <div className="key-stat key-stat--healthy">
          <span className="key-stat__dot key-stat__dot--healthy" />
          <div>
            <strong>{summary.configured}</strong>
            <span>com credencial ativa</span>
          </div>
        </div>
        <div className="key-stat key-stat--attention">
          <span className="key-stat__dot key-stat__dot--attention" />
          <div>
            <strong>{summary.attention}</strong>
            <span>precisando de atenção</span>
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
      {!isLoading && !initialError && !hasProviders && <p className="info">Cadastre servidores MCP para gerir chaves aqui.</p>}

      <section className="key-grid" aria-live="polite">
        {providers.map((provider) => {
          const metadata = metadataByProvider.get(provider.id);
          const hasSecret = metadata?.has_secret ?? false;
          const keyState = keyStates[provider.id] ?? createDefaultState();
          const formState = formStates[provider.id] ?? createFormState();
          const status: ConnectivityStatus | 'pending' | 'awaiting' = !hasSecret
            ? 'pending'
            : keyState.status === 'untested'
            ? 'awaiting'
            : keyState.status;

          let statusLabel: string;
          let statusClass = 'key-status-badge--muted';

          if (keyState.isTesting) {
            statusLabel = 'Testando…';
            statusClass = 'key-status-badge--testing';
          } else if (status === 'pending') {
            statusLabel = 'Credencial pendente';
            statusClass = 'key-status-badge--warning';
          } else if (status === 'awaiting') {
            statusLabel = 'Aguardando teste';
            statusClass = 'key-status-badge--muted';
          } else {
            statusLabel =
              status === 'healthy'
                ? 'Handshake saudável'
                : status === 'degraded'
                ? 'Latência elevada'
                : 'Erro de handshake';
            statusClass = STATUS_CLASS[status];
          }

          const capabilities = provider.capabilities.length > 0 ? provider.capabilities : ['chat'];
          const lastUpdated = formatDate(metadata?.updated_at);
          const lastTested = formatDate(keyState.lastTested);
          const latency = formatLatency(keyState.latency);
          const baseMessage = hasSecret
            ? 'Sem validações recentes. Execute um teste de conectividade para acompanhar latência.'
            : 'Cadastre uma chave para habilitar testes e provisionamento.';
          const message = keyState.message ?? baseMessage;
          const description = provider.description || provider.command;
          const isTestDisabled = !hasSecret || formState.isEditing || keyState.isTesting;
          const editLabel = hasSecret ? 'Atualizar chave' : 'Configurar chave';

          const secretFieldId = `secret-${provider.id}`;
          const secretHintId = formState.isLoadingValue ? `${secretFieldId}-hint` : undefined;
          const secretErrorId = formState.error ? `${secretFieldId}-error` : undefined;
          const secretDescribedBy = [secretHintId, secretErrorId].filter(Boolean).join(' ') || undefined;

          return (
            <article key={provider.id} className="key-card">
              <header className="key-card__header">
                <div>
                  <h2>{provider.name}</h2>
                  {description && <p className="key-card__meta">{description}</p>}
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
                      {capabilities.slice(0, 3).map((scope) => (
                        <li key={`${provider.id}-${scope}`}>{scope.toLowerCase()}</li>
                      ))}
                      {capabilities.length > 3 && <li key={`${provider.id}-more`}>…</li>}
                    </ul>
                  </dd>
                </div>
                <div>
                  <dt>Transporte</dt>
                  <dd>{provider.transport.toUpperCase()}</dd>
                </div>
                <div>
                  <dt>Atualizada em</dt>
                  <dd>{lastUpdated}</dd>
                </div>
                <div>
                  <dt>Último teste</dt>
                  <dd>{lastTested}</dd>
                </div>
                <div>
                  <dt>Latência</dt>
                  <dd>{latency}</dd>
                </div>
              </dl>

              <p className="key-card__message">{message}</p>

              {formState.isEditing ? (
                <form
                  className="key-form"
                  onSubmit={async (event) => {
                    event.preventDefault();
                    await handleSave(provider.id);
                  }}
                  noValidate
                >
                  <label className="key-form__label" htmlFor={secretFieldId}>
                    Chave de acesso
                  </label>
                  <input
                    id={secretFieldId}
                    type="password"
                    className={clsx('key-form__input', { 'is-invalid': Boolean(formState.error) })}
                    value={formState.inputValue}
                    onChange={(event) => handleInputChange(provider.id, event.target.value)}
                    placeholder="sk-..."
                    autoComplete="off"
                    disabled={formState.isSaving || formState.isLoadingValue}
                    aria-describedby={secretDescribedBy}
                    aria-invalid={formState.error ? 'true' : 'false'}
                  />
                  {formState.isLoadingValue && secretHintId && (
                    <p id={secretHintId} className="key-form__hint">
                      Carregando chave atual…
                    </p>
                  )}
                  {formState.error && (
                    <p id={secretErrorId} className="key-form__error" role="alert">
                      {formState.error}
                    </p>
                  )}
                  <FileUploadControl
                    title="Importar chave do provedor"
                    description="Carregue arquivo local para preencher automaticamente a credencial."
                    accept=".txt,.json,.env,.pem"
                    maxSizeBytes={64 * 1024}
                    idleMessage="Ou selecione um arquivo com a credencial."
                    actionLabel="Carregar chave"
                    onUpload={(file, progress) => handleSecretFileUpload(provider.id, file, progress)}
                  />
                  <div className="key-form__actions">
                    <button
                      type="submit"
                      className="key-form__primary"
                      disabled={formState.isSaving || formState.isLoadingValue}
                    >
                      {formState.isSaving ? 'Salvando…' : 'Salvar agora'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCancel(provider.id)}
                      disabled={formState.isSaving || formState.isLoadingValue}
                    >
                      Cancelar
                    </button>
                    {hasSecret && (
                      <button
                        type="button"
                        className="key-remove-button"
                        onClick={() => handleRemove(provider.id)}
                        disabled={formState.isSaving || formState.isLoadingValue || formState.isDeleting}
                      >
                        {formState.isDeleting ? 'Removendo…' : 'Remover chave'}
                      </button>
                    )}
                  </div>
                </form>
              ) : (
                <div className="key-card__toolbar">
                  <button
                    type="button"
                    className="key-edit-button"
                    onClick={() => handleEdit(provider.id, hasSecret)}
                    disabled={formState.isSaving || formState.isLoadingValue || formState.isDeleting}
                  >
                    {editLabel}
                  </button>
                  <button
                    type="button"
                    className="key-test-button"
                    onClick={() => handleTest(provider)}
                    disabled={isTestDisabled}
                  >
                    {keyState.isTesting ? 'Testando…' : 'Testar conectividade'}
                  </button>
                </div>
              )}
            </article>
          );
        })}
      </section>
    </main>
  );
}
