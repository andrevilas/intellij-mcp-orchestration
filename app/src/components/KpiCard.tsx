import type { ReactNode } from 'react';
import clsx from 'clsx';

import './kpi-card.scss';

export type Trend = 'up' | 'down' | 'flat';

export type KpiCardStatus = 'default' | 'loading' | 'empty' | 'error';

export interface KpiCardProps {
  label: string;
  value?: string;
  caption?: string;
  trend?: Trend;
  trendLabel?: string;
  icon?: ReactNode;
  status?: KpiCardStatus;
  statusMessage?: string;
  action?: ReactNode;
  onRetry?: () => void;
  footer?: ReactNode;
}

const TREND_SYMBOL: Record<Trend, string> = {
  up: '▲',
  down: '▼',
  flat: '■',
};

const STATUS_LABEL: Record<Exclude<KpiCardStatus, 'default'>, string> = {
  loading: 'Carregando indicador',
  empty: 'Nenhum dado disponível',
  error: 'Falha ao carregar indicador',
};

export function KpiCard({
  label,
  value,
  caption,
  trend = 'flat',
  trendLabel,
  icon,
  status = 'default',
  statusMessage,
  action,
  onRetry,
  footer,
}: KpiCardProps) {
  const headingId = `${label.replace(/\s+/g, '-').toLowerCase()}-kpi`; // deterministic id
  const message = status !== 'default' ? statusMessage ?? STATUS_LABEL[status] : undefined;

  return (
    <article
      className={clsx('kpi-card', status !== 'default' && `kpi-card--${status}`)}
      aria-labelledby={headingId}
      aria-busy={status === 'loading'}
      aria-live={status === 'loading' ? 'polite' : 'off'}
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

      {status !== 'default' ? (
        <div className="kpi-card__status" role={status === 'error' ? 'alert' : 'status'} aria-live="polite">
          {status === 'loading' ? (
            <span className="kpi-card__skeleton" aria-hidden="true" />
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
