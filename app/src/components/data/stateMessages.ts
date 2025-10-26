import { describeFixtureRequest } from '../../utils/fixtureStatus';
import type { StatusMessageOverrides } from '../status/statusUtils';

export interface DataStateMessagesOptions {
  action?: string;
  errorPrefix?: string;
  empty?: string;
  loading?: string;
  skeleton?: string;
}

export function createDataStateMessages(
  resource: string,
  { action, errorPrefix, empty, loading, skeleton }: DataStateMessagesOptions = {},
): StatusMessageOverrides {
  const fixtureMessages = describeFixtureRequest(resource, { action, errorPrefix });
  return {
    loading: loading ?? fixtureMessages.loading,
    skeleton: skeleton ?? fixtureMessages.loading,
    error: fixtureMessages.error,
    empty: empty ?? `Nenhum registro de ${resource} disponível no momento.`,
  };
}

export function buildEmptyState(
  resource: string,
  description?: string,
): { title: string; description?: string } {
  return {
    title: `Nenhum ${resource} encontrado.`,
    description,
  };
}
