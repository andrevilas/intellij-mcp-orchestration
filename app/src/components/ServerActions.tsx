import { useId, type ReactNode } from 'react';

import type { ServerProcessLifecycle } from '../api';

export type ServerAction = 'start' | 'stop' | 'restart';

const ACTION_LABEL: Record<ServerAction, string> = {
  start: 'Iniciar',
  stop: 'Parar',
  restart: 'Reiniciar',
};

type ServerActionRiskLevel = 'controlled' | 'elevated' | 'critical';

const RISK_METADATA: Record<ServerActionRiskLevel, { title: string; description: string }> = {
  controlled: {
    title: 'Risco controlado',
    description:
      'As operações são protegidas por confirmação dupla. Revise a modal antes de acionar o supervisor MCP.',
  },
  elevated: {
    title: 'Risco elevado',
    description:
      'A ação pode interromper provisionamentos ativos. Confirme apenas se o impacto for conhecido e desejado.',
  },
  critical: {
    title: 'Mudança crítica',
    description:
      'Requer coordenação com o time de operações. Certifique-se de comunicar o freeze antes de prosseguir.',
  },
};

export interface ServerActionsProps {
  status: ServerProcessLifecycle;
  pendingAction: ServerAction | null;
  onStart(): void;
  onStop(): void;
  onRestart(): void;
  children?: ReactNode;
  riskLevel?: ServerActionRiskLevel;
  riskMessage?: string;
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
  riskLevel = 'controlled',
  riskMessage,
}: ServerActionsProps) {
  const pendingLabel = getPendingLabel(pendingAction);
  const disableStart = status === 'running' || Boolean(pendingAction);
  const disableStop = status !== 'running' || Boolean(pendingAction);
  const disableRestart = Boolean(pendingAction);

  const riskDescriptorId = useId();
  const riskCopy = riskMessage && riskMessage.trim().length > 0 ? riskMessage : RISK_METADATA[riskLevel].description;
  const hasRiskMessage = riskCopy.trim().length > 0;
  const hasExtraContent = hasRiskMessage || Boolean(children);
  const riskTitle = RISK_METADATA[riskLevel].title;
  const describedBy = hasRiskMessage ? riskDescriptorId : undefined;

  return (
    <div className="server-actions" role="group" aria-label="Ações do servidor" aria-describedby={describedBy}>
      <button type="button" onClick={onStart} disabled={disableStart} className="server-action-button">
        {pendingAction === 'start' ? pendingLabel : ACTION_LABEL.start}
      </button>
      <button type="button" onClick={onStop} disabled={disableStop} className="server-action-button">
        {pendingAction === 'stop' ? pendingLabel : ACTION_LABEL.stop}
      </button>
      <button type="button" onClick={onRestart} disabled={disableRestart} className="server-action-button">
        {pendingAction === 'restart' ? pendingLabel : ACTION_LABEL.restart}
      </button>
      {hasExtraContent && (
        <div className="server-actions__extra">
          {hasRiskMessage && (
            <div
              id={riskDescriptorId}
              className="server-actions__risk"
              data-risk-level={riskLevel}
              aria-live="polite"
            >
              <strong className="server-actions__risk-title">{riskTitle}</strong>
              <p className="server-actions__risk-message">{riskCopy}</p>
            </div>
          )}
          {children}
        </div>
      )}
    </div>
  );
}
