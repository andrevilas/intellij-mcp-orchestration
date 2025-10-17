import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';

import type {
  AgentConfigHistoryItem,
  AgentConfigLayer,
  AgentConfigPlanResponse,
  AgentSummary,
  ApplyAgentLayerPlanRequest,
  ApplyPolicyPlanResponse,
} from '../api';
import { fetchAgentConfigHistory, postAgentLayerPlan, postAgentLayerPlanApply } from '../api';
import PlanSummary from '../pages/AdminChat/PlanSummary';
import PlanDiffViewer, { type PlanDiffItem } from './PlanDiffViewer';
import JsonEditor from './JsonEditor';

interface AgentConfigLayerEditorProps {
  agent: AgentSummary;
  layer: AgentConfigLayer;
}

type PendingPlan = {
  id: string;
  plan: AgentConfigPlanResponse['planPayload'];
  patch: string;
  summary: AgentConfigPlanResponse['plan'];
  diffs: PlanDiffItem[];
};

type ApplyStatus =
  | { type: 'idle' }
  | { type: 'success'; message: string }
  | { type: 'error'; message: string };

type HistoryState =
  | { status: 'idle'; items: AgentConfigHistoryItem[] }
  | { status: 'loading'; items: AgentConfigHistoryItem[] }
  | { status: 'error'; items: AgentConfigHistoryItem[]; message: string };

function parseEditorValue(raw: string, label: string): Record<string, unknown> | null {
  const normalized = raw.trim();

  if (!normalized) {
    return {};
  }

  try {
    const parsed = JSON.parse(normalized);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error(`${label} deve ser um objeto JSON.`);
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    console.error('Failed to parse JSON editor value', error);
    throw new Error(`${label} contém JSON inválido.`);
  }
}

function mapDiffItems(response: AgentConfigPlanResponse): PlanDiffItem[] {
  return response.diffs.map((diff) => ({
    id: diff.id,
    title: diff.file,
    summary: diff.summary ?? undefined,
    diff: diff.diff ?? undefined,
  }));
}

function formatLayerTitle(layer: AgentConfigLayer): string {
  switch (layer) {
    case 'policies':
      return 'Policies';
    case 'routing':
      return 'Routing';
    case 'finops':
      return 'FinOps';
    case 'observability':
      return 'Observability';
    default:
      return layer;
  }
}

export default function AgentConfigLayerEditor({ agent, layer }: AgentConfigLayerEditorProps) {
  const [formValue, setFormValue] = useState<string>('{}');
  const [formError, setFormError] = useState<string | null>(null);
  const [isPlanning, setPlanning] = useState<boolean>(false);
  const [planResponse, setPlanResponse] = useState<AgentConfigPlanResponse | null>(null);
  const [pendingPlan, setPendingPlan] = useState<PendingPlan | null>(null);
  const [applyState, setApplyState] = useState<ApplyStatus>({ type: 'idle' });
  const [historyState, setHistoryState] = useState<HistoryState>({ status: 'idle', items: [] });

  useEffect(() => {
    setFormValue('{}');
    setFormError(null);
    setPlanResponse(null);
    setPendingPlan(null);
    setApplyState({ type: 'idle' });
  }, [agent.name, layer]);

  const planDiffItems = useMemo(() => {
    if (!planResponse) {
      return [] as PlanDiffItem[];
    }
    return mapDiffItems(planResponse);
  }, [planResponse]);

  const handlePlan = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setApplyState({ type: 'idle' });
      setFormError(null);

      let payload: Record<string, unknown>;
      try {
        payload = parseEditorValue(formValue, 'Configuração');
      } catch (error) {
        if (error instanceof Error) {
          setFormError(error.message);
        } else {
          setFormError('Configuração contém JSON inválido.');
        }
        return;
      }

      setPlanning(true);

      try {
        const response = await postAgentLayerPlan(agent.name, layer, { changes: payload });
        setPlanResponse(response);
        setPendingPlan({
          id: response.planId,
          plan: response.planPayload,
          patch: response.patch,
          summary: response.plan,
          diffs: mapDiffItems(response),
        });
      } catch (error) {
        console.error('Falha ao gerar plano do agent', error);
        const message = error instanceof Error ? error.message : 'Falha ao gerar plano de configuração.';
        setFormError(message);
        setPlanResponse(null);
        setPendingPlan(null);
      } finally {
        setPlanning(false);
      }
    },
    [agent.name, formValue, layer],
  );

  const handleApply = useCallback(async () => {
    if (!pendingPlan) {
      setApplyState({ type: 'error', message: 'Gere um plano antes de aplicar as alterações.' });
      return;
    }

    const request: ApplyAgentLayerPlanRequest = {
      planId: pendingPlan.id,
      plan: pendingPlan.plan,
      patch: pendingPlan.patch,
      actor: 'Console MCP',
      actorEmail: 'agents@console.mcp',
      commitMessage: `chore: atualizar ${layer} do agent ${agent.name}`,
      layer,
    };

    setApplyState({ type: 'idle' });

    try {
      const response: ApplyPolicyPlanResponse = await postAgentLayerPlanApply(agent.name, request);
      const details = [response.message];
      if (response.branch) {
        details.push(`Branch: ${response.branch}`);
      }
      if (response.pullRequest?.url) {
        details.push(`PR: ${response.pullRequest.url}`);
      }
      setApplyState({ type: 'success', message: details.join(' ') });
      setPlanResponse((current) => current);
      setPendingPlan(null);
    } catch (error) {
      console.error('Falha ao aplicar plano do agent', error);
      const message = error instanceof Error ? error.message : 'Falha ao aplicar plano de configuração.';
      setApplyState({ type: 'error', message });
    }
  }, [agent.name, layer, pendingPlan]);

  const handleLoadHistory = useCallback(async () => {
    setHistoryState((current) => ({ status: 'loading', items: current.items }));

    try {
      const items = await fetchAgentConfigHistory(agent.name, layer);
      setHistoryState({ status: 'idle', items });
    } catch (error) {
      console.error('Falha ao carregar histórico de configuração', error);
      const message = error instanceof Error ? error.message : 'Falha ao carregar histórico.';
      setHistoryState((current) => ({ status: 'error', items: current.items, message }));
    }
  }, [agent.name, layer]);

  const handleRollback = useCallback(
    async (item: AgentConfigHistoryItem) => {
      if (!item.patch || !item.planPayload) {
        setApplyState({ type: 'error', message: 'Registro selecionado não possui diff aplicável.' });
        return;
      }

      const request: ApplyAgentLayerPlanRequest = {
        planId: item.planId,
        plan: item.planPayload,
        patch: item.patch,
        actor: 'Console MCP',
        actorEmail: 'agents@console.mcp',
        commitMessage: `chore: rollback ${layer} do agent ${agent.name}`,
        layer,
      };

      try {
        const response = await postAgentLayerPlanApply(agent.name, request);
        const message = [response.message];
        if (response.pullRequest?.url) {
          message.push(`PR: ${response.pullRequest.url}`);
        }
        setApplyState({ type: 'success', message: message.join(' ') });
      } catch (error) {
        console.error('Falha ao executar rollback de configuração', error);
        const message = error instanceof Error ? error.message : 'Falha ao executar rollback.';
        setApplyState({ type: 'error', message });
      }
    },
    [agent.name, layer],
  );

  return (
    <div className="agent-config-editor">
      <header className="agent-config-editor__header">
        <div>
          <h4>{formatLayerTitle(layer)}</h4>
          <p className="agent-config-editor__subtitle">
            Atualize a camada <strong>{formatLayerTitle(layer)}</strong> do agent {agent.title}.
          </p>
        </div>
        <button
          type="button"
          className="agent-config-editor__history"
          onClick={handleLoadHistory}
          disabled={historyState.status === 'loading'}
        >
          {historyState.status === 'loading' ? 'Carregando histórico…' : 'Ver histórico'}
        </button>
      </header>

      <form className="agent-config-editor__form" onSubmit={handlePlan}>
        <JsonEditor
          id={`agent-config-${layer}`}
          label={`Configuração de ${formatLayerTitle(layer)}`}
          value={formValue}
          onChange={(nextValue) => {
            setFormValue(nextValue);
            setFormError(null);
          }}
          error={formError}
          description="Informe as alterações desejadas em JSON."
        />
        <div className="agent-config-editor__actions">
          <button type="submit" className="agent-config-editor__primary" disabled={isPlanning}>
            {isPlanning ? 'Gerando plano…' : 'Gerar plano'}
          </button>
          <button
            type="button"
            className="agent-config-editor__secondary"
            onClick={handleApply}
            disabled={isPlanning}
          >
            Aplicar alterações
          </button>
        </div>
      </form>

      <PlanSummary plan={planResponse?.plan ?? null} isLoading={isPlanning} />
      <PlanDiffViewer
        diffs={planDiffItems}
        emptyMessage="Gere um plano para visualizar as alterações sugeridas."
        title="Diffs do plano"
      />

      {applyState.type === 'error' ? (
        <p className="agent-config-editor__message agent-config-editor__message--error" role="alert">
          {applyState.message}
        </p>
      ) : null}
      {applyState.type === 'success' ? (
        <p className="agent-config-editor__message" role="status">
          {applyState.message}
        </p>
      ) : null}

      {historyState.items.length > 0 ? (
        <section className="agent-config-editor__history-list">
          <h5>Execuções anteriores</h5>
          <ul>
            {historyState.items.map((item) => (
              <li key={item.id} className="agent-config-editor__history-item">
                <div>
                  <p>
                    <strong>{new Date(item.createdAt).toLocaleString()}</strong> — {item.requestedBy}
                  </p>
                  {item.summary ? <p className="agent-config-editor__history-summary">{item.summary}</p> : null}
                </div>
                <div className="agent-config-editor__history-actions">
                  <span className={`agent-config-editor__chip agent-config-editor__chip--${item.status}`}>
                    {item.statusLabel}
                  </span>
                  <button type="button" onClick={() => handleRollback(item)}>
                    Rollback
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {historyState.status === 'error' ? (
        <p className="agent-config-editor__message agent-config-editor__message--error" role="alert">
          {historyState.message}
        </p>
      ) : null}
    </div>
  );
}
