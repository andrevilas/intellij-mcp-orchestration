export type AsyncContentStatus = 'default' | 'loading' | 'empty' | 'error' | 'skeleton';

export type StatusMessageOverrides = Partial<Record<AsyncContentStatus, string>>;

export interface StatusA11yAttributes {
  readonly message: string;
  readonly role: 'status' | 'alert';
  readonly ariaLive: 'off' | 'polite' | 'assertive';
  readonly ariaBusy: boolean;
  readonly surfaceToken: string;
  readonly borderToken: string;
  readonly accentToken: string;
}

const STATUS_METADATA: Record<AsyncContentStatus, StatusA11yAttributes> = {
  default: {
    message: '',
    role: 'status',
    ariaLive: 'off',
    ariaBusy: false,
    surfaceToken: '--mcp-status-surface-default',
    borderToken: '--mcp-status-border-default',
    accentToken: '--mcp-status-icon-default',
  },
  loading: {
    message: 'Carregando informações…',
    role: 'status',
    ariaLive: 'polite',
    ariaBusy: true,
    surfaceToken: '--mcp-status-surface-loading',
    borderToken: '--mcp-status-border-loading',
    accentToken: '--mcp-status-icon-loading',
  },
  skeleton: {
    message: 'Preparando visualização…',
    role: 'status',
    ariaLive: 'polite',
    ariaBusy: true,
    surfaceToken: '--mcp-status-surface-skeleton',
    borderToken: '--mcp-status-border-skeleton',
    accentToken: '--mcp-status-icon-skeleton',
  },
  empty: {
    message: 'Nenhum dado disponível no momento.',
    role: 'status',
    ariaLive: 'polite',
    ariaBusy: false,
    surfaceToken: '--mcp-status-surface-empty',
    borderToken: '--mcp-status-border-empty',
    accentToken: '--mcp-status-icon-empty',
  },
  error: {
    message: 'Ocorreu um erro ao carregar as informações.',
    role: 'alert',
    ariaLive: 'assertive',
    ariaBusy: false,
    surfaceToken: '--mcp-status-surface-error',
    borderToken: '--mcp-status-border-error',
    accentToken: '--mcp-status-icon-error',
  },
};

export function getStatusMetadata(status: AsyncContentStatus): StatusA11yAttributes {
  return STATUS_METADATA[status];
}

export function resolveStatusMessage(
  status: AsyncContentStatus,
  override?: string | null,
): string {
  if (typeof override === 'string' && override.trim().length > 0) {
    return override;
  }

  return STATUS_METADATA[status].message;
}

export function isStatusActive(status: AsyncContentStatus): boolean {
  return status !== 'default';
}
