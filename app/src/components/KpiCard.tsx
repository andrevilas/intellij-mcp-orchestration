import type { ReactNode } from 'react';
import clsx from 'clsx';

import {
  getStatusMetadata,
  isStatusActive,
  resolveStatusMessage,
  type AsyncContentStatus,
  type StatusMessageOverrides,
} from './status/statusUtils';

import './kpi-card.scss';

export type Trend = 'up' | 'down' | 'flat';

export type KpiCardStatus = AsyncContentStatus;

export interface KpiCardProps {
  label: string;
  value?: string;
  caption?: string;
  trend?: Trend;
  trendLabel?: string;
  icon?: ReactNode;
  status?: KpiCardStatus;
  statusMessages?: StatusMessageOverrides;
  action?: ReactNode;
  onRetry?: () => void;
  footer?: ReactNode;
  testId?: string;
}

const TREND_SYMBOL: Record<Trend, string> = {
  up: '▲',
  down: '▼',
  flat: '■',
};

export function KpiCard({
  label,
  value,
  caption,
  trend = 'flat',
  trendLabel,
  icon,
  status = 'default',
  statusMessages,
  action,
  onRetry,
  footer,
  testId,
}: KpiCardProps) {
  const headingId = `${label.replace(/\s+/g, '-').toLowerCase()}-kpi`; // deterministic id
  const statusMetadata = getStatusMetadata(status);
  const message = isStatusActive(status)
    ? resolveStatusMessage(status, statusMessages?.[status])
    : undefined;
  const isSkeleton = status === 'skeleton';

  return (
    <article
      className="kpi-card"
      data-status={isStatusActive(status) ? status : undefined}
      aria-labelledby={headingId}
      aria-busy={statusMetadata.ariaBusy}
      aria-live={statusMetadata.ariaLive}
      data-testid={testId}
    >
      <header className="kpi-card__header">
        <span id={headingId} className="kpi-card__label">
          {label}
        </span>
        {icon ? <span className="kpi-card__icon" aria-hidden="true">{icon}</span> : null}
      </header>

      {status === 'default' ? (
        <>
          <strong className="kpi-card__value">{value}</strong>
          {caption ? <p className="kpi-card__caption">{caption}</p> : null}
          {trendLabel ? (
            <small
              className={clsx('kpi-card__trend', `kpi-card__trend--${trend}`)}
              aria-label={`Tendência ${trend === 'up' ? 'positiva' : trend === 'down' ? 'negativa' : 'estável'}`}
            >
              <span aria-hidden="true">{TREND_SYMBOL[trend]}</span> {trendLabel}
            </small>
          ) : null}
        </>
      ) : null}

      {isStatusActive(status) ? (
        <div
          className="kpi-card__status"
          role={statusMetadata.role}
          aria-live={statusMetadata.ariaLive}
          aria-busy={statusMetadata.ariaBusy}
        >
          {status === 'loading' ? (
            <span className="kpi-card__skeleton kpi-card__skeleton--value" aria-hidden="true" />
          ) : null}
          {isSkeleton ? (
            <div className="kpi-card__skeleton-group" aria-hidden="true">
              <span className="kpi-card__skeleton kpi-card__skeleton--value" />
              <span className="kpi-card__skeleton kpi-card__skeleton--caption" />
              <span className="kpi-card__skeleton kpi-card__skeleton--trend" />
            </div>
          ) : null}
          <p className="kpi-card__status-message">{message}</p>
          {status === 'error' && onRetry ? (
            <button type="button" className="kpi-card__retry" onClick={onRetry}>
              Tentar novamente
            </button>
          ) : null}
          {action ? <div className="kpi-card__action">{action}</div> : null}
        </div>
      ) : null}

      {footer ? <footer className="kpi-card__footer">{footer}</footer> : null}
    </article>
  );
}

export default KpiCard;
