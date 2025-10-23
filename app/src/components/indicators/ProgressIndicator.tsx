import type { HTMLAttributes, ReactNode } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCircleInfo } from '@fortawesome/free-solid-svg-icons/faCircleInfo';
import { faTriangleExclamation } from '@fortawesome/free-solid-svg-icons/faTriangleExclamation';
import clsx from 'clsx';

import {
  getStatusMetadata,
  isStatusActive,
  resolveStatusMessage,
  type AsyncContentStatus,
  type StatusMessageOverrides,
} from '../status/statusUtils';

import './progress-indicator.scss';

export type ProgressIndicatorTone = 'info' | 'success' | 'warning' | 'danger' | 'neutral';
export type ProgressIndicatorStatus = AsyncContentStatus;

export interface ProgressIndicatorProps extends HTMLAttributes<HTMLDivElement> {
  label: string;
  value?: number;
  tone?: ProgressIndicatorTone;
  description?: string;
  status?: ProgressIndicatorStatus;
  statusLabel?: string;
  statusMessages?: StatusMessageOverrides;
  action?: ReactNode;
}

export default function ProgressIndicator({
  label,
  value,
  tone = 'info',
  description,
  status = 'default',
  statusLabel,
  statusMessages,
  action,
  className,
  ...props
}: ProgressIndicatorProps) {
  const normalizedStatus: ProgressIndicatorStatus = status;
  const normalizedValue = typeof value === 'number' ? value : 0;
  const clampedValue = Math.min(100, Math.max(0, normalizedValue));
  const statusMetadata = getStatusMetadata(normalizedStatus);
  const hasStatus = isStatusActive(normalizedStatus);
  const statusMessage = hasStatus
    ? resolveStatusMessage(normalizedStatus, statusLabel ?? statusMessages?.[normalizedStatus])
    : undefined;
  const statusVisual = hasStatus
    ? (() => {
        switch (normalizedStatus) {
          case 'loading':
            return <span className="progress-indicator__skeleton" aria-hidden="true" />;
          case 'empty':
            return (
              <span className="progress-indicator__status-icon" aria-hidden="true">
                <FontAwesomeIcon icon={faCircleInfo} fixedWidth />
              </span>
            );
          case 'error':
            return (
              <span className="progress-indicator__status-icon" aria-hidden="true">
                <FontAwesomeIcon icon={faTriangleExclamation} fixedWidth />
              </span>
            );
          default:
            return null;
        }
      })()
    : null;
  return (
    <div
      {...props}
      className={clsx(
        'progress-indicator',
        `progress-indicator--${tone}`,
        className,
      )}
      role="group"
      aria-label={label}
      data-status={hasStatus ? normalizedStatus : undefined}
      aria-busy={statusMetadata.ariaBusy}
      aria-live={statusMetadata.ariaLive}
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
          role={statusMetadata.role}
          aria-live={statusMetadata.ariaLive}
          aria-busy={statusMetadata.ariaBusy}
        >
          {statusVisual ? <div className="progress-indicator__status-visual">{statusVisual}</div> : null}
          {statusMessage ? (
            <p className="progress-indicator__status-message">{statusMessage}</p>
          ) : null}
          {action ? <div className="progress-indicator__action">{action}</div> : null}
        </div>
      )}
    </div>
  );
}
