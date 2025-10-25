import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import Button from './Button';
import ButtonGroup from './ButtonGroup';

describe('actions components', () => {
  it('mantêm toolbar acessível com estados loading e disabled', async () => {
    const user = userEvent.setup();
    const onRefresh = vi.fn();

    render(
      <ButtonGroup label="Ações rápidas" segmented orientation="horizontal">
        <Button loading allowInteractionWhileLoading onClick={onRefresh}>
          Atualizar
        </Button>
        <Button disabled icon={<span aria-hidden="true">★</span>}>
          Fixar
        </Button>
        <Button variant="danger">Remover</Button>
      </ButtonGroup>,
    );

    const toolbar = screen.getByRole('toolbar', { name: 'Ações rápidas' });
    expect(toolbar).toHaveAttribute('data-orientation', 'horizontal');

    const refreshButton = screen.getByRole('button', { name: 'Atualizar' });
    expect(refreshButton).toHaveAttribute('aria-busy', 'true');
    expect(refreshButton).not.toBeDisabled();
    await user.click(refreshButton);
    expect(onRefresh).toHaveBeenCalledTimes(1);

    const pinnedButton = screen.getByRole('button', { name: 'Fixar' });
    expect(pinnedButton).toBeDisabled();
  });
});
