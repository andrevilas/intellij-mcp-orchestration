import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import Button from './Button';
import ButtonGroup from './ButtonGroup';

describe('ButtonGroup', () => {
  it('renderiza toolbar com rótulo acessível', () => {
    render(
      <ButtonGroup label="Ações do servidor">
        <Button>Iniciar</Button>
        <Button variant="danger">Parar</Button>
      </ButtonGroup>,
    );

    const toolbar = screen.getByRole('toolbar', { name: 'Ações do servidor' });
    expect(toolbar).toHaveAttribute('data-orientation', 'horizontal');
  });

  it('suporta orientação vertical e modo segmentado', () => {
    render(
      <ButtonGroup orientation="vertical" segmented label="Executar pipeline">
        <Button icon={<span data-testid="icon" />} aria-label="Rodar" />
        <Button loading aria-label="Publicar" />
      </ButtonGroup>,
    );

    const toolbar = screen.getByRole('toolbar', { name: 'Executar pipeline' });
    expect(toolbar).toHaveAttribute('aria-orientation', 'vertical');
    expect(toolbar).toHaveClass('mcp-button-group--segmented');
  });
});
