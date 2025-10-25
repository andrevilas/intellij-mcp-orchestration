import type { ReactNode } from 'react';

import StatusBadge, {
  type StatusBadgeAppearance,
  type StatusBadgeProps,
  type StatusBadgeTone,
} from '../indicators/StatusBadge';
import { type AsyncContentStatus, type StatusMessageOverrides } from '../status/statusUtils';

const DEFAULT_MESSAGES: StatusMessageOverrides = {
  loading: 'Carregando…',
  empty: 'Nenhum resultado disponível.',
  error: 'Não foi possível carregar o conteúdo.',
};

export interface AsyncStateBadgeProps
  extends Omit<StatusBadgeProps, 'status' | 'statusMessages' | 'tone' | 'appearance' | 'children'> {
  children?: ReactNode;
  tone?: StatusBadgeTone;
  appearance?: StatusBadgeAppearance;
  status?: AsyncContentStatus;
  statusMessages?: StatusMessageOverrides;
}

export default function AsyncStateBadge({
  children,
  tone = 'neutral',
  appearance = 'soft',
  status = 'default',
  statusMessages,
  ...props
}: AsyncStateBadgeProps) {
  const mergedMessages: StatusMessageOverrides = {
    ...DEFAULT_MESSAGES,
    ...statusMessages,
  };

  return (
    <StatusBadge
      {...props}
      tone={tone}
      appearance={appearance}
      status={status}
      statusMessages={mergedMessages}
    >
      {children}
    </StatusBadge>
  );
}
