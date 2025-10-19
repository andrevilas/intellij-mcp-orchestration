import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './icons';
import './styles/index.scss';
import './styles/base.scss';
import { ThemeProvider } from './theme/ThemeContext';

async function enableMocks(): Promise<void> {
  if (import.meta.env.VITE_ENABLE_API_MOCKS === 'false') {
    return;
  }

  if (!import.meta.env.DEV && import.meta.env.MODE !== 'test') {
    return;
  }

  const { worker } = await import('./mocks/browser');
  await worker.start({ onUnhandledRequest: 'bypass' });
}

async function bootstrap(): Promise<void> {
  try {
    await enableMocks();
  } catch (error) {
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
