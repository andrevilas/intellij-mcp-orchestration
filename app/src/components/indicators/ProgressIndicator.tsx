import type { HTMLAttributes } from 'react';
import clsx from 'clsx';

import './progress-indicator.scss';

export type ProgressIndicatorTone = 'info' | 'success' | 'warning' | 'danger' | 'neutral';

export interface ProgressIndicatorProps extends HTMLAttributes<HTMLDivElement> {
  label: string;
  value: number;
  tone?: ProgressIndicatorTone;
  description?: string;
}

export default function ProgressIndicator({
  label,
  value,
  tone = 'info',
  description,
  className,
  ...props
}: ProgressIndicatorProps) {
  const clampedValue = Math.min(100, Math.max(0, value));
  return (
    <div
      {...props}
      className={clsx('progress-indicator', `progress-indicator--${tone}`, className)}
      role="group"
      aria-label={label}
    >
      <div className="progress-indicator__header">
        <span className="progress-indicator__label">{label}</span>
        <span className="progress-indicator__value" aria-live="polite">{clampedValue}%</span>
      </div>
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
    </div>
  );
}
