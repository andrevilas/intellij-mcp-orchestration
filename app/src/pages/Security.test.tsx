import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import Security from './Security';
import {
  fetchSecurityUsers,
  fetchSecurityRoles,
  fetchSecurityApiKeys,
  createSecurityUser,
  fetchSecurityAuditTrail,
  fetchAuditLogs,
  rotateSecurityApiKey,
} from '../api';

vi.mock('../api', async () => {
  const actual = await vi.importActual<typeof import('../api')>('../api');
  return {
    ...actual,
    fetchSecurityUsers: vi.fn(),
    fetchSecurityRoles: vi.fn(),
    fetchSecurityApiKeys: vi.fn(),
    createSecurityUser: vi.fn(),
    updateSecurityUser: vi.fn(),
    deleteSecurityUser: vi.fn(),
    createSecurityRole: vi.fn(),
    updateSecurityRole: vi.fn(),
    deleteSecurityRole: vi.fn(),
    createSecurityApiKey: vi.fn(),
    updateSecurityApiKey: vi.fn(),
    rotateSecurityApiKey: vi.fn(),
    revokeSecurityApiKey: vi.fn(),
    fetchSecurityAuditTrail: vi.fn(),
    fetchAuditLogs: vi.fn(),
  };
});

const mockFetchUsers = vi.mocked(fetchSecurityUsers);
const mockFetchRoles = vi.mocked(fetchSecurityRoles);
const mockFetchApiKeys = vi.mocked(fetchSecurityApiKeys);
const mockCreateUser = vi.mocked(createSecurityUser);
const mockFetchAudit = vi.mocked(fetchSecurityAuditTrail);
const mockFetchAuditLogs = vi.mocked(fetchAuditLogs);
const mockRotateKey = vi.mocked(rotateSecurityApiKey);

describe('Security page', () => {
  beforeEach(() => {
    mockFetchUsers.mockResolvedValue([
      {
        id: 'user-1',
        name: 'Ana Silva',
        email: 'ana@empresa.com',
        roles: ['role-ops'],
        status: 'active',
        createdAt: '2024-03-01T12:00:00Z',
        lastSeenAt: '2024-03-05T09:30:00Z',
        mfaEnabled: true,
      },
      {
        id: 'user-2',
        name: 'Bruno Costa',
        email: 'bruno@empresa.com',
        roles: ['role-finops'],
        status: 'invited',
        createdAt: '2024-03-02T12:00:00Z',
        lastSeenAt: null,
        mfaEnabled: false,
      },
    ]);

    mockFetchRoles.mockResolvedValue([
      {
        id: 'role-ops',
        name: 'Operações',
        description: 'Acesso a provisionamento e smoke tests',
        permissions: ['mcp.sessions.create'],
        members: 3,
        createdAt: '2024-02-01T12:00:00Z',
        updatedAt: '2024-02-10T12:00:00Z',
      },
      {
        id: 'role-finops',
        name: 'FinOps',
        description: 'Acesso à auditoria de custos',
        permissions: ['mcp.finops.read'],
        members: 2,
        createdAt: '2024-02-01T12:00:00Z',
        updatedAt: '2024-02-12T12:00:00Z',
      },
    ]);

    mockFetchApiKeys.mockResolvedValue([
      {
        id: 'key-1',
        name: 'Observabilidade Prod',
        owner: 'observability',
        scopes: ['mcp:invoke'],
        status: 'active',
        createdAt: '2024-01-01T12:00:00Z',
        lastUsedAt: '2024-03-07T10:00:00Z',
        expiresAt: null,
        tokenPreview: 'prod****',
      },
    ]);

    mockCreateUser.mockResolvedValue({
      id: 'user-3',
      name: 'Carla Nunes',
      email: 'carla@empresa.com',
      roles: ['role-ops'],
      status: 'active',
      createdAt: '2024-03-08T12:00:00Z',
      lastSeenAt: null,
      mfaEnabled: true,
    });

    mockFetchAudit.mockResolvedValue([]);
    mockFetchAuditLogs.mockResolvedValue({
      events: [
        {
          id: 'log-1',
          createdAt: '2024-03-08T09:00:00Z',
          actorId: 'user-1',
          actorName: 'Ana Silva',
          actorRoles: ['approver'],
          action: 'security.users.list',
          resource: '/security/users',
          status: 'success',
          planId: null,
          metadata: { count: 2 },
        },
      ],
      page: 1,
      pageSize: 25,
      total: 1,
      totalPages: 1,
    });
    mockRotateKey.mockResolvedValue({
      key: {
        id: 'key-1',
        name: 'Observabilidade Prod',
        owner: 'observability',
        scopes: ['mcp:invoke'],
        status: 'active',
        createdAt: '2024-01-01T12:00:00Z',
        lastUsedAt: '2024-03-07T10:00:00Z',
        expiresAt: null,
        tokenPreview: 'prod****',
      },
      secret: 'rotated-secret',
    });
  });

  it('renderiza usuários com filtros por status', async () => {
    render(<Security />);

    const table = await screen.findByRole('table', {
      name: 'Tabela de usuários com papéis e status de MFA',
    });
    expect(within(table).getByText('Ana Silva')).toBeInTheDocument();
    expect(within(table).getByText('Bruno Costa')).toBeInTheDocument();

    await userEvent.type(screen.getByRole('searchbox', { name: /Busca/i }), 'Bruno');
    expect(within(table).queryByText('Ana Silva')).not.toBeInTheDocument();
    expect(within(table).getByText('Bruno Costa')).toBeInTheDocument();
  });

  it('permite criar novo usuário com MFA obrigatório', async () => {
    const user = userEvent.setup();
    render(<Security />);

    await user.click(await screen.findByRole('button', { name: 'Novo usuário' }));

    const dialog = await screen.findByRole('dialog', { name: 'Convidar novo usuário' });
    await user.type(within(dialog).getByLabelText('Nome completo'), 'Carla Nunes');
    await user.type(within(dialog).getByLabelText('E-mail corporativo'), 'carla@empresa.com');
    await user.selectOptions(within(dialog).getByLabelText('Papéis atribuídos'), 'role-ops');
    await user.click(within(dialog).getByRole('button', { name: 'Enviar convite' }));

    await waitFor(() =>
      expect(mockCreateUser).toHaveBeenCalledWith({
        name: 'Carla Nunes',
        email: 'carla@empresa.com',
        roles: ['role-ops'],
        status: 'active',
        mfaEnabled: true,
      }),
    );
    await screen.findByText('Carla Nunes');
  });

  it('exibe painel de auditoria ao solicitar histórico de uma API key', async () => {
    const user = userEvent.setup();
    render(<Security />);

    await user.click(await screen.findByRole('tab', { name: 'API keys' }));
    const auditButton = await screen.findByRole('button', { name: 'Auditoria' });
    await user.click(auditButton);

    expect(fetchSecurityAuditTrail).toHaveBeenCalledWith('api-key', 'key-1', expect.any(AbortSignal));
    await screen.findByRole('complementary', { name: /Auditoria/ });
  });

  it('renderiza auditoria agregada com filtros e exportação', async () => {
    const user = userEvent.setup();
    render(<Security />);

    await user.click(await screen.findByRole('tab', { name: 'Auditoria' }));
    const table = await screen.findByRole('table', {
      name: /Tabela de eventos de auditoria com filtros avançados/i,
    });

    expect(mockFetchAuditLogs).toHaveBeenCalledWith(
      {
        actor: undefined,
        action: undefined,
        start: undefined,
        end: undefined,
        page: 1,
        pageSize: 25,
      },
      expect.any(AbortSignal),
    );
    expect(within(table).getByText('security.users.list')).toBeInTheDocument();
    expect(screen.getByText('1 evento')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Filtro de ação'), 'security.user');
    await user.click(screen.getByRole('button', { name: 'Aplicar filtros' }));

    expect(mockFetchAuditLogs).toHaveBeenLastCalledWith(
      expect.objectContaining({ action: 'security.user' }),
      expect.any(AbortSignal),
    );

    expect(screen.getByRole('button', { name: 'Exportar CSV' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Exportar JSON' })).toBeEnabled();
  });
});
