import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';

import type { AgentSummary } from '../api';
import { useAgent, type AgentError } from '../hooks/useAgent';
import { getAgentsBaseUrl } from '../services/httpClient';
import type { AgentInvokeConfig, AgentInvokeRequest } from '../types/agent';
import { createAgentRequestId, mergeAgentConfigs } from '../utils/agentRequest';
import { formatAgentTimestamp, formatModel, formatStatus, STATUS_CLASS } from '../utils/agents';
import JsonEditor from './JsonEditor';

interface AgentDetailPanelProps {
  agent: AgentSummary;
  onClose: () => void;
}

type PlaygroundInput = Record<string, unknown>;

type PlaygroundRequest = AgentInvokeRequest<PlaygroundInput, AgentInvokeConfig>;

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

export default function AgentDetailPanel({ agent, onClose }: AgentDetailPanelProps): JSX.Element {
  const [activeTab, setActiveTab] = useState<'playground' | 'config'>('playground');
  const [payloadText, setPayloadText] = useState<string>(JSON.stringify({ query: '' }, null, 2));
  const [overridesText, setOverridesText] = useState<string>(JSON.stringify({ parameters: {} }, null, 2));
  const [payloadError, setPayloadError] = useState<string | null>(null);
  const [overridesError, setOverridesError] = useState<string | null>(null);
  const [lastRequest, setLastRequest] = useState<PlaygroundRequest | null>(null);

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

  useEffect(() => {
    setActiveTab('playground');
    setPayloadText(JSON.stringify({ query: '' }, null, 2));
    setOverridesText(JSON.stringify({ parameters: {} }, null, 2));
    setPayloadError(null);
    setOverridesError(null);
    setLastRequest(null);
    reset({ preserveFallback: false });
  }, [agent.name, reset]);

  useEffect(() => {
    if (data?.request) {
      setLastRequest(data.request as PlaygroundRequest);
    }
  }, [data]);

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

  return (
    <aside className="agent-detail" aria-labelledby="agent-detail-title" role="dialog">
      <header className="agent-detail__header">
        <div>
          <p className="agent-detail__breadcrumb">Agents · {agent.name}</p>
          <h3 id="agent-detail-title">{agent.title}</h3>
        </div>
        <button type="button" className="agent-detail__close" onClick={onClose} aria-label="Fechar detalhes">
          ×
        </button>
      </header>

      <div className="agent-detail__tabs" role="tablist" aria-label={`Detalhes de ${agent.title}`}>
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
      </div>

      <section
        id="agent-detail-panel-playground"
        role="tabpanel"
        aria-labelledby="agent-detail-tab-playground"
        hidden={activeTab !== 'playground'}
        className="agent-detail__panel"
      >
        <form className="agent-detail__form" onSubmit={handleSubmit}>
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
            <button type="submit" className="agent-detail__run" disabled={isLoading}>
              {isLoading ? 'Invocando…' : 'Invocar agent'}
            </button>
            <button type="button" className="agent-detail__reset" onClick={handleReset} disabled={isLoading}>
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
          <div className="agent-detail__results">
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
          <div className="agent-detail__snippet">
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
        <div className="agent-detail__summary">
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
    </aside>
  );
}
