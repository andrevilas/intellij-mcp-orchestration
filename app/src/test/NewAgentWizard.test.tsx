import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  ApplyPolicyPlanResponse,
  ConfigPlan,
  ConfigPlanPayload,
  ConfigPlanPreview,
  ProviderSummary,
} from '../api';
import {
  fetchProviders,
  postAgentPlanApply,
  postGovernedAgentPlan,
} from '../api';
import NewAgentWizard from '../pages/Agents/NewAgentWizard';

vi.mock('../api');

describe('NewAgentWizard', () => {
  const providers: ProviderSummary[] = [
    {
      id: 'catalog',
      name: 'Catalog MCP',
      command: 'python app.py',
      description: 'Catálogo de produtos',
      tags: [],
      capabilities: ['search'],
      transport: 'stdio',
    },
    {
      id: 'observability',
      name: 'Observability MCP',
      command: 'uvicorn main:app',
      description: 'Observabilidade da frota',
      tags: [],
      capabilities: ['telemetry'],
      transport: 'http',
    },
  ];

  const plan: ConfigPlan = {
    intent: 'add_agent',
    summary: 'Adicionar agent sentinel-watcher',
    steps: [
      {
        id: 'scaffold',
        title: 'Criar arquivos base',
        description: 'Gerar manifestos e módulo Python.',
        dependsOn: [],
        actions: [
          {
            type: 'write_file',
            path: 'agents-hub/app/agents/sentinel-watcher/agent.yaml',
            contents: 'name: sentinel-watcher\n',
            encoding: 'utf-8',
            overwrite: false,
          },
        ],
      },
    ],
    diffs: [
      {
        path: 'agents-hub/app/agents/sentinel-watcher/agent.yaml',
        summary: 'Criar manifesto',
        changeType: 'create',
        diff: '--- /dev/null\n+++ agent.yaml\n+name: sentinel-watcher',
      },
    ],
    risks: [
      {
        title: 'Revisar variáveis de ambiente',
        impact: 'médio',
        mitigation: 'Confirmar segredos no cofre.',
      },
    ],
    status: 'pending',
    context: [],
    approvalRules: [],
  };

  const planPayload: ConfigPlanPayload = {
    intent: 'add_agent',
    summary: plan.summary,
    status: 'pending',
    steps: [],
    diffs: [],
    risks: [],
  };

  const preview: ConfigPlanPreview = {
    branch: 'feature/add-sentinel-watcher',
    baseBranch: 'main',
    commitMessage: 'feat: adicionar agent sentinel-watcher',
    pullRequest: { provider: 'github', title: 'feat: adicionar agent sentinel-watcher' },
  };

  const applyResponse: ApplyPolicyPlanResponse = {
    status: 'completed',
    mode: 'branch_pr',
    planId: 'agent-plan-123',
    recordId: 'record-1',
    branch: 'feature/add-sentinel-watcher',
    baseBranch: 'main',
    commitSha: 'abc123',
    diff: { stat: '1 file', patch: 'diff --git a/agent.yaml b/agent.yaml' },
    hitlRequired: false,
    message: 'Plano aplicado com sucesso.',
    approvalId: null,
    pullRequest: {
      provider: 'github',
      id: '77',
      number: '77',
      url: 'https://github.com/example/pr/77',
      title: 'feat: adicionar agent sentinel-watcher',
      state: 'open',
      headSha: 'abc123',
      branch: 'feature/add-sentinel-watcher',
      ciStatus: 'success',
      reviewStatus: 'pending',
      merged: false,
      lastSyncedAt: '2025-01-05T12:00:00Z',
      reviewers: [],
      ciResults: [],
    },
  };

  beforeEach(() => {
    vi.mocked(fetchProviders).mockResolvedValue(providers);
    vi.mocked(postGovernedAgentPlan).mockResolvedValue({
      plan,
      planPayload,
      preview,
      previewPayload: {
        branch: preview.branch,
        base_branch: preview.baseBranch,
        commit_message: preview.commitMessage,
        pull_request: {
          provider: preview.pullRequest?.provider ?? null,
          title: preview.pullRequest?.title ?? '',
          body: null,
        },
      },
    });
    vi.mocked(postAgentPlanApply).mockResolvedValue(applyResponse);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('gera plano governado, exibe diffs/risks e aplica com metadata', async () => {
    const onCreated = vi.fn();
    const user = userEvent.setup();

    render(<NewAgentWizard isOpen onClose={() => undefined} onAgentCreated={onCreated} />);

    await screen.findByRole('heading', { name: 'Novo agent governado' });

    const slugInput = screen.getByLabelText('Identificador do agent');
    await user.clear(slugInput);
    await user.type(slugInput, 'sentinel-watcher');

    const manifestArea = screen.getByLabelText('Manifesto base (JSON)');
    await user.clear(manifestArea);
    fireEvent.change(manifestArea, {
      target: { value: '{"title":"Sentinel Watcher","capabilities":["monitoring"],"tools":[]}' },
    });

    const catalogCheckbox = await screen.findByLabelText(/Catalog MCP/);
    await user.click(catalogCheckbox);

    await user.click(screen.getByRole('button', { name: 'Gerar plano governado' }));

    await screen.findByText('Plano gerado. Revise as alterações antes de aplicar.');
    expect(screen.getByText('Riscos identificados')).toBeInTheDocument();
    expect(screen.getByLabelText('Mensagem do commit')).toHaveValue(preview.commitMessage);

    await user.click(screen.getByRole('button', { name: 'Aplicar plano' }));

    await screen.findByText(/Plano aplicado com sucesso\./);
    expect(screen.getByText(/Branch: feature\/add-sentinel-watcher/)).toBeInTheDocument();
    expect(screen.getByText(/PR: https:\/\/github.com\/example\/pr\/77/)).toBeInTheDocument();
    const planCall = vi.mocked(postGovernedAgentPlan).mock.calls[0]?.[0] as
      | {
          agent?: { slug?: string; manifest?: Record<string, unknown>; repository?: string };
          manifestSource?: string;
          mcpServers?: string[];
        }
      | undefined;
    const createdSlug = planCall?.agent?.slug ?? '';
    expect(createdSlug).toBeTruthy();
    expect(onCreated).toHaveBeenCalledWith(createdSlug);

    expect(postGovernedAgentPlan).toHaveBeenCalledWith(
      expect.objectContaining({
        agent: expect.objectContaining({
          slug: createdSlug,
          repository: 'agents-hub',
          manifest: expect.objectContaining({ name: createdSlug }),
        }),
        manifestSource:
          '{"title":"Sentinel Watcher","capabilities":["monitoring"],"tools":[]}',
        mcpServers: ['catalog'],
      }),
    );

    expect(postAgentPlanApply).toHaveBeenCalledWith(
      expect.objectContaining({ commitMessage: preview.commitMessage }),
    );
  });

  it('valida campos obrigatórios antes de gerar plano', async () => {
    const user = userEvent.setup();

    render(<NewAgentWizard isOpen onClose={() => undefined} />);

    await screen.findByRole('heading', { name: 'Novo agent governado' });

    const slugInput = screen.getByLabelText('Identificador do agent');
    await user.clear(slugInput);
    await user.click(screen.getByRole('button', { name: 'Gerar plano governado' }));
    expect(await screen.findByText('Informe o identificador do agent.')).toBeInTheDocument();

    await user.type(slugInput, 'sentinel-watcher');

    const manifestArea = screen.getByLabelText('Manifesto base (JSON)');
    await user.clear(manifestArea);
    fireEvent.change(manifestArea, { target: { value: '{' } });

    await user.click(screen.getByRole('button', { name: 'Gerar plano governado' }));
    expect(await screen.findByText('Manifesto base inválido. Forneça JSON válido.')).toBeInTheDocument();

    await user.clear(manifestArea);
    fireEvent.change(manifestArea, { target: { value: '{"name":"sentinel"}' } });

    await user.click(screen.getByRole('button', { name: 'Gerar plano governado' }));
    expect(await screen.findByText('Selecione pelo menos um servidor MCP.')).toBeInTheDocument();

    expect(postGovernedAgentPlan).not.toHaveBeenCalled();
  });
});
