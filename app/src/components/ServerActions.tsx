import type { ReactNode } from 'react';

export type ServerAction = 'start' | 'stop' | 'restart';

const ACTION_LABEL: Record<ServerAction, string> = {
  start: 'Iniciar',
  stop: 'Parar',
  restart: 'Reiniciar',
};

export interface ServerActionsProps {
  status: 'up' | 'down';
  pendingAction: ServerAction | null;
  onStart(): void;
  onStop(): void;
  onRestart(): void;
  children?: ReactNode;
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
}: ServerActionsProps) {
  const pendingLabel = getPendingLabel(pendingAction);
  const disableStart = status === 'up' || Boolean(pendingAction);
  const disableStop = status === 'down' || Boolean(pendingAction);
  const disableRestart = status === 'down' || Boolean(pendingAction);

  return (
    <div className="server-actions" role="group" aria-label="Ações do servidor">
      <button type="button" onClick={onStart} disabled={disableStart} className="server-action-button">
        {pendingAction === 'start' ? pendingLabel : ACTION_LABEL.start}
      </button>
      <button type="button" onClick={onStop} disabled={disableStop} className="server-action-button">
        {pendingAction === 'stop' ? pendingLabel : ACTION_LABEL.stop}
      </button>
      <button type="button" onClick={onRestart} disabled={disableRestart} className="server-action-button">
        {pendingAction === 'restart' ? pendingLabel : ACTION_LABEL.restart}
      </button>
      {children && <div className="server-actions__extra">{children}</div>}
    </div>
  );
}
