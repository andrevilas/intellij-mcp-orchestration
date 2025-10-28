import clsx from 'clsx';
import { useId } from 'react';
import type { ReactNode } from 'react';

import './feedback.scss';

export type AlertVariant = 'info' | 'success' | 'warning' | 'error';

export interface AlertProps {
  title?: string;
  description: ReactNode;
  variant?: AlertVariant;
  action?: ReactNode;
  onDismiss?: () => void;
}

export default function Alert({
  title,
  description,
  variant = 'info',
  action,
  onDismiss,
}: AlertProps): JSX.Element {
  const role = variant === 'error' || variant === 'warning' ? 'alert' : 'status';
  const liveMode = variant === 'error' || variant === 'warning' ? 'assertive' : 'polite';
  const titleId = useId();
  const descriptionId = useId();
  const accessibleLabel = typeof description === 'string' ? description : undefined;

  return (
    <div
      className={clsx('mcp-alert', `mcp-alert--${variant}`)}
      role={role}
      aria-live={liveMode}
      aria-atomic="true"
      aria-labelledby={title ? titleId : undefined}
      aria-describedby={descriptionId}
      aria-label={accessibleLabel}
      data-variant={variant}
    >
      <div className="mcp-alert__body">
        {title ? (
          <h4 id={titleId} className="mcp-alert__title">
            {title}
          </h4>
        ) : null}
        <div id={descriptionId} className="mcp-alert__description">
          {description}
        </div>
      </div>
      {action ? <div className="mcp-alert__action">{action}</div> : null}
      {onDismiss ? (
        <button type="button" className="mcp-alert__dismiss" onClick={onDismiss} aria-label="Fechar alerta">
          ×
        </button>
      ) : null}
    </div>
  );
}
