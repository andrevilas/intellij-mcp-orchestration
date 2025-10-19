import { useEffect, useId, useMemo, useState } from 'react';

import Button from '../actions/Button';
import ModalBase from './ModalBase';

interface ConfirmationModalProps {
  isOpen: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  confirmArmedLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  isLoading?: boolean;
  confirmMode?: 'single' | 'double';
  confirmHint?: string;
  confirmArmedHint?: string;
}

export default function ConfirmationModal({
  isOpen,
  title,
  description,
  confirmLabel = 'Confirmar',
  confirmArmedLabel = 'Confirmar agora',
  cancelLabel = 'Cancelar',
  onConfirm,
  onCancel,
  isLoading = false,
  confirmMode = 'double',
  confirmHint = 'Clique em confirmar para habilitar a etapa final.',
  confirmArmedHint = 'Clique novamente para confirmar.',
}: ConfirmationModalProps): JSX.Element | null {
  const hintId = useId();
  const [isArmed, setArmed] = useState(false);
  const requiresDoubleConfirm = confirmMode === 'double';

  useEffect(() => {
    if (!isOpen) {
      setArmed(false);
    }
  }, [isOpen]);

  const handleCancel = () => {
    setArmed(false);
    onCancel();
  };

  const handleConfirm = () => {
    if (isLoading) {
      return;
    }
    if (requiresDoubleConfirm && !isArmed) {
      setArmed(true);
      return;
    }
    onConfirm();
    if (requiresDoubleConfirm) {
      setArmed(false);
    }
  };

  const confirmButtonLabel = useMemo(
    () => (requiresDoubleConfirm && isArmed ? confirmArmedLabel : confirmLabel),
    [confirmArmedLabel, confirmLabel, isArmed, requiresDoubleConfirm],
  );

  const liveHint = requiresDoubleConfirm ? (isArmed ? confirmArmedHint : confirmHint) : undefined;

  return (
    <ModalBase
      isOpen={isOpen}
      title={title}
      description={description}
      onClose={handleCancel}
      footer={
        <>
          <div className="mcp-modal__actions">
            <Button variant="ghost" onClick={handleCancel}>
              {cancelLabel}
            </Button>
            <Button
              variant="danger"
              loading={isLoading}
              onClick={handleConfirm}
              aria-describedby={requiresDoubleConfirm ? hintId : undefined}
              data-state={isArmed ? 'armed' : 'idle'}
            >
              {confirmButtonLabel}
            </Button>
          </div>
          {liveHint ? (
            <p
              id={hintId}
              className={`mcp-modal__confirm-hint${isArmed ? ' mcp-modal__confirm-hint--armed' : ''}`}
              role="status"
              aria-live="polite"
            >
              {liveHint}
            </p>
          ) : null}
        </>
      }
    />
  );
}
