import type { ReactNode } from 'react';
import clsx from 'clsx';

import {
  getStatusMetadata,
  isStatusActive,
  resolveStatusMessage,
  type AsyncContentStatus,
  type StatusMessageOverrides,
} from '../status/statusUtils';

import './AsyncStateCard.scss';

const DEFAULT_MESSAGES: StatusMessageOverrides = {
  loading: 'Carregando informações…',
  empty: 'Nenhum dado disponível no momento.',
  error: 'Ocorreu um erro ao carregar as informações.',
};

export interface AsyncStateCardProps {
  title: string;
  description?: string;
  status?: AsyncContentStatus;
  statusMessages?: StatusMessageOverrides;
  illustration?: ReactNode;
  accent?: ReactNode;
  toolbar?: ReactNode;
  footer?: ReactNode;
  children?: ReactNode;
  onRetry?: () => void;
  testId?: string;
  className?: string;
}

export function AsyncStateCard({
  title,
  description,
  status = 'default',
  statusMessages,
  illustration,
  accent,
  toolbar,
  footer,
  children,
  onRetry,
  testId,
  className,
}: AsyncStateCardProps) {
  const headingId = `${title.replace(/\s+/g, '-').toLowerCase()}-async-card`;
  const descriptionId = description ? `${headingId}-description` : undefined;
  const statusMetadata = getStatusMetadata(status);
  const statusMessage = resolveStatusMessage(status, statusMessages?.[status] ?? DEFAULT_MESSAGES[status] ?? null);
  const statusActive = isStatusActive(status);

  return (
    <section
      className={clsx('async-state-card', className)}
      aria-labelledby={headingId}
      aria-describedby={descriptionId}
      aria-busy={statusMetadata.ariaBusy}
      aria-live={statusActive ? statusMetadata.ariaLive : 'off'}
      role={statusActive ? statusMetadata.role : 'region'}
      data-status={statusActive ? status : undefined}
      data-testid={testId}
    >
      <header className="async-state-card__header">
        <div className="async-state-card__heading">
          <h2 id={headingId}>{title}</h2>
          {description ? (
            <p id={descriptionId} className="async-state-card__description">
              {description}
            </p>
          ) : null}
        </div>
        {toolbar ? <div className="async-state-card__toolbar">{toolbar}</div> : null}
      </header>

      {accent ? <div className="async-state-card__accent">{accent}</div> : null}

      {statusActive ? (
        <div className="async-state-card__status" role={statusMetadata.role} aria-live={statusMetadata.ariaLive}>
          {illustration ? (
            <div className="async-state-card__illustration" aria-hidden="true">
              {illustration}
            </div>
          ) : null}
          <p className="async-state-card__status-message">{statusMessage}</p>
          {status === 'error' && onRetry ? (
            <button type="button" className="async-state-card__retry" onClick={onRetry}>
              Tentar novamente
            </button>
          ) : null}
        </div>
      ) : (
        <div className="async-state-card__content">{children}</div>
      )}

      {footer ? <footer className="async-state-card__footer">{footer}</footer> : null}
    </section>
  );
}

export default AsyncStateCard;
