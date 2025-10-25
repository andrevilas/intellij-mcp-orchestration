import type { ReactNode } from 'react';

import ResourceTable, {
  type ResourceTableEmptyState,
  type ResourceTableProps,
} from '../ResourceTable';
import { type AsyncContentStatus, type StatusMessageOverrides } from '../status/statusUtils';

const DEFAULT_MESSAGES: StatusMessageOverrides = {
  loading: 'Carregando informações…',
  empty: 'Nenhum registro encontrado para esta tabela.',
  error: 'Não foi possível carregar os dados no momento.',
};

export interface AsyncStateTableProps<T>
  extends Omit<ResourceTableProps<T>, 'isLoading' | 'error' | 'statusMessages' | 'emptyState'> {
  status?: AsyncContentStatus;
  statusMessages?: StatusMessageOverrides;
  errorMessage?: string | null;
  emptyState?: ResourceTableEmptyState;
  illustration?: ReactNode;
}

export default function AsyncStateTable<T>({
  status = 'default',
  statusMessages,
  errorMessage,
  emptyState,
  illustration,
  ...props
}: AsyncStateTableProps<T>) {
  const mergedMessages: StatusMessageOverrides = {
    ...DEFAULT_MESSAGES,
    ...statusMessages,
  };

  const resolvedError = status === 'error' ? errorMessage ?? mergedMessages.error ?? null : null;
  const isLoading = status === 'loading';
  const emptyMessage = mergedMessages.empty ?? DEFAULT_MESSAGES.empty ?? 'Nenhum dado disponível.';
  const derivedEmptyState: ResourceTableEmptyState = emptyState ?? {
    title: emptyMessage,
    description: undefined,
    illustration,
  };

  return (
    <ResourceTable
      {...props}
      isLoading={isLoading}
      error={resolvedError}
      statusMessages={mergedMessages}
      emptyState={derivedEmptyState}
    />
  );
}
