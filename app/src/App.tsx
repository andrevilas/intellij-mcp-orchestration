import { useEffect, useState } from 'react';

import './App.css';
import type { ProviderSummary, Session } from './api';
import { createSession, fetchProviders, fetchSessions } from './api';
import Dashboard from './pages/Dashboard';

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
    <Dashboard
      providers={providers}
      sessions={sessions}
      isLoading={isLoading}
      initialError={initialError}
      feedback={feedback}
      provisioningId={provisioningId}
      onProvision={handleProvision}
    />
  );
}

export default App;
