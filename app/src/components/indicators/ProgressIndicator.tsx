import type { HTMLAttributes, ReactNode } from 'react';
import clsx from 'clsx';

import './progress-indicator.scss';

export type ProgressIndicatorTone = 'info' | 'success' | 'warning' | 'danger' | 'neutral';
export type ProgressIndicatorStatus = 'default' | 'loading' | 'empty' | 'error';

export interface ProgressIndicatorProps extends HTMLAttributes<HTMLDivElement> {
  label: string;
  value?: number;
  tone?: ProgressIndicatorTone;
  description?: string;
  status?: ProgressIndicatorStatus;
  statusLabel?: string;
  action?: ReactNode;
}

export default function ProgressIndicator({
  label,
  value,
  tone = 'info',
  description,
  status = 'default',
  statusLabel,
  action,
  className,
  ...props
}: ProgressIndicatorProps) {
  const normalizedStatus: ProgressIndicatorStatus = status;
  const normalizedValue = typeof value === 'number' ? value : 0;
  const clampedValue = Math.min(100, Math.max(0, normalizedValue));
  const statusMessage =
    normalizedStatus === 'default'
      ? null
      : statusLabel ??
        (normalizedStatus === 'loading'
          ? 'Sincronizando indicador…'
          : normalizedStatus === 'empty'
            ? 'Nenhum progresso disponível no período selecionado.'
            : 'Não foi possível carregar o indicador.');
  return (
    <div
      {...props}
      className={clsx(
        'progress-indicator',
        `progress-indicator--${tone}`,
        className,
        normalizedStatus !== 'default' && 'progress-indicator--has-status',
      )}
      role="group"
      aria-label={label}
      data-status={normalizedStatus !== 'default' ? normalizedStatus : undefined}
      aria-busy={normalizedStatus === 'loading'}
    >
      <div className="progress-indicator__header">
        <span className="progress-indicator__label">{label}</span>
        {normalizedStatus === 'default' ? (
          <span className="progress-indicator__value" aria-live="polite">{clampedValue}%</span>
        ) : null}
      </div>
      {normalizedStatus === 'default' ? (
        <>
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={clampedValue}
            className="progress-indicator__track"
          >
            <span className="progress-indicator__bar" style={{ width: `${clampedValue}%` }} />
          </div>
          {description ? <p className="progress-indicator__description">{description}</p> : null}
        </>
      ) : (
        <div
          className="progress-indicator__status"
          role={normalizedStatus === 'error' ? 'alert' : 'status'}
          aria-live="polite"
        >
          {normalizedStatus === 'loading' ? (
            <span className="progress-indicator__spinner" aria-hidden="true" />
          ) : null}
          {statusMessage ? (
            <p className="progress-indicator__status-message">{statusMessage}</p>
          ) : null}
          {action ? <div className="progress-indicator__action">{action}</div> : null}
        </div>
      )}
    </div>
  );
}
