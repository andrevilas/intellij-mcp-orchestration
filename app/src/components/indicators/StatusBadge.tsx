import type { HTMLAttributes, ReactNode } from 'react';
import clsx from 'clsx';

import './status-badge.scss';

export type StatusBadgeTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';
export type StatusBadgeAppearance = 'solid' | 'soft' | 'outline';

export interface StatusBadgeProps extends HTMLAttributes<HTMLSpanElement> {
  children: ReactNode;
  tone?: StatusBadgeTone;
  appearance?: StatusBadgeAppearance;
  icon?: ReactNode;
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
  className,
  'aria-label': ariaLabel,
  ...props
}: StatusBadgeProps) {
  const childText = typeof children === 'string' ? children.trim() : '';
  const fallbackAriaLabel = childText.length > 0 ? `${childText} — ${TONE_LABEL[tone]}` : undefined;
  const resolvedAriaLabel = ariaLabel ?? fallbackAriaLabel;
  return (
    <span
      {...props}
      className={clsx('status-badge', `status-badge--${tone}`, `status-badge--${appearance}`, className)}
      data-tone={tone}
      data-appearance={appearance}
      aria-label={resolvedAriaLabel}
    >
      {icon ? (
        <span className="status-badge__icon" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <span className="status-badge__label">{children}</span>
    </span>
  );
}
