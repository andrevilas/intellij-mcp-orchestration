import type { AgentStatus, AgentSummary } from '../api';

export const STATUS_LABELS: Record<AgentStatus, string> = {
  healthy: 'Saudável',
  degraded: 'Instável',
  pending: 'Pendente',
  inactive: 'Inativo',
  failed: 'Falha',
  unknown: 'Desconhecido',
};

export const STATUS_CLASS: Record<AgentStatus, string> = {
  healthy: 'agents__status--healthy',
  degraded: 'agents__status--degraded',
  pending: 'agents__status--pending',
  inactive: 'agents__status--inactive',
  failed: 'agents__status--failed',
  unknown: 'agents__status--unknown',
};

export function formatAgentTimestamp(value: string | null): string {
  if (!value) {
    return '—';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  const day = String(date.getUTCDate()).padStart(2, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const year = date.getUTCFullYear();
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');

  return `${day}/${month}/${year} ${hours}:${minutes} UTC`;
}

export function formatStatus(status: AgentStatus): string {
  return STATUS_LABELS[status] ?? STATUS_LABELS.unknown;
}

export function formatModel(agent: AgentSummary): string {
  if (!agent.model) {
    return '—';
  }

  if (agent.model.name && agent.model.provider) {
    return `${agent.model.name} (${agent.model.provider})`;
  }

  return agent.model.name ?? agent.model.provider ?? '—';
}
