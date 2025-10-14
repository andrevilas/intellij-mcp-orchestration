import { useCallback, useEffect, useMemo, useState } from 'react';

import './App.css';
import type { ProviderSummary, Session } from './api';
import { createSession, fetchProviders, fetchSessions } from './api';
import CommandPalette from './components/CommandPalette';
import Dashboard from './pages/Dashboard';
import FinOps from './pages/FinOps';
import Keys from './pages/Keys';
import Policies from './pages/Policies';
import Routing from './pages/Routing';
import Servers from './pages/Servers';

export interface Feedback {
  kind: 'success' | 'error';
  text: string;
}

const DEFAULT_CLIENT = 'console-web';

const VIEW_DEFINITIONS = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    description: 'Visão executiva com KPIs e alertas operacionais',
    keywords: ['home', 'overview', 'resumo'],
  },
  {
    id: 'servers',
    label: 'Servidores',
    description: 'Controle de lifecycle e telemetria dos MCP servers',
    keywords: ['start', 'stop', 'restart', 'logs'],
  },
  {
    id: 'keys',
    label: 'Chaves',
    description: 'Gestão de credenciais e testes de conectividade',
    keywords: ['credentials', 'access', 'tokens'],
  },
  {
    id: 'policies',
    label: 'Políticas',
    description: 'Templates, rollouts e histórico de políticas',
    keywords: ['guardrails', 'templates', 'rollback'],
  },
  {
    id: 'routing',
    label: 'Routing',
    description: 'Simulações what-if e gestão de estratégias de roteamento',
    keywords: ['rota', 'failover', 'latência'],
  },
  {
    id: 'finops',
    label: 'FinOps',
    description: 'Análises de custo, séries temporais e pareto',
    keywords: ['custos', 'financeiro', 'pareto'],
  },
] as const;

type ViewId = (typeof VIEW_DEFINITIONS)[number]['id'];

function App() {
  const [providers, setProviders] = useState<ProviderSummary[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [initialError, setInitialError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [provisioningId, setProvisioningId] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<ViewId>('dashboard');
  const [isPaletteOpen, setPaletteOpen] = useState(false);

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

  const handleNavigate = useCallback((view: ViewId) => {
    setActiveView(view);
    setPaletteOpen(false);
  }, []);

  const commandOptions = useMemo(
    () =>
      VIEW_DEFINITIONS.map((view) => ({
        id: view.id,
        title: view.label,
        subtitle: view.description,
        keywords: view.keywords,
        onSelect: () => handleNavigate(view.id),
      })),
    [handleNavigate],
  );

  useEffect(() => {
    function handleGlobalShortcut(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen((current) => !current);
      }
    }

    window.addEventListener('keydown', handleGlobalShortcut);
    return () => window.removeEventListener('keydown', handleGlobalShortcut);
  }, []);

  return (
    <div className="app-shell">
      <header className="app-shell__header">
        <div>
          <span className="app-shell__eyebrow">MCP Console</span>
          <h1>Operações unificadas</h1>
        </div>
        <div className="app-shell__actions">
          <nav aria-label="Navegação principal" className="app-shell__nav">
            {VIEW_DEFINITIONS.map((view) => (
              <button
                key={view.id}
                type="button"
                className={activeView === view.id ? 'nav-button nav-button--active' : 'nav-button'}
                aria-pressed={activeView === view.id}
                onClick={() => handleNavigate(view.id)}
              >
                {view.label}
              </button>
            ))}
          </nav>
          <button
            type="button"
            className="command-button"
            aria-haspopup="dialog"
            aria-expanded={isPaletteOpen}
            onClick={() => setPaletteOpen(true)}
          >
            <span className="command-button__text">Command palette</span>
            <kbd aria-hidden="true">⌘K</kbd>
          </button>
        </div>
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
        {activeView === 'finops' && (
          <FinOps providers={providers} isLoading={isLoading} initialError={initialError} />
        )}
      </div>
      <CommandPalette
        isOpen={isPaletteOpen}
        onClose={() => setPaletteOpen(false)}
        commands={commandOptions}
      />
    </div>
  );
}

export default App;
