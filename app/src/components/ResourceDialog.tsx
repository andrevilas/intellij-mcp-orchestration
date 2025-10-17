import { useEffect, useId, useRef } from 'react';
import type { FormEventHandler, ReactNode } from 'react';

export interface ResourceDialogProps {
  title: string;
  description?: string;
  isOpen: boolean;
  isSubmitting?: boolean;
  submitLabel?: string;
  cancelLabel?: string;
  tone?: 'default' | 'danger';
  error?: string | null;
  onClose: () => void;
  onSubmit: FormEventHandler<HTMLFormElement>;
  children: ReactNode;
  footer?: ReactNode;
}

export default function ResourceDialog({
  title,
  description,
  isOpen,
  isSubmitting = false,
  submitLabel = 'Salvar alterações',
  cancelLabel = 'Cancelar',
  tone = 'default',
  error = null,
  onClose,
  onSubmit,
  children,
  footer,
}: ResourceDialogProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLFormElement | null>(null);
  const titleId = useId();
  const descriptionId = description ? `${titleId}-description` : undefined;

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const frame = requestAnimationFrame(() => {
      const focusable = panelRef.current?.querySelector<HTMLElement>(
        'input:not([type="hidden"]):not([disabled]), textarea:not([disabled]), select:not([disabled])',
      );
      focusable?.focus({ preventScroll: true });
    });

    function handleKeydown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    }

    document.addEventListener('keydown', handleKeydown);

    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('keydown', handleKeydown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  function handleBackdropClick(event: React.MouseEvent<HTMLDivElement>) {
    if (event.target === dialogRef.current) {
      onClose();
    }
  }

  return (
    <div
      className="resource-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onClick={handleBackdropClick}
      ref={dialogRef}
    >
      <form
        className={`resource-dialog__panel resource-dialog__panel--${tone}`}
        onSubmit={onSubmit}
        ref={panelRef}
      >
        <header className="resource-dialog__header">
          <h2 id={titleId}>{title}</h2>
          {description ? <p id={descriptionId}>{description}</p> : null}
        </header>
        <div className="resource-dialog__body">
          {error ? (
            <div className="resource-dialog__error" role="alert">
              {error}
            </div>
          ) : null}
          {children}
        </div>
        <footer className="resource-dialog__footer">
          <div className="resource-dialog__footer-main">
            <button type="submit" className="resource-dialog__primary" disabled={isSubmitting}>
              {isSubmitting ? 'Salvando...' : submitLabel}
            </button>
            <button
              type="button"
              className="resource-dialog__secondary"
              onClick={onClose}
              disabled={isSubmitting}
            >
              {cancelLabel}
            </button>
          </div>
          {footer ? <div className="resource-dialog__footer-extra">{footer}</div> : null}
        </footer>
      </form>
    </div>
  );
}
