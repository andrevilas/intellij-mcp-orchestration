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

export default function StatusBadge({
  children,
  tone = 'neutral',
  appearance = 'soft',
  icon,
  className,
  ...props
}: StatusBadgeProps) {
  return (
    <span
      {...props}
      className={clsx('status-badge', `status-badge--${tone}`, `status-badge--${appearance}`, className)}
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
