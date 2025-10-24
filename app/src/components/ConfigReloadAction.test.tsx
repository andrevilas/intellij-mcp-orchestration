import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';

import ConfigReloadAction from './ConfigReloadAction';
import {
  applyGovernedConfigReload,
  planGovernedConfigReload,
  type GovernedConfigReloadApplyResponse,
  type GovernedConfigReloadPlanResponse,
} from '../api';

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    planGovernedConfigReload: vi.fn(),
    applyGovernedConfigReload: vi.fn(),
  };
});

describe('ConfigReloadAction', () => {
  const planMock = planGovernedConfigReload as unknown as Mock;
  const applyMock = applyGovernedConfigReload as unknown as Mock;

  beforeEach(() => {
    vi.resetAllMocks();
  });

  function buildPlanResponse(): GovernedConfigReloadPlanResponse {
    return {
      planId: 'reload-plan-123',
      message: 'Plano gerado para regerar finops.checklist.',
      plan: {
        intent: 'generate_artifact',
        summary: 'Gerar checklist finops',
        steps: [],
        diffs: [
          {
            path: 'generated/finops/checklist.md',
            summary: 'Atualizar checklist',
            changeType: 'update',
            diff: '--- a/generated/finops/checklist.md\n+++ b/generated/finops/checklist.md\n+Conteúdo',
          },
        ],
        risks: [],
        status: 'pending',
        context: [],
        approvalRules: [],
      },
      planPayload: {
        intent: 'generate_artifact',
        summary: 'Gerar checklist finops',
        steps: [],
        diffs: [
          {
            path: 'generated/finops/checklist.md',
            summary: 'Atualizar checklist',
            change_type: 'update',
            diff: '--- a/generated/finops/checklist.md\n+++ b/generated/finops/checklist.md\n+Conteúdo',
          },
        ],
        risks: [],
        status: 'pending',
        context: [],
        approval_rules: [],
      },
      patch: '--- a/generated/finops/checklist.md\n+++ b/generated/finops/checklist.md\n+Conteúdo',
    };
  }

  function buildApplyResponse(): GovernedConfigReloadApplyResponse {
    return {
      status: 'completed',
      message: 'Artefato regenerado com sucesso.',
      recordId: 'rec-reload-1',
      branch: 'chore/reload-artifact',
      baseBranch: 'main',
      commitSha: 'def456',
      pullRequest: {
        provider: 'github',
        id: 'pr-10',
        number: '10',
        url: 'https://github.com/example/pr/10',
        title: 'chore: regenerate artifact',
        state: 'open',
        headSha: 'def456',
        branch: 'chore/reload-artifact',
        ciStatus: 'pending',
        reviewStatus: 'review_required',
        merged: false,
        reviewers: [],
        ciResults: [],
      },
    };
  }

  it('gera plano governado e exibe diff sugerido', async () => {
    planMock.mockResolvedValueOnce(buildPlanResponse());
    render(<ConfigReloadAction />);

    const generateButton = screen.getByRole('button', { name: 'Gerar plano' });
    await userEvent.click(generateButton);

    await waitFor(() => expect(planMock).toHaveBeenCalledTimes(1));
    expect(planMock).toHaveBeenCalledWith({
      artifactType: 'agent.manifest',
      targetPath: 'agents-hub/app/agents/<slug>/agent.yaml',
      parameters: JSON.parse('{"owner":"platform-team","capabilities":["structured-output"]}'),
    });

    expect(screen.getByRole('heading', { name: 'Plano gerado' })).toBeVisible();
    expect(screen.getByText(/Gerar checklist finops \(ID:/)).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Diffs sugeridos' })).toBeVisible();
    expect(screen.getByText('Atualizar checklist')).toBeVisible();
  });

  it('aplica plano governado registrando histórico e auditoria', async () => {
    planMock.mockResolvedValueOnce(buildPlanResponse());
    applyMock.mockResolvedValueOnce(buildApplyResponse());
    render(<ConfigReloadAction />);

    await userEvent.click(screen.getByRole('button', { name: 'Gerar plano' }));
    await waitFor(() => expect(planMock).toHaveBeenCalled());

    await userEvent.type(screen.getByLabelText('Executor'), 'Ana Operator');
    await userEvent.type(screen.getByLabelText('E-mail corporativo'), 'ana@example.com');
    await userEvent.clear(screen.getByLabelText('Mensagem do commit'));
    await userEvent.type(screen.getByLabelText('Mensagem do commit'), 'chore: atualizar checklist');
    await userEvent.type(screen.getByLabelText('Justificativa operacional'), 'Validar com FinOps.');

    await userEvent.click(screen.getByRole('button', { name: 'Aplicar plano' }));

    const confirmation = await screen.findByRole('dialog', { name: 'Confirmar aplicação governada' });
    expect(
      within(confirmation).getByText('Revise diffs e clique para habilitar a confirmação final.'),
    ).toBeVisible();
    await userEvent.click(within(confirmation).getByRole('button', { name: 'Aplicar plano' }));
    await userEvent.click(within(confirmation).getByRole('button', { name: 'Aplicar agora' }));

    await waitFor(() => expect(applyMock).toHaveBeenCalledTimes(1));
    expect(applyMock.mock.calls[0][0]).toMatchObject({
      planId: 'reload-plan-123',
      actor: 'Ana Operator',
      actorEmail: 'ana@example.com',
      commitMessage: 'chore: atualizar checklist',
    });

    const successAlert = await screen.findByRole('status');
    expect(successAlert).toHaveTextContent(/Artefato regenerado com sucesso/i);

    const history = screen.getByRole('list');
    const firstEntry = within(history).getByText(/Executor:/).closest('li');
    expect(firstEntry).toBeTruthy();
    expect(within(firstEntry as HTMLElement).getByText(/Ana Operator/)).toBeVisible();
    expect(within(firstEntry as HTMLElement).getByText(/Artefato regenerado com sucesso/)).toBeVisible();

    await userEvent.click(screen.getByRole('button', { name: 'Ver auditoria' }));
    await waitFor(() => expect(screen.getByRole('complementary')).toBeVisible());
    expect(screen.getByText(/config\.reload\.apply/i)).toBeVisible();
  });
});
