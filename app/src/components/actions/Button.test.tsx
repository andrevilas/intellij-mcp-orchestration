import { render, screen, within } from '@testing-library/react';
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
      <>
        <Button variant="ghost" size="sm">
          Ghost
        </Button>
        <Button variant="outline">Outline</Button>
        <Button variant="link" icon={<span data-testid="icon" />}>
          Link
        </Button>
      </>,
    );
    expect(screen.getByRole('button', { name: 'Ghost' })).toHaveClass(
      'mcp-button--ghost',
      'mcp-button--sm',
    );
    expect(screen.getByRole('button', { name: 'Outline' })).toHaveClass('mcp-button--outline');
    const linkButton = screen.getByRole('button', { name: 'Link' });
    expect(linkButton).toHaveClass('mcp-button--link');
    expect(within(linkButton).getByTestId('icon')).toBeInTheDocument();
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
    expect(button).toHaveAttribute('aria-busy', 'true');
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
