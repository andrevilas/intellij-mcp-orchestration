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
});
