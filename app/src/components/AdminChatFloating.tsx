import { FormEvent, useMemo, useRef, useState } from 'react';

import useAdminChat from '../hooks/useAdminChat';
import './admin-chat-floating.scss';

const ROLE_LABELS = {
  user: 'Você',
  assistant: 'Copiloto',
  system: 'Sistema',
} as const;

export default function AdminChatFloating(): JSX.Element {
  const {
    messages,
    isChatLoading,
    error,
    statusMessage,
    sendMessage,
    clearError,
    clearStatus,
    hasConversation,
    agentDisplayName,
  } = useAdminChat();

  const [prompt, setPrompt] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const roleLabels = useMemo(() => ROLE_LABELS, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = prompt.trim();
    if (!trimmed) {
      return;
    }
    try {
      await sendMessage(trimmed);
      setPrompt('');
      textareaRef.current?.focus();
    } catch {
      // handled by hook
    }
  };

  return (
    <div className="admin-chat-floating">
      <header className="admin-chat-floating__header">
        <h3>Converse com o assistente</h3>
        <p>{agentDisplayName ?? 'Carregando agente MCP…'}</p>
      </header>
      {statusMessage ? (
        <div className="admin-chat-floating__alert admin-chat-floating__alert--success" role="status">
          <span>{statusMessage}</span>
          <button type="button" onClick={clearStatus} aria-label="Fechar status">
            ×
          </button>
        </div>
      ) : null}
      {error ? (
        <div className="admin-chat-floating__alert admin-chat-floating__alert--error" role="alert">
          <span>{error}</span>
          <button type="button" onClick={clearError} aria-label="Fechar erro">
            ×
          </button>
        </div>
      ) : null}
      <div className="admin-chat-floating__messages" role="log" aria-live="polite">
        {hasConversation ? (
          <ul>
            {messages.map((message) => (
              <li key={message.id} className={`admin-chat-floating__message admin-chat-floating__message--${message.role}`}>
                <header>
                  <span>{roleLabels[message.role]}</span>
                  <time dateTime={message.createdAt}>{new Date(message.createdAt).toLocaleTimeString()}</time>
                </header>
                <p>{message.content}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="admin-chat-floating__placeholder">
            Envie uma mensagem para o copiloto iniciar o diagnóstico assistido.
          </p>
        )}
        {isChatLoading ? <p className="admin-chat-floating__loading">Processando solicitação…</p> : null}
      </div>
      <form className="admin-chat-floating__form" onSubmit={handleSubmit}>
        <label htmlFor="admin-chat-floating-input" className="visually-hidden">
          Mensagem para o assistente
        </label>
        <textarea
          id="admin-chat-floating-input"
          ref={textareaRef}
          rows={3}
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder="Descreva a ação que deseja executar…"
          disabled={isChatLoading}
        />
        <div className="admin-chat-floating__actions">
          <button type="submit" className="admin-chat-floating__send" disabled={isChatLoading}>
            Enviar
          </button>
        </div>
      </form>
    </div>
  );
}
