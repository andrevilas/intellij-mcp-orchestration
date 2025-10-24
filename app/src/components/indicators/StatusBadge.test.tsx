import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import StatusBadge from './StatusBadge';

describe('StatusBadge', () => {
  it('renders children when no status is active', () => {
    render(<StatusBadge tone="info">Online</StatusBadge>);

    const label = screen.getByText('Online');
    expect(label).toBeInTheDocument();
    expect(label.closest('.status-badge')).toHaveAttribute('aria-label', 'Online — Estado informativo');
  });

  it('renders loading state message with progress indicator semantics', () => {
    render(
      <StatusBadge status="loading" statusMessages={{ loading: 'Carregando badges…' }}>
        Online
      </StatusBadge>,
    );

    const message = screen.getByText('Carregando badges…');
    expect(message).toBeInTheDocument();
    const container = message.closest('.status-badge');
    expect(container).toHaveAttribute('role', 'status');
    expect(container).toHaveAttribute('aria-busy', 'true');
  });

  it('shows retry action when error status is active', () => {
    const onRetry = vi.fn();
    render(
      <StatusBadge
        status="error"
        statusMessages={{ error: 'Falha ao sincronizar badges.' }}
        onRetry={onRetry}
      />,
    );

    const retryButton = screen.getByRole('button', { name: 'Tentar novamente' });
    expect(retryButton).toBeInTheDocument();
    retryButton.click();
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
