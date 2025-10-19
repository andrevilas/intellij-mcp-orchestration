import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import Button from './Button';

describe('Button', () => {
  it('renderiza texto e aplica variante padrão', () => {
    render(<Button>Salvar</Button>);
    const button = screen.getByRole('button', { name: 'Salvar' });
    expect(button).toHaveClass('mcp-button', 'mcp-button--primary');
  });

  it('suporta variantes e tamanhos customizados', () => {
    render(
      <Button variant="ghost" size="sm">
        Ghost
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Ghost' });
    expect(button).toHaveClass('mcp-button--ghost', 'mcp-button--sm');
  });

  it('exibe spinner e desabilita quando loading', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Enviando
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Enviando' });
    expect(button).toBeDisabled();
    expect(button.querySelector('.mcp-button__spinner')).toBeInTheDocument();
    await user.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('renderiza ícone opcional', () => {
    render(
      <Button icon={<span data-testid="icon" />}>Ação</Button>,
    );
    expect(screen.getByTestId('icon')).toBeInTheDocument();
  });
});
