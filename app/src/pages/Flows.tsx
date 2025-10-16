import { useCallback, useEffect, useMemo, useState } from 'react';
import ReactFlow, {
  Background,
  Connection,
  Controls,
  Edge as ReactFlowEdge,
  MiniMap,
  Node as ReactFlowNode,
  OnSelectionChangeParams,
  useEdgesState,
  useNodesState,
} from 'reactflow';
import 'reactflow/dist/style.css';

import {
  FlowEdge,
  FlowGraph,
  FlowNode,
  FlowVersion,
  FlowVersionCreateInput,
  FlowVersionList,
  compareFlowVersions,
  createFlowVersion,
  listFlowVersions,
  rollbackFlowVersion,
} from '../api';

const DEFAULT_FLOW_ID = 'demo-flow';

type EditorNode = ReactFlowNode<FlowNode>;
type EditorEdge = ReactFlowEdge<FlowEdge>;

interface Position {
  x: number;
  y: number;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parsePosition(value: unknown, fallbackIndex: number): Position {
  if (isPlainRecord(value) && typeof value.x === 'number' && typeof value.y === 'number') {
    return { x: value.x, y: value.y };
  }
  return { x: 120 + fallbackIndex * 140, y: 120 + (fallbackIndex % 4) * 80 };
}

function toEditorNodes(graph: FlowGraph): EditorNode[] {
  return graph.nodes.map((node, index) => ({
    id: node.id,
    position: parsePosition(node.config?.position, index),
    data: {
      id: node.id,
      label: node.label,
      type: node.type,
      config: node.config ?? {},
    },
  }));
}

function toEditorEdges(graph: FlowGraph): EditorEdge[] {
  return graph.edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    data: {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      condition: edge.condition ?? null,
    },
    label: edge.condition ?? undefined,
  }));
}

function fromEditorNodes(flowId: string, nodes: EditorNode[]): FlowNode[] {
  return nodes.map((node, index) => {
    const data = isPlainRecord(node.data) ? (node.data as FlowNode) : undefined;
    const fallbackLabel = `${flowId}-node-${index + 1}`;
    const config = isPlainRecord(data?.config) ? { ...data!.config } : {};
    config.position = { x: node.position.x, y: node.position.y };
    return {
      id: data?.id ?? node.id,
      type: data?.type ?? 'state',
      label: data?.label ?? fallbackLabel,
      config,
    };
  });
}

function fromEditorEdges(edges: EditorEdge[]): FlowEdge[] {
  return edges.map((edge) => {
    const data = isPlainRecord(edge.data) ? (edge.data as FlowEdge) : undefined;
    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      condition: data?.condition ?? (typeof edge.label === 'string' ? edge.label : null),
    };
  });
}

function defaultGraph(flowId: string): FlowGraph {
  return {
    id: flowId,
    label: `Fluxo ${flowId}`,
    entry: 'inicio',
    exit: 'fim',
    nodes: [
      {
        id: 'inicio',
        type: 'state',
        label: 'Início',
        config: { position: { x: 120, y: 180 } },
      },
      {
        id: 'fim',
        type: 'state',
        label: 'Fim',
        config: { position: { x: 420, y: 180 } },
      },
    ],
    edges: [
      {
        id: 'edge-inicio-fim',
        source: 'inicio',
        target: 'fim',
        condition: null,
      },
    ],
    metadata: {
      description: 'Fluxo LangGraph inicial',
      agent_class: 'FlowAgent',
      target_path: `agents-hub/app/agents/${flowId}/agent.py`,
    },
  };
}

function buildGraphPayload(
  flowId: string,
  label: string,
  entry: string,
  exit: string,
  nodes: EditorNode[],
  edges: EditorEdge[],
  agentClass: string,
  targetPath: string,
  description: string,
): FlowGraph {
  const normalizedNodes = fromEditorNodes(flowId, nodes);
  const normalizedEdges = fromEditorEdges(edges);
  const entryId = normalizedNodes.some((node) => node.id === entry)
    ? entry
    : normalizedNodes[0]?.id ?? entry;
  const exitId = normalizedNodes.some((node) => node.id === exit)
    ? exit
    : normalizedNodes[normalizedNodes.length - 1]?.id ?? exit;

  const metadata: Record<string, unknown> = {
    agent_class: agentClass,
    target_path: targetPath,
  };
  if (description.trim()) {
    metadata.description = description.trim();
  }

  return {
    id: flowId,
    label,
    entry: entryId,
    exit: exitId,
    nodes: normalizedNodes,
    edges: normalizedEdges,
    metadata,
  };
}

function formatTimestamp(value: string | null | undefined): string {
  if (!value) {
    return '—';
  }
  const date = new Date(value);
  return date.toLocaleString();
}

function defaultTargetPath(flowId: string): string {
  return `agents-hub/app/agents/${flowId}/agent.py`;
}

const DEFAULT_GRAPH = defaultGraph(DEFAULT_FLOW_ID);

function Flows(): JSX.Element {
  const [flowId, setFlowId] = useState<string>(DEFAULT_FLOW_ID);
  const [pendingFlowId, setPendingFlowId] = useState<string>(DEFAULT_FLOW_ID);
  const [label, setLabel] = useState<string>(DEFAULT_GRAPH.label);
  const [description, setDescription] = useState<string>(
    typeof DEFAULT_GRAPH.metadata.description === 'string'
      ? (DEFAULT_GRAPH.metadata.description as string)
      : '',
  );
  const [entryNode, setEntryNode] = useState<string>(DEFAULT_GRAPH.entry);
  const [exitNode, setExitNode] = useState<string>(DEFAULT_GRAPH.exit);
  const [agentClass, setAgentClass] = useState<string>('FlowAgent');
  const [targetPath, setTargetPath] = useState<string>(defaultTargetPath(DEFAULT_FLOW_ID));
  const [comment, setComment] = useState<string>('');
  const [author, setAuthor] = useState<string>('console-web');
  const [versions, setVersions] = useState<FlowVersion[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);
  const [compareVersion, setCompareVersion] = useState<number | null>(null);
  const [diffText, setDiffText] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setLoading] = useState<boolean>(false);
  const [isSaving, setSaving] = useState<boolean>(false);
  const [isDiffLoading, setDiffLoading] = useState<boolean>(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>(toEditorNodes(DEFAULT_GRAPH));
  const [edges, setEdges, onEdgesChange] = useEdgesState<FlowEdge>(toEditorEdges(DEFAULT_GRAPH));

  const selectedNode = useMemo(
    () => nodes.find((node) => node.id === selectedNodeId) ?? null,
    [nodes, selectedNodeId],
  );

  const applyGraph = useCallback(
    (graph: FlowGraph, version: FlowVersion | null) => {
      setNodes(toEditorNodes(graph));
      setEdges(toEditorEdges(graph));
      setLabel(graph.label);
      setDescription(typeof graph.metadata.description === 'string' ? (graph.metadata.description as string) : '');
      setEntryNode(graph.entry);
      setExitNode(graph.exit);
      setAgentClass(String(graph.metadata.agent_class ?? 'FlowAgent'));
      const metadataPath = typeof graph.metadata.target_path === 'string'
        ? (graph.metadata.target_path as string)
        : defaultTargetPath(graph.id);
      setTargetPath(metadataPath);
      setSelectedVersion(version?.version ?? null);
      setCompareVersion(null);
      setDiffText(null);
      setSelectedNodeId(null);
    },
    [setEdges, setNodes],
  );

  const hydrateFromList = useCallback(
    (response: FlowVersionList, loadedFlowId: string) => {
      setVersions(response.versions);
      if (response.versions.length > 0) {
        applyGraph(response.versions[0].graph, response.versions[0]);
      } else {
        const resetGraph = defaultGraph(loadedFlowId);
        applyGraph(resetGraph, null);
      }
    },
    [applyGraph],
  );

  const loadFlowVersions = useCallback(
    async (requestedId: string) => {
      setLoading(true);
      setErrorMessage(null);
      try {
        const normalizedId = requestedId.trim() || DEFAULT_FLOW_ID;
        const payload = await listFlowVersions(normalizedId);
        setFlowId(normalizedId);
        hydrateFromList(payload, normalizedId);
        setStatusMessage(`Fluxo ${normalizedId} carregado (${payload.versions.length} versão(ões))`);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Falha ao carregar versões';
        setErrorMessage(message);
      } finally {
        setLoading(false);
      }
    },
    [hydrateFromList],
  );

  useEffect(() => {
    void loadFlowVersions(DEFAULT_FLOW_ID);
  }, [loadFlowVersions]);

  const handleConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) {
        return;
      }
      const newEdge: FlowEdge = {
        id: `edge-${Date.now()}`,
        source: connection.source,
        target: connection.target,
        condition: null,
      };
      setEdges((current) => [
        ...current,
        {
          id: newEdge.id,
          source: newEdge.source,
          target: newEdge.target,
          data: newEdge,
        },
      ]);
    },
    [setEdges],
  );

  const handleSelectionChange = useCallback((params: OnSelectionChangeParams) => {
    if (params.nodes && params.nodes.length > 0) {
      setSelectedNodeId(params.nodes[0].id);
    } else {
      setSelectedNodeId(null);
    }
  }, []);

  const handleAddNode = useCallback(
    (type: FlowNode['type']) => {
      const newId = `${type}-${Date.now()}`;
      const newNode: FlowNode = {
        id: newId,
        type,
        label: type === 'checkpoint' ? 'Checkpoint HITL' : 'Novo Nó',
        config: { position: { x: 180 + nodes.length * 60, y: 120 + nodes.length * 40 } },
      };
      setNodes((current) => [
        ...current,
        {
          id: newNode.id,
          position: parsePosition(newNode.config.position, current.length),
          data: newNode,
        },
      ]);
    },
    [nodes.length, setNodes],
  );

  const handleDeleteNode = useCallback(() => {
    if (!selectedNodeId) {
      return;
    }
    setNodes((current) => current.filter((node) => node.id !== selectedNodeId));
    setEdges((current) => current.filter((edge) => edge.source !== selectedNodeId && edge.target !== selectedNodeId));
    setSelectedNodeId(null);
  }, [selectedNodeId, setEdges, setNodes]);

  const handleNodeLabelChange = useCallback(
    (nextLabel: string) => {
      if (!selectedNodeId) {
        return;
      }
      setNodes((current) =>
        current.map((node) => {
          if (node.id !== selectedNodeId) {
            return node;
          }
          const data = isPlainRecord(node.data) ? { ...(node.data as FlowNode) } : { id: node.id, type: 'state', label: node.id, config: {} };
          data.label = nextLabel;
          return { ...node, data };
        }),
      );
    },
    [selectedNodeId, setNodes],
  );

  const handleNodeTypeChange = useCallback(
    (nextType: FlowNode['type']) => {
      if (!selectedNodeId) {
        return;
      }
      setNodes((current) =>
        current.map((node) => {
          if (node.id !== selectedNodeId) {
            return node;
          }
          const data = isPlainRecord(node.data) ? { ...(node.data as FlowNode) } : { id: node.id, type: 'state', label: node.id, config: {} };
          data.type = nextType;
          return { ...node, data };
        }),
      );
    },
    [selectedNodeId, setNodes],
  );

  const handleLoadFlow = useCallback(() => {
    void loadFlowVersions(pendingFlowId);
  }, [loadFlowVersions, pendingFlowId]);

  const buildPayload = useCallback((): FlowVersionCreateInput => {
    const graph = buildGraphPayload(
      flowId,
      label,
      entryNode,
      exitNode,
      nodes,
      edges,
      agentClass,
      targetPath || defaultTargetPath(flowId),
      description,
    );
    return {
      graph,
      targetPath: targetPath || defaultTargetPath(flowId),
      agentClass,
      comment: comment || null,
      author: author || null,
      baselineAgentCode: versions[0]?.agentCode ?? null,
    };
  }, [agentClass, author, comment, description, edges, entryNode, exitNode, flowId, label, nodes, targetPath, versions]);

  const handleSaveVersion = useCallback(async () => {
    setSaving(true);
    setStatusMessage(null);
    setErrorMessage(null);
    try {
      const payload = buildPayload();
      const record = await createFlowVersion(flowId, payload);
      setComment('');
      setStatusMessage(`Versão ${record.version} criada com sucesso`);
      await loadFlowVersions(flowId);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha ao salvar versão';
      setErrorMessage(message);
    } finally {
      setSaving(false);
    }
  }, [buildPayload, flowId, loadFlowVersions]);

  const handleRollback = useCallback(
    async (version: number) => {
      setSaving(true);
      setErrorMessage(null);
      try {
        const record = await rollbackFlowVersion(flowId, version, { author, comment: comment || `Rollback para ${version}` });
        setStatusMessage(`Rollback gerou versão ${record.version}`);
        await loadFlowVersions(flowId);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Falha ao realizar rollback';
        setErrorMessage(message);
      } finally {
        setSaving(false);
      }
    },
    [author, comment, flowId, loadFlowVersions],
  );

  const handleLoadVersion = useCallback(
    (version: FlowVersion) => {
      applyGraph(version.graph, version);
      setStatusMessage(`Versão ${version.version} carregada`);
    },
    [applyGraph],
  );

  const handleCompareVersion = useCallback(
    async (version: number) => {
      if (versions.length === 0) {
        return;
      }
      const latest = versions[0];
      if (latest.version === version) {
        setDiffText(null);
        setCompareVersion(null);
        return;
      }
      setDiffLoading(true);
      setErrorMessage(null);
      try {
        const diff = await compareFlowVersions(flowId, version, latest.version);
        setDiffText(diff.diff);
        setCompareVersion(version);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Falha ao comparar versões';
        setErrorMessage(message);
      } finally {
        setDiffLoading(false);
      }
    },
    [flowId, versions],
  );

  const nodeOptions = useMemo(() => nodes.map((node) => ({ id: node.id, label: isPlainRecord(node.data) ? (node.data as FlowNode).label : node.id })), [nodes]);

  return (
    <section className="flows-page" aria-label="Editor de LangGraph">
      <div className="flows-page__canvas">
        <header className="flows-page__header">
          <h1>Orquestrador de Fluxos LangGraph</h1>
          <p>Modele nós, checkpoints HITL e registre versões auditáveis.</p>
        </header>

        <div className="flows-page__controls">
          <label className="flows-field">
            <span>ID do fluxo</span>
            <div className="flows-field__row">
              <input
                type="text"
                value={pendingFlowId}
                onChange={(event) => setPendingFlowId(event.target.value)}
                placeholder="ex.: atendimento"
              />
              <button type="button" onClick={handleLoadFlow} disabled={isLoading}>
                {isLoading ? 'Carregando...' : 'Carregar'}
              </button>
            </div>
          </label>
          <label className="flows-field">
            <span>Título</span>
            <input type="text" value={label} onChange={(event) => setLabel(event.target.value)} />
          </label>
          <label className="flows-field">
            <span>Descrição</span>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={2}
            />
          </label>
          <div className="flows-field flows-field--inline">
            <label>
              <span>Entrada</span>
              <select value={entryNode} onChange={(event) => setEntryNode(event.target.value)}>
                {nodeOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Saída</span>
              <select value={exitNode} onChange={(event) => setExitNode(event.target.value)}>
                {nodeOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="flows-field flows-field--inline">
            <label>
              <span>Classe do agente</span>
              <input
                type="text"
                value={agentClass}
                onChange={(event) => setAgentClass(event.target.value)}
              />
            </label>
            <label>
              <span>Arquivo</span>
              <input
                type="text"
                value={targetPath}
                onChange={(event) => setTargetPath(event.target.value)}
              />
            </label>
          </div>
          <div className="flows-actions">
            <button type="button" onClick={() => handleAddNode('state')}>Adicionar nó</button>
            <button type="button" onClick={() => handleAddNode('checkpoint')}>Adicionar checkpoint</button>
            <button type="button" onClick={handleDeleteNode} disabled={!selectedNode}>
              Remover selecionado
            </button>
          </div>
        </div>

        <div className="flows-canvas">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={handleConnect}
            onSelectionChange={handleSelectionChange}
            fitView
          >
            <MiniMap zoomable pannable />
            <Controls />
            <Background gap={16} size={1} />
          </ReactFlow>
        </div>

        <div className="flows-side-panel" aria-live="polite">
          <h2>Detalhes do nó</h2>
          {selectedNode ? (
            <div className="flows-field-group">
              <label className="flows-field">
                <span>Identificador</span>
                <input type="text" value={selectedNode.id} disabled />
              </label>
              <label className="flows-field">
                <span>Rótulo</span>
                <input
                  type="text"
                  value={isPlainRecord(selectedNode.data) ? (selectedNode.data as FlowNode).label : selectedNode.id}
                  onChange={(event) => handleNodeLabelChange(event.target.value)}
                />
              </label>
              <label className="flows-field">
                <span>Tipo</span>
                <select
                  value={isPlainRecord(selectedNode.data) ? (selectedNode.data as FlowNode).type : 'state'}
                  onChange={(event) => handleNodeTypeChange(event.target.value)}
                >
                  <option value="state">Estado</option>
                  <option value="checkpoint">Checkpoint HITL</option>
                  <option value="tool">Tool</option>
                  <option value="llm">LLM</option>
                </select>
              </label>
            </div>
          ) : (
            <p className="flows-placeholder">Selecione um nó para editar detalhes.</p>
          )}
        </div>

        <footer className="flows-footer">
          <div className="flows-field flows-field--inline">
            <label>
              <span>Autor</span>
              <input type="text" value={author} onChange={(event) => setAuthor(event.target.value)} />
            </label>
            <label>
              <span>Comentário</span>
              <input type="text" value={comment} onChange={(event) => setComment(event.target.value)} />
            </label>
          </div>
          <button type="button" onClick={handleSaveVersion} disabled={isSaving}>
            {isSaving ? 'Salvando...' : 'Salvar versão'}
          </button>
        </footer>

        {(statusMessage || errorMessage) && (
          <div className="flows-feedback" role="status">
            {statusMessage && <span className="flows-feedback__success">{statusMessage}</span>}
            {errorMessage && <span className="flows-feedback__error">{errorMessage}</span>}
            <button type="button" onClick={() => { setStatusMessage(null); setErrorMessage(null); }}>
              Limpar
            </button>
          </div>
        )}
      </div>

      <aside className="flows-history" aria-label="Histórico de versões">
        <header className="flows-history__header">
          <h2>Versionamento</h2>
          <p>{versions.length} versões registradas</p>
        </header>
        <ul className="flows-history__list">
          {versions.map((version) => (
            <li
              key={version.version}
              className={
                version.version === selectedVersion
                  ? 'flows-history__item flows-history__item--active'
                  : 'flows-history__item'
              }
            >
              <div>
                <strong>v{version.version}</strong>{' '}
                <span className="flows-history__meta">{formatTimestamp(version.createdAt)}</span>
                {version.comment && <p className="flows-history__comment">{version.comment}</p>}
                {version.hitlCheckpoints.length > 0 && (
                  <p className="flows-history__checkpoints">
                    Checkpoints: {version.hitlCheckpoints.join(', ')}
                  </p>
                )}
              </div>
              <div className="flows-history__actions">
                <button type="button" onClick={() => handleLoadVersion(version)}>
                  Carregar
                </button>
                <button type="button" onClick={() => handleCompareVersion(version.version)}>
                  {compareVersion === version.version ? 'Atualizar diff' : 'Comparar'}
                </button>
                <button type="button" onClick={() => handleRollback(version.version)}>
                  Rollback
                </button>
              </div>
            </li>
          ))}
          {versions.length === 0 && <li className="flows-placeholder">Nenhuma versão disponível.</li>}
        </ul>
        <section className="flows-diff-panel" aria-live="polite">
          <h3>Diff de versões</h3>
          {isDiffLoading ? (
            <p>Calculando diff...</p>
          ) : diffText ? (
            <pre className="flows-diff" aria-label="Diferenças de código">
              <code>{diffText}</code>
            </pre>
          ) : (
            <p className="flows-placeholder">Selecione uma versão para comparar com a última.</p>
          )}
        </section>
      </aside>
    </section>
  );
}

export default Flows;
