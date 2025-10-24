import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';

import type { AgentConfigHistoryItem, AgentConfigLayer, AgentSummary } from '../../api';
import { useAgent, type AgentError } from '../../hooks/useAgent';
import { getAgentsBaseUrl } from '../../services/httpClient';
import type { AgentInvokeConfig, AgentInvokeRequest } from '../../types/agent';
import { createAgentRequestId, mergeAgentConfigs } from '../../utils/agentRequest';
import { formatAgentTimestamp, formatModel, formatStatus, STATUS_CLASS } from '../../utils/agents';
import { AGENT_DETAIL_TEST_IDS } from '../testIds';
import JsonEditor from '../../components/JsonEditor';
import AgentConfigLayerEditor, {
  type AgentConfigLayerEditorHandle,
} from '../../components/AgentConfigLayerEditor';

interface AgentDetailProps {
  agent: AgentSummary;
  onClose: () => void;
}

type PlaygroundInput = Record<string, unknown>;

type PlaygroundRequest = AgentInvokeRequest<PlaygroundInput, AgentInvokeConfig>;

type ActionAlert = { kind: 'success' | 'error' | 'info'; message: string } | null;

const EMPTY_HISTORY: Record<AgentConfigLayer, AgentConfigHistoryItem[]> = {
  policies: [],
  routing: [],
  finops: [],
  observability: [],
};

function escapeSingleQuotes(value: string): string {
  return value.replace(/'/g, "'\\''");
}

function formatValue(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (value === undefined) {
    return '—';
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function parseEditorValue<T extends Record<string, unknown>>(
  raw: string,
  setError: (value: string | null) => void,
  fieldLabel: string,
): T | null {
  const normalized = raw.trim();

  if (!normalized) {
    setError(null);
    return {} as T;
  }

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      setError(`${fieldLabel} deve ser um objeto JSON.`);
      return null;
    }
    setError(null);
    return parsed as T;
  } catch {
    setError(`${fieldLabel} contém JSON inválido.`);
    return null;
  }
}

export default function AgentDetail({ agent, onClose }: AgentDetailProps): JSX.Element {
  const [activeTab, setActiveTab] = useState<
    'playground' | 'config' | 'policies' | 'routing' | 'finops' | 'observability'
  >('playground');
  const [payloadText, setPayloadText] = useState<string>(JSON.stringify({ query: '' }, null, 2));
  const [overridesText, setOverridesText] = useState<string>(JSON.stringify({ parameters: {} }, null, 2));
  const [payloadError, setPayloadError] = useState<string | null>(null);
  const [overridesError, setOverridesError] = useState<string | null>(null);
  const [lastRequest, setLastRequest] = useState<PlaygroundRequest | null>(null);
  const [historyCache, setHistoryCache] = useState<Record<AgentConfigLayer, AgentConfigHistoryItem[]>>({
    ...EMPTY_HISTORY,
  });
  const [alert, setAlert] = useState<ActionAlert>(null);
  const [isActionRunning, setActionRunning] = useState(false);
  const isGovernanceTab =
    activeTab === 'policies' || activeTab === 'routing' || activeTab === 'finops' || activeTab === 'observability';

  const defaultConfig = useMemo<AgentInvokeConfig>(
    () => ({ metadata: { caller: 'console-playground', surface: 'agent-detail' } }),
    [],
  );

  const { data, error, isFallback, isLoading, invoke, reset } = useAgent<
    unknown,
    PlaygroundInput,
    AgentInvokeConfig
  >(agent.name, {
    defaultConfig,
  });

  const policiesRef = useRef<AgentConfigLayerEditorHandle>(null);
  const routingRef = useRef<AgentConfigLayerEditorHandle>(null);
  const finopsRef = useRef<AgentConfigLayerEditorHandle>(null);
  const observabilityRef = useRef<AgentConfigLayerEditorHandle>(null);
  const containerRef = useRef<HTMLElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    setActiveTab('playground');
    setPayloadText(JSON.stringify({ query: '' }, null, 2));
    setOverridesText(JSON.stringify({ parameters: {} }, null, 2));
    setPayloadError(null);
    setOverridesError(null);
    setLastRequest(null);
    setHistoryCache({ ...EMPTY_HISTORY });
    setAlert(null);
    reset({ preserveFallback: false });
  }, [agent.name, reset]);

  useEffect(() => {
    if (data?.request) {
      setLastRequest(data.request as PlaygroundRequest);
    }
  }, [data]);

  const getActiveEditor = useCallback(() => {
    switch (activeTab) {
      case 'policies':
        return policiesRef.current;
      case 'routing':
        return routingRef.current;
      case 'finops':
        return finopsRef.current;
      case 'observability':
        return observabilityRef.current;
      default:
        return null;
    }
  }, [activeTab]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPayloadError(null);
    setOverridesError(null);

    const parsedPayload = parseEditorValue<PlaygroundInput>(payloadText, setPayloadError, 'Payload');
    if (parsedPayload === null) {
      return;
    }

    const parsedOverrides = parseEditorValue<AgentInvokeConfig>(
      overridesText,
      setOverridesError,
      'Overrides',
    );
    if (parsedOverrides === null) {
      return;
    }

    const requestId = createAgentRequestId();
    const mergedConfig = mergeAgentConfigs(defaultConfig, parsedOverrides ?? undefined);
    const finalConfig: AgentInvokeConfig = {
      ...mergedConfig,
      metadata: { ...(mergedConfig.metadata ?? {}), requestId },
    };

    const requestPayload: PlaygroundRequest = {
      input: parsedPayload ?? {},
      config: finalConfig,
    };

    setLastRequest(requestPayload);

    invoke({
      input: parsedPayload ?? {},
      config: parsedOverrides ?? undefined,
      requestId,
    }).catch((invokeError: AgentError) => {
      console.error('Falha ao invocar agente', invokeError);
    });
  };

  const handleReset = () => {
    setPayloadText(JSON.stringify({ query: '' }, null, 2));
    setOverridesText(JSON.stringify({ parameters: {} }, null, 2));
    setPayloadError(null);
    setOverridesError(null);
    setLastRequest(null);
    reset({ preserveFallback: false });
  };

  const handleHistoryUpdate = useCallback((layer: AgentConfigLayer, items: AgentConfigHistoryItem[]) => {
    setHistoryCache((current) => ({ ...current, [layer]: items }));
  }, []);

  const handleSave = useCallback(async () => {
    const editor = getActiveEditor();
    if (!editor) {
      setAlert({ kind: 'error', message: 'Selecione uma camada de configuração para salvar.' });
      return;
    }

    setActionRunning(true);
    setAlert({ kind: 'info', message: 'Gerando plano…' });

    try {
      const plan = await editor.plan();
      if (!plan) {
        setAlert({
          kind: 'error',
          message: 'Não foi possível gerar o plano. Revise a configuração e tente novamente.',
        });
        return;
      }

      const response = await editor.apply();
      if (!response) {
        setAlert({
          kind: 'error',
          message: 'Falha ao aplicar alterações. Verifique os detalhes da camada selecionada.',
        });
        return;
      }

      const details = [response.message];
      if (response.branch) {
        details.push(`Branch: ${response.branch}`);
      }
      if (response.pullRequest?.url) {
        details.push(`PR: ${response.pullRequest.url}`);
      }
      setAlert({ kind: 'success', message: details.join(' ') });
    } catch (actionError) {
      console.error('Falha ao salvar alterações do agent', actionError);
      setAlert({
        kind: 'error',
        message:
          actionError instanceof Error
            ? actionError.message
            : 'Falha ao salvar alterações. Tente novamente.',
      });
    } finally {
      setActionRunning(false);
    }
  }, [getActiveEditor]);

  const handleCreateRollback = useCallback(async () => {
    const editor = getActiveEditor();
    if (!editor) {
      setAlert({ kind: 'error', message: 'Selecione uma camada de configuração para criar rollback.' });
      return;
    }

    setActionRunning(true);
    setAlert({ kind: 'info', message: 'Carregando histórico…' });

    try {
      let historyItems = editor.getCachedHistory();
      if (!historyItems.length) {
        historyItems = await editor.loadHistory();
      }

      const latest = historyItems[0];
      if (!latest) {
        setAlert({ kind: 'error', message: 'Nenhum histórico disponível para rollback.' });
        return;
      }

      const response = await editor.rollback(latest.id);
      if (!response) {
        setAlert({ kind: 'error', message: 'Falha ao criar rollback. Verifique o histórico selecionado.' });
        return;
      }

      const details = [response.message];
      if (response.pullRequest?.url) {
        details.push(`PR: ${response.pullRequest.url}`);
      }
      setAlert({ kind: 'success', message: details.join(' ') });
    } catch (actionError) {
      console.error('Falha ao criar rollback do agent', actionError);
      setAlert({
        kind: 'error',
        message:
          actionError instanceof Error
            ? actionError.message
            : 'Falha ao criar rollback. Tente novamente.',
      });
    } finally {
      setActionRunning(false);
    }
  }, [getActiveEditor]);

  const agentsBase = useMemo(() => getAgentsBaseUrl().replace(/\/$/, ''), []);
  const apiKey = (import.meta.env.VITE_CONSOLE_API_KEY ?? '').trim();
  const apiKeyHeader = apiKey || '<API_KEY>';
  const encodedName = encodeURIComponent(agent.name);

  const requestJson = lastRequest ? JSON.stringify(lastRequest, null, 2) : null;
  const curlSnippet = requestJson
    ? [
        `curl -X POST '${agentsBase}/${encodedName}/invoke'`,
        "  -H 'Content-Type: application/json'",
        `  -H 'X-API-Key: ${apiKeyHeader}'`,
        `  -d '${escapeSingleQuotes(requestJson)}'`,
      ].join(' \\\n')
    : null;

  const traceContent = data?.trace ?? (data?.result && typeof data.result === 'object' && data.result
    ? (data.result as { trace?: unknown }).trace
    : undefined);

  useEffect(() => {
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    let focusFrame: number | null = null;
    if (typeof window !== 'undefined') {
      focusFrame = window.requestAnimationFrame(() => {
        containerRef.current?.focus({ preventScroll: true });
      });
    } else {
      containerRef.current?.focus({ preventScroll: true });
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      if (typeof window !== 'undefined' && focusFrame !== null) {
        window.cancelAnimationFrame(focusFrame);
      }
      document.removeEventListener('keydown', handleKeyDown);
      const previous = previousFocusRef.current;
      previousFocusRef.current = null;
      if (previous) {
        if (typeof window !== 'undefined') {
          window.requestAnimationFrame(() => {
            previous.focus({ preventScroll: true });
          });
        } else {
          previous.focus({ preventScroll: true });
        }
      }
    };
  }, [onClose]);

  return (
    <aside
      className="agent-detail"
      aria-labelledby="agent-detail-title"
      role="dialog"
      data-testid={AGENT_DETAIL_TEST_IDS.root}
      ref={containerRef}
      tabIndex={-1}
    >
      <header className="agent-detail__header">
        <div>
          <p className="agent-detail__breadcrumb">Agents · {agent.name}</p>
          <h3 id="agent-detail-title">{agent.title}</h3>
        </div>
        <div className="agent-detail__toolbar">
          <button
            type="button"
            className="agent-detail__run agent-detail__toolbar-button"
            onClick={handleSave}
            disabled={isActionRunning || !isGovernanceTab}
          >
            {isActionRunning && isGovernanceTab ? 'Processando…' : 'Salvar alterações'}
          </button>
          <button
            type="button"
            className="agent-detail__reset agent-detail__toolbar-button"
            onClick={handleCreateRollback}
            disabled={isActionRunning || !isGovernanceTab}
          >
            Criar rollback
          </button>
        </div>
        <button type="button" className="agent-detail__close" onClick={onClose} aria-label="Fechar detalhes">
          ×
        </button>
      </header>

      {alert ? (
        <p
          className={`agent-config-editor__message${
            alert.kind === 'error' ? ' agent-config-editor__message--error' : ''
          }`}
          role={alert.kind === 'error' ? 'alert' : 'status'}
        >
          {alert.message}
        </p>
      ) : null}

      <div
        className="agent-detail__tabs"
        role="tablist"
        aria-label={`Detalhes de ${agent.title}`}
        data-testid={AGENT_DETAIL_TEST_IDS.tabs}
      >
        <button
          type="button"
          role="tab"
          id="agent-detail-tab-playground"
          className={
            activeTab === 'playground'
              ? 'agent-detail__tab agent-detail__tab--active'
              : 'agent-detail__tab'
          }
          aria-selected={activeTab === 'playground'}
          aria-controls="agent-detail-panel-playground"
          onClick={() => setActiveTab('playground')}
        >
          Playground
        </button>
        <button
          type="button"
          role="tab"
          id="agent-detail-tab-config"
          className={
            activeTab === 'config' ? 'agent-detail__tab agent-detail__tab--active' : 'agent-detail__tab'
          }
          aria-selected={activeTab === 'config'}
          aria-controls="agent-detail-panel-config"
          onClick={() => setActiveTab('config')}
        >
          Config
        </button>
        <button
          type="button"
          role="tab"
          id="agent-detail-tab-policies"
          className={
            activeTab === 'policies' ? 'agent-detail__tab agent-detail__tab--active' : 'agent-detail__tab'
          }
          aria-selected={activeTab === 'policies'}
          aria-controls="agent-detail-panel-policies"
          onClick={() => setActiveTab('policies')}
        >
          Policies
        </button>
        <button
          type="button"
          role="tab"
          id="agent-detail-tab-routing"
          className={
            activeTab === 'routing' ? 'agent-detail__tab agent-detail__tab--active' : 'agent-detail__tab'
          }
          aria-selected={activeTab === 'routing'}
          aria-controls="agent-detail-panel-routing"
          onClick={() => setActiveTab('routing')}
        >
          Routing
        </button>
        <button
          type="button"
          role="tab"
          id="agent-detail-tab-finops"
          className={
            activeTab === 'finops' ? 'agent-detail__tab agent-detail__tab--active' : 'agent-detail__tab'
          }
          aria-selected={activeTab === 'finops'}
          aria-controls="agent-detail-panel-finops"
          onClick={() => setActiveTab('finops')}
        >
          FinOps
        </button>
        <button
          type="button"
          role="tab"
          id="agent-detail-tab-observability"
          className={
            activeTab === 'observability'
              ? 'agent-detail__tab agent-detail__tab--active'
              : 'agent-detail__tab'
          }
          aria-selected={activeTab === 'observability'}
          aria-controls="agent-detail-panel-observability"
          onClick={() => setActiveTab('observability')}
        >
          Observability
        </button>
      </div>

      <section
        id="agent-detail-panel-playground"
        role="tabpanel"
        aria-labelledby="agent-detail-tab-playground"
        hidden={activeTab !== 'playground'}
        className="agent-detail__panel"
      >
        <form
          className="agent-detail__form"
          onSubmit={handleSubmit}
          data-testid={AGENT_DETAIL_TEST_IDS.playground}
        >
          <JsonEditor
            id="agent-detail-payload"
            label="Payload"
            description="Objeto enviado no campo input do invoke."
            value={payloadText}
            onChange={(nextValue) => {
              setPayloadText(nextValue);
              setPayloadError(null);
            }}
            error={payloadError}
          />
          <JsonEditor
            id="agent-detail-overrides"
            label="Overrides"
            description="Configuração extra mesclada ao metadata/config padrão."
            value={overridesText}
            onChange={(nextValue) => {
              setOverridesText(nextValue);
              setOverridesError(null);
            }}
            error={overridesError}
          />
          <div className="agent-detail__actions">
            <button
              type="submit"
              className="agent-detail__run"
              disabled={isLoading}
              data-testid={AGENT_DETAIL_TEST_IDS.run}
            >
              {isLoading ? 'Invocando…' : 'Invocar agent'}
            </button>
            <button
              type="button"
              className="agent-detail__reset"
              onClick={handleReset}
              disabled={isLoading}
              data-testid={AGENT_DETAIL_TEST_IDS.reset}
            >
              Limpar
            </button>
          </div>
        </form>

        {isFallback ? (
          <p className="agent-detail__fallback" role="status">
            Agente indisponível no catálogo. Utilize um fallback ou tente novamente mais tarde.
          </p>
        ) : null}

        {error ? (
          <p className="agent-detail__error" role="alert">
            {error.message}
          </p>
        ) : null}

        {data ? (
          <div className="agent-detail__results" data-testid={AGENT_DETAIL_TEST_IDS.results}>
            <div>
              <h4>Resposta</h4>
              <pre>{formatValue(data.result)}</pre>
            </div>
            <div>
              <h4>Trace</h4>
              {traceContent ? <pre>{formatValue(traceContent)}</pre> : <p>Trace não retornado.</p>}
            </div>
          </div>
        ) : null}

        {curlSnippet ? (
          <div className="agent-detail__snippet" data-testid={AGENT_DETAIL_TEST_IDS.snippet}>
            <div className="agent-detail__snippet-header">
              <h4>Chamada cURL</h4>
              {lastRequest?.config?.metadata?.requestId ? (
                <span className="agent-detail__request-id">req: {lastRequest.config.metadata.requestId}</span>
              ) : null}
            </div>
            <pre>
              <code>{curlSnippet}</code>
            </pre>
          </div>
        ) : null}
      </section>

      <section
        id="agent-detail-panel-config"
        role="tabpanel"
        aria-labelledby="agent-detail-tab-config"
        hidden={activeTab !== 'config'}
        className="agent-detail__panel"
      >
        <div className="agent-detail__summary" data-testid={AGENT_DETAIL_TEST_IDS.summary}>
          {agent.description ? <p className="agent-detail__description">{agent.description}</p> : null}
          <dl className="agent-detail__grid">
            <div>
              <dt>Nome interno</dt>
              <dd>{agent.name}</dd>
            </div>
            <div>
              <dt>Versão</dt>
              <dd>{agent.version}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>
                <span className={`agents__status ${STATUS_CLASS[agent.status]}`}>{formatStatus(agent.status)}</span>
              </dd>
            </div>
            <div>
              <dt>Modelo</dt>
              <dd>{formatModel(agent)}</dd>
            </div>
            <div>
              <dt>Último deploy</dt>
              <dd>{formatAgentTimestamp(agent.lastDeployedAt)}</dd>
            </div>
            <div>
              <dt>Owner</dt>
              <dd>{agent.owner ?? '—'}</dd>
            </div>
          </dl>
          <div className="agent-detail__capabilities">
            <h4>Capabilities</h4>
            {agent.capabilities.length > 0 ? (
              <ul>
                {agent.capabilities.map((capability) => (
                  <li key={capability}>{capability}</li>
                ))}
              </ul>
            ) : (
              <p>Sem capabilities cadastradas.</p>
            )}
          </div>
        </div>
      </section>

      <section
        id="agent-detail-panel-policies"
        role="tabpanel"
        aria-labelledby="agent-detail-tab-policies"
        hidden={activeTab !== 'policies'}
        className="agent-detail__panel"
      >
        <AgentConfigLayerEditor
          ref={policiesRef}
          agent={agent}
          layer="policies"
          initialHistory={historyCache.policies}
          onHistoryUpdate={(items) => handleHistoryUpdate('policies', items)}
        />
      </section>

      <section
        id="agent-detail-panel-routing"
        role="tabpanel"
        aria-labelledby="agent-detail-tab-routing"
        hidden={activeTab !== 'routing'}
        className="agent-detail__panel"
      >
        <AgentConfigLayerEditor
          ref={routingRef}
          agent={agent}
          layer="routing"
          initialHistory={historyCache.routing}
          onHistoryUpdate={(items) => handleHistoryUpdate('routing', items)}
        />
      </section>

      <section
        id="agent-detail-panel-finops"
        role="tabpanel"
        aria-labelledby="agent-detail-tab-finops"
        hidden={activeTab !== 'finops'}
        className="agent-detail__panel"
      >
        <AgentConfigLayerEditor
          ref={finopsRef}
          agent={agent}
          layer="finops"
          initialHistory={historyCache.finops}
          onHistoryUpdate={(items) => handleHistoryUpdate('finops', items)}
        />
      </section>

      <section
        id="agent-detail-panel-observability"
        role="tabpanel"
        aria-labelledby="agent-detail-tab-observability"
        hidden={activeTab !== 'observability'}
        className="agent-detail__panel"
      >
        <AgentConfigLayerEditor
          ref={observabilityRef}
          agent={agent}
          layer="observability"
          initialHistory={historyCache.observability}
          onHistoryUpdate={(items) => handleHistoryUpdate('observability', items)}
        />
      </section>
    </aside>
  );
}
