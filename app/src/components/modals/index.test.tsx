import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { ProviderSummary } from '../../api';
import ProvisioningDialog from '../ProvisioningDialog';
import { ToastProvider } from '../feedback/ToastProvider';
import ConfirmationModal from './ConfirmationModal';
import FormModal from './FormModal';

function setupPortal() {
  const root = document.createElement('div');
  root.setAttribute('id', 'modal-root');
  document.body.append(root);
  return () => root.remove();
}

describe('modal components', () => {
  it('exige confirmação dupla e reseta estado após cancelamento', async () => {
    const cleanupPortal = setupPortal();
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

    const confirmButton = screen.getByRole('button', { name: 'Confirmar' });
    await user.click(confirmButton);
    await screen.findByText('Clique novamente para confirmar.');
    await user.click(screen.getByRole('button', { name: 'Confirmar agora' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Confirmar' })).toBeInTheDocument();
    });

    cleanupPortal();
  });

  it('mantém trap de foco dentro do FormModal', async () => {
    const cleanupPortal = setupPortal();
    const onSubmit = vi.fn();
    const onCancel = vi.fn();
    const user = userEvent.setup();

    render(
      <FormModal isOpen title="Editar rota" onSubmit={onSubmit} onCancel={onCancel}>
        <label>
          Nome
          <input defaultValue="Fallback" data-autofocus="true" />
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

    cleanupPortal();
  });

  it('anuncia validações e confirmações únicas no ProvisioningDialog', async () => {
    const cleanupPortal = setupPortal();
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const provider: ProviderSummary = {
      id: 'provider-1',
      name: 'Gemini',
      command: 'gemini',
      description: 'Servidor Gemini',
      tags: ['llm'],
      capabilities: ['chat'],
      transport: 'grpc',
    };

    render(
      <ToastProvider>
        <ProvisioningDialog
          isOpen
          provider={provider}
          isSubmitting={false}
          onCancel={onCancel}
          onConfirm={onConfirm}
        />
      </ToastProvider>,
    );

    const reasonInput = await screen.findByDisplayValue(`Provisionamento para ${provider.name}`);
    await user.clear(reasonInput);
    await user.click(screen.getByRole('button', { name: 'Provisionar com overrides' }));

    expect(onConfirm).not.toHaveBeenCalled();
    expect(await screen.findByText('Descreva o motivo do provisionamento.')).toBeInTheDocument();
    expect(
      await screen.findByRole('alert', {
        name: /Não foi possível enviar overrides; revise os campos destacados./i,
      }),
    ).toBeInTheDocument();

    await user.type(reasonInput, 'Expansão Europa');
    await user.click(screen.getByRole('button', { name: 'Provisionar com overrides' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(
      await screen.findByRole('status', {
        name: /Provisionamento enviado para Gemini com motivo "Expansão Europa"./i,
      }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(
      await screen.findByRole('alert', {
        name: /Provisionamento cancelado para Gemini./i,
      }),
    ).toBeInTheDocument();

    cleanupPortal();
  });
});
