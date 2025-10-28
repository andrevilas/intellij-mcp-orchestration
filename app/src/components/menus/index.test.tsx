import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

    const { rerender } = render(
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
    const status = await screen.findByText(/Sincronizando ações/i);
    expect(status).toHaveAttribute('role', 'status');
    expect(status).toHaveAttribute('aria-live', 'polite');
    rerender(
      <div>
        <Dropdown label="Ações contextuais" options={dropdownOptions} loading={false} />
        <Tooltip content="Executa rotina" delay={{ open: 0, close: 0 }}>
          <button type="button">Rotina</button>
        </Tooltip>
      </div>,
    );

    fireEvent.keyDown(document.body, { key: 'Escape' });
    fireEvent.keyUp(document.body, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());

    const tooltipTrigger = screen.getByRole('button', { name: 'Rotina' });
    await user.hover(tooltipTrigger);
    const tooltip = await screen.findByRole('tooltip');
    tooltipTrigger.focus();
    expect(tooltip).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });
});
