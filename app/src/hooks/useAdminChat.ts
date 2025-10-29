import { useCallback, useEffect, useMemo, useState } from 'react';

import type {
  AdminChatMessage,
  AdminHitlRequest,
  AdminPlanDiff,
  AdminPlanSummary,
  AdminRiskItem,
  ConfigChatResponse,
} from '../api';
import { fetchAgents, postConfigApply, postConfigChat, postConfigPlan, type AgentSummary } from '../api';

const FALLBACK_AGENT_ID = 'mcp-admin-assistant';
const FALLBACK_AGENT_NAME = 'MCP Admin Assistant';
const ASSISTANT_AGENT_STORAGE_KEY = 'admin-chat.assistant-agent';
const PLATFORM_KNOWLEDGE_SUMMARY = `
A plataforma Console MCP oferece capacidades completas para orquestração de agentes e servidores MCP.
- Observabilidade: métricas, traces (HTTP GET /telemetry/*) e heatmaps em tempo real.
- Servidores: lifecycle dos MCP servers com operações start/stop/restart e inspeção de logs (HTTP POST /servers/:id/actions).
- Agents: catálogo com manifests versionados, smoke tests e owners (HTTP GET /agents, POST /agents/:id/smoke).
- Chaves: armazenamento de credenciais, teste integrado e rotação assistida (HTTP GET/POST /secrets).
- Segurança e Políticas: guardrails, auditoria HITL e políticas de acesso em /policies e /security.
- Roteamento e Flows: definição de rotas, simulações what-if e editor de LangGraph com checkpoints HITL (HTTP POST /routing, /flows).
- FinOps: dashboards de custo com séries temporais e alertas (HTTP GET /finops/*).
- Marketplace: importação assistida de agentes externos com verificação de assinatura.
- Admin Chat & Onboarding: geração de planos, aplicação via branch/PR e execução de smoke tests usando as rotas /config/*.
O agente pode invocar as APIs administrativas expostas pela própria plataforma (endpoints /config/chat, /config/plan, /config/apply, /config/onboard, etc.) para executar ações solicitadas.
`;

function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'Falha ao comunicar com o assistente administrativo.';
}

export interface UseAdminChatState {
  threadId: string | null;
  messages: AdminChatMessage[];
  plan: AdminPlanSummary | null;
  diffs: AdminPlanDiff[];
  risks: AdminRiskItem[];
  hitlRequest: AdminHitlRequest | null;
  isChatLoading: boolean;
  isPlanLoading: boolean;
  isApplyLoading: boolean;
  error: string | null;
  statusMessage: string | null;
  sendMessage: (prompt: string) => Promise<void>;
  loadHistory: () => Promise<ConfigChatResponse | null>;
  generatePlan: (scope: string, options?: { refresh?: boolean }) => Promise<void>;
  applyPlan: (note?: string | null) => Promise<void>;
  confirmHitl: (note?: string | null) => Promise<void>;
  cancelHitl: () => void;
  clearStatus: () => void;
  clearError: () => void;
  hasConversation: boolean;
  assistantAgentId: string | null;
  isAgentConfigured: boolean;
  agentDisplayName: string | null;
  availableAgents: AgentSummary[];
  selectAssistantAgent: (agentId: string) => void;
}

export default function useAdminChat(): UseAdminChatState {
  const [assistantAgentId, setAssistantAgentId] = useState<string | null>(FALLBACK_AGENT_ID);
  const [agentDisplayName, setAgentDisplayName] = useState<string | null>(FALLBACK_AGENT_NAME);
  const [isAgentConfigured, setAgentConfigured] = useState(false);
  const [availableAgents, setAvailableAgents] = useState<AgentSummary[]>([]);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AdminChatMessage[]>([]);
  const [plan, setPlan] = useState<AdminPlanSummary | null>(null);
  const [diffs, setDiffs] = useState<AdminPlanDiff[]>([]);
  const [risks, setRisks] = useState<AdminRiskItem[]>([]);
  const [hitlRequest, setHitlRequest] = useState<AdminHitlRequest | null>(null);
  const [isChatLoading, setChatLoading] = useState(false);
  const [isPlanLoading, setPlanLoading] = useState(false);
  const [isApplyLoading, setApplyLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const hasConversation = useMemo(() => messages.length > 0, [messages]);

  useEffect(() => {
    let cancelled = false;
    async function resolveAssistantAgent() {
      try {
        const agents = await fetchAgents();
        if (cancelled) {
          return;
        }
        setAvailableAgents(agents);
        const storedAgentId = (() => {
          try {
            return window.localStorage.getItem(ASSISTANT_AGENT_STORAGE_KEY);
          } catch {
            return null;
          }
        })();
        if (agents.length > 0) {
          const preferredCandidate = storedAgentId
            ? agents.find((agent) => agent.name === storedAgentId)
            : agents.find((agent) => agent.status !== 'inactive');
          const selected = preferredCandidate ?? agents[0];
          setAssistantAgentId(selected.name);
          setAgentDisplayName(selected.title || selected.name);
          setAgentConfigured(true);
          try {
            window.localStorage.setItem(ASSISTANT_AGENT_STORAGE_KEY, selected.name);
          } catch {
            // ignore
          }
          return;
        }
        setAvailableAgents([]);
        setAssistantAgentId(FALLBACK_AGENT_ID);
        setAgentDisplayName(FALLBACK_AGENT_NAME);
        setAgentConfigured(false);
        try {
          window.localStorage.removeItem(ASSISTANT_AGENT_STORAGE_KEY);
        } catch {
          // ignore
        }
      } catch (error) {
        console.error('Falha ao carregar agentes MCP para o Admin Chat.', error);
        if (cancelled) {
          return;
        }
        setAvailableAgents([]);
        setAssistantAgentId(FALLBACK_AGENT_ID);
        setAgentDisplayName(FALLBACK_AGENT_NAME);
        setAgentConfigured(false);
      }
    }
    void resolveAssistantAgent();
    return () => {
      cancelled = true;
    };
  }, []);

  const chatContext = useMemo(() => {
    if (!assistantAgentId) {
      return undefined;
    }
    return JSON.stringify({
      agent: assistantAgentId,
      knowledgeBase: 'platform-docs',
      instructions: PLATFORM_KNOWLEDGE_SUMMARY,
    });
  }, [assistantAgentId]);

  const updateConversation = useCallback((response: ConfigChatResponse) => {
    setThreadId(response.threadId);
    setMessages(response.messages);
  }, []);

  const sendMessage = useCallback(
    async (prompt: string) => {
      setChatLoading(true);
      setError(null);
      setStatusMessage(null);
      try {
        const response = await postConfigChat({
          intent: 'message',
          prompt,
          threadId,
          context: chatContext,
        });
        updateConversation(response);
      } catch (cause) {
        setError(extractErrorMessage(cause));
        throw cause;
      } finally {
        setChatLoading(false);
      }
    },
    [chatContext, threadId, updateConversation],
  );

  const loadHistory = useCallback(async () => {
    if (!threadId) {
      return null;
    }

    setChatLoading(true);
    setError(null);
    try {
      const response = await postConfigChat({
        intent: 'history',
        threadId,
      });
      updateConversation(response);
      return response;
    } catch (cause) {
      setError(extractErrorMessage(cause));
      return null;
    } finally {
      setChatLoading(false);
    }
  }, [threadId, updateConversation]);

  const generatePlan = useCallback(
    async (scope: string, options?: { refresh?: boolean }) => {
      if (!threadId) {
        throw new Error('Inicie uma conversa antes de gerar um plano.');
      }

      setPlanLoading(true);
      setError(null);
      setStatusMessage(null);
      try {
        const response = await postConfigPlan({
          intent: 'generate',
          threadId,
          scope,
          refresh: options?.refresh,
        });
        setPlan(response.plan);
        setDiffs(response.diffs);
        setRisks(response.risks);
        setHitlRequest(null);
      } catch (cause) {
        setError(extractErrorMessage(cause));
        throw cause;
      } finally {
        setPlanLoading(false);
      }
    },
    [threadId],
  );

  const applyPlan = useCallback(
    async (note?: string | null) => {
      if (!threadId || !plan) {
        throw new Error('Gere um plano antes de aplicar alterações.');
      }

      setApplyLoading(true);
      setError(null);
      setStatusMessage(null);
      try {
        const response = await postConfigApply({
          intent: 'apply',
          threadId,
          planId: plan.id,
          note,
        });

        if (response.status === 'hitl_required') {
          setHitlRequest(response.request);
          return;
        }

        if (response.plan) {
          setPlan(response.plan);
        } else {
          setPlan((current) =>
            current ? { ...current, status: 'applied', generatedAt: new Date().toISOString() } : current,
          );
        }
        const details: string[] = [response.message];
        if (response.branch) {
          details.push(`Branch: ${response.branch}`);
        }
        if (response.pullRequest?.url) {
          details.push(`PR: ${response.pullRequest.url}`);
        }
        setStatusMessage(details.join(' '));
        setHitlRequest(null);
      } catch (cause) {
        setError(extractErrorMessage(cause));
        throw cause;
      } finally {
        setApplyLoading(false);
      }
    },
    [plan, threadId],
  );

  const confirmHitl = useCallback(
    async (note?: string | null) => {
      if (!threadId || !plan || !hitlRequest) {
        throw new Error('Nenhuma aprovação pendente.');
      }

      setApplyLoading(true);
      setError(null);
      setStatusMessage(null);
      try {
        const response = await postConfigApply({
          intent: 'confirm',
          threadId,
          planId: plan.id,
          token: hitlRequest.token,
          note,
        });

        if (response.status === 'hitl_required') {
          setHitlRequest(response.request);
        } else {
          if (response.plan) {
            setPlan(response.plan);
          } else {
            setPlan((current) =>
              current ? { ...current, status: 'applied', generatedAt: new Date().toISOString() } : current,
            );
          }
          setHitlRequest(null);
          const details: string[] = [response.message];
          if (response.branch) {
            details.push(`Branch: ${response.branch}`);
          }
          if (response.pullRequest?.url) {
            details.push(`PR: ${response.pullRequest.url}`);
          }
          setStatusMessage(details.join(' '));
        }
      } catch (cause) {
        setError(extractErrorMessage(cause));
        throw cause;
      } finally {
        setApplyLoading(false);
      }
    },
    [hitlRequest, plan, threadId],
  );

  const cancelHitl = useCallback(() => {
    setHitlRequest(null);
  }, []);

  const clearStatus = useCallback(() => {
    setStatusMessage(null);
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    threadId,
    messages,
    plan,
    diffs,
    risks,
    hitlRequest,
    isChatLoading,
    isPlanLoading,
    isApplyLoading,
    error,
    statusMessage,
    sendMessage,
    loadHistory,
    generatePlan,
    applyPlan,
    confirmHitl,
    cancelHitl,
    clearStatus,
    clearError,
    hasConversation,
    assistantAgentId,
    agentDisplayName,
    isAgentConfigured,
    availableAgents,
    selectAssistantAgent: (agentId: string) => {
      const resolved = availableAgents.find((agent) => agent.name === agentId);
      if (resolved) {
        setAssistantAgentId(resolved.name);
        setAgentDisplayName(resolved.title || resolved.name);
        setAgentConfigured(true);
        try {
          window.localStorage.setItem(ASSISTANT_AGENT_STORAGE_KEY, resolved.name);
        } catch {
          // ignore
        }
        return;
      }
      setAssistantAgentId(FALLBACK_AGENT_ID);
      setAgentDisplayName(FALLBACK_AGENT_NAME);
      setAgentConfigured(false);
      try {
        window.localStorage.removeItem(ASSISTANT_AGENT_STORAGE_KEY);
      } catch {
        // ignore
      }
    },
  };
}
