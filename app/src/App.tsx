import { useEffect, useMemo, useState } from 'react';

import './App.css';
import type { ProviderSummary, Session } from './api';
import { apiBase, createSession, fetchProviders, fetchSessions } from './api';

interface Feedback {
  kind: 'success' | 'error';
  text: string;
}

const DEFAULT_CLIENT = 'console-web';

function App() {
  const [providers, setProviders] = useState<ProviderSummary[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [initialError, setInitialError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [provisioningId, setProvisioningId] = useState<string | null>(null);

  const formattedApiBase = useMemo(() => apiBase || '/api/v1', []);

  useEffect(() => {
    const controller = new AbortController();

    async function bootstrap() {
      try {
        setIsLoading(true);
        const [providerList, sessionList] = await Promise.all([
          fetchProviders(controller.signal),
          fetchSessions(controller.signal),
        ]);

        setProviders(providerList);
        setSessions(
          sessionList
            .slice()
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
        );
        setInitialError(null);
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }
        const message = error instanceof Error ? error.message : 'Falha ao carregar dados iniciais';
        setInitialError(message);
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }

    void bootstrap();

    return () => controller.abort();
  }, []);

  async function handleProvision(provider: ProviderSummary) {
    const controller = new AbortController();
    setProvisioningId(provider.id);
    setFeedback(null);

    try {
      const response = await createSession(
        provider.id,
        {
          reason: 'Provisionamento disparado pela Console MCP',
          client: DEFAULT_CLIENT,
        },
        controller.signal,
      );

      setSessions((current) => [response.session, ...current]);
      setFeedback({
        kind: 'success',
        text: `Sessão ${response.session.id} criada para ${provider.name}.`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha ao criar sessão';
      setFeedback({ kind: 'error', text: message });
    } finally {
      setProvisioningId(null);
    }
  }

  const hasProviders = providers.length > 0;
  const hasSessions = sessions.length > 0;

  return (
    <main className="app">
      <section className="hero">
        <h1>MCP Console</h1>
        <p>
          Interface web para orquestrar servidores MCP locais. Esta etapa conecta o frontend ao protótipo FastAPI e permite
          testar provisionamentos em memória.
        </p>
        <small className="api-endpoint">API base atual: {formattedApiBase}</small>
      </section>

      <section className="providers">
        <header className="section-header">
          <div>
            <h2>Provedores registrados</h2>
            <p>Lista carregada do manifesto versionado em {"config/console-mcp/servers.example.json"}.</p>
          </div>
        </header>

        {isLoading && <p className="info">Carregando provedores…</p>}
        {initialError && <p className="error">{initialError}</p>}

        {!isLoading && !initialError && !hasProviders && (
          <p className="info">Nenhum provedor configurado ainda. Ajuste o manifesto e recarregue.</p>
        )}

        <div className="provider-grid">
          {providers.map((provider) => (
            <article key={provider.id} className="provider-card">
              <header>
                <div>
                  <h3>{provider.name}</h3>
                  <p className="provider-description">{provider.description || 'Sem descrição fornecida.'}</p>
                </div>
                <span className={`availability ${provider.is_available ? 'online' : 'offline'}`}>
                  {provider.is_available ? 'Disponível' : 'Indisponível'}
                </span>
              </header>

              <dl className="provider-meta">
                <div>
                  <dt>Identificador</dt>
                  <dd>{provider.id}</dd>
                </div>
                <div>
                  <dt>Comando</dt>
                  <dd>
                    <code>{provider.command}</code>
                  </dd>
                </div>
                <div>
                  <dt>Transporte</dt>
                  <dd>{provider.transport}</dd>
                </div>
              </dl>

              <div className="badges">
                {provider.capabilities.map((capability) => (
                  <span key={capability} className="badge capability">
                    {capability}
                  </span>
                ))}
                {provider.tags.map((tag) => (
                  <span key={tag} className="badge tag">
                    #{tag}
                  </span>
                ))}
              </div>

              <button
                className="provision-button"
                onClick={() => handleProvision(provider)}
                disabled={provisioningId === provider.id}
              >
                {provisioningId === provider.id ? 'Provisionando…' : 'Criar sessão de provisionamento'}
              </button>
            </article>
          ))}
        </div>
      </section>

      {feedback && <div className={`feedback ${feedback.kind}`}>{feedback.text}</div>}

      <section className="sessions">
        <header className="section-header">
          <div>
            <h2>Histórico recente de sessões</h2>
            <p>Dados retornados pelo endpoint `/api/v1/sessions`.</p>
          </div>
        </header>

        {!hasSessions && <p className="info">Ainda não há sessões registradas nesta execução.</p>}

        {hasSessions && (
          <ul className="session-list">
            {sessions.map((session) => (
              <li key={session.id} className="session-item">
                <div className="session-header">
                  <span className="session-id">{session.id}</span>
                  <span className="session-status">{session.status}</span>
                </div>
                <div className="session-meta">
                  <span>
                    Provedor: <strong>{session.provider_id}</strong>
                  </span>
                  <span>
                    Criado em: {new Date(session.created_at).toLocaleString()}
                  </span>
                  {session.reason && <span>Motivo: {session.reason}</span>}
                  {session.client && <span>Cliente: {session.client}</span>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

export default App;
