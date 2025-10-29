import { useMemo } from 'react';
import useAdminChat from '../hooks/useAdminChat';
import './admin-chat-agent-settings.scss';

export default function AdminChatAgentSettings(): JSX.Element {
  const { assistantAgentId, agentDisplayName, availableAgents, selectAssistantAgent, isAgentConfigured } =
    useAdminChat();

  const options = useMemo(() => {
    if (availableAgents.length === 0) {
      return [
        {
          value: assistantAgentId ?? 'fallback',
          label: agentDisplayName ?? 'MCP Admin Assistant (fallback)',
          disabled: true,
        },
      ];
    }
    return availableAgents.map((agent) => ({
      value: agent.name,
      label: agent.title || agent.name,
      status: agent.status,
    }));
  }, [agentDisplayName, assistantAgentId, availableAgents]);

  return (
    <div className="admin-chat-agent-settings">
      <header className="admin-chat-agent-settings__header">
        <h3>Configurar agente do chat</h3>
        <p>
          Escolha qual agente MCP deve responder às conversas. O agente selecionado receberá instruções com o
          conhecimento completo da plataforma e poderá invocar as APIs internas para executar ações.
        </p>
      </header>
      <div className="admin-chat-agent-settings__field">
        <label htmlFor="admin-chat-agent-select">Agente configurado</label>
        <select
          id="admin-chat-agent-select"
          value={assistantAgentId ?? ''}
          onChange={(event) => selectAssistantAgent(event.target.value)}
          disabled={availableAgents.length === 0}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value} disabled={'disabled' in option && option.disabled}>
              {option.label}
              {'status' in option && option.status ? ` (${option.status})` : ''}
            </option>
          ))}
        </select>
        <p className="admin-chat-agent-settings__hint">
          {availableAgents.length === 0
            ? 'Nenhum agente MCP encontrado. O assistente interno será utilizado até que um agente seja cadastrado.'
            : isAgentConfigured
            ? `Agente "${agentDisplayName}" configurado com sucesso.`
            : 'Selecione um agente disponível para personalizar o chat.'}
        </p>
      </div>
      <section className="admin-chat-agent-settings__knowledge">
        <h4>Escopo de conhecimento do agente</h4>
        <ul>
          <li>Acesso completo às funcionalidades do Console MCP (observabilidade, servidores, policies, flows etc.).</li>
          <li>Permissão para invocar endpoints administrativos como /config/chat, /config/plan e /config/apply.</li>
          <li>Conhecimento da documentação interna e dos fluxos de onboarding assistido.</li>
          <li>Capacidade de gerar e aplicar planos, executar smoke tests e interagir com guardrails HITL.</li>
        </ul>
      </section>
    </div>
  );
}
