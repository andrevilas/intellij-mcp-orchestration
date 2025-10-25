import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import Tooltip from './Tooltip';

describe('Tooltip', () => {
  it('associa aria-describedby ao elemento alvo', async () => {
    const user = userEvent.setup();
    render(
      <Tooltip content="Informações complementares" delay={{ open: 0, close: 0 }}>
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
      <Tooltip content="Atalho: ⌘K" delay={{ open: 0, close: 0 }}>
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

  it('suporta estados loading e disabled com anúncios únicos', async () => {
    const user = userEvent.setup();
    render(
      <Tooltip content="Original" loading loadingContent="Carregando tooltip" delay={{ open: 0, close: 0 }}>
        <button type="button">Sincronizar</button>
      </Tooltip>,
    );

    const trigger = screen.getByRole('button', { name: 'Sincronizar' });
    await user.hover(trigger);
    const bubble = await screen.findByRole('tooltip');
    expect(bubble).toHaveAttribute('aria-busy', 'true');
    expect(bubble).toHaveTextContent('Carregando tooltip');
    expect(bubble.querySelector('.mcp-tooltip__spinner')).toBeInTheDocument();

    render(
      <Tooltip content="Não deve abrir" disabled delay={{ open: 0, close: 0 }}>
        <button type="button">Inativo</button>
      </Tooltip>,
    );

    const disabledTrigger = screen.getByRole('button', { name: 'Inativo' });
    await user.hover(disabledTrigger);
    expect(screen.queryAllByRole('tooltip')).toHaveLength(1);
  });
});
