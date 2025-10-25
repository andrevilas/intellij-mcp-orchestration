import { createPortal } from 'react-dom';
import { useEffect, useId, useMemo, useRef, type ReactNode } from 'react';
import clsx from 'clsx';

import Button from '../actions/Button';
import './modal.scss';

interface ModalBaseProps {
  isOpen: boolean;
  title: string;
  description?: ReactNode;
  onClose: () => void;
  footer?: ReactNode;
  children?: ReactNode;
  closeOnBackdrop?: boolean;
  size?: 'md' | 'lg' | 'xl';
  dialogClassName?: string;
  contentClassName?: string;
}

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  const selectors = [
    'a[href]',
    'button:not([disabled])',
    'textarea:not([disabled])',
    'input:not([type="hidden"]):not([disabled])',
    'select:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ];
  return Array.from(container.querySelectorAll<HTMLElement>(selectors.join(','))).filter(
    (element) => !element.hasAttribute('disabled') && !element.getAttribute('aria-hidden'),
  );
}

export default function ModalBase({
  isOpen,
  title,
  description,
  onClose,
  footer,
  children,
  closeOnBackdrop = true,
  size = 'md',
  dialogClassName,
  contentClassName,
}: ModalBaseProps): JSX.Element | null {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    if (dialog) {
      const focusables = getFocusableElements(dialog);
      const cycleTargets = focusables.filter((element) => !element.hasAttribute('data-modal-close'));
      const preferred = dialog.querySelector<HTMLElement>('[data-autofocus="true"]');
      const contentCandidate = cycleTargets.find((element) => !element.closest('.mcp-modal__header'));
      const target = preferred ?? contentCandidate ?? cycleTargets[0] ?? focusables[0] ?? dialog;
      target.focus({ preventScroll: true });
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
      if (event.key === 'Tab') {
        const dialogElement = dialogRef.current;
        if (!dialogElement) {
          return;
        }
        const focusables = getFocusableElements(dialogElement);
        const cycleTargets = focusables.filter((element) => !element.hasAttribute('data-modal-close'));
        const targets = cycleTargets.length > 0 ? cycleTargets : focusables;
        if (targets.length === 0) {
          event.preventDefault();
          dialogElement.focus();
          return;
        }
        const activeIndex = targets.indexOf(document.activeElement as HTMLElement);
        const nextIndex = event.shiftKey ? activeIndex - 1 : activeIndex + 1;
        const wrappedIndex = (nextIndex + targets.length) % targets.length;
        event.preventDefault();
        targets[wrappedIndex].focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
      if (previousFocus.current) {
        previousFocus.current.focus({ preventScroll: true });
      }
    };
  }, [isOpen, onClose]);

  const overlay = useMemo(() => document.getElementById('modal-root') ?? document.body, []);

  const content = !isOpen ? null : (
    <div
      className="mcp-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      data-state={isOpen ? 'open' : 'closed'}
    >
      <div
        className="mcp-modal__backdrop"
        onClick={closeOnBackdrop ? onClose : undefined}
        aria-hidden="true"
      />
      <div
        className={clsx('mcp-modal__dialog', dialogClassName)}
        ref={dialogRef}
        tabIndex={-1}
        data-size={size}
      >
        <header className="mcp-modal__header">
          <h2 id={titleId}>{title}</h2>
          <Button
            variant="outline"
            size="sm"
            onClick={onClose}
            aria-label="Fechar modal"
            data-modal-close="true"
          >
            Fechar
          </Button>
        </header>
        {description ? (
          <p id={descriptionId} className="mcp-modal__description">
            {description}
          </p>
        ) : null}
        <div className={clsx('mcp-modal__content', contentClassName)}>{children}</div>
        {footer ? <footer className="mcp-modal__footer">{footer}</footer> : null}
      </div>
    </div>
  );

  return createPortal(content, overlay);
}
