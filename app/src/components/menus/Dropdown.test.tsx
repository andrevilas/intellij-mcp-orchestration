import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import Dropdown, { type DropdownOption } from './Dropdown';

describe('Dropdown', () => {
  const options: DropdownOption[] = [
    { id: 'export', label: 'Exportar', onSelect: vi.fn() },
    {
      id: 'share',
      label: 'Compartilhar',
      description: 'Cria link público',
      onSelect: vi.fn(),
    },
    { id: 'archive', label: 'Arquivar', onSelect: vi.fn(), disabled: true },
  ];

  it('abre menu e executa ação selecionada', async () => {
    const user = userEvent.setup();
    render(<Dropdown label="Ações" options={options} />);

    await user.click(screen.getByRole('button', { name: 'Ações' }));
    const menu = screen.getByRole('menu');
    const shareButton = within(menu).getByRole('menuitem', { name: 'Compartilhar Cria link público' });

    await user.click(shareButton);
    expect(options[1].onSelect).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('navega via teclado respeitando itens desabilitados', async () => {
    const user = userEvent.setup();
    render(<Dropdown label="Opções" options={options} />);

    const trigger = screen.getByRole('button', { name: 'Opções' });
    trigger.focus();
    await user.keyboard('{ArrowDown}');

    const menu = screen.getByRole('menu');
    await user.keyboard('{ArrowDown}');
    await user.keyboard('{ArrowDown}');
    await user.keyboard('{ArrowDown}');

    const focused = menu.ownerDocument.activeElement as HTMLElement | null;
    expect(focused?.textContent).toContain('Compartilhar');
    expect(focused).not.toHaveAttribute('aria-disabled');
    const disabledOption = within(menu).getByRole('menuitem', { name: 'Arquivar' });
    expect(disabledOption).toHaveAttribute('aria-disabled', 'true');
  });

  it('fecha com tecla Escape e retorna foco ao gatilho', async () => {
    const user = userEvent.setup();
    render(<Dropdown label="Controles" options={options} />);

    await user.click(screen.getByRole('button', { name: 'Controles' }));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    await screen.findByRole('button', { name: 'Controles' });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Controles' })).toHaveFocus();
    });
  });

  it('expõe aria-label customizado e ícones nas opções', async () => {
    const user = userEvent.setup();
    render(
      <Dropdown
        label={<span aria-hidden="true">⋯</span>}
        triggerAriaLabel="Mais ações"
        options={[
          {
            ...options[0],
            icon: <span data-testid="dropdown-icon" />,
          },
          ...options.slice(1),
        ]}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Mais ações' }));
    const menu = screen.getByRole('menu');
    expect(menu).toBeInTheDocument();
    expect(within(menu).getByTestId('dropdown-icon')).toBeInTheDocument();
  });

  it('exibe mensagens de status exclusivas para loading e disabled', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const { rerender } = render(
      <Dropdown
        label="Sincronizar"
        options={[{ id: 'sync', label: 'Sincronizar agora', onSelect }]}
        loading
        loadingLabel="Sincronizando ações"
      />,
    );

    const trigger = screen.getByRole('button', { name: 'Sincronizar' });
    expect(trigger).toHaveAttribute('aria-busy', 'true');
    await user.click(trigger);
    const status = await screen.findByRole('status', { name: /Sincronizando ações/i });
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(onSelect).not.toHaveBeenCalled();

    await user.click(trigger);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();

    rerender(
      <Dropdown label="Desabilitado" options={options} disabled />,
    );

    const disabledTrigger = screen.getByRole('button', { name: 'Desabilitado' });
    expect(disabledTrigger).toBeDisabled();
    await user.click(disabledTrigger);
    expect(screen.queryAllByRole('menu')).toHaveLength(0);
  });

  it('permite abrir pelo ArrowUp e fecha ao tabular para fora', async () => {
    const user = userEvent.setup();
    render(
      <>
        <Dropdown label="Ferramentas" options={options} />
        <button type="button">Outro foco</button>
      </>,
    );

    const trigger = screen.getByRole('button', { name: 'Ferramentas' });
    trigger.focus();
    await user.keyboard('{ArrowUp}');

    const menu = screen.getByRole('menu');
    const lastEnabled = within(menu).getByRole('menuitem', { name: 'Compartilhar Cria link público' });
    expect(lastEnabled).toHaveFocus();

    await user.tab();
    await waitFor(() => {
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Ferramentas' })).not.toHaveFocus();
    expect(screen.getByRole('button', { name: 'Outro foco' })).toHaveFocus();
  });
});
