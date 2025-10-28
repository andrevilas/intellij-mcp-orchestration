import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/index.scss';
import './styles/base.scss';
import { ThemeProvider } from './theme/ThemeContext';

type FixtureStatus = 'ready' | 'error' | 'disabled';

declare global {
  // eslint-disable-next-line no-var
  var __CONSOLE_MCP_FIXTURES__: FixtureStatus | undefined;
  interface Window {
    __mswWorker?: {
      stop(): Promise<void>;
      start(): Promise<void>;
    };
  }
}

const setFixtureStatus = (status: FixtureStatus): void => {
  try {
    globalThis.__CONSOLE_MCP_FIXTURES__ = status;
  } catch (error) {
    console.warn('Unable to persist fixture status flag', error);
  }
};

async function enableMocks(): Promise<void> {
  const isFixtureEnv = import.meta.env.VITE_CONSOLE_USE_FIXTURES;
  const isFixtureMode = isFixtureEnv === true || isFixtureEnv === 'true';
  if (!isFixtureMode) {
    setFixtureStatus('disabled');
    return;
  }

  if (!import.meta.env.DEV && import.meta.env.MODE !== 'test') {
    setFixtureStatus('disabled');
    return;
  }

  const isAutomation =
    typeof navigator !== 'undefined' &&
    typeof navigator.webdriver === 'boolean' &&
    navigator.webdriver === true;

  if (isAutomation) {
    console.info('Automation environment detected; inicializando worker MSW para fixtures.');
  }

  const { worker } = await import('./mocks/browser');
  const workerOptions = {
    onUnhandledRequest: 'error' as const,
    serviceWorker: {
      url: '/mockServiceWorker.js',
    },
  };
  await worker.start(workerOptions);
  if (typeof window !== 'undefined') {
    window.__mswWorker = {
      async stop() {
        await worker.stop();
      },
      async start() {
        await worker.start(workerOptions);
      },
    };
  }
  setFixtureStatus('ready');
}

async function bootstrap(): Promise<void> {
  try {
    await enableMocks();
  } catch (error) {
    setFixtureStatus('error');
    console.error('Failed to initialize API mocks', error);
  }

  const rootElement = document.getElementById('root');

  if (!rootElement) {
    throw new Error('Root element not found');
  }

  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </React.StrictMode>,
  );
}

void bootstrap();
