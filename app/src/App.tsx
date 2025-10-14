import { useEffect, useState } from 'react';

import './App.css';
import type { ProviderSummary, Session } from './api';
import { createSession, fetchProviders, fetchSessions } from './api';
import Dashboard from './pages/Dashboard';
import Keys from './pages/Keys';
import Policies from './pages/Policies';
import Routing from './pages/Routing';
import Servers from './pages/Servers';

export interface Feedback {
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
  const [activeView, setActiveView] = useState<'dashboard' | 'servers' | 'keys' | 'policies' | 'routing'>('dashboard');

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

  return (
    <div className="app-shell">
      <header className="app-shell__header">
        <div>
          <span className="app-shell__eyebrow">MCP Console</span>
          <h1>Operações unificadas</h1>
        </div>
        <nav aria-label="Navegação principal" className="app-shell__nav">
          <button
            type="button"
            className={activeView === 'dashboard' ? 'nav-button nav-button--active' : 'nav-button'}
            aria-pressed={activeView === 'dashboard'}
            onClick={() => setActiveView('dashboard')}
          >
            Dashboard
          </button>
          <button
            type="button"
            className={activeView === 'servers' ? 'nav-button nav-button--active' : 'nav-button'}
            aria-pressed={activeView === 'servers'}
            onClick={() => setActiveView('servers')}
          >
            Servidores
          </button>
          <button
            type="button"
            className={activeView === 'keys' ? 'nav-button nav-button--active' : 'nav-button'}
            aria-pressed={activeView === 'keys'}
            onClick={() => setActiveView('keys')}
          >
            Chaves
          </button>
          <button
            type="button"
            className={activeView === 'policies' ? 'nav-button nav-button--active' : 'nav-button'}
            aria-pressed={activeView === 'policies'}
            onClick={() => setActiveView('policies')}
          >
            Políticas
          </button>
          <button
            type="button"
            className={activeView === 'routing' ? 'nav-button nav-button--active' : 'nav-button'}
            aria-pressed={activeView === 'routing'}
            onClick={() => setActiveView('routing')}
          >
            Routing
          </button>
        </nav>
      </header>
      <div className="app-shell__content" role="region" aria-live="polite">
        {activeView === 'dashboard' && (
          <Dashboard
            providers={providers}
            sessions={sessions}
            isLoading={isLoading}
            initialError={initialError}
            feedback={feedback}
            provisioningId={provisioningId}
            onProvision={handleProvision}
          />
        )}
        {activeView === 'servers' && (
          <Servers providers={providers} sessions={sessions} isLoading={isLoading} initialError={initialError} />
        )}
        {activeView === 'keys' && <Keys providers={providers} isLoading={isLoading} initialError={initialError} />}
        {activeView === 'policies' && (
          <Policies providers={providers} isLoading={isLoading} initialError={initialError} />
        )}
        {activeView === 'routing' && (
          <Routing providers={providers} isLoading={isLoading} initialError={initialError} />
        )}
      </div>
    </div>
  );
}

export default App;
