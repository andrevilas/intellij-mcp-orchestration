import { FormEvent, useState } from 'react';

import Button from '../actions/Button';
import ConfirmationModal from './ConfirmationModal';
import FormModal from './FormModal';
import WizardModal from './WizardModal';
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
  const [isWizardOpen, setWizardOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isWizardCompleting, setWizardCompleting] = useState(false);
  const [wizardAck, setWizardAck] = useState(false);
  const [wizardState, setWizardState] = useState({
    name: 'Agente de provisão',
    justification: 'Sincronizar inventário semanal',
    environment: 'produção',
    scope: 'restrito',
  });

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
      <Button variant="ghost" onClick={() => setWizardOpen(true)}>
        Abrir wizard governado
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
      <WizardModal
        isOpen={isWizardOpen}
        title="Habilitar fluxo governado"
        description="Configure parâmetros antes de liberar o agente."
        onClose={() => {
          setWizardOpen(false);
          setWizardCompleting(false);
          setWizardAck(false);
          pushToast({
            id: 'wizard-cancelled',
            title: 'Fluxo governado cancelado',
            description: 'Nenhuma alteração foi aplicada.',
            variant: 'warning',
            autoDismiss: false,
          });
        }}
        steps={[
          {
            id: 'detalhes',
            title: 'Detalhes',
            description: 'Identifique o agente e descreva o motivo.',
            content: (
              <div className="mcp-modal__wizard-pane">
                <label style={{ display: 'grid', gap: '0.25rem' }}>
                  Nome do agente
                  <input
                    value={wizardState.name}
                    onChange={(event) =>
                      setWizardState((current) => ({ ...current, name: event.target.value }))
                    }
                    data-autofocus="true"
                    placeholder="Ex.: Agente FinOps"
                  />
                </label>
                <label style={{ display: 'grid', gap: '0.25rem' }}>
                  Justificativa
                  <textarea
                    value={wizardState.justification}
                    onChange={(event) =>
                      setWizardState((current) => ({ ...current, justification: event.target.value }))
                    }
                    rows={3}
                  />
                </label>
              </div>
            ),
            onNext: () => {
              if (!wizardState.name.trim()) {
                pushToast({
                  id: 'wizard-missing-name',
                  title: 'Informe o nome do agente',
                  description: 'Defina um identificador para o agente governado.',
                  variant: 'error',
                  autoDismiss: false,
                });
                return false;
              }
              if (wizardState.justification.trim().length < 10) {
                pushToast({
                  id: 'wizard-justification',
                  title: 'Descreva a justificativa',
                  description: 'Inclua ao menos 10 caracteres para contextualizar.',
                  variant: 'error',
                  autoDismiss: false,
                });
                return false;
              }
              return true;
            },
          },
          {
            id: 'escopo',
            title: 'Escopo',
            description: 'Selecione ambientes e permissões.',
            content: (
              <div className="mcp-modal__wizard-pane">
                <fieldset style={{ display: 'grid', gap: '0.75rem' }}>
                  <legend>Ambiente alvo</legend>
                  {['produção', 'homologação', 'laboratório'].map((option) => (
                    <label key={option} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <input
                        type="radio"
                        checked={wizardState.environment === option}
                        onChange={() =>
                          setWizardState((current) => ({ ...current, environment: option }))
                        }
                      />
                      {option.charAt(0).toUpperCase() + option.slice(1)}
                    </label>
                  ))}
                </fieldset>
                <label style={{ display: 'grid', gap: '0.25rem' }}>
                  Escopo de permissões
                  <select
                    value={wizardState.scope}
                    onChange={(event) =>
                      setWizardState((current) => ({ ...current, scope: event.target.value }))
                    }
                  >
                    <option value="restrito">Restrito · leitura e provisionamento</option>
                    <option value="ampliado">Ampliado · leitura, provisionamento e auditoria</option>
                    <option value="total">Total · leitura, provisionamento, auditoria e rollback</option>
                  </select>
                </label>
              </div>
            ),
          },
          {
            id: 'confirmacao',
            title: 'Revisão',
            description: 'Revise antes de habilitar o agente.',
            nextLabel: 'Habilitar confirmação',
            content: (
              <div className="mcp-modal__wizard-pane">
                <dl style={{ display: 'grid', gap: '0.5rem' }}>
                  <div>
                    <dt style={{ fontWeight: 600 }}>Agente</dt>
                    <dd>{wizardState.name}</dd>
                  </div>
                  <div>
                    <dt style={{ fontWeight: 600 }}>Ambiente</dt>
                    <dd>{wizardState.environment}</dd>
                  </div>
                  <div>
                    <dt style={{ fontWeight: 600 }}>Escopo</dt>
                    <dd>{wizardState.scope}</dd>
                  </div>
                  <div>
                    <dt style={{ fontWeight: 600 }}>Justificativa</dt>
                    <dd>{wizardState.justification}</dd>
                  </div>
                </dl>
                <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
                  <input
                    type="checkbox"
                    checked={wizardAck}
                    onChange={(event) => setWizardAck(event.target.checked)}
                  />
                  <span>
                    Confirmo que revisei permissões, ambientes e compreendo que o rollback exigirá dupla confirmação.
                  </span>
                </label>
              </div>
            ),
          },
        ]}
        confirmHint="Clique para habilitar a confirmação final."
        confirmArmedHint="Clique novamente para concluir o fluxo."
        confirmLabel="Liberar agente"
        confirmArmedLabel="Confirmar liberação"
        isCompleting={isWizardCompleting}
        onComplete={async () => {
          if (!wizardAck) {
            pushToast({
              id: 'wizard-ack',
              title: 'Confirme a revisão',
              description: 'Marque a confirmação para prosseguir.',
              variant: 'error',
              autoDismiss: false,
            });
            return false;
          }
          setWizardCompleting(true);
          await new Promise((resolve) => window.setTimeout(resolve, 500));
          setWizardCompleting(false);
          setWizardOpen(false);
          setWizardAck(false);
          pushToast({
            id: 'wizard-success',
            title: 'Fluxo governado habilitado',
            description: `O agente ${wizardState.name} foi liberado para ${wizardState.environment}.`,
            variant: 'success',
          });
          return true;
        }}
      />
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
