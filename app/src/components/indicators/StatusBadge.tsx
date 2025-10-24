import type { HTMLAttributes, ReactNode } from 'react';
import clsx from 'clsx';

import {
  getStatusMetadata,
  isStatusActive,
  resolveStatusMessage,
  type AsyncContentStatus,
  type StatusMessageOverrides,
} from '../status/statusUtils';

import './status-badge.scss';

export type StatusBadgeTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';
export type StatusBadgeAppearance = 'solid' | 'soft' | 'outline';

export interface StatusBadgeProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'> {
  children?: ReactNode;
  tone?: StatusBadgeTone;
  appearance?: StatusBadgeAppearance;
  icon?: ReactNode;
  status?: AsyncContentStatus;
  statusMessages?: StatusMessageOverrides;
  onRetry?: () => void;
}

const TONE_LABEL: Record<StatusBadgeTone, string> = {
  neutral: 'Estado neutro',
  info: 'Estado informativo',
  success: 'Estado positivo',
  warning: 'Estado de alerta',
  danger: 'Estado crítico',
};

export default function StatusBadge({
  children,
  tone = 'neutral',
  appearance = 'soft',
  icon,
  status = 'default',
  statusMessages,
  onRetry,
  className,
  'aria-label': ariaLabel,
  role: explicitRole,
  'aria-live': ariaLive,
  'aria-busy': ariaBusy,
  ...props
}: StatusBadgeProps) {
  const statusMetadata = getStatusMetadata(status);
  const statusActive = isStatusActive(status);
  const statusMessage = statusActive
    ? resolveStatusMessage(status, statusMessages?.[status] ?? null)
    : null;
  const labelContent = statusActive ? statusMessage : children;

  const fallbackLabel = (() => {
    if (ariaLabel) {
      return ariaLabel;
    }
    if (typeof labelContent === 'string' && labelContent.trim().length > 0) {
      return `${labelContent.trim()} — ${TONE_LABEL[tone]}`;
    }
    if (!statusActive && typeof children === 'string' && children.trim().length > 0) {
      return `${children.trim()} — ${TONE_LABEL[tone]}`;
    }
    return undefined;
  })();

  return (
    <span
      {...props}
      className={clsx('status-badge', `status-badge--${tone}`, `status-badge--${appearance}`, className)}
      data-tone={tone}
      data-appearance={appearance}
      data-status={statusActive ? status : undefined}
      aria-label={ariaLabel ?? fallbackLabel}
      aria-live={statusActive ? statusMetadata.ariaLive : ariaLive}
      aria-busy={statusActive ? statusMetadata.ariaBusy : ariaBusy}
      role={statusActive ? statusMetadata.role : explicitRole}
    >
      {statusActive ? (
        <>
          {status === 'loading' ? <span className="status-badge__spinner" aria-hidden="true" /> : null}
          <span className="status-badge__label">{labelContent}</span>
          {status === 'error' && onRetry ? (
            <button type="button" className="status-badge__retry" onClick={onRetry}>
              Tentar novamente
            </button>
          ) : null}
        </>
      ) : (
        <>
          {icon ? (
            <span className="status-badge__icon" aria-hidden="true">
              {icon}
            </span>
          ) : null}
          <span className="status-badge__label">{children}</span>
        </>
      )}
    </span>
  );
}
