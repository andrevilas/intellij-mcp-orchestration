import { useState } from 'react';

import Button from '../actions/Button';
import { ToastProvider, useToast } from './ToastProvider';
import StoryThemeProvider from '../story-utils/StoryThemeProvider';

const meta = {
  title: 'Feedback/Toast',
  component: ToastProvider,
  tags: ['ui-kit', 'tokens', 'a11y'],
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Toasts empilhados respeitam `--mcp-z-toast`, mantêm `aria-live="polite"` e expõem `dismissToast` para controle.',
      },
    },
  },
};

export default meta;

function ToastHarness(): JSX.Element {
  const { pushToast } = useToast();
  const [count, setCount] = useState(0);

  const trigger = (variant: 'success' | 'info' | 'warning' | 'error') => {
    const next = count + 1;
    setCount(next);
    pushToast({
      title: `Notificação ${next}`,
      description: `Exemplo ${variant} ${next}`,
      variant,
    });
  };

  return (
    <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
      <Button variant="primary" onClick={() => trigger('success')}>
        Sucesso
      </Button>
      <Button variant="secondary" onClick={() => trigger('info')}>
        Info
      </Button>
      <Button variant="danger" onClick={() => trigger('warning')}>
        Aviso
      </Button>
      <Button variant="outline" onClick={() => trigger('error')}>
        Erro
      </Button>
    </div>
  );
}

export const Light = {
  render: () => (
    <StoryThemeProvider theme="light">
      <ToastProvider>
        <ToastHarness />
      </ToastProvider>
    </StoryThemeProvider>
  ),
};

export const Dark = {
  render: () => (
    <StoryThemeProvider theme="dark">
      <ToastProvider>
        <ToastHarness />
      </ToastProvider>
    </StoryThemeProvider>
  ),
};
