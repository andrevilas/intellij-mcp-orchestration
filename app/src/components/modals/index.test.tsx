import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { useState } from 'react';

import type { ProviderSummary } from '../../api';
import ProvisioningDialog from '../ProvisioningDialog';
import { ToastProvider } from '../feedback/ToastProvider';
import ConfirmationModal from './ConfirmationModal';
import FormModal from './FormModal';
import WizardModal from './WizardModal';

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

  it('guia progressão no WizardModal, reseta armamento e exige dupla confirmação', async () => {
    const cleanupPortal = setupPortal();
    const user = userEvent.setup();
    const onComplete = vi.fn();

    function WizardHarness() {
      const [ack, setAck] = useState(false);
      return (
        <WizardModal
          isOpen
          title="Ativar agente governado"
          description="Fluxo com validação e dupla confirmação."
          onClose={() => undefined}
          confirmHint="Clique para habilitar a confirmação final."
          confirmArmedHint="Clique novamente para confirmar."
          onComplete={() => {
            if (!ack) {
              return false;
            }
            onComplete();
            return true;
          }}
          steps={[
            {
              id: 'detalhes',
              title: 'Detalhes',
              content: <input defaultValue="Agente" data-autofocus="true" />,
            },
            {
              id: 'escopo',
              title: 'Escopo',
              content: <p>Configuração de escopo</p>,
            },
            {
              id: 'revisao',
              title: 'Revisão',
              content: (
                <label>
                  <input
                    type="checkbox"
                    checked={ack}
                    onChange={(event) => setAck(event.target.checked)}
                  />
                  Revisão concluída
                </label>
              ),
            },
          ]}
        />
      );
    }

    render(<WizardHarness />);

    await user.click(screen.getByRole('button', { name: 'Continuar' }));
    await user.click(screen.getByRole('button', { name: 'Continuar' }));

    const confirmButton = screen.getByRole('button', { name: 'Confirmar' });
    await user.click(confirmButton);
    await screen.findByText('Clique para habilitar a confirmação final.');

    const armedButton = screen.getByRole('button', { name: 'Confirmar agora' });
    await user.click(armedButton);
    expect(onComplete).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Voltar' }));
    await screen.findByText('Configuração de escopo');

    await user.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(screen.getByRole('button', { name: 'Confirmar' })).toBeInTheDocument();

    await user.click(screen.getByLabelText('Revisão concluída'));
    await user.click(screen.getByRole('button', { name: 'Confirmar' }));
    await user.click(screen.getByRole('button', { name: 'Confirmar agora' }));
    expect(onComplete).toHaveBeenCalledTimes(1);

    cleanupPortal();
  });
});
