import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import Dropdown, { type DropdownOption } from './Dropdown';
import Tooltip from './Tooltip';

const dropdownOptions: DropdownOption[] = [
  { id: 'sync', label: 'Sincronizar', onSelect: vi.fn() },
];

describe('menus components', () => {
  it('coordena dropdowns e tooltips com fechamento por ESC', async () => {
    const user = userEvent.setup();

    render(
      <div>
        <Dropdown
          label="Ações contextuais"
          options={dropdownOptions}
          loading
          loadingLabel="Sincronizando ações"
        />
        <Tooltip content="Executa rotina" delay={{ open: 0, close: 0 }}>
          <button type="button">Rotina</button>
        </Tooltip>
      </div>,
    );

    const dropdownTrigger = screen.getByRole('button', { name: 'Ações contextuais' });
    await user.click(dropdownTrigger);
    const status = await screen.findByRole('status', { name: /Sincronizando ações/i });
    expect(status).toHaveAttribute('aria-live', 'polite');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();

    const tooltipTrigger = screen.getByRole('button', { name: 'Rotina' });
    tooltipTrigger.focus();
    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });
});
