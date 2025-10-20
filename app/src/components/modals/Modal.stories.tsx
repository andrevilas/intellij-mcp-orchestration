import { FormEvent, useState } from 'react';

import Button from '../actions/Button';
import ConfirmationModal from './ConfirmationModal';
import FormModal from './FormModal';
import StoryThemeProvider from '../story-utils/StoryThemeProvider';
import { ToastProvider, useToast } from '../feedback/ToastProvider';

const meta = {
  title: 'Modals/Stack',
  component: ConfirmationModal,
  tags: ['ui-kit', 'tokens', 'a11y'],
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component: 'Modais com trap de foco, confirmações em dois cliques e suporte a `data-autofocus`.',
      },
    },
  },
};

export default meta;

function ModalHarness(): JSX.Element {
  const { pushToast } = useToast();
  const [isConfirmOpen, setConfirmOpen] = useState(false);
  const [isFormOpen, setFormOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    window.setTimeout(() => {
      setLoading(false);
      setFormOpen(false);
      pushToast({
        title: 'Workflow salvo',
        description: 'Configuração atualizada com sucesso.',
        variant: 'success',
      });
    }, 400);
  };

  return (
    <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
      <Button variant="secondary" onClick={() => setConfirmOpen(true)}>
        Confirmar remoção
      </Button>
      <Button variant="primary" onClick={() => setFormOpen(true)}>
        Editar workflow
      </Button>
      <ConfirmationModal
        isOpen={isConfirmOpen}
        title="Remover instância"
        description="Esta ação removerá logs associados."
        onConfirm={() => {
          pushToast({ title: 'Instância removida', description: 'Logs enviados para arquivo.', variant: 'warning' });
          setConfirmOpen(false);
        }}
        onCancel={() => setConfirmOpen(false)}
      />
      <FormModal
        isOpen={isFormOpen}
        title="Editar workflow"
        description="Atualize janela de execução."
        onSubmit={handleSubmit}
        onCancel={() => setFormOpen(false)}
        isSubmitting={loading}
      >
        <label style={{ display: 'grid', gap: '0.25rem' }}>
          Nome
          <input defaultValue="Rotina noturna" data-autofocus="true" />
        </label>
        <label style={{ display: 'grid', gap: '0.25rem' }}>
          Janela
          <select defaultValue="diaria">
            <option value="diaria">Diária</option>
            <option value="semanal">Semanal</option>
          </select>
        </label>
      </FormModal>
    </div>
  );
}

export const Light = {
  render: () => (
    <StoryThemeProvider theme="light">
      <ToastProvider>
        <ModalHarness />
      </ToastProvider>
    </StoryThemeProvider>
  ),
};

export const Dark = {
  render: () => (
    <StoryThemeProvider theme="dark">
      <ToastProvider>
        <ModalHarness />
      </ToastProvider>
    </StoryThemeProvider>
  ),
};
