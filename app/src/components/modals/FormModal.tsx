import type { FormEvent, ReactNode } from 'react';

import Button from '../actions/Button';
import ModalBase from './ModalBase';

interface FormModalProps {
  isOpen: boolean;
  title: string;
  description?: string;
  submitLabel?: string;
  cancelLabel?: string;
  children: ReactNode;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
}

export default function FormModal({
  isOpen,
  title,
  description,
  submitLabel = 'Salvar',
  cancelLabel = 'Cancelar',
  children,
  onSubmit,
  onCancel,
  isSubmitting = false,
}: FormModalProps): JSX.Element | null {
  return (
    <ModalBase
      isOpen={isOpen}
      title={title}
      description={description}
      onClose={onCancel}
      footer={null}
    >
      <form
        className="mcp-modal__form"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit(event);
        }}
      >
        <div className="mcp-modal__form-content">{children}</div>
        <div className="mcp-modal__actions">
          <Button variant="ghost" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button variant="primary" type="submit" loading={isSubmitting}>
            {submitLabel}
          </Button>
        </div>
      </form>
    </ModalBase>
  );
}
