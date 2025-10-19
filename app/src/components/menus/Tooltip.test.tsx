import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import Tooltip from './Tooltip';

describe('Tooltip', () => {
  it('associa aria-describedby ao elemento alvo', async () => {
    const user = userEvent.setup();
    render(
      <Tooltip content="Informações complementares">
        <button type="button">Ajuda</button>
      </Tooltip>,
    );

    const button = screen.getByRole('button', { name: 'Ajuda' });
    await user.hover(button);
    const tooltip = await screen.findByRole('tooltip');
    expect(button).toHaveAttribute('aria-describedby', tooltip.id);
  });

  it('esconde tooltip ao perder foco ou pressionar ESC', async () => {
    const user = userEvent.setup();
    render(
      <Tooltip content="Atalho: ⌘K">
        <button type="button">Paleta</button>
      </Tooltip>,
    );

    const button = screen.getByRole('button', { name: 'Paleta' });
    button.focus();
    await user.tab();
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();

    button.focus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });
});
