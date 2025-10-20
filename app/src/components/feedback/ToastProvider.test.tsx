import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { ThemeProvider } from '../../theme/ThemeContext';
import { ToastProvider, useToast } from './ToastProvider';

function TestHarness() {
  const { pushToast } = useToast();
  return (
    <button
      type="button"
      onClick={() =>
        pushToast({ title: 'Atualizado', description: 'Registro sincronizado', variant: 'success' })
      }
    >
      Disparar toast
    </button>
  );
}

describe('ToastProvider', () => {
  it('exibe e remove toasts respeitando limites', async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider>
        <ToastProvider maxVisible={2}>
          <TestHarness />
        </ToastProvider>
      </ThemeProvider>,
    );

    const trigger = screen.getByRole('button', { name: 'Disparar toast' });
    await user.click(trigger);
    expect(await screen.findByText('Registro sincronizado')).toBeInTheDocument();

    await user.click(trigger);
    await user.click(trigger);
    const toasts = screen.getAllByRole('status');
    expect(toasts).toHaveLength(2);
    const viewport = screen.getByRole('region', { name: 'Notificações recentes' });
    expect(viewport).toHaveAttribute('aria-live', 'polite');
  });
});
