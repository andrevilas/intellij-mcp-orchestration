import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { SecretValue } from '../api';
import Keys, { type KeysProps } from './Keys';

describe('Keys secrets management', () => {
  const provider = {
    id: 'gemini',
    name: 'Gemini MCP',
    description: 'Model Provider',
    command: 'gemini',
    capabilities: ['chat', 'vision'],
    tags: ['llm'],
    transport: 'stdio',
  };

  function renderComponent(overrides: Partial<KeysProps> = {}) {
    const props: KeysProps = {
      providers: [provider],
      secrets: [],
      isLoading: false,
      initialError: null,
      onSecretSave: vi.fn(async (_id: string, value: string): Promise<SecretValue> => ({
        provider_id: provider.id,
        value,
        updated_at: new Date().toISOString(),
      })),
      onSecretDelete: vi.fn(async () => {}),
      onSecretReveal: vi.fn(async () => ({
        provider_id: provider.id,
        value: 'sk-live-123',
        updated_at: new Date().toISOString(),
      })),
      ...overrides,
    };

    const result = render(<Keys {...props} />);
    return { ...result, props };
  }

  it('loads existing secret value when editing and saves updates', async () => {
    const user = userEvent.setup();
    const onSecretReveal = vi.fn(async () => ({
      provider_id: provider.id,
      value: 'sk-live-123',
      updated_at: new Date().toISOString(),
    }));
    const onSecretSave = vi.fn(async (_id: string, value: string) => ({
      provider_id: provider.id,
      value,
      updated_at: new Date().toISOString(),
    }));

    renderComponent({
      secrets: [
        { provider_id: provider.id, has_secret: true, updated_at: '2024-01-01T00:00:00.000Z' },
      ],
      onSecretReveal,
      onSecretSave,
    });

    await screen.findByRole('heading', { name: provider.name });
    const editButton = await screen.findByRole('button', { name: 'Atualizar chave' });

    await user.click(editButton);

    await waitFor(() => {
      expect(onSecretReveal).toHaveBeenCalledWith(provider.id);
    });

    const input = await screen.findByLabelText('Chave de acesso');
    await waitFor(() => expect(input).toHaveValue('sk-live-123'));

    await user.clear(input);
    await user.type(input, 'sk-live-999');

    const saveButton = screen.getByRole('button', { name: 'Salvar agora' });
    await user.click(saveButton);

    await waitFor(() => {
      expect(onSecretSave).toHaveBeenCalledWith(provider.id, 'sk-live-999');
    });
  });

  it('allows configuring a new secret without revealing previous value', async () => {
    const user = userEvent.setup();
    const onSecretReveal = vi.fn();
    const onSecretSave = vi.fn(async (_id: string, value: string) => ({
      provider_id: provider.id,
      value,
      updated_at: new Date().toISOString(),
    }));

    renderComponent({ onSecretReveal, onSecretSave });

    await screen.findByRole('heading', { name: provider.name });
    const configureButton = screen.getByRole('button', { name: 'Configurar chave' });

    await user.click(configureButton);
    expect(onSecretReveal).not.toHaveBeenCalled();

    const input = await screen.findByLabelText('Chave de acesso');
    await user.type(input, 'sk-test-abc');

    const saveButton = screen.getByRole('button', { name: 'Salvar agora' });
    await user.click(saveButton);

    await waitFor(() => {
      expect(onSecretSave).toHaveBeenCalledWith(provider.id, 'sk-test-abc');
    });
  });

  it('supports removing an existing secret from the provider card', async () => {
    const user = userEvent.setup();
    const onSecretDelete = vi.fn(async () => {});

    renderComponent({
      secrets: [
        { provider_id: provider.id, has_secret: true, updated_at: '2024-01-01T00:00:00.000Z' },
      ],
      onSecretDelete,
    });

    const editButton = await screen.findByRole('button', { name: 'Atualizar chave' });
    await user.click(editButton);

    const removeButton = await screen.findByRole('button', { name: 'Remover chave' });
    await user.click(removeButton);

    await waitFor(() => {
      expect(onSecretDelete).toHaveBeenCalledWith(provider.id);
    });
  });

  it('summarises providers and highlights pending credentials', async () => {
    renderComponent({
      secrets: [
        { provider_id: 'other', has_secret: true, updated_at: '2024-01-01T00:00:00.000Z' },
      ],
      providers: [
        provider,
        {
          id: 'other',
          name: 'Outra Console',
          description: 'Agente auxiliar',
          command: 'other',
          capabilities: ['search'],
          tags: [],
          transport: 'http',
        },
      ],
    });

    const summary = await screen.findByLabelText('Resumo de credenciais por provedor');
    const stats = within(summary).getAllByText(/\d/);
    expect(stats[0]).toHaveTextContent('2');
  });
});
