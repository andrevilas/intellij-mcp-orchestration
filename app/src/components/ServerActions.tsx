import type { ReactNode } from 'react';

import type { ServerProcessLifecycle } from '../api';

export type ServerAction = 'start' | 'stop' | 'restart';

const ACTION_LABEL: Record<ServerAction, string> = {
  start: 'Iniciar',
  stop: 'Parar',
  restart: 'Reiniciar',
};

export interface ServerActionsProps {
  status: ServerProcessLifecycle;
  pendingAction: ServerAction | null;
  onStart(): void;
  onStop(): void;
  onRestart(): void;
  children?: ReactNode;
  riskAcknowledgement?: string | null;
  riskTestId?: string;
}

function getPendingLabel(action: ServerAction | null): string | undefined {
  if (!action) {
    return undefined;
  }
  switch (action) {
    case 'start':
      return 'Inicializando…';
    case 'stop':
      return 'Encerrando…';
    case 'restart':
      return 'Reiniciando…';
  }
}

export default function ServerActions({
  status,
  pendingAction,
  onStart,
  onStop,
  onRestart,
  children,
  riskAcknowledgement,
  riskTestId,
}: ServerActionsProps) {
  const pendingLabel = getPendingLabel(pendingAction);
  const disableStart = status === 'running' || Boolean(pendingAction);
  const disableStop = status !== 'running' || Boolean(pendingAction);
  const disableRestart = Boolean(pendingAction);

  return (
    <div className="server-actions" role="group" aria-label="Ações do servidor">
      <button
        type="button"
        onClick={onStart}
        disabled={disableStart}
        className="server-action-button server-action-button--start"
      >
        {pendingAction === 'start' ? pendingLabel : ACTION_LABEL.start}
      </button>
      <button
        type="button"
        onClick={onStop}
        disabled={disableStop}
        className="server-action-button server-action-button--stop"
      >
        {pendingAction === 'stop' ? pendingLabel : ACTION_LABEL.stop}
      </button>
      <button
        type="button"
        onClick={onRestart}
        disabled={disableRestart}
        className="server-action-button server-action-button--restart"
      >
        {pendingAction === 'restart' ? pendingLabel : ACTION_LABEL.restart}
      </button>
      {children && <div className="server-actions__extra">{children}</div>}
      {riskAcknowledgement ? (
        <p
          className="server-actions__risk"
          role="note"
          data-testid={riskTestId}
          aria-live={pendingAction ? 'assertive' : 'polite'}
        >
          <strong>Risco controlado.</strong> {riskAcknowledgement}
        </p>
      ) : null}
    </div>
  );
}
