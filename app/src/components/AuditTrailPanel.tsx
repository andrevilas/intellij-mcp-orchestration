import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';

export interface AuditTrailPanelProps {
  title: string;
  subtitle?: string;
  isOpen: boolean;
  events: Array<{
    id: string;
    timestamp: string;
    actor: string;
    action: string;
    target: string;
    description: string;
    metadata: Record<string, unknown> | null;
  }>;
  isLoading?: boolean;
  error?: string | null;
  emptyState?: ReactNode;
  onClose: () => void;
  onRetry?: () => void;
}

export default function AuditTrailPanel({
  title,
  subtitle,
  isOpen,
  events,
  isLoading = false,
  error = null,
  emptyState = 'Nenhum evento registrado para este recurso.',
  onClose,
  onRetry,
}: AuditTrailPanelProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const frame = requestAnimationFrame(() => {
      panelRef.current?.focus({ preventScroll: true });
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

  return (
    <aside className="audit-panel" role="complementary" aria-labelledby="audit-panel-title" ref={panelRef} tabIndex={-1}>
      <div className="audit-panel__header">
        <div>
          <h2 id="audit-panel-title">{title}</h2>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
        <button type="button" className="audit-panel__close" onClick={onClose}>
          Fechar
        </button>
      </div>
      {error ? (
        <div className="audit-panel__error" role="alert">
          <span>{error}</span>
          {onRetry ? (
            <button type="button" className="audit-panel__retry" onClick={onRetry}>
              Tentar novamente
            </button>
          ) : null}
        </div>
      ) : null}
      {isLoading ? (
        <div className="audit-panel__loading" role="status" aria-live="polite">
          Carregando eventos...
        </div>
      ) : null}
      {!isLoading && !error && events.length === 0 ? (
        <div className="audit-panel__empty" role="note">
          {emptyState}
        </div>
      ) : null}
      <ol className="audit-panel__timeline">
        {events.map((event) => (
          <li key={event.id} className="audit-panel__event">
            <header className="audit-panel__event-header">
              <span className="audit-panel__event-action">{event.action}</span>
              <time dateTime={event.timestamp}>{new Date(event.timestamp).toLocaleString()}</time>
            </header>
            <p className="audit-panel__event-description">{event.description}</p>
            <dl className="audit-panel__event-meta">
              <div>
                <dt>Ator</dt>
                <dd>{event.actor}</dd>
              </div>
              <div>
                <dt>Alvo</dt>
                <dd>{event.target}</dd>
              </div>
            </dl>
            {event.metadata ? (
              <details className="audit-panel__event-metadata">
                <summary>Metadados</summary>
                <pre>{JSON.stringify(event.metadata, null, 2)}</pre>
              </details>
            ) : null}
          </li>
        ))}
      </ol>
    </aside>
  );
}
