import type { ReactNode } from 'react';

import './resource-detail-card.scss';

export type ResourceDetailStatus = 'default' | 'loading' | 'empty' | 'error';

export interface ResourceDetailItem {
  id: string;
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: ReactNode;
}

export interface ResourceDetailCardProps {
  title: string;
  description?: string;
  ariaLabel: string;
  items: ResourceDetailItem[];
  status?: ResourceDetailStatus;
  emptyState?: {
    title: string;
    description?: string;
    action?: ReactNode;
    illustration?: ReactNode;
  };
  error?: string | null;
  onRetry?: () => void;
  actions?: ReactNode;
  footer?: ReactNode;
}

const STATUS_MESSAGE: Record<Exclude<ResourceDetailStatus, 'default'>, string> = {
  loading: 'Carregando detalhes…',
  empty: 'Nenhuma informação disponível para o recurso selecionado.',
  error: 'Não foi possível carregar os detalhes deste recurso.',
};

export default function ResourceDetailCard({
  title,
  description,
  ariaLabel,
  items,
  status = 'default',
  emptyState,
  error,
  onRetry,
  actions,
  footer,
}: ResourceDetailCardProps) {
  const headingId = `${title.replace(/\s+/g, '-').toLowerCase()}-detail-heading`;
  const descriptionId = description ? `${headingId}-description` : undefined;

  return (
    <section
      className="resource-detail-card"
      data-status={status !== 'default' ? status : undefined}
      aria-labelledby={headingId}
      aria-describedby={descriptionId}
      aria-label={ariaLabel}
      aria-busy={status === 'loading'}
    >
      <header className="resource-detail-card__header">
        <div className="resource-detail-card__titles">
          <h3 id={headingId}>{title}</h3>
          {description ? (
            <p id={descriptionId} className="resource-detail-card__description">
              {description}
            </p>
          ) : null}
        </div>
        {actions ? <div className="resource-detail-card__actions">{actions}</div> : null}
      </header>

      {status === 'default' ? (
        <dl className="resource-detail-card__grid">
          {items.map((item) => (
            <div key={item.id} className="resource-detail-card__item">
              <dt className="resource-detail-card__item-label">
                {item.icon ? <span aria-hidden="true">{item.icon}</span> : null}
                {item.label}
              </dt>
              <dd className="resource-detail-card__item-value">
                {item.value}
                {item.hint ? <span className="resource-detail-card__item-hint">{item.hint}</span> : null}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}

      {status !== 'default' ? (
        <div
          className="resource-detail-card__status"
          role={status === 'error' ? 'alert' : 'status'}
          aria-live="polite"
        >
          {status === 'loading' ? <span className="resource-detail-card__spinner" aria-hidden="true" /> : null}
          <p>{status === 'error' && error ? error : STATUS_MESSAGE[status]}</p>
          {status === 'error' && onRetry ? (
            <button type="button" className="resource-detail-card__retry" onClick={onRetry}>
              Tentar novamente
            </button>
          ) : null}
          {status === 'empty' && emptyState ? (
            <div className="resource-detail-card__empty">
              {emptyState.illustration ? (
                <div className="resource-detail-card__empty-illustration" aria-hidden="true">
                  {emptyState.illustration}
                </div>
              ) : null}
              <h4>{emptyState.title}</h4>
              {emptyState.description ? <p>{emptyState.description}</p> : null}
              {emptyState.action ? (
                <div className="resource-detail-card__empty-action">{emptyState.action}</div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {footer ? <footer className="resource-detail-card__footer">{footer}</footer> : null}
    </section>
  );
}
