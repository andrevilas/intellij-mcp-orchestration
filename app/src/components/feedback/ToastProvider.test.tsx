import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { useRef } from 'react';

import { ThemeProvider } from '../../theme/ThemeContext';
import { ToastProvider, useToast } from './ToastProvider';

function TestHarness({ unique }: { unique?: boolean }) {
  const { pushToast } = useToast();
  const counterRef = useRef(0);
  return (
    <button
      type="button"
      onClick={() => {
        counterRef.current += 1;
        const suffix = unique ? ` #${counterRef.current}` : '';
        pushToast({
          title: 'Atualizado',
          description: `Registro sincronizado${suffix}`,
          variant: 'success',
        });
      }}
    >
      Disparar toast
    </button>
  );
}

function ErrorHarness() {
  const { pushToast } = useToast();
  return (
    <button
      type="button"
      onClick={() =>
        pushToast({ title: 'Falha', description: 'Erro ao sincronizar', variant: 'error' })
      }
    >
      Disparar erro
    </button>
  );
}

describe('ToastProvider', () => {
  it('exibe e remove toasts respeitando limites', async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider>
        <ToastProvider maxVisible={2}>
          <TestHarness unique />
        </ToastProvider>
      </ThemeProvider>,
    );

    const trigger = screen.getByRole('button', { name: 'Disparar toast' });
    await user.click(trigger);
    expect(await screen.findByText(/Registro sincronizado/)).toBeInTheDocument();

    await user.click(trigger);
    await user.click(trigger);
    const toasts = screen.getAllByRole('status');
    expect(toasts).toHaveLength(2);
    const viewport = screen.getByRole('region', { name: 'Notificações recentes' });
    expect(viewport).toHaveAttribute('aria-live', 'polite');
  });

  it('evita duplicar toasts idênticos e mantém item único', async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider>
        <ToastProvider>
          <TestHarness />
        </ToastProvider>
      </ThemeProvider>,
    );

    const trigger = screen.getByRole('button', { name: 'Disparar toast' });
    await user.click(trigger);
    await screen.findByText('Registro sincronizado');

    await user.click(trigger);
    await user.click(trigger);

    const toasts = screen.getAllByRole('status');
    expect(toasts).toHaveLength(1);
    expect(toasts[0]).toHaveTextContent(/Registro sincronizado/);
  });

  it('mantém toasts de erro até confirmação manual', async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider>
        <ToastProvider>
          <ErrorHarness />
        </ToastProvider>
      </ThemeProvider>,
    );

    const trigger = screen.getByRole('button', { name: 'Disparar erro' });
    await user.click(trigger);

    const alert = await screen.findByRole('alert', { name: /Falha/ });
    expect(alert).toHaveAttribute('data-variant', 'error');

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(alert).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Dispensar' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
