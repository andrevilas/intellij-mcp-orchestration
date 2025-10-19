import clsx from 'clsx';
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
  return (
    <div className={clsx('mcp-alert', `mcp-alert--${variant}`)} role="status">
      <div className="mcp-alert__body">
        {title ? <h4 className="mcp-alert__title">{title}</h4> : null}
        <div className="mcp-alert__description">{description}</div>
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
