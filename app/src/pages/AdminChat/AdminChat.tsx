import { FormEvent, useMemo, useState } from 'react';

import useAdminChat from '../../hooks/useAdminChat';
import DiffViewer from './DiffViewer';
import PlanSummary from './PlanSummary';
import RiskCard from './RiskCard';

const ROLE_LABELS = {
  user: 'Operador',
  assistant: 'Copiloto',
  system: 'Sistema',
} as const;

export default function AdminChat() {
  const {
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
    generatePlan,
    applyPlan,
    confirmHitl,
    cancelHitl,
    onboardProvider,
    clearStatus,
    clearError,
    hasConversation,
  } = useAdminChat();

  const [prompt, setPrompt] = useState('');
  const [scope, setScope] = useState('');
  const [note, setNote] = useState('');
  const [providerId, setProviderId] = useState('');
  const [command, setCommand] = useState('');
  const [scopeError, setScopeError] = useState<string | null>(null);
  const [onboardError, setOnboardError] = useState<string | null>(null);

  const handleSend = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = prompt.trim();
    if (!trimmed) {
      return;
    }
    try {
      await sendMessage(trimmed);
      setPrompt('');
    } catch {
      // handled by hook
    }
  };

  const handleGeneratePlan = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedScope = scope.trim();
    if (!trimmedScope && !plan) {
      setScopeError('Informe um escopo para gerar o plano.');
      return;
    }
    try {
      await generatePlan(trimmedScope || plan?.scope || '', {
        refresh: Boolean(plan && trimmedScope === ''),
      });
      if (!trimmedScope && plan) {
        setScope(plan.scope);
      }
      setScopeError(null);
    } catch {
      // handled
    }
  };

  const handleApply = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      await applyPlan(note.trim() ? note.trim() : null);
    } catch {
      // handled
    }
  };

  const handleConfirm = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      await confirmHitl(note.trim() ? note.trim() : null);
      setNote('');
    } catch {
      // handled
    }
  };

  const handleOnboard = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedId = providerId.trim();
    if (!trimmedId) {
      setOnboardError('Informe o ID do provedor MCP.');
      return;
    }
    try {
      await onboardProvider(trimmedId, command.trim() ? command.trim() : null);
      setOnboardError(null);
      setProviderId('');
      setCommand('');
    } catch {
      // handled
    }
  };

  const hasRisks = risks.length > 0;
  const roleLabels = useMemo(() => ROLE_LABELS, []);

  const planActions = (
    <div className="admin-chat__plan-actions">
      <form className="admin-chat__form" onSubmit={handleGeneratePlan}>
        <label className="admin-chat__label" htmlFor="admin-chat-scope">
          Escopo do plano
        </label>
        <div className="admin-chat__form-row">
          <input
            id="admin-chat-scope"
            name="scope"
            type="text"
            value={scope}
            onChange={(event) => {
              setScope(event.target.value);
              if (scopeError) {
                setScopeError(null);
              }
            }}
            placeholder="Ex.: Atualizar guardrails para rotas críticas"
            aria-invalid={scopeError ? 'true' : 'false'}
            aria-describedby={scopeError ? 'admin-chat-scope-error' : undefined}
            disabled={isPlanLoading}
          />
          <button type="submit" className="admin-chat__button" disabled={isPlanLoading}>
            {plan ? 'Regenerar plano' : 'Gerar plano'}
          </button>
        </div>
        {scopeError ? (
          <p id="admin-chat-scope-error" className="admin-chat__helper admin-chat__helper--error">
            {scopeError}
          </p>
        ) : (
          <p className="admin-chat__helper">
            O escopo ajuda o copiloto a focar no rollout desejado. Você pode reaproveitar o escopo atual.
          </p>
        )}
      </form>
      {hitlRequest ? (
        <form className="admin-chat__form" onSubmit={handleConfirm}>
          <p className="admin-chat__helper admin-chat__helper--warning" role="alert">
            {hitlRequest.message}
          </p>
          <label className="admin-chat__label" htmlFor="admin-chat-note">
            Nota para aprovação (opcional)
          </label>
          <textarea
            id="admin-chat-note"
            name="note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={3}
            disabled={isApplyLoading}
          />
          <div className="admin-chat__button-row">
            <button type="submit" className="admin-chat__button admin-chat__button--primary" disabled={isApplyLoading}>
              Confirmar aplicação
            </button>
            <button
              type="button"
              className="admin-chat__button admin-chat__button--ghost"
              onClick={cancelHitl}
              disabled={isApplyLoading}
            >
              Cancelar
            </button>
          </div>
        </form>
      ) : (
        <form className="admin-chat__form" onSubmit={handleApply}>
          <label className="admin-chat__label" htmlFor="admin-chat-note">
            Nota para aplicação (opcional)
          </label>
          <textarea
            id="admin-chat-note"
            name="note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={3}
            disabled={isApplyLoading}
          />
          <div className="admin-chat__button-row">
            <button
              type="submit"
              className="admin-chat__button admin-chat__button--primary"
              disabled={isApplyLoading || !plan}
            >
              Aplicar plano
            </button>
          </div>
        </form>
      )}
    </div>
  );

  return (
    <div className="admin-chat">
      <div className="admin-chat__layout">
        <section className="admin-chat__panel admin-chat__panel--conversation">
          <header className="admin-chat__header">
            <h1>Assistente administrativo MCP</h1>
            <p>Converse com o copiloto para gerar planos, revisar diffs e aplicar mudanças com segurança.</p>
          </header>

          {statusMessage ? (
            <div className="admin-chat__alert admin-chat__alert--success" role="status">
              <p>{statusMessage}</p>
              <button type="button" onClick={clearStatus} className="admin-chat__alert-dismiss" aria-label="Fechar alerta">
                ×
              </button>
            </div>
          ) : null}

          {error ? (
            <div className="admin-chat__alert admin-chat__alert--error" role="alert">
              <p>{error}</p>
              <button type="button" onClick={clearError} className="admin-chat__alert-dismiss" aria-label="Fechar erro">
                ×
              </button>
            </div>
          ) : null}

          <div className="admin-chat__messages" role="log" aria-live="polite">
            {hasConversation ? (
              <ul>
                {messages.map((message) => (
                  <li key={message.id} className={`admin-chat__message admin-chat__message--${message.role}`}>
                    <header>
                      <span className="admin-chat__message-role">{roleLabels[message.role]}</span>
                      <time dateTime={message.createdAt}>{new Date(message.createdAt).toLocaleString()}</time>
                    </header>
                    <p>{message.content}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="admin-chat__placeholder">
                Nenhuma interação ainda. Envie uma mensagem para o copiloto iniciar um diagnóstico assistido.
              </p>
            )}
            {isChatLoading ? <p className="admin-chat__loading">Processando solicitação…</p> : null}
          </div>

          <form className="admin-chat__form" onSubmit={handleSend}>
            <label className="admin-chat__label" htmlFor="admin-chat-message">
              Mensagem para o copiloto
            </label>
            <textarea
              id="admin-chat-message"
              name="message"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              rows={4}
              placeholder="Ex.: Gere um plano para habilitar checkpoints HITL nas rotas de maior risco"
              disabled={isChatLoading}
            />
            <div className="admin-chat__button-row">
              <button type="submit" className="admin-chat__button admin-chat__button--primary" disabled={isChatLoading}>
                Enviar mensagem
              </button>
            </div>
          </form>

          <form className="admin-chat__form admin-chat__form--inline" onSubmit={handleOnboard}>
            <fieldset disabled={isOnboarding} className="admin-chat__fieldset">
              <legend>Onboarding de servidores MCP</legend>
              <div className="admin-chat__form-row">
                <label className="admin-chat__label" htmlFor="admin-chat-provider">
                  ID do servidor
                </label>
                <input
                  id="admin-chat-provider"
                  name="provider"
                  type="text"
                  value={providerId}
                  onChange={(event) => {
                    setProviderId(event.target.value);
                    if (onboardError) {
                      setOnboardError(null);
                    }
                  }}
                  placeholder="Ex.: openai-gpt4o"
                  aria-invalid={onboardError ? 'true' : 'false'}
                  aria-describedby={onboardError ? 'admin-chat-provider-error' : undefined}
                />
              </div>
              <div className="admin-chat__form-row">
                <label className="admin-chat__label" htmlFor="admin-chat-command">
                  Comando (opcional)
                </label>
                <input
                  id="admin-chat-command"
                  name="command"
                  type="text"
                  value={command}
                  onChange={(event) => setCommand(event.target.value)}
                  placeholder="Ex.: ./run-mcp --profile production"
                />
              </div>
              {onboardError ? (
                <p id="admin-chat-provider-error" className="admin-chat__helper admin-chat__helper--error">
                  {onboardError}
                </p>
              ) : (
                <p className="admin-chat__helper">
                  O assistente irá provisionar o servidor e atualizar o catálogo de forma segura.
                </p>
              )}
              <div className="admin-chat__button-row">
                <button type="submit" className="admin-chat__button" disabled={isOnboarding}>
                  Iniciar onboarding
                </button>
              </div>
            </fieldset>
          </form>
        </section>

        <aside className="admin-chat__panel admin-chat__panel--summary">
          <PlanSummary plan={plan} isLoading={isPlanLoading} actions={planActions} />
          <DiffViewer diffs={diffs} />
          <section className="admin-chat__risks">
            <h2>Riscos e checkpoints</h2>
            {hasRisks ? (
              <div className="admin-chat__risks-grid">
                {risks.map((risk) => (
                  <RiskCard key={risk.id} risk={risk} />
                ))}
              </div>
            ) : (
              <p className="admin-chat__placeholder">
                Nenhum risco elevado encontrado. Gere um plano para visualizar checkpoints sugeridos.
              </p>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
