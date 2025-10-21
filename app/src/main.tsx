import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './icons';
import './styles/index.scss';
import './styles/base.scss';
import { ThemeProvider } from './theme/ThemeContext';

type FixtureStatus = 'ready' | 'error' | 'disabled';

declare global {
  // eslint-disable-next-line no-var
  var __CONSOLE_MCP_FIXTURES__: FixtureStatus | undefined;
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

  const { worker } = await import('./mocks/browser');
  await worker.start({
    onUnhandledRequest: 'error',
    serviceWorker: {
      url: '/mockServiceWorker.js',
    },
  });
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
