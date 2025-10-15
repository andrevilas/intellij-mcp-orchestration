import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import App from './App';

describe('MCP Console UI shell', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.body.className = '';
    delete document.body.dataset.theme;
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it('navega entre rotas e atualiza breadcrumbs', async () => {
    const user = userEvent.setup();
    await act(async () => {
      render(<App />);
    });

    expect(await screen.findByRole('heading', { name: /Dashboard operacional/i })).toBeInTheDocument();

    const serversLink = await screen.findByRole('link', { name: 'Servers' });
    await act(async () => {
      await user.click(serversLink);
    });

    expect(await screen.findByRole('heading', { name: /Servers MCP/i })).toBeInTheDocument();

    const breadcrumb = screen.getByRole('navigation', { name: 'Trilha de navegação' });
    expect(breadcrumb).toHaveTextContent('Início');
    expect(breadcrumb).toHaveTextContent('Servers');
  });

  it('permite alternar tema light/dark pelo ThemeSwitch', async () => {
    const user = userEvent.setup();
    await act(async () => {
      render(<App />);
    });

    const toggle = await screen.findByRole('button', { name: /Ativar tema escuro/i });
    expect(document.body.classList.contains('theme-dark')).toBe(false);

    await act(async () => {
      await user.click(toggle);
    });

    expect(document.body.classList.contains('theme-dark')).toBe(true);
    expect(window.localStorage.getItem('mcp-console-theme')).toBe('dark');

    const backToLight = await screen.findByRole('button', { name: /Ativar tema claro/i });
    await act(async () => {
      await user.click(backToLight);
    });

    expect(document.body.classList.contains('theme-dark')).toBe(false);
    expect(window.localStorage.getItem('mcp-console-theme')).toBe('light');
  });
});
