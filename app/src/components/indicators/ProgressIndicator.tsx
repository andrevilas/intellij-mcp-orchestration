import { useId, type HTMLAttributes, type ReactNode } from 'react';
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
  'aria-label': ariaLabelProp,
  'aria-labelledby': ariaLabelledByProp,
  'aria-describedby': ariaDescribedByProp,
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
  let statusVisual: ReactNode | null = null;

  if (hasStatus) {
    switch (normalizedStatus) {
      case 'loading':
        statusVisual = <span className="progress-indicator__skeleton" aria-hidden="true" />;
        break;
      case 'empty':
        statusVisual = (
          <span className="progress-indicator__status-icon" aria-hidden="true">
            <FontAwesomeIcon icon={faCircleInfo} fixedWidth />
          </span>
        );
        break;
      case 'error':
        statusVisual = (
          <span className="progress-indicator__status-icon" aria-hidden="true">
            <FontAwesomeIcon icon={faTriangleExclamation} fixedWidth />
          </span>
        );
        break;
      default:
        statusVisual = null;
    }
  }

  const generatedLabelId = useId();
  const generatedDescriptionId = useId();
  const generatedStatusMessageId = useId();
  const descriptionId = description && normalizedStatus === 'default' ? generatedDescriptionId : undefined;
  const statusMessageId = hasStatus && statusMessage ? generatedStatusMessageId : undefined;
  const ariaLabelledBy = [ariaLabelledByProp, generatedLabelId].filter(Boolean).join(' ') || undefined;
  const ariaDescribedBy = [
    ariaDescribedByProp,
    descriptionId,
    statusMessageId,
  ]
    .filter(Boolean)
    .join(' ') || undefined;

  return (
    <div
      {...props}
      className={clsx(
        'progress-indicator',
        `progress-indicator--${tone}`,
        className,
      )}
      role="group"
      aria-label={ariaLabelProp}
      aria-labelledby={ariaLabelledBy}
      aria-describedby={ariaDescribedBy}
      data-status={hasStatus ? normalizedStatus : undefined}
      aria-busy={statusMetadata.ariaBusy}
      aria-live={statusMetadata.ariaLive}
    >
      <div className="progress-indicator__header">
        <span id={generatedLabelId} className="progress-indicator__label">
          {label}
        </span>
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
          {description ? (
            <p id={descriptionId} className="progress-indicator__description">
              {description}
            </p>
          ) : null}
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
            <p id={statusMessageId} className="progress-indicator__status-message">
              {statusMessage}
            </p>
          ) : null}
          {action ? <div className="progress-indicator__action">{action}</div> : null}
        </div>
      )}
    </div>
  );
}
