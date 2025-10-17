import { useEffect, useId, useRef } from 'react';
import type { ReactElement, ReactNode } from 'react';

export interface MediaLightboxProps {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
}

export default function MediaLightbox({
  open,
  title,
  description,
  onClose,
  children,
}: MediaLightboxProps): ReactElement | null {
  const titleId = useId();
  const descriptionId = useId();
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    queueMicrotask(() => {
      closeButtonRef.current?.focus();
    });

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  return (
    <div className="media-lightbox" role="presentation">
      <div className="media-lightbox__backdrop" onClick={onClose} aria-hidden="true" />
      <div
        className="media-lightbox__dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
      >
        <header className="media-lightbox__header">
          <h2 id={titleId} className="media-lightbox__title">
            {title}
          </h2>
          <button
            type="button"
            className="media-lightbox__close"
            onClick={onClose}
            aria-label="Fechar player"
            ref={closeButtonRef}
          >
            ×
          </button>
        </header>
        {description ? (
          <p id={descriptionId} className="media-lightbox__description">
            {description}
          </p>
        ) : null}
        <div className="media-lightbox__body">{children}</div>
      </div>
    </div>
  );
}
