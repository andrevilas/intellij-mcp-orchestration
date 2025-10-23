import type { ReactNode } from 'react';

import {
  getStatusMetadata,
  isStatusActive,
  resolveStatusMessage,
  type AsyncContentStatus,
} from './status/statusUtils';

import './resource-detail-card.scss';

export type ResourceDetailStatus = AsyncContentStatus;

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
  const statusMetadata = getStatusMetadata(status);
  const hasStatus = isStatusActive(status);
  const message = hasStatus
    ? resolveStatusMessage(status, status === 'error' ? error : undefined)
    : undefined;

  return (
    <section
      className="resource-detail-card"
      data-status={hasStatus ? status : undefined}
      aria-labelledby={headingId}
      aria-describedby={descriptionId}
      aria-label={ariaLabel}
      aria-busy={statusMetadata.ariaBusy}
      aria-live={statusMetadata.ariaLive}
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

      {!hasStatus ? (
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

      {hasStatus ? (
        <div
          className="resource-detail-card__status"
          role={statusMetadata.role}
          aria-live={statusMetadata.ariaLive}
          aria-busy={statusMetadata.ariaBusy}
        >
          {status === 'loading' ? <span className="resource-detail-card__spinner" aria-hidden="true" /> : null}
          <p>{message}</p>
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
