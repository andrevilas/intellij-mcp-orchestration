import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';

import {
  createSecurityApiKey,
  createSecurityRole,
  createSecurityUser,
  deleteSecurityRole,
  deleteSecurityUser,
  fetchSecurityApiKeys,
  fetchSecurityAuditTrail,
  fetchSecurityRoles,
  fetchSecurityUsers,
  fetchAuditLogs,
  rotateSecurityApiKey,
  revokeSecurityApiKey,
  updateSecurityApiKey,
  updateSecurityRole,
  updateSecurityUser,
  type CreateSecurityApiKeyInput,
  type SecurityApiKey,
  type SecurityApiKeySecret,
  type SecurityAuditEvent,
  type SecurityAuditResource,
  type AuditLogEntry,
  type SecurityRole,
  type SecurityUser,
  type SecurityUserStatus,
} from '../api';
import ResourceTable, { type ResourceTableColumn } from '../components/ResourceTable';
import ResourceDialog from '../components/ResourceDialog';
import AuditTrailPanel from '../components/AuditTrailPanel';
import ConfigReloadAction from '../components/ConfigReloadAction';

interface UserDraft {
  name: string;
  email: string;
  roles: string[];
  status: SecurityUserStatus;
  mfaEnabled: boolean;
}

interface RoleDraft {
  name: string;
  description: string;
  permissionsText: string;
}

interface ApiKeyDraft {
  name: string;
  owner: string;
  scopesText: string;
  expiresAt: string;
}

const USER_STATUS_LABEL: Record<SecurityUserStatus, string> = {
  active: 'Ativo',
  suspended: 'Suspenso',
  invited: 'Convite pendente',
};

const API_KEY_STATUS_LABEL = {
  active: 'Ativa',
  revoked: 'Revogada',
  expired: 'Expirada',
} as const satisfies Record<SecurityApiKey['status'], string>;

type SecurityTab = 'users' | 'roles' | 'api-keys' | 'audit';

function buildDefaultUserDraft(): UserDraft {
  return {
    name: '',
    email: '',
    roles: [],
    status: 'active',
    mfaEnabled: true,
  };
}

function buildDefaultRoleDraft(): RoleDraft {
  return {
    name: '',
    description: '',
    permissionsText: '',
  };
}

function buildDefaultApiKeyDraft(): ApiKeyDraft {
  return {
    name: '',
    owner: '',
    scopesText: 'mcp:invoke',
    expiresAt: '',
  };
}

function formatDateTime(value: string | null): string {
  if (!value) {
    return '—';
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return '—';
  }
  return parsed.toLocaleString();
}

function normalizePermissions(input: string): string[] {
  return input
    .split(/[\n,]/)
    .map((permission) => permission.trim())
    .filter((permission, index, source) => permission.length > 0 && source.indexOf(permission) === index);
}

function normalizeScopes(input: string): string[] {
  return input
    .split(/[\n,]/)
    .map((scope) => scope.trim())
    .filter((scope, index, source) => scope.length > 0 && source.indexOf(scope) === index);
}

function normalizeExpiration(value: string): CreateSecurityApiKeyInput['expiresAt'] {
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function normalizeDateTimeInput(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.toISOString();
}

function describeAuditActor(entry: AuditLogEntry): string {
  if (entry.actorName && entry.actorId) {
    return `${entry.actorName} (${entry.actorId})`;
  }
  return entry.actorName ?? entry.actorId ?? '—';
}

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export default function Security() {
  const [activeTab, setActiveTab] = useState<SecurityTab>('users');

  const [users, setUsers] = useState<SecurityUser[]>([]);
  const [isLoadingUsers, setLoadingUsers] = useState(true);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [userSearch, setUserSearch] = useState('');
  const [userStatusFilter, setUserStatusFilter] = useState<'all' | SecurityUserStatus>('all');

  const [roles, setRoles] = useState<SecurityRole[]>([]);
  const [isLoadingRoles, setLoadingRoles] = useState(true);
  const [rolesError, setRolesError] = useState<string | null>(null);
  const [roleSearch, setRoleSearch] = useState('');

  const [apiKeys, setApiKeys] = useState<SecurityApiKey[]>([]);
  const [isLoadingApiKeys, setLoadingApiKeys] = useState(true);
  const [apiKeysError, setApiKeysError] = useState<string | null>(null);
  const [apiKeySearch, setApiKeySearch] = useState('');
  const [apiKeyStatusFilter, setApiKeyStatusFilter] = useState<'all' | SecurityApiKey['status']>('all');

  const [isUserDialogOpen, setUserDialogOpen] = useState(false);
  const [userDialogMode, setUserDialogMode] = useState<'create' | 'edit'>('create');
  const [userDialogSubmitting, setUserDialogSubmitting] = useState(false);
  const [userDialogError, setUserDialogError] = useState<string | null>(null);
  const [userDraft, setUserDraft] = useState<UserDraft>(() => buildDefaultUserDraft());
  const [userTarget, setUserTarget] = useState<SecurityUser | null>(null);
  const [userDeleteTarget, setUserDeleteTarget] = useState<SecurityUser | null>(null);
  const [userDeleteError, setUserDeleteError] = useState<string | null>(null);
  const [isDeletingUser, setDeletingUser] = useState(false);

  const [isRoleDialogOpen, setRoleDialogOpen] = useState(false);
  const [roleDialogMode, setRoleDialogMode] = useState<'create' | 'edit'>('create');
  const [roleDialogSubmitting, setRoleDialogSubmitting] = useState(false);
  const [roleDialogError, setRoleDialogError] = useState<string | null>(null);
  const [roleDraft, setRoleDraft] = useState<RoleDraft>(() => buildDefaultRoleDraft());
  const [roleTarget, setRoleTarget] = useState<SecurityRole | null>(null);
  const [roleDeleteTarget, setRoleDeleteTarget] = useState<SecurityRole | null>(null);
  const [roleDeleteError, setRoleDeleteError] = useState<string | null>(null);
  const [isDeletingRole, setDeletingRole] = useState(false);

  const [isApiKeyDialogOpen, setApiKeyDialogOpen] = useState(false);
  const [apiKeyDialogMode, setApiKeyDialogMode] = useState<'create' | 'edit'>('create');
  const [apiKeyDialogSubmitting, setApiKeyDialogSubmitting] = useState(false);
  const [apiKeyDialogError, setApiKeyDialogError] = useState<string | null>(null);
  const [apiKeyDraft, setApiKeyDraft] = useState<ApiKeyDraft>(() => buildDefaultApiKeyDraft());
  const [apiKeyTarget, setApiKeyTarget] = useState<SecurityApiKey | null>(null);
  const [pendingKeyActionId, setPendingKeyActionId] = useState<string | null>(null);
  const [apiKeySecret, setApiKeySecret] = useState<SecurityApiKeySecret | null>(null);

  const [auditResource, setAuditResource] = useState<{
    type: SecurityAuditResource;
    id: string;
    title: string;
  } | null>(null);
  const [auditEvents, setAuditEvents] = useState<SecurityAuditEvent[]>([]);
  const [isAuditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [auditLogsPage, setAuditLogsPage] = useState(1);
  const [auditLogsPageSize, setAuditLogsPageSize] = useState(25);
  const [auditLogsTotal, setAuditLogsTotal] = useState(0);
  const [auditLogsTotalPages, setAuditLogsTotalPages] = useState(0);
  const [isAuditTableLoading, setAuditTableLoading] = useState(false);
  const [auditTableError, setAuditTableError] = useState<string | null>(null);
  const [auditFilters, setAuditFilters] = useState({ actor: '', action: '', start: '', end: '' });
  const [auditFilterDraft, setAuditFilterDraft] = useState({ actor: '', action: '', start: '', end: '' });
  const [auditReloadToken, setAuditReloadToken] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoadingUsers(true);
    fetchSecurityUsers(controller.signal)
      .then((payload) => {
        if (controller.signal.aborted) {
          return;
        }
        setUsers(payload);
        setUsersError(null);
      })
      .catch((error) => {
        if (controller.signal.aborted) {
          return;
        }
        const message = error instanceof Error ? error.message : 'Falha ao carregar usuários.';
        setUsersError(message);
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoadingUsers(false);
        }
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoadingRoles(true);
    fetchSecurityRoles(controller.signal)
      .then((payload) => {
        if (controller.signal.aborted) {
          return;
        }
        setRoles(payload);
        setRolesError(null);
      })
      .catch((error) => {
        if (controller.signal.aborted) {
          return;
        }
        const message = error instanceof Error ? error.message : 'Falha ao carregar papéis.';
        setRolesError(message);
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoadingRoles(false);
        }
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoadingApiKeys(true);
    fetchSecurityApiKeys(controller.signal)
      .then((payload) => {
        if (controller.signal.aborted) {
          return;
        }
        setApiKeys(payload);
        setApiKeysError(null);
      })
      .catch((error) => {
        if (controller.signal.aborted) {
          return;
        }
        const message = error instanceof Error ? error.message : 'Falha ao carregar API keys.';
        setApiKeysError(message);
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoadingApiKeys(false);
        }
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!auditResource) {
      return;
    }
    const controller = new AbortController();
    setAuditLoading(true);
    setAuditError(null);
    fetchSecurityAuditTrail(auditResource.type, auditResource.id, controller.signal)
      .then((events) => {
        if (!controller.signal.aborted) {
          setAuditEvents(events);
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          const message = error instanceof Error ? error.message : 'Falha ao carregar eventos auditáveis.';
          setAuditError(message);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setAuditLoading(false);
        }
      });
    return () => controller.abort();
  }, [auditResource]);

  useEffect(() => {
    if (activeTab !== 'audit') {
      return;
    }

    const controller = new AbortController();
    setAuditTableLoading(true);
    setAuditTableError(null);

    const startIso = normalizeDateTimeInput(auditFilters.start);
    const endIso = normalizeDateTimeInput(auditFilters.end);

    fetchAuditLogs(
      {
        actor: auditFilters.actor || undefined,
        action: auditFilters.action || undefined,
        start: startIso ?? undefined,
        end: endIso ?? undefined,
        page: auditLogsPage,
        pageSize: auditLogsPageSize,
      },
      controller.signal,
    )
      .then((payload) => {
        if (controller.signal.aborted) {
          return;
        }

        if (payload.total_pages > 0 && auditLogsPage > payload.total_pages) {
          setAuditLogsPage(payload.total_pages);
          return;
        }
        if (payload.total_pages === 0 && auditLogsPage !== 1) {
          setAuditLogsPage(1);
          return;
        }

        setAuditLogs(payload.events);
        setAuditLogsTotal(payload.total);
        setAuditLogsTotalPages(payload.total_pages);
      })
      .catch((error) => {
        if (controller.signal.aborted) {
          return;
        }
        const message = error instanceof Error ? error.message : 'Falha ao carregar auditoria.';
        setAuditTableError(message);
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setAuditTableLoading(false);
        }
      });

    return () => controller.abort();
  }, [
    activeTab,
    auditFilters.actor,
    auditFilters.action,
    auditFilters.start,
    auditFilters.end,
    auditLogsPage,
    auditLogsPageSize,
    auditReloadToken,
  ]);

  const filteredUsers = useMemo(() => {
    const query = userSearch.trim().toLowerCase();
    return users
      .filter((user) => {
        if (userStatusFilter !== 'all' && user.status !== userStatusFilter) {
          return false;
        }
        if (!query) {
          return true;
        }
        return (
          user.name.toLowerCase().includes(query) ||
          user.email.toLowerCase().includes(query) ||
          user.roles.some((role) => role.toLowerCase().includes(query))
        );
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }, [users, userSearch, userStatusFilter]);

  const filteredRoles = useMemo(() => {
    const query = roleSearch.trim().toLowerCase();
    return roles
      .filter((role) => {
        if (!query) {
          return true;
        }
        return (
          role.name.toLowerCase().includes(query) ||
          role.description.toLowerCase().includes(query) ||
          role.permissions.some((permission) => permission.toLowerCase().includes(query))
        );
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }, [roles, roleSearch]);

  const filteredApiKeys = useMemo(() => {
    const query = apiKeySearch.trim().toLowerCase();
    return apiKeys
      .filter((key) => {
        if (apiKeyStatusFilter !== 'all' && key.status !== apiKeyStatusFilter) {
          return false;
        }
        if (!query) {
          return true;
        }
        return (
          key.name.toLowerCase().includes(query) ||
          key.owner.toLowerCase().includes(query) ||
          key.scopes.some((scope) => scope.toLowerCase().includes(query))
        );
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }, [apiKeys, apiKeySearch, apiKeyStatusFilter]);

  const roleNameById = useMemo(() => {
    const map = new Map<string, string>();
    roles.forEach((role) => {
      map.set(role.id, role.name);
    });
    return map;
  }, [roles]);

  const auditColumns = useMemo<ResourceTableColumn<AuditLogEntry>[]>(
    () => [
      {
        id: 'created-at',
        header: 'Registrado em',
        render: (entry) => formatDateTime(entry.createdAt),
      },
      {
        id: 'actor',
        header: 'Ator',
        render: (entry) => (
          <div>
            <strong>{describeAuditActor(entry)}</strong>
            {entry.actorRoles.length > 0 ? (
              <div className="resource-table__muted">Papéis: {entry.actorRoles.join(', ')}</div>
            ) : null}
          </div>
        ),
      },
      {
        id: 'action',
        header: 'Ação',
        render: (entry) => entry.action,
      },
      {
        id: 'resource',
        header: 'Recurso',
        render: (entry) => entry.resource,
      },
      {
        id: 'status',
        header: 'Status',
        render: (entry) => entry.status,
      },
      {
        id: 'metadata',
        header: 'Detalhes',
        render: (entry) => {
          const metadata = { ...entry.metadata };
          if (entry.planId && metadata.planId === undefined) {
            metadata.planId = entry.planId;
          }
          const hasMetadata = Object.keys(metadata).length > 0;
          return hasMetadata ? (
            <pre className="security__audit-metadata">{JSON.stringify(metadata, null, 2)}</pre>
          ) : (
            '—'
          );
        },
      },
    ],
    [],
  );

  const hasAuditFiltersApplied = useMemo(
    () => Object.values(auditFilters).some((value) => value.trim().length > 0),
    [auditFilters],
  );

  const hasAuditDraftValues = useMemo(
    () => Object.values(auditFilterDraft).some((value) => value.trim().length > 0),
    [auditFilterDraft],
  );

  const canResetAuditFilters = hasAuditFiltersApplied || hasAuditDraftValues;

  const effectiveAuditTotalPages = Math.max(1, auditLogsTotalPages);
  const isAuditNextDisabled = auditLogsTotalPages === 0 || auditLogsPage >= effectiveAuditTotalPages;
  const isAuditPreviousDisabled = auditLogsPage <= 1;

  const userColumns = useMemo<ResourceTableColumn<SecurityUser>[]>(
    () => [
      {
        id: 'name',
        header: 'Usuário',
        render: (user) => (
          <div>
            <strong>{user.name}</strong>
            <div className="resource-table__muted">{user.email}</div>
          </div>
        ),
      },
      {
        id: 'roles',
        header: 'Papéis',
        render: (user) => {
          if (user.roles.length === 0) {
            return 'Sem papéis associados';
          }
          const names = user.roles.map((roleId) => roleNameById.get(roleId) ?? roleId);
          return names.join(', ');
        },
      },
      {
        id: 'status',
        header: 'Status',
        render: (user) => USER_STATUS_LABEL[user.status],
      },
      {
        id: 'mfa',
        header: 'MFA',
        align: 'center',
        render: (user) => (user.mfaEnabled ? 'Habilitado' : 'Desabilitado'),
      },
      {
        id: 'last-seen',
        header: 'Último acesso',
        align: 'right',
        render: (user) => formatDateTime(user.lastSeenAt),
      },
    ],
    [roleNameById],
  );

  const roleColumns = useMemo<ResourceTableColumn<SecurityRole>[]>(
    () => [
      {
        id: 'name',
        header: 'Papel',
        render: (role) => (
          <div>
            <strong>{role.name}</strong>
            <div className="resource-table__muted">{role.description}</div>
          </div>
        ),
      },
      {
        id: 'permissions',
        header: 'Permissões',
        render: (role) => (role.permissions.length > 0 ? role.permissions.join(', ') : 'Nenhuma permissão configurada'),
      },
      {
        id: 'members',
        header: 'Membros',
        align: 'center',
        render: (role) => role.members,
      },
      {
        id: 'updatedAt',
        header: 'Atualizado em',
        align: 'right',
        render: (role) => formatDateTime(role.updatedAt),
      },
    ],
    [],
  );

  const apiKeyColumns = useMemo<ResourceTableColumn<SecurityApiKey>[]>(
    () => [
      {
        id: 'name',
        header: 'API key',
        render: (key) => (
          <div>
            <strong>{key.name}</strong>
            <div className="resource-table__muted">Owner: {key.owner}</div>
          </div>
        ),
      },
      {
        id: 'scopes',
        header: 'Escopos',
        render: (key) => (key.scopes.length > 0 ? key.scopes.join(', ') : '—'),
      },
      {
        id: 'status',
        header: 'Status',
        render: (key) => API_KEY_STATUS_LABEL[key.status],
      },
      {
        id: 'lastUsed',
        header: 'Último uso',
        align: 'right',
        render: (key) => formatDateTime(key.lastUsedAt),
      },
    ],
    [],
  );

  const openCreateUserDialog = useCallback(() => {
    setUserDialogMode('create');
    setUserDraft(buildDefaultUserDraft());
    setUserDialogError(null);
    setUserTarget(null);
    setUserDialogOpen(true);
  }, []);

  const openEditUserDialog = useCallback((user: SecurityUser) => {
    setUserDialogMode('edit');
    setUserDraft({
      name: user.name,
      email: user.email,
      roles: user.roles,
      status: user.status,
      mfaEnabled: user.mfaEnabled,
    });
    setUserDialogError(null);
    setUserTarget(user);
    setUserDialogOpen(true);
  }, []);

  const handleUserDialogSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (userDialogSubmitting) {
        return;
      }

      const trimmedName = userDraft.name.trim();
      const trimmedEmail = userDraft.email.trim();

      if (!trimmedName) {
        setUserDialogError('Informe o nome completo do usuário.');
        return;
      }

      if (!trimmedEmail || !trimmedEmail.includes('@')) {
        setUserDialogError('Informe um e-mail corporativo válido.');
        return;
      }

      setUserDialogSubmitting(true);
      setUserDialogError(null);

      try {
        if (userDialogMode === 'create') {
          const created = await createSecurityUser({
            name: trimmedName,
            email: trimmedEmail,
            roles: userDraft.roles,
            status: userDraft.status,
            mfaEnabled: userDraft.mfaEnabled,
          });
          setUsers((current) => [...current, created]);
        } else if (userTarget) {
          const updated = await updateSecurityUser(userTarget.id, {
            name: trimmedName,
            email: trimmedEmail,
            roles: userDraft.roles,
            status: userDraft.status,
            mfaEnabled: userDraft.mfaEnabled,
          });
          setUsers((current) => current.map((user) => (user.id === updated.id ? updated : user)));
        }
        setUserDialogOpen(false);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Falha ao salvar usuário.';
        setUserDialogError(message);
      } finally {
        setUserDialogSubmitting(false);
      }
    },
    [userDraft, userDialogMode, userDialogSubmitting, userTarget],
  );

  const handleDeleteUser = useCallback(async () => {
    if (!userDeleteTarget) {
      return;
    }
    setDeletingUser(true);
    setUserDeleteError(null);
    try {
      await deleteSecurityUser(userDeleteTarget.id);
      setUsers((current) => current.filter((user) => user.id !== userDeleteTarget.id));
      setUserDeleteTarget(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha ao remover usuário.';
      setUserDeleteError(message);
    } finally {
      setDeletingUser(false);
    }
  }, [userDeleteTarget]);

  const openCreateRoleDialog = useCallback(() => {
    setRoleDialogMode('create');
    setRoleDraft(buildDefaultRoleDraft());
    setRoleDialogError(null);
    setRoleTarget(null);
    setRoleDialogOpen(true);
  }, []);

  const openEditRoleDialog = useCallback((role: SecurityRole) => {
    setRoleDialogMode('edit');
    setRoleDraft({
      name: role.name,
      description: role.description,
      permissionsText: role.permissions.join('\n'),
    });
    setRoleDialogError(null);
    setRoleTarget(role);
    setRoleDialogOpen(true);
  }, []);

  const handleRoleDialogSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (roleDialogSubmitting) {
        return;
      }

      const trimmedName = roleDraft.name.trim();
      if (!trimmedName) {
        setRoleDialogError('Informe o nome do papel.');
        return;
      }

      const permissions = normalizePermissions(roleDraft.permissionsText);

      setRoleDialogSubmitting(true);
      setRoleDialogError(null);

      try {
        if (roleDialogMode === 'create') {
          const created = await createSecurityRole({
            name: trimmedName,
            description: roleDraft.description.trim(),
            permissions,
          });
          setRoles((current) => [...current, created]);
        } else if (roleTarget) {
          const updated = await updateSecurityRole(roleTarget.id, {
            name: trimmedName,
            description: roleDraft.description.trim(),
            permissions,
          });
          setRoles((current) => current.map((role) => (role.id === updated.id ? updated : role)));
        }
        setRoleDialogOpen(false);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Falha ao salvar papel.';
        setRoleDialogError(message);
      } finally {
        setRoleDialogSubmitting(false);
      }
    },
    [roleDraft, roleDialogMode, roleDialogSubmitting, roleTarget],
  );

  const handleDeleteRole = useCallback(async () => {
    if (!roleDeleteTarget) {
      return;
    }
    setDeletingRole(true);
    setRoleDeleteError(null);
    try {
      await deleteSecurityRole(roleDeleteTarget.id);
      setRoles((current) => current.filter((role) => role.id !== roleDeleteTarget.id));
      setRoleDeleteTarget(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha ao remover papel.';
      setRoleDeleteError(message);
    } finally {
      setDeletingRole(false);
    }
  }, [roleDeleteTarget]);

  const openCreateApiKeyDialog = useCallback(() => {
    setApiKeyDialogMode('create');
    setApiKeyDraft(buildDefaultApiKeyDraft());
    setApiKeyDialogError(null);
    setApiKeyTarget(null);
    setApiKeyDialogOpen(true);
  }, []);

  const openEditApiKeyDialog = useCallback((key: SecurityApiKey) => {
    setApiKeyDialogMode('edit');
    setApiKeyDraft({
      name: key.name,
      owner: key.owner,
      scopesText: key.scopes.join('\n'),
      expiresAt: key.expiresAt ?? '',
    });
    setApiKeyDialogError(null);
    setApiKeyTarget(key);
    setApiKeyDialogOpen(true);
  }, []);

  const handleApiKeyDialogSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (apiKeyDialogSubmitting) {
        return;
      }

      const trimmedName = apiKeyDraft.name.trim();
      const trimmedOwner = apiKeyDraft.owner.trim();
      if (!trimmedName) {
        setApiKeyDialogError('Informe um nome amigável para a API key.');
        return;
      }
      if (!trimmedOwner) {
        setApiKeyDialogError('Associe a API key a um responsável ou serviço.');
        return;
      }

      const scopes = normalizeScopes(apiKeyDraft.scopesText);
      if (scopes.length === 0) {
        setApiKeyDialogError('Inclua pelo menos um escopo.');
        return;
      }

      setApiKeyDialogSubmitting(true);
      setApiKeyDialogError(null);

      try {
        if (apiKeyDialogMode === 'create') {
          const created = await createSecurityApiKey({
            name: trimmedName,
            owner: trimmedOwner,
            scopes,
            expiresAt: normalizeExpiration(apiKeyDraft.expiresAt),
          });
          setApiKeys((current) => [...current, created.key]);
          setApiKeySecret(created);
        } else if (apiKeyTarget) {
          const updated = await updateSecurityApiKey(apiKeyTarget.id, {
            name: trimmedName,
            owner: trimmedOwner,
            scopes,
            expiresAt: normalizeExpiration(apiKeyDraft.expiresAt),
          });
          setApiKeys((current) => current.map((key) => (key.id === updated.id ? updated : key)));
        }
        setApiKeyDialogOpen(false);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Falha ao salvar API key.';
        setApiKeyDialogError(message);
      } finally {
        setApiKeyDialogSubmitting(false);
      }
    },
    [apiKeyDraft, apiKeyDialogMode, apiKeyDialogSubmitting, apiKeyTarget],
  );

  const handleRotateApiKey = useCallback(
    async (key: SecurityApiKey) => {
      setPendingKeyActionId(key.id);
      try {
        const rotated = await rotateSecurityApiKey(key.id);
        setApiKeys((current) => current.map((item) => (item.id === rotated.key.id ? rotated.key : item)));
        setApiKeySecret(rotated);
      } catch (error) {
        console.error('Falha ao rotacionar API key', error);
      } finally {
        setPendingKeyActionId(null);
      }
    },
    [],
  );

  const handleRevokeApiKey = useCallback(
    async (key: SecurityApiKey) => {
      setPendingKeyActionId(key.id);
      try {
        await revokeSecurityApiKey(key.id);
        setApiKeys((current) =>
          current.map((item) => (item.id === key.id ? { ...item, status: 'revoked' } : item)),
        );
      } catch (error) {
        console.error('Falha ao revogar API key', error);
      } finally {
        setPendingKeyActionId(null);
      }
    },
    [],
  );

  const handleOpenAudit = useCallback(
    (resource: SecurityAuditResource, id: string, title: string) => {
      setAuditEvents([]);
      setAuditError(null);
      setAuditResource({ type: resource, id, title });
    },
    [],
  );

  const handleApplyAuditFilters = useCallback(() => {
    setAuditFilters({ ...auditFilterDraft });
    setAuditLogsPage(1);
  }, [auditFilterDraft]);

  const handleResetAuditFilters = useCallback(() => {
    const empty = { actor: '', action: '', start: '', end: '' };
    setAuditFilterDraft(empty);
    setAuditFilters(empty);
    setAuditLogsPage(1);
  }, []);

  const handleAuditPreviousPage = useCallback(() => {
    setAuditLogsPage((current) => Math.max(1, current - 1));
  }, []);

  const handleAuditNextPage = useCallback(() => {
    setAuditLogsPage((current) => current + 1);
  }, []);

  const handleAuditPageSizeChange = useCallback((event: ChangeEvent<HTMLSelectElement>) => {
    const value = Number(event.target.value);
    if (!Number.isNaN(value) && value > 0) {
      setAuditLogsPageSize(value);
      setAuditLogsPage(1);
    }
  }, []);

  const handleExportAuditCsv = useCallback(() => {
    if (auditLogs.length === 0) {
      return;
    }

    const header = [
      'id',
      'created_at',
      'actor',
      'roles',
      'action',
      'resource',
      'status',
      'plan_id',
      'metadata',
    ];

    const rows = auditLogs.map((entry) => {
      const metadata = { ...entry.metadata };
      if (entry.planId && metadata.planId === undefined) {
        metadata.planId = entry.planId;
      }

      const values: Array<string | null> = [
        entry.id,
        entry.createdAt,
        describeAuditActor(entry),
        entry.actorRoles.join('|'),
        entry.action,
        entry.resource,
        entry.status,
        entry.planId,
        JSON.stringify(metadata),
      ];

      return values
        .map((raw) => {
          const text = raw ?? '';
          const normalized = typeof text === 'string' ? text : String(text);
          return `"${normalized.replace(/"/g, '""')}"`;
        })
        .join(';');
    });

    const csv = [header.join(';'), ...rows].join('\n');
    const timestamp = new Date().toISOString().slice(0, 10);
    downloadBlob(`audit-logs-${timestamp}.csv`, new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
  }, [auditLogs]);

  const handleExportAuditJson = useCallback(() => {
    if (auditLogs.length === 0) {
      return;
    }

    const exportFilters = {
      actor: auditFilters.actor || null,
      action: auditFilters.action || null,
      start: normalizeDateTimeInput(auditFilters.start),
      end: normalizeDateTimeInput(auditFilters.end),
    };

    const payload = {
      generatedAt: new Date().toISOString(),
      page: auditLogsPage,
      pageSize: auditLogsPageSize,
      total: auditLogsTotal,
      filters: exportFilters,
      events: auditLogs,
    };

    const timestamp = new Date().toISOString().slice(0, 10);
    downloadBlob(
      `audit-logs-${timestamp}.json`,
      new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }),
    );
  }, [auditFilters, auditLogs, auditLogsPage, auditLogsPageSize, auditLogsTotal]);

  return (
    <div className="security-page">
      <header className="security-page__header">
        <div>
          <span className="app-shell__eyebrow">Segurança</span>
          <h1>Central de segurança</h1>
          <p>
            Monitore identidades, papéis e credenciais MCP em um único lugar. Gere auditorias detalhadas e
            aplique políticas de least privilege com confiança.
          </p>
        </div>
      </header>

      <div className="security-page__tabs" role="tablist" aria-label="Agrupamento de recursos de segurança">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'users'}
          aria-controls="security-tabpanel-users"
          className="security-page__tab"
          id="security-tab-users"
          onClick={() => setActiveTab('users')}
        >
          Usuários
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'roles'}
          aria-controls="security-tabpanel-roles"
          className="security-page__tab"
          id="security-tab-roles"
          onClick={() => setActiveTab('roles')}
        >
          Papéis
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'api-keys'}
          aria-controls="security-tabpanel-api-keys"
          className="security-page__tab"
          id="security-tab-api-keys"
          onClick={() => setActiveTab('api-keys')}
        >
          API keys
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'audit'}
          aria-controls="security-tabpanel-audit"
          className="security-page__tab"
          id="security-tab-audit"
          onClick={() => setActiveTab('audit')}
        >
          Auditoria
        </button>
      </div>

      <div className="security-page__tab-panels">
        {activeTab === 'users' ? (
          <section
            role="tabpanel"
            id="security-tabpanel-users"
            aria-labelledby="security-tab-users"
          >
            <ResourceTable
              title="Gestão de usuários"
              description="Convide operadores, configure MFA obrigatório e mantenha trilhas de auditoria completas."
              ariaLabel="Tabela de usuários com papéis e status de MFA"
              items={filteredUsers}
              columns={userColumns}
              getRowId={(item) => item.id}
              isLoading={isLoadingUsers}
              error={usersError}
              emptyState="Nenhum usuário cadastrado. Convide membros da equipe para conceder acesso à console MCP."
              onRetry={() => {
                setLoadingUsers(true);
                setUsersError(null);
                fetchSecurityUsers()
                  .then((payload) => setUsers(payload))
                  .catch((error) => {
                    const message = error instanceof Error ? error.message : 'Falha ao carregar usuários.';
                    setUsersError(message);
                  })
                  .finally(() => setLoadingUsers(false));
              }}
              toolbar={
                <button type="button" onClick={openCreateUserDialog}>
                  Novo usuário
                </button>
              }
              filters={
                <>
                  <label>
                    Busca
                    <input
                      type="search"
                      value={userSearch}
                      onChange={(event: ChangeEvent<HTMLInputElement>) => setUserSearch(event.target.value)}
                      placeholder="Pesquisar por nome, e-mail ou papel"
                    />
                  </label>
                  <label>
                    Status
                    <select
                      value={userStatusFilter}
                      onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                        setUserStatusFilter(event.target.value === 'all' ? 'all' : (event.target.value as SecurityUserStatus))
                      }
                    >
                      <option value="all">Todos</option>
                      <option value="active">Ativos</option>
                      <option value="invited">Convites pendentes</option>
                      <option value="suspended">Suspensos</option>
                    </select>
                  </label>
                </>
              }
              renderActions={(user) => (
                <>
                  <button type="button" onClick={() => openEditUserDialog(user)}>
                    Editar
                  </button>
                  <button
                    type="button"
                    className="resource-table__actions--danger"
                    onClick={() => {
                      setUserDeleteTarget(user);
                      setUserDeleteError(null);
                    }}
                  >
                    Remover
                  </button>
                  <button
                    type="button"
                    onClick={() => handleOpenAudit('user', user.id, user.name)}
                  >
                    Auditoria
                  </button>
                </>
              )}
            />
          </section>
        ) : null}

        {activeTab === 'roles' ? (
          <section
            role="tabpanel"
            id="security-tabpanel-roles"
            aria-labelledby="security-tab-roles"
          >
            <ResourceTable
              title="Papéis e permissões"
              description="Estruture permissões de forma granular e acompanhe aderência ao princípio do menor privilégio."
              ariaLabel="Tabela de papéis com permissões e contagem de membros"
              items={filteredRoles}
              columns={roleColumns}
              getRowId={(item) => item.id}
              isLoading={isLoadingRoles}
              error={rolesError}
              emptyState="Nenhum papel cadastrado. Crie papéis para agrupar permissões e delegar acessos com segurança."
              onRetry={() => {
                setLoadingRoles(true);
                setRolesError(null);
                fetchSecurityRoles()
                  .then((payload) => setRoles(payload))
                  .catch((error) => {
                    const message = error instanceof Error ? error.message : 'Falha ao carregar papéis.';
                    setRolesError(message);
                  })
                  .finally(() => setLoadingRoles(false));
              }}
              toolbar={
                <button type="button" onClick={openCreateRoleDialog}>
                  Novo papel
                </button>
              }
              filters={
                <label>
                  Busca
                  <input
                    type="search"
                    value={roleSearch}
                    onChange={(event: ChangeEvent<HTMLInputElement>) => setRoleSearch(event.target.value)}
                    placeholder="Pesquisar por nome ou permissão"
                  />
                </label>
              }
              renderActions={(role) => (
                <>
                  <button type="button" onClick={() => openEditRoleDialog(role)}>
                    Editar
                  </button>
                  <button
                    type="button"
                    className="resource-table__actions--danger"
                    onClick={() => {
                      setRoleDeleteTarget(role);
                      setRoleDeleteError(null);
                    }}
                  >
                    Remover
                  </button>
                  <button type="button" onClick={() => handleOpenAudit('role', role.id, role.name)}>
                    Auditoria
                  </button>
                </>
              )}
            />
          </section>
        ) : null}

        {activeTab === 'api-keys' ? (
          <section
            role="tabpanel"
            id="security-tabpanel-api-keys"
            aria-labelledby="security-tab-api-keys"
          >
            <ResourceTable
              title="API keys de integração"
              description="Emita, rotacione e revogue tokens de acesso MCP mantendo visibilidade completa de escopos."
              ariaLabel="Tabela de API keys com owner e escopos"
              items={filteredApiKeys}
              columns={apiKeyColumns}
              getRowId={(item) => item.id}
              isLoading={isLoadingApiKeys}
              error={apiKeysError}
              emptyState="Nenhuma API key ativa. Gere credenciais para integrações automatizadas ou agentes externos."
              onRetry={() => {
                setLoadingApiKeys(true);
                setApiKeysError(null);
                fetchSecurityApiKeys()
                  .then((payload) => setApiKeys(payload))
                  .catch((error) => {
                    const message = error instanceof Error ? error.message : 'Falha ao carregar API keys.';
                    setApiKeysError(message);
                  })
                  .finally(() => setLoadingApiKeys(false));
              }}
              toolbar={
                <button type="button" onClick={openCreateApiKeyDialog}>
                  Nova API key
                </button>
              }
              filters={
                <>
                  <label>
                    Busca
                    <input
                      type="search"
                      value={apiKeySearch}
                      onChange={(event: ChangeEvent<HTMLInputElement>) => setApiKeySearch(event.target.value)}
                      placeholder="Pesquisar por nome, owner ou escopo"
                    />
                  </label>
                  <label>
                    Status
                    <select
                      value={apiKeyStatusFilter}
                      onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                        setApiKeyStatusFilter(
                          event.target.value === 'all'
                            ? 'all'
                            : (event.target.value as SecurityApiKey['status']),
                        )
                      }
                    >
                      <option value="all">Todas</option>
                      <option value="active">Ativas</option>
                      <option value="revoked">Revogadas</option>
                      <option value="expired">Expiradas</option>
                    </select>
                  </label>
                </>
              }
              renderActions={(key) => (
                <>
                  <button type="button" onClick={() => openEditApiKeyDialog(key)}>
                    Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRotateApiKey(key)}
                    disabled={pendingKeyActionId === key.id}
                  >
                    {pendingKeyActionId === key.id ? 'Rotacionando…' : 'Rotacionar'}
                  </button>
                  <button
                    type="button"
                    className="resource-table__actions--danger"
                    onClick={() => handleRevokeApiKey(key)}
                    disabled={pendingKeyActionId === key.id || key.status === 'revoked'}
                  >
                    {key.status === 'revoked'
                      ? 'Revogada'
                      : pendingKeyActionId === key.id
                        ? 'Revogando…'
                        : 'Revogar'}
                  </button>
                  <button type="button" onClick={() => handleOpenAudit('api-key', key.id, key.name)}>
                    Auditoria
                  </button>
                </>
              )}
            />
          </section>
        ) : null}

        {activeTab === 'audit' ? (
          <section
            role="tabpanel"
            id="security-tabpanel-audit"
            aria-labelledby="security-tab-audit"
          >
            <ConfigReloadAction />
            <ResourceTable
              title="Eventos de auditoria centralizada"
              description="Investigue ações críticas com filtros por ator, ação e período. Exportações em CSV ou JSON facilitam revisões externas."
              ariaLabel="Tabela de eventos de auditoria com filtros avançados"
              items={auditLogs}
              columns={auditColumns}
              getRowId={(item) => item.id}
              isLoading={isAuditTableLoading}
              error={auditTableError}
              emptyState="Nenhum evento encontrado para os filtros atuais. Ajuste o período ou refine a busca para visualizar a trilha de auditoria."
              onRetry={() => setAuditReloadToken((value) => value + 1)}
              toolbar={
                <div className="security__audit-toolbar">
                  <button type="button" onClick={handleExportAuditCsv} disabled={auditLogs.length === 0}>
                    Exportar CSV
                  </button>
                  <button type="button" onClick={handleExportAuditJson} disabled={auditLogs.length === 0}>
                    Exportar JSON
                  </button>
                  <span className="security__audit-summary">
                    {auditLogsTotal} {auditLogsTotal === 1 ? 'evento' : 'eventos'}
                  </span>
                </div>
              }
              filters={
                <form
                  className="security__audit-filters"
                  onSubmit={(event) => {
                    event.preventDefault();
                    handleApplyAuditFilters();
                  }}
                >
                  <label>
                    Filtro por ator
                    <input
                      type="search"
                      value={auditFilterDraft.actor}
                      onChange={(event: ChangeEvent<HTMLInputElement>) =>
                        setAuditFilterDraft((current) => ({ ...current, actor: event.target.value }))
                      }
                      placeholder="Buscar por ID, nome ou e-mail"
                    />
                  </label>
                  <label>
                    Filtro de ação
                    <input
                      type="search"
                      value={auditFilterDraft.action}
                      onChange={(event: ChangeEvent<HTMLInputElement>) =>
                        setAuditFilterDraft((current) => ({ ...current, action: event.target.value }))
                      }
                      placeholder="Ex.: security.user.update"
                    />
                  </label>
                  <label>
                    Início do período
                    <input
                      type="datetime-local"
                      value={auditFilterDraft.start}
                      onChange={(event: ChangeEvent<HTMLInputElement>) =>
                        setAuditFilterDraft((current) => ({ ...current, start: event.target.value }))
                      }
                    />
                  </label>
                  <label>
                    Fim do período
                    <input
                      type="datetime-local"
                      value={auditFilterDraft.end}
                      onChange={(event: ChangeEvent<HTMLInputElement>) =>
                        setAuditFilterDraft((current) => ({ ...current, end: event.target.value }))
                      }
                    />
                  </label>
                  <div className="security__audit-filter-actions">
                    <button type="submit">Aplicar filtros</button>
                    <button
                      type="button"
                      onClick={handleResetAuditFilters}
                      disabled={!canResetAuditFilters}
                    >
                      Limpar filtros
                    </button>
                  </div>
                </form>
              }
            />

            <div className="security__audit-pagination" role="navigation" aria-label="Paginação de auditoria">
              <label className="security__audit-page-size">
                Itens por página
                <select value={auditLogsPageSize} onChange={handleAuditPageSizeChange}>
                  <option value={1}>1</option>
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                </select>
              </label>
              <div className="security__audit-page-controls">
                <button type="button" onClick={handleAuditPreviousPage} disabled={isAuditPreviousDisabled}>
                  Página anterior
                </button>
                <span>
                  Página {auditLogsTotalPages === 0 ? 1 : auditLogsPage} de {effectiveAuditTotalPages}
                </span>
                <button type="button" onClick={handleAuditNextPage} disabled={isAuditNextDisabled}>
                  Próxima página
                </button>
              </div>
            </div>
          </section>
        ) : null}
      </div>

      <ResourceDialog
        title={userDialogMode === 'create' ? 'Convidar novo usuário' : 'Editar usuário'}
        description="Defina papéis e MFA obrigatório para garantir acesso seguro à console MCP."
        isOpen={isUserDialogOpen}
        isSubmitting={userDialogSubmitting}
        onClose={() => setUserDialogOpen(false)}
        onSubmit={handleUserDialogSubmit}
        error={userDialogError}
        submitLabel={userDialogMode === 'create' ? 'Enviar convite' : 'Salvar alterações'}
      >
        <label>
          Nome completo
          <input
            value={userDraft.name}
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              setUserDraft((draft) => ({ ...draft, name: event.target.value }))
            }
            placeholder="Ex.: Ana Silva"
          />
        </label>
        <label>
          E-mail corporativo
          <input
            type="email"
            value={userDraft.email}
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              setUserDraft((draft) => ({ ...draft, email: event.target.value }))
            }
            placeholder="ana.silva@empresa.com"
          />
        </label>
        <label>
          Papéis atribuídos
          <select
            multiple
            value={userDraft.roles}
            onChange={(event: ChangeEvent<HTMLSelectElement>) =>
              setUserDraft((draft) => ({
                ...draft,
                roles: Array.from(event.target.selectedOptions).map((option) => option.value),
              }))
            }
          >
            {roles.map((role) => (
              <option key={role.id} value={role.id}>
                {role.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Status de acesso
          <select
            value={userDraft.status}
            onChange={(event: ChangeEvent<HTMLSelectElement>) =>
              setUserDraft((draft) => ({ ...draft, status: event.target.value as SecurityUserStatus }))
            }
          >
            <option value="active">Ativo</option>
            <option value="invited">Convite pendente</option>
            <option value="suspended">Suspenso</option>
          </select>
        </label>
        <label>
          <span>Multi-factor authentication (MFA)</span>
          <select
            value={userDraft.mfaEnabled ? 'on' : 'off'}
            onChange={(event: ChangeEvent<HTMLSelectElement>) =>
              setUserDraft((draft) => ({ ...draft, mfaEnabled: event.target.value === 'on' }))
            }
          >
            <option value="on">Obrigatório</option>
            <option value="off">Opcional</option>
          </select>
        </label>
      </ResourceDialog>

      <ResourceDialog
        title="Remover usuário"
        description={userDeleteTarget ? `Revogar acesso de ${userDeleteTarget.name}.` : ''}
        isOpen={userDeleteTarget !== null}
        isSubmitting={isDeletingUser}
        onClose={() => setUserDeleteTarget(null)}
        onSubmit={(event: FormEvent<HTMLFormElement>) => {
          event.preventDefault();
          void handleDeleteUser();
        }}
        error={userDeleteError}
        submitLabel="Remover acesso"
        tone="danger"
      >
        <p>
          O usuário perderá acesso imediato à console MCP e terá sessão encerrada. Esta ação é auditável e pode ser revertida
          reenviando um convite.
        </p>
      </ResourceDialog>

      <ResourceDialog
        title={roleDialogMode === 'create' ? 'Criar novo papel' : 'Editar papel'}
        description="Padronize permissões para acelerar onboarding e simplificar auditorias SOX."
        isOpen={isRoleDialogOpen}
        isSubmitting={roleDialogSubmitting}
        onClose={() => setRoleDialogOpen(false)}
        onSubmit={handleRoleDialogSubmit}
        error={roleDialogError}
        submitLabel={roleDialogMode === 'create' ? 'Criar papel' : 'Salvar alterações'}
      >
        <label>
          Nome
          <input
            value={roleDraft.name}
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              setRoleDraft((draft) => ({ ...draft, name: event.target.value }))
            }
            placeholder="Ex.: Operações"
          />
        </label>
        <label>
          Descrição
          <textarea
            value={roleDraft.description}
            onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
              setRoleDraft((draft) => ({ ...draft, description: event.target.value }))
            }
            placeholder="Contextualize quando aplicar este papel."
          />
        </label>
        <label>
          Permissões (uma por linha)
          <textarea
            value={roleDraft.permissionsText}
            onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
              setRoleDraft((draft) => ({ ...draft, permissionsText: event.target.value }))
            }
            placeholder={['mcp.sessions.create', 'mcp.policies.deploy'].join('\n')}
          />
        </label>
      </ResourceDialog>

      <ResourceDialog
        title="Remover papel"
        description={roleDeleteTarget ? `Excluir o papel ${roleDeleteTarget.name}.` : ''}
        isOpen={roleDeleteTarget !== null}
        isSubmitting={isDeletingRole}
        onClose={() => setRoleDeleteTarget(null)}
        onSubmit={(event: FormEvent<HTMLFormElement>) => {
          event.preventDefault();
          void handleDeleteRole();
        }}
        error={roleDeleteError}
        submitLabel="Remover papel"
        tone="danger"
      >
        <p>Usuários associados terão as permissões deste papel removidas. Nenhum outro dado será alterado.</p>
      </ResourceDialog>

      <ResourceDialog
        title={apiKeyDialogMode === 'create' ? 'Gerar nova API key' : 'Editar API key'}
        description="Escopos limitados e expiração opcional ajudam a reduzir blast radius em integrações MCP."
        isOpen={isApiKeyDialogOpen}
        isSubmitting={apiKeyDialogSubmitting}
        onClose={() => setApiKeyDialogOpen(false)}
        onSubmit={handleApiKeyDialogSubmit}
        error={apiKeyDialogError}
        submitLabel={apiKeyDialogMode === 'create' ? 'Gerar API key' : 'Salvar alterações'}
      >
        <label>
          Nome
          <input
            value={apiKeyDraft.name}
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              setApiKeyDraft((draft) => ({ ...draft, name: event.target.value }))
            }
            placeholder="Ex.: Observabilidade - Prod"
          />
        </label>
        <label>
          Owner / Serviço
          <input
            value={apiKeyDraft.owner}
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              setApiKeyDraft((draft) => ({ ...draft, owner: event.target.value }))
            }
            placeholder="Squad responsável ou serviço automatizado"
          />
        </label>
        <label>
          Escopos (um por linha)
          <textarea
            value={apiKeyDraft.scopesText}
            onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
              setApiKeyDraft((draft) => ({ ...draft, scopesText: event.target.value }))
            }
            placeholder={['mcp:invoke', 'mcp:telemetry:read'].join('\n')}
          />
        </label>
        <label>
          Expiração (opcional)
          <input
            type="date"
            value={apiKeyDraft.expiresAt}
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              setApiKeyDraft((draft) => ({ ...draft, expiresAt: event.target.value }))
            }
          />
        </label>
      </ResourceDialog>

      <AuditTrailPanel
        title={auditResource ? `Auditoria • ${auditResource.title}` : 'Auditoria'}
        subtitle="Eventos ordenados do mais recente ao mais antigo"
        isOpen={auditResource !== null}
        events={auditEvents}
        isLoading={isAuditLoading}
        error={auditError}
        onRetry={() => {
          if (auditResource) {
            setAuditResource({ ...auditResource });
          }
        }}
        onClose={() => setAuditResource(null)}
      />

      <ResourceDialog
        title="Novo segredo gerado"
        description="Copie o token exibido abaixo. Ele não será mostrado novamente."
        isOpen={apiKeySecret !== null}
        isSubmitting={false}
        onClose={() => setApiKeySecret(null)}
        onSubmit={(event: FormEvent<HTMLFormElement>) => {
          event.preventDefault();
          setApiKeySecret(null);
        }}
        submitLabel="Entendi"
      >
        <p>
          API key <strong>{apiKeySecret?.key.name}</strong>
        </p>
        <label>
          Token
          <textarea readOnly value={apiKeySecret?.secret ?? ''} />
        </label>
        <p>
          Compartilhe com segurança por canais auditados. Tokens antigos permanecem válidos até sua revogação.
        </p>
      </ResourceDialog>
    </div>
  );
}
