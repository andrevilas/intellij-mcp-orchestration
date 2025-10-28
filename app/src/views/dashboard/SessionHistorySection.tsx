import { useMemo } from 'react';

import type { Session } from '../../api';
import AsyncStateTable from '../../components/async/AsyncStateTable';
import type { ResourceTableColumn } from '../../components/ResourceTable';
import StatusBadge from '../../components/indicators/StatusBadge';
import Pagination from '../../components/navigation/Pagination';
import type { AsyncContentStatus, StatusMessageOverrides } from '../../components/status/statusUtils';

interface SessionHistorySectionProps {
  sessions: Session[];
  totalSessions: number;
  range: { start: number; end: number };
  currentPage: number;
  pageCount: number;
  onPageChange(page: number): void;
  isLoading: boolean;
  error: string | null;
  statusMessages: StatusMessageOverrides;
  emptyDescription: string;
  onRetry?: () => void;
  testId?: string;
}

function resolveSessionTone(status: string): 'neutral' | 'info' | 'success' | 'warning' | 'danger' {
  const normalized = status.toLowerCase();
  if (normalized === 'success' || normalized === 'completed') {
    return 'success';
  }
  if (normalized === 'error' || normalized === 'failed') {
    return 'danger';
  }
  if (normalized === 'pending' || normalized === 'queued') {
    return 'warning';
  }
  if (normalized === 'running' || normalized === 'processing') {
    return 'info';
  }
  return 'neutral';
}

function resolveStatusLabel(status: string): string {
  const normalized = status.trim().toLowerCase();
  switch (normalized) {
    case 'success':
      return 'Sucesso';
    case 'error':
      return 'Erro';
    case 'running':
      return 'Em execução';
    case 'pending':
      return 'Aguardando';
    case 'completed':
      return 'Concluída';
    case 'failed':
      return 'Falhou';
    default:
      return status;
  }
}

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
});

export default function SessionHistorySection({
  sessions,
  totalSessions,
  range,
  currentPage,
  pageCount,
  onPageChange,
  isLoading,
  error,
  statusMessages,
  emptyDescription,
  onRetry,
  testId,
}: SessionHistorySectionProps) {
  const columns = useMemo<ResourceTableColumn<Session>[]>(
    () => [
      {
        id: 'id',
        header: 'Sessão',
        sortable: true,
        sortAccessor: (session) => session.id,
        width: '220px',
        render: (session) => <code>{session.id}</code>,
      },
      {
        id: 'status',
        header: 'Status',
        sortable: true,
        sortAccessor: (session) => session.status,
        width: '140px',
        render: (session) => (
          <StatusBadge tone={resolveSessionTone(session.status)} appearance="soft">
            {resolveStatusLabel(session.status)}
          </StatusBadge>
        ),
      },
      {
        id: 'provider',
        header: 'Provedor',
        sortable: true,
        sortAccessor: (session) => session.provider_id,
        render: (session) => session.provider_id,
      },
      {
        id: 'createdAt',
        header: 'Criado em',
        sortable: true,
        align: 'right',
        width: '200px',
        sortAccessor: (session) => new Date(session.created_at),
        render: (session) => DATE_TIME_FORMATTER.format(new Date(session.created_at)),
      },
      {
        id: 'details',
        header: 'Detalhes',
        render: (session) => (
          <div className="dashboard-sessions__details">
            {session.reason ? <p>{session.reason}</p> : <p>Sem observações adicionais.</p>}
            {session.client ? <span className="dashboard-sessions__client">Cliente: {session.client}</span> : null}
          </div>
        ),
      },
    ],
    [],
  );

  const hasSessions = sessions.length > 0;
  const status: AsyncContentStatus = error
    ? 'error'
    : isLoading
      ? hasSessions
        ? 'loading'
        : 'skeleton'
      : hasSessions
        ? 'default'
        : 'empty';

  return (
    <section className="dashboard__sessions" aria-label="Histórico recente de sessões" data-testid={testId}>
      <header className="dashboard__section-header">
        <div>
          <h2>Histórico recente de sessões</h2>
          <p>Dados retornados pelo endpoint <code>/api/v1/sessions</code>.</p>
        </div>
      </header>

      <AsyncStateTable
        title="Sessões MCP"
        description="Últimas execuções de provisionamento registradas na console."
        ariaLabel="Tabela de histórico de sessões MCP"
        items={sessions}
        columns={columns}
        getRowId={(session) => session.id}
        status={status}
        errorMessage={error}
        statusMessages={statusMessages}
        emptyState={{
          title: 'Ainda não há sessões registradas nesta execução.',
          description: emptyDescription,
        }}
        onRetry={onRetry}
        getRowDescription={(session) =>
          session.reason
            ? `${resolveStatusLabel(session.status)} — ${session.reason}`
            : `${resolveStatusLabel(session.status)} pelo provedor ${session.provider_id}`
        }
      />

      <div className="dashboard__sessions-footer">
        <span className="dashboard__sessions-summary" role="status" aria-live="polite">
          Mostrando {range.start}–{range.end} de {totalSessions} sessões
        </span>
        <Pagination
          currentPage={currentPage}
          pageCount={pageCount}
          onPageChange={onPageChange}
          ariaLabel="Paginação do histórico de sessões"
        />
      </div>
    </section>
  );
}
