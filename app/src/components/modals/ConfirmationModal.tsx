import Button from '../actions/Button';
import ModalBase from './ModalBase';

interface ConfirmationModalProps {
  isOpen: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  isLoading?: boolean;
}

export default function ConfirmationModal({
  isOpen,
  title,
  description,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  onConfirm,
  onCancel,
  isLoading = false,
}: ConfirmationModalProps): JSX.Element | null {
  return (
    <ModalBase
      isOpen={isOpen}
      title={title}
      description={description}
      onClose={onCancel}
      footer={
        <div className="mcp-modal__actions">
          <Button variant="ghost" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button variant="danger" loading={isLoading} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      }
    />
  );
}
