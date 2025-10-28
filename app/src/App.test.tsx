import { act } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockInstance } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';

import App, { NOTIFICATION_READ_STATE_KEY } from './App';
import { ThemeProvider } from './theme/ThemeContext';
import {
  DASHBOARD_TEST_IDS,
  POLICIES_TEST_IDS,
  SERVERS_TEST_IDS,
} from './pages/testIds';
import { server } from './mocks/server';
import providersFixture from '#fixtures/providers.json';
import sessionsFixture from '#fixtures/sessions.json';
import notificationsFixture from '#fixtures/notifications.json';
import * as api from './api';
import type { ProviderSummary, Session } from './api';

function renderWithinProviders(): ReturnType<typeof render> {
  return render(
    <ThemeProvider>
      <App />
    </ThemeProvider>,
  );
}

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const providerCatalog = (providersFixture as { providers: ProviderSummary[] }).providers;
const geminiProvider = providerCatalog.find((entry) => entry.id === 'gemini');
if (!geminiProvider) {
  throw new Error('Gemini provider fixture not found');
}

const sessionCatalog = (sessionsFixture as { sessions: Session[] }).sessions;
const initialGeminiSession = sessionCatalog.find((entry) => entry.provider_id === geminiProvider.id);
if (!initialGeminiSession) {
  throw new Error('Gemini session fixture not found');
}

const notificationCatalog = (notificationsFixture as {
  notifications: Array<{ id: string; title: string; message: string }>;
}).notifications;

const finopsCriticalNotification = notificationCatalog.find((entry) => entry.id === 'notif-finops-budget');

const FALLBACK_NOTIFICATION_TITLE = 'Nenhum evento recente';
const FALLBACK_NOTIFICATION_MESSAGE =
  'As integrações MCP permanecem estáveis. Novas notificações aparecerão aqui automaticamente.';

const LONG_WAIT: NonNullable<Parameters<typeof screen.findByRole>[2]> = { timeout: 15000 };
const nativeFetch = globalThis.fetch.bind(globalThis);

async function mountApp(
  userOptions?: Parameters<typeof userEvent.setup>[0],
): Promise<{ user: ReturnType<typeof userEvent.setup> }> {
  const user = userEvent.setup(userOptions);

  await act(async () => {
    renderWithinProviders();
    await Promise.resolve();
  });

  await screen.findByRole('heading', { name: 'Operações unificadas' }, LONG_WAIT);

  return { user };
}

describe('App provider orchestration flow', () => {
  const originalConsoleError = console.error;
  let fetchSpy: MockInstance<Parameters<typeof globalThis.fetch>, ReturnType<typeof globalThis.fetch>>;
  let consoleErrorSpy: MockInstance<Parameters<typeof console.error>, ReturnType<typeof console.error>>;

  beforeAll(() => {
    (globalThis as unknown as { ResizeObserver: typeof ResizeObserverMock }).ResizeObserver = ResizeObserverMock;
  });

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
    consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation((message?: unknown, ...optionalParams: unknown[]) => {
        if (typeof message === 'string' && message.includes('not wrapped in act')) {
          return;
        }
        originalConsoleError(message, ...optionalParams);
      });
    window.localStorage.clear();
    globalThis.__CONSOLE_MCP_FIXTURES__ = 'ready';
    server.use(
      http.post('*/api/v1/telemetry/ui-events', () => HttpResponse.json({}, { status: 204 })),
    );
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  it('lists providers and provisions a session on demand', async () => {
    const { user } = await mountApp();

    await waitFor(() => expect(screen.queryByText('Carregando provedores…')).not.toBeInTheDocument());

    const providerCard = await screen.findByTestId(DASHBOARD_TEST_IDS.providerCard(geminiProvider.id), undefined, LONG_WAIT);
    const provisionButton = within(providerCard).getByRole('button', {
      name: 'Criar sessão de provisionamento',
    });
    await user.click(provisionButton);

    const dialog = await screen.findByRole('dialog', { name: /Overrides táticos para/i }, LONG_WAIT);
    const reasonInput = within(dialog).getByLabelText('Motivo');
    await user.clear(reasonInput);
    await user.type(reasonInput, 'Provisionamento disparado pela Console MCP');
    const sampleRateInput = within(dialog).getByLabelText('Sample rate de tracing (%)');
    await user.clear(sampleRateInput);
    await user.type(sampleRateInput, '50');

    const confirmButton = within(dialog).getByRole('button', { name: 'Provisionar com overrides' });
    await user.click(confirmButton);

    const successToast = await screen.findByText(
      /Sessão session-gemini-/i,
      { selector: '.feedback.success' },
      LONG_WAIT,
    );
    expect(successToast).toBeInTheDocument();

    await waitFor(() => {
      expect(
        fetchSpy.mock.calls.some(([url, options]) => {
          const target = url instanceof URL ? url.href : url?.toString() ?? '';
          return (
            target.includes(`/api/v1/providers/${geminiProvider.id}/sessions`) &&
            (options as RequestInit | undefined)?.method === 'POST'
          );
        }),
      ).toBe(true);
    });
  }, 30000);

  it('supports keyboard-first flows with skip link and arrow navigation', async () => {
    const { user } = await mountApp();

    const skipLink = await screen.findByRole('link', { name: 'Ir para o conteúdo principal' });
    await user.tab();
    expect(skipLink).toHaveFocus();

    await user.keyboard('{Enter}');
    const mainRegion = document.getElementById('main-content');
    expect(mainRegion).not.toBeNull();
    await waitFor(() => expect(mainRegion).toHaveFocus());

    const nav = screen.getByRole('navigation', { name: 'Navegação principal' });
    const navLinks = within(nav).getAllByRole('link');
    (navLinks[0] as HTMLAnchorElement).focus();

    await user.keyboard('{ArrowRight}');
    expect(navLinks[1]).toHaveFocus();
    await screen.findByRole('heading', { name: /Observabilidade unificada/i }, LONG_WAIT);

    await user.keyboard('{ArrowLeft}');
    expect(navLinks[0]).toHaveFocus();

    await waitFor(() => {
      expect(navLinks[0]).toHaveAttribute('aria-current', 'page');
      expect(navLinks[1]).not.toHaveAttribute('aria-current', 'page');
    });
  }, 30000);

  it('allows controlling servers from the servers view', async () => {
    const { user } = await mountApp();
    const serversTab = screen.getByRole('link', { name: 'Servidores' });
    await user.click(serversTab);

    await screen.findByRole('heading', { name: /Servidores MCP/i }, LONG_WAIT);

    const serverCard = await screen.findByTestId(
      SERVERS_TEST_IDS.card(geminiProvider.id),
      {},
      LONG_WAIT,
    );
    const scoped = within(serverCard);

    const stopButton = await scoped.findByRole('button', { name: 'Parar' });
    await user.click(stopButton);

    const stopDialog = await screen.findByRole('dialog', {
      name: `Parar servidor · ${geminiProvider.name}`,
    });
    await user.click(within(stopDialog).getByRole('button', { name: 'Parar servidor' }));
    await user.click(within(stopDialog).getByRole('button', { name: 'Parar agora' }));

    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: `Parar servidor · ${geminiProvider.name}` }),
      ).not.toBeInTheDocument(),
    );

    await waitFor(() => expect(scoped.getByText('Offline')).toBeInTheDocument());

    const startButton = scoped.getByRole('button', { name: 'Iniciar' });
    await user.click(startButton);

    const startDialog = await screen.findByRole('dialog', {
      name: `Iniciar servidor · ${geminiProvider.name}`,
    });
    await user.click(within(startDialog).getByRole('button', { name: 'Iniciar servidor' }));
    await user.click(within(startDialog).getByRole('button', { name: 'Iniciar agora' }));

    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: `Iniciar servidor · ${geminiProvider.name}` }),
      ).not.toBeInTheDocument(),
    );

    await waitFor(() => expect(scoped.getByText('Online')).toBeInTheDocument());
  }, 30000);

  it('permite editar, pingar e remover servidores MCP pela página de servidores', async () => {
    const { user } = await mountApp();
    await user.click(screen.getByRole('link', { name: 'Servidores' }));

    await screen.findByRole('heading', { name: /Servidores MCP/i }, LONG_WAIT);

    const serverCard = await screen.findByTestId(
      SERVERS_TEST_IDS.card(geminiProvider.id),
      {},
      LONG_WAIT,
    );
    const scoped = within(serverCard);

    const pingButton = scoped.getByRole('button', { name: 'Ping agora' });
    await user.click(pingButton);

    const pingFeedback = await scoped.findByRole('status', {
      name: 'Ping realizado com sucesso via fixtures.',
    });
    expect(pingFeedback).toBeInTheDocument();

    const editButton = scoped.getByRole('button', { name: 'Editar servidor' });
    await user.click(editButton);

    const editDialog = await screen.findByRole('dialog', { name: 'Editar servidor MCP' });
    await user.clear(within(editDialog).getByLabelText('Nome exibido'));
    await user.type(within(editDialog).getByLabelText('Nome exibido'), 'Gemini MCP · Observabilidade');
    await user.clear(within(editDialog).getByLabelText('Comando/endpoint'));
    await user.type(within(editDialog).getByLabelText('Comando/endpoint'), '/opt/mcp/gemini');
    await user.clear(within(editDialog).getByLabelText('Descrição'));
    await user.type(
      within(editDialog).getByLabelText('Descrição'),
      'Servidor MCP supervisionado pela console.',
    );

    await user.click(within(editDialog).getByRole('button', { name: 'Salvar alterações' }));

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Editar servidor MCP' })).not.toBeInTheDocument(),
    );

    const updatedHeading = await screen.findByRole('heading', {
      level: 2,
      name: 'Gemini MCP · Observabilidade',
    });
    const updatedCard = updatedHeading.closest('article');
    expect(updatedCard).not.toBeNull();

    const removeButton = within(updatedCard as HTMLElement).getByRole('button', { name: 'Remover servidor' });
    await user.click(removeButton);

    const deleteDialog = await screen.findByRole('dialog', { name: 'Remover servidor MCP' });
    await user.click(within(deleteDialog).getByRole('button', { name: 'Remover servidor' }));

    await waitFor(() =>
      expect(
        screen.queryByRole('heading', { level: 2, name: 'Gemini MCP · Observabilidade' }),
      ).not.toBeInTheDocument(),
    );
  }, 30000);

  it('executes connectivity checks from the keys view', async () => {
    const { user } = await mountApp();
    await user.click(screen.getByRole('link', { name: 'Chaves' }));

    await screen.findByRole('heading', { name: /Chaves MCP/i }, LONG_WAIT);

    const keyHeading = await screen.findByRole('heading', { level: 2, name: geminiProvider.name });
    const keyCard = keyHeading.closest('article');
    if (!keyCard) {
      throw new Error('Key card not found');
    }
    const scoped = within(keyCard);

    const testButton = scoped.getByRole('button', { name: 'Testar conectividade' });
    await user.click(testButton);

    expect(await scoped.findByText('Secret validado pelas fixtures locais.')).toBeInTheDocument();
    expect(scoped.getByText('Handshake saudável')).toBeInTheDocument();
  }, 30000);

  it('permite explorar cenários de routing e simular falhas', async () => {
    const { user } = await mountApp();
    await user.click(screen.getByRole('link', { name: 'Routing' }));

    await screen.findByRole('heading', { name: /Simulador/i }, LONG_WAIT);

    const focusBadge = await screen.findByTestId('routing-focus');
    expect(focusBadge).toHaveTextContent('Redução de custo');

    const latencyOption = screen.getByRole('radio', { name: /Latência prioritária/i });
    await user.click(latencyOption);

    await waitFor(() => expect(screen.getByTestId('routing-focus')).toHaveTextContent('Resposta em milissegundos'));

    const failoverSelect = screen.getByLabelText('Falha simulada');
    await user.selectOptions(failoverSelect, geminiProvider.name);

    await waitFor(() =>
      expect(
        fetchSpy.mock.calls.some(([url, options]) => {
          const target = url instanceof URL ? url.href : url?.toString() ?? '';
          return (
            target.includes('/api/v1/routing/simulate') &&
            (options as RequestInit | undefined)?.method === 'POST'
          );
        }),
      ).toBe(true),
    );
  }, 30000);

  it('apresenta filtros de FinOps e exporta CSV da série temporal', async () => {
    const { user } = await mountApp();
    await user.click(screen.getByRole('link', { name: 'FinOps' }));

    await screen.findByRole('heading', { name: /Séries temporais/i }, LONG_WAIT);

    const exportButton = await screen.findByRole('button', { name: 'Exportar CSV' });
    expect(exportButton).toBeEnabled();

    const providerSelect = screen.getByLabelText('Provedor');
    await user.selectOptions(providerSelect, geminiProvider.id);

    const periodButton = screen.getByRole('button', { name: '7 dias' });
    await user.click(periodButton);

    const metricButton = screen.getByRole('button', { name: 'Tokens' });
    await user.click(metricButton);

    expect(await screen.findByRole('table', { name: /Resumo diário filtrado/i })).toBeInTheDocument();

    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;

    const createObjectURLMock = vi.fn(() => 'blob:finops');
    const revokeObjectURLMock = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      writable: true,
      value: createObjectURLMock,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      writable: true,
      value: revokeObjectURLMock,
    });
    const anchorClickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    try {
      await user.click(exportButton);
      expect(createObjectURLMock).toHaveBeenCalled();

      const experimentCsvButton = await screen.findByRole('button', {
        name: 'Exportar experimentos em CSV',
      });
      await user.click(experimentCsvButton);

      const experimentJsonButton = screen.getByRole('button', { name: 'Exportar experimentos em JSON' });
      await user.click(experimentJsonButton);

      const laneCsvButton = screen.getByRole('button', { name: 'Exportar custos por tier em CSV' });
      await user.click(laneCsvButton);

      const marketplaceJsonButton = screen.getByRole('button', {
        name: 'Exportar marketplace em JSON',
      });
      await user.click(marketplaceJsonButton);

      expect(anchorClickSpy).toHaveBeenCalledTimes(5);
      await new Promise((resolve) => setTimeout(resolve, 1100));
      expect(revokeObjectURLMock).toHaveBeenCalled();
    } finally {
      anchorClickSpy.mockRestore();
      if (typeof originalCreateObjectURL === 'function') {
        Object.defineProperty(URL, 'createObjectURL', {
          configurable: true,
          writable: true,
          value: originalCreateObjectURL,
        });
      } else {
        delete (URL as unknown as Record<string, unknown>).createObjectURL;
      }
      if (typeof originalRevokeObjectURL === 'function') {
        Object.defineProperty(URL, 'revokeObjectURL', {
          configurable: true,
          writable: true,
          value: originalRevokeObjectURL,
        });
      } else {
        delete (URL as unknown as Record<string, unknown>).revokeObjectURL;
      }
    }
  }, 30000);

  it('permite alternar superfícies pelo command palette', async () => {
    const { user } = await mountApp();

    const paletteButton = screen.getByRole('button', { name: /Command palette/i });
    expect(paletteButton).toHaveAttribute('aria-expanded', 'false');

    await user.click(paletteButton);

    const palette = await screen.findByRole('dialog', { name: 'Ações rápidas' });
    expect(paletteButton).toHaveAttribute('aria-expanded', 'true');

    const searchBox = within(palette).getByRole('searchbox', { name: 'Buscar comando' });
    await user.type(searchBox, 'Routing');

    const routingOptions = await within(palette).findAllByRole('option', { name: /Routing/i });
    await user.click(routingOptions[0]);

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Ações rápidas' })).not.toBeInTheDocument());
    expect(paletteButton).toHaveAttribute('aria-expanded', 'false');

    await screen.findByRole('heading', { name: /Simulador/i }, LONG_WAIT);
  }, 30000);

  it('exibe a central de notificações e permite triagem rápida', async () => {
    const { user } = await mountApp();

    const notificationsButton = await screen.findByRole('button', { name: /Abrir central de notificações/i });
    expect(notificationsButton).toHaveAttribute('aria-expanded', 'false');

    await user.click(notificationsButton);

    const notificationCenter = await screen.findByRole(
      'dialog',
      { name: 'Status operacionais e FinOps' },
      LONG_WAIT,
    );
    expect(notificationsButton).toHaveAttribute('aria-expanded', 'true');

    const notificationList = within(notificationCenter).getByRole('list', { name: 'Lista de notificações' });
    const allNotifications = within(notificationList).getAllByRole('listitem');
    expect(allNotifications.length).toBeGreaterThan(1);

    const firstNotification = allNotifications[0];
    const title = within(firstNotification).getByRole('heading', { level: 3 }).textContent ?? '';
    const toggleButton = within(firstNotification).getByRole('button', { name: 'Marcar como lida' });
    await user.click(toggleButton);

    await waitFor(() => expect(toggleButton).toHaveTextContent('Marcar como não lida'));

    const unreadFilter = within(notificationCenter).getByRole('radio', { name: /Não lidas/ });
    await user.click(unreadFilter);

    within(notificationList)
      .getAllByRole('listitem')
      .forEach((notification) => {
        expect(within(notification).queryByRole('heading', { level: 3, name: title })).toBeNull();
      });

    const markAllButton = within(notificationCenter).getByRole('button', { name: 'Limpar' });
    await user.click(markAllButton);
    await waitFor(() => expect(markAllButton).toBeDisabled());
  }, 30000);

  it('permite aplicar templates de política e executar rollback', async () => {
    const { user } = await mountApp();
    await user.click(screen.getByRole('link', { name: 'Políticas' }));

    await screen.findByRole('heading', { name: /Políticas MCP/i }, LONG_WAIT);

    const templatesSection = await screen.findByTestId(POLICIES_TEST_IDS.templates, undefined, LONG_WAIT);
    const routingTemplate = await within(templatesSection).findByLabelText('Template Routing focado em latência');
    await user.click(routingTemplate);

    const applyButton = await screen.findByRole('button', { name: 'Aplicar template' });
    await user.click(applyButton);

    const applyDialog = await screen.findByRole('dialog', { name: 'Aplicar template · Routing focado em latência' });
    const armApply = within(applyDialog).getByRole('button', { name: 'Aplicar template' });
    await user.click(armApply);
    const confirmApply = within(applyDialog).getByRole('button', { name: 'Aplicar agora' });
    await user.click(confirmApply);

    await waitFor(() =>
      expect(
        fetchSpy.mock.calls.some(([url, options]) => {
          const target = url instanceof URL ? url.href : url?.toString() ?? '';
          return (
            target.includes('/api/v1/policies/deployments') &&
            (options as RequestInit | undefined)?.method === 'POST'
          );
        }),
      ).toBe(true),
    );

    await screen.findByRole('heading', { level: 2, name: 'Routing focado em latência' }, LONG_WAIT);
    await waitFor(() =>
      expect(
        screen.getAllByText('Routing focado em latência ativado para toda a frota.').length,
      ).toBeGreaterThan(0),
    );

    const actionsSection = screen.getByTestId(POLICIES_TEST_IDS.actions);
    const rollbackButton = within(actionsSection).getByRole('button', { name: 'Rollback imediato' });
    await user.click(rollbackButton);

    const rollbackDialog = await screen.findByRole('dialog', { name: 'Rollback imediato · FinOps burn-rate' });
    const armRollback = within(rollbackDialog).getByRole('button', { name: 'Confirmar rollback' });
    await user.click(armRollback);
    const confirmRollback = within(rollbackDialog).getByRole('button', { name: 'Rollback agora' });
    await user.click(confirmRollback);

    await waitFor(() =>
      expect(
        fetchSpy.mock.calls.some(([url, options]) => {
          const target = url instanceof URL ? url.href : url?.toString() ?? '';
          return (
            target.includes('/api/v1/policies/deployments/') &&
            (options as RequestInit | undefined)?.method === 'DELETE'
          );
        }),
      ).toBe(true),
    );

    await waitFor(() =>
      expect(
        screen.getAllByText('Rollback concluído para FinOps burn-rate.').length,
      ).toBeGreaterThan(0),
    );

    const statusSection = await screen.findByTestId(POLICIES_TEST_IDS.status, undefined, LONG_WAIT);
    expect(within(statusSection).getByText('FinOps burn-rate')).toBeInTheDocument();
  }, 30000);

  it('carrega notificações remotas durante o bootstrap', async () => {
    const previousFixtureStatus = globalThis.__CONSOLE_MCP_FIXTURES__;
    globalThis.__CONSOLE_MCP_FIXTURES__ = 'disabled';

    const notificationsSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const notificationsMock = vi
      .spyOn(api, 'fetchNotifications')
      .mockRejectedValue(new Error('Erro ao carregar notificações'));
    const { user } = await mountApp();

    try {
      const notificationButton = await screen.findByRole('button', { name: /Abrir central de notificações/i });
      await user.click(notificationButton);

      const notificationCenter = await screen.findByRole(
        'dialog',
        { name: 'Status operacionais e FinOps' },
        LONG_WAIT,
      );

      const fallbackNotification = await within(notificationCenter).findByRole('heading', {
        level: 3,
        name: FALLBACK_NOTIFICATION_TITLE,
      });
      const fallbackItem = fallbackNotification.closest('li');
      expect(fallbackItem).not.toBeNull();
      if (fallbackItem) {
        expect(fallbackItem).toHaveTextContent(FALLBACK_NOTIFICATION_MESSAGE);
      }

      await waitFor(() => {
        const storedState = window.localStorage.getItem(NOTIFICATION_READ_STATE_KEY);
        expect(storedState).not.toBeNull();
        expect(JSON.parse(storedState!)).toMatchObject({ 'platform-placeholder': false });
      });

      expect(notificationsSpy).toHaveBeenCalled();
      expect(notificationsMock).toHaveBeenCalled();
    } finally {
      notificationsMock.mockRestore();
      notificationsSpy.mockRestore();
      globalThis.__CONSOLE_MCP_FIXTURES__ = previousFixtureStatus ?? 'ready';
    }
  }, 30000);

  it('usa fallback quando a API retorna lista vazia', async () => {
    const previousFixtureStatus = globalThis.__CONSOLE_MCP_FIXTURES__;
    globalThis.__CONSOLE_MCP_FIXTURES__ = 'disabled';

    const notificationsMock = vi.spyOn(api, 'fetchNotifications').mockResolvedValue([]);

    const { user } = await mountApp();

    const notificationButton = await screen.findByRole('button', { name: /Abrir central de notificações/i });
    await user.click(notificationButton);

    const notificationCenter = await screen.findByRole(
      'dialog',
      { name: 'Status operacionais e FinOps' },
      LONG_WAIT,
    );

    const fallbackNotification = await within(notificationCenter).findByRole('heading', {
      level: 3,
      name: FALLBACK_NOTIFICATION_TITLE,
    });
    expect(fallbackNotification).toBeInTheDocument();

    expect(notificationsMock).toHaveBeenCalled();
    notificationsMock.mockRestore();
    globalThis.__CONSOLE_MCP_FIXTURES__ = previousFixtureStatus ?? 'ready';
  }, 30000);

  it('persists notification read state across reloads', async () => {
    const { user } = await mountApp();

    const notificationButton = await screen.findByRole('button', { name: /Abrir central de notificações/i });
    await user.click(notificationButton);

    const notificationCenter = await screen.findByRole(
      'dialog',
      { name: 'Status operacionais e FinOps' },
      LONG_WAIT,
    );

    if (!finopsCriticalNotification) {
      throw new Error('Notification fixture not found');
    }

    await within(notificationCenter).findByText(finopsCriticalNotification.title);

    const markAllButton = within(notificationCenter).getByRole('button', { name: 'Limpar' });
    await user.click(markAllButton);
    await waitFor(() => expect(markAllButton).toBeDisabled());

    const stored = window.localStorage.getItem(NOTIFICATION_READ_STATE_KEY);
    expect(stored).not.toBeNull();

    const parsed = JSON.parse(stored!);
    expect(parsed[finopsCriticalNotification.id]).toBe(true);
  }, 30000);

  it('renderiza showcase UI kit com toasts e modais acessíveis', async () => {
    const previousFixtureStatus = globalThis.__CONSOLE_MCP_FIXTURES__;
    globalThis.__CONSOLE_MCP_FIXTURES__ = 'disabled';

    const { user } = await mountApp();

    try {
      const uiKitAside = await screen.findByLabelText('Mostruário UI Kit', undefined, LONG_WAIT);
      const showcase = await within(uiKitAside).findByRole('region', { name: 'UI Kit' });

      await user.click(within(showcase).getByRole('button', { name: 'Reexecutar health-check' }));
      expect(await screen.findByRole('status', { name: 'Health-check reenviado' })).toBeInTheDocument();

      await user.click(within(showcase).getByRole('button', { name: 'Abrir confirmação' }));
      expect(await screen.findByRole('dialog', { name: 'Excluir instância' })).toBeInTheDocument();
    } finally {
      globalThis.__CONSOLE_MCP_FIXTURES__ = previousFixtureStatus ?? 'ready';
    }
  }, 30000);
});
