import { useCallback, useMemo, useState } from 'react';

import type {
  AdminChatMessage,
  AdminHitlRequest,
  AdminPlanDiff,
  AdminPlanSummary,
  AdminRiskItem,
  ConfigChatResponse,
} from '../api';
import {
  postConfigApply,
  postConfigChat,
  postConfigMcpOnboard,
  postConfigPlan,
} from '../api';

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
  isOnboarding: boolean;
  error: string | null;
  statusMessage: string | null;
  sendMessage: (prompt: string) => Promise<void>;
  loadHistory: () => Promise<ConfigChatResponse | null>;
  generatePlan: (scope: string, options?: { refresh?: boolean }) => Promise<void>;
  applyPlan: (note?: string | null) => Promise<void>;
  confirmHitl: (note?: string | null) => Promise<void>;
  cancelHitl: () => void;
  onboardProvider: (providerId: string, command?: string | null) => Promise<void>;
  clearStatus: () => void;
  clearError: () => void;
  hasConversation: boolean;
}

export default function useAdminChat(): UseAdminChatState {
  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AdminChatMessage[]>([]);
  const [plan, setPlan] = useState<AdminPlanSummary | null>(null);
  const [diffs, setDiffs] = useState<AdminPlanDiff[]>([]);
  const [risks, setRisks] = useState<AdminRiskItem[]>([]);
  const [hitlRequest, setHitlRequest] = useState<AdminHitlRequest | null>(null);
  const [isChatLoading, setChatLoading] = useState(false);
  const [isPlanLoading, setPlanLoading] = useState(false);
  const [isApplyLoading, setApplyLoading] = useState(false);
  const [isOnboarding, setOnboarding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const hasConversation = useMemo(() => messages.length > 0, [messages]);

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
        });
        updateConversation(response);
      } catch (cause) {
        setError(extractErrorMessage(cause));
        throw cause;
      } finally {
        setChatLoading(false);
      }
    },
    [threadId, updateConversation],
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
        setStatusMessage(response.message);
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
          setStatusMessage(response.message);
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

  const onboardProvider = useCallback(
    async (providerId: string, command?: string | null) => {
      setOnboarding(true);
      setError(null);
      setStatusMessage(null);
      try {
        const response = await postConfigMcpOnboard({
          intent: 'onboard',
          providerId,
          command,
        });
        setStatusMessage(response.message);
      } catch (cause) {
        setError(extractErrorMessage(cause));
        throw cause;
      } finally {
        setOnboarding(false);
      }
    },
    [],
  );

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
    isOnboarding,
    error,
    statusMessage,
    sendMessage,
    loadHistory,
    generatePlan,
    applyPlan,
    confirmHitl,
    cancelHitl,
    onboardProvider,
    clearStatus,
    clearError,
    hasConversation,
  };
}
