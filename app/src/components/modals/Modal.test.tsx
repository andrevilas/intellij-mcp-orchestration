import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import ConfirmationModal from './ConfirmationModal';
import FormModal from './FormModal';

function setupPortal() {
  const root = document.createElement('div');
  root.setAttribute('id', 'modal-root');
  document.body.append(root);
  return () => root.remove();
}

describe('Modal components', () => {
  it('executa callbacks em ConfirmationModal', async () => {
    const cleanup = setupPortal();
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const user = userEvent.setup();

    render(
      <ConfirmationModal
        isOpen
        title="Remover servidor"
        description="Esta ação é irreversível"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Confirmar' }));
    expect(onConfirm).toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onCancel).toHaveBeenCalled();

    cleanup();
  });

  it('mantém foco preso dentro do FormModal até submit/cancel', async () => {
    const cleanup = setupPortal();
    const onSubmit = vi.fn();
    const onCancel = vi.fn();
    const user = userEvent.setup();

    render(
      <FormModal
        isOpen
        title="Editar rota"
        onSubmit={onSubmit}
        onCancel={onCancel}
      >
        <label>
          Nome
          <input defaultValue="Fallback" />
        </label>
      </FormModal>,
    );

    const input = screen.getByDisplayValue('Fallback');
    expect(input).toHaveFocus();

    await user.tab();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Salvar' })).toHaveFocus();
    await user.tab();
    expect(input).toHaveFocus();

    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onCancel).toHaveBeenCalled();

    cleanup();
  });
});
