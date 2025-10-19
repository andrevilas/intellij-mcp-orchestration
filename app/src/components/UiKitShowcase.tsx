import { FormEvent, useMemo, useState } from 'react';

import Button from './actions/Button';
import ButtonGroup from './actions/ButtonGroup';
import Dropdown from './menus/Dropdown';
import Tooltip from './menus/Tooltip';
import Alert from './feedback/Alert';
import { useToast } from './feedback/ToastProvider';
import ConfirmationModal from './modals/ConfirmationModal';
import FormModal from './modals/FormModal';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

import './ui-kit-showcase.scss';

export default function UiKitShowcase(): JSX.Element {
  const { pushToast } = useToast();
  const [isConfirmationOpen, setConfirmationOpen] = useState(false);
  const [isFormOpen, setFormOpen] = useState(false);
  const [alertVisible, setAlertVisible] = useState(true);
  const [workflowName, setWorkflowName] = useState('Rotina semanal');
  const [isSubmitting, setSubmitting] = useState(false);

  const dropdownOptions = useMemo(
    () => [
      {
        id: 'toast-success',
        label: 'Toast de sucesso',
        description: 'Mostra notificação persistente',
        icon: <FontAwesomeIcon icon="download" fixedWidth aria-hidden="true" />,
        onSelect: () =>
          pushToast({
            title: 'Provisionamento concluído',
            description: 'O servidor foi promovido para produção.',
            variant: 'success',
          }),
      },
      {
        id: 'open-confirmation',
        label: 'Abrir confirmação',
        description: 'Solicita aprovação explícita',
        icon: <FontAwesomeIcon icon="share-nodes" fixedWidth aria-hidden="true" />,
        onSelect: () => setConfirmationOpen(true),
      },
      {
        id: 'open-form',
        label: 'Abrir formulário',
        description: 'Edita parâmetros críticos',
        icon: <FontAwesomeIcon icon="pen-to-square" fixedWidth aria-hidden="true" />,
        onSelect: () => setFormOpen(true),
      },
    ],
    [pushToast],
  );

  const toolbarActions = useMemo(
    () => [
      {
        id: 'run',
        icon: <FontAwesomeIcon icon="play" fixedWidth aria-hidden="true" />,
        label: 'Executar blueprint',
        onClick: () =>
          pushToast({
            title: 'Execução iniciada',
            description: 'O blueprint foi enviado para o orquestrador.',
            variant: 'info',
          }),
      },
      {
        id: 'restart',
        icon: <FontAwesomeIcon icon="rotate-right" fixedWidth aria-hidden="true" />,
        label: 'Reexecutar última etapa',
        onClick: () =>
          pushToast({
            title: 'Reprocessamento agendado',
            description: 'A etapa será repetida com rollback seguro.',
            variant: 'success',
          }),
      },
      {
        id: 'stop',
        icon: <FontAwesomeIcon icon="circle-stop" fixedWidth aria-hidden="true" />,
        label: 'Cancelar',
        variant: 'danger' as const,
        onClick: () =>
          pushToast({
            title: 'Execução cancelada',
            description: 'Nenhuma alteração adicional será aplicada.',
            variant: 'warning',
          }),
      },
    ],
    [pushToast],
  );

  function handleWorkflowSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setSubmitting(true);
    const data = new FormData(event.currentTarget);
    const name = String(data.get('workflow-name') ?? 'Workflow');
    window.setTimeout(() => {
      setSubmitting(false);
      setFormOpen(false);
      pushToast({
        title: 'Fluxo atualizado',
        description: `${name} salvo com sucesso.`,
        variant: 'info',
      });
    }, 300);
  }

  return (
    <section className="ui-kit-showcase" data-testid="ui-kit-showcase" aria-label="UI Kit">
      <header className="ui-kit-showcase__header">
        <h2>UI Kit</h2>
        <p>
          Componentes reutilizáveis com tokens MCP. Use o dropdown para explorar ações ou abra os modais para validar acessibilidade.
        </p>
      </header>

      <div className="ui-kit-showcase__group">
        <span className="ui-kit-showcase__label">Botões</span>
        <div className="ui-kit-showcase__row">
          <Button variant="primary">Primário</Button>
          <Button variant="secondary">Secundário</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Fantasma</Button>
          <Button variant="link">Link</Button>
          <Button variant="danger" loading>
            Remover
          </Button>
        </div>
        <div className="ui-kit-showcase__toolbar" role="presentation">
          <ButtonGroup segmented label="Rotinas de execução">
            {toolbarActions.map((action) => (
              <Tooltip key={action.id} content={action.label} placement="bottom">
                <Button
                  aria-label={action.label}
                  variant={action.variant ?? 'secondary'}
                  icon={action.icon}
                  onClick={action.onClick}
                />
              </Tooltip>
            ))}
          </ButtonGroup>
        </div>
      </div>

      <div className="ui-kit-showcase__group">
        <span className="ui-kit-showcase__label">Menus</span>
        <div className="ui-kit-showcase__row">
          <Dropdown label="Ações rápidas" options={dropdownOptions} />
          <Tooltip content="Executa fluxo automatizado" placement="bottom">
            <Button variant="ghost">Detalhes</Button>
          </Tooltip>
        </div>
      </div>

      <div className="ui-kit-showcase__group">
        <span className="ui-kit-showcase__label">Feedback</span>
        <div className="ui-kit-showcase__column">
          {alertVisible ? (
            <Alert
              title="Execução em andamento"
              description="O runbook noturno está sendo executado com 3 etapas restantes."
              action={
                <Button size="sm" variant="ghost" onClick={() => setAlertVisible(false)}>
                  Dispensar
                </Button>
              }
            />
          ) : (
            <Button size="sm" variant="ghost" onClick={() => setAlertVisible(true)}>
              Reexibir alerta
            </Button>
          )}
        </div>
      </div>

      <div className="ui-kit-showcase__group">
        <span className="ui-kit-showcase__label">Modais</span>
        <div className="ui-kit-showcase__row">
          <Button variant="secondary" onClick={() => setConfirmationOpen(true)}>
            Abrir confirmação
          </Button>
          <Button variant="secondary" onClick={() => setFormOpen(true)}>
            Abrir formulário
          </Button>
        </div>
      </div>

      <ConfirmationModal
        isOpen={isConfirmationOpen}
        title="Excluir instância"
        description="Esta ação removerá logs associados e não poderá ser desfeita."
        onConfirm={() => {
          setConfirmationOpen(false);
          pushToast({
            title: 'Instância removida',
            description: 'Os recursos associados foram desalocados.',
            variant: 'warning',
          });
        }}
        onCancel={() => setConfirmationOpen(false)}
      />

      <FormModal
        isOpen={isFormOpen}
        title="Editar workflow"
        description="Atualize as janelas de execução e metas de SLO."
        onSubmit={handleWorkflowSubmit}
        onCancel={() => setFormOpen(false)}
        isSubmitting={isSubmitting}
      >
        <label className="ui-kit-showcase__field">
          <span>Nome</span>
          <input
            type="text"
            name="workflow-name"
            value={workflowName}
            onChange={(event) => setWorkflowName(event.target.value)}
            required
            data-autofocus="true"
          />
        </label>
        <label className="ui-kit-showcase__field">
          <span>Janela</span>
          <select name="workflow-window" defaultValue="semanal">
            <option value="diaria">Diária</option>
            <option value="semanal">Semanal</option>
            <option value="mensal">Mensal</option>
          </select>
        </label>
      </FormModal>
    </section>
  );
}
