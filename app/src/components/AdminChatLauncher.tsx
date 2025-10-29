import { lazy, Suspense, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

import ModalBase from './modals/ModalBase';
import './admin-chat-launcher.scss';

const AdminChatFloating = lazy(() => import('./AdminChatFloating'));
const OnboardingWizard = lazy(() => import('../pages/Onboarding/OnboardingWizard'));
const AdminChatAgentSettings = lazy(() => import('./AdminChatAgentSettings'));

type LauncherOptionId = 'chat' | 'onboarding' | 'agent-settings';

export default function AdminChatLauncher(): JSX.Element {
  const [isMenuOpen, setMenuOpen] = useState(false);
  const [activePanel, setActivePanel] = useState<LauncherOptionId | null>(null);

  const toggleMenu = () => {
    setMenuOpen((current) => !current);
  };

  const handleSelectOption = (option: LauncherOptionId) => {
    setActivePanel(option);
    setMenuOpen(false);
  };

  const closeChat = () => setActivePanel((current) => (current === 'chat' ? null : current));
  const closeOnboarding = () => setActivePanel((current) => (current === 'onboarding' ? null : current));

  return (
    <>
      <button
        type="button"
        className="admin-chat-launcher"
        onClick={toggleMenu}
        aria-haspopup="menu"
        aria-expanded={isMenuOpen}
        aria-controls="admin-assistant-menu"
      >
        <FontAwesomeIcon icon="robot" fixedWidth aria-hidden="true" />
        <span className="admin-chat-launcher__label">Assistente MCP</span>
      </button>
      {isMenuOpen ? (
        <ul className="admin-chat-launcher__menu" role="menu" id="admin-assistant-menu">
          <li>
            <button
              type="button"
              className="admin-chat-launcher__option"
              role="menuitem"
              onClick={() => handleSelectOption('chat')}
            >
              <FontAwesomeIcon icon="comments" fixedWidth aria-hidden="true" />
              Conversar com o assistente
            </button>
          </li>
          <li>
            <button
              type="button"
              className="admin-chat-launcher__option"
              role="menuitem"
              onClick={() => handleSelectOption('onboarding')}
            >
              <FontAwesomeIcon icon="wand-magic-sparkles" fixedWidth aria-hidden="true" />
              Onboarding assistido MCP
            </button>
          </li>
          <li>
            <button
              type="button"
              className="admin-chat-launcher__option"
              role="menuitem"
              onClick={() => handleSelectOption('agent-settings')}
            >
              <FontAwesomeIcon icon="sliders" fixedWidth aria-hidden="true" />
              Configurar agente do chat
            </button>
          </li>
        </ul>
      ) : null}
      {activePanel === 'chat' ? (
        <div className="admin-chat-drawer" role="dialog" aria-label="Chat administrativo MCP">
          <div className="admin-chat-drawer__header">
            <div>
              <h2>Assistente administrativo MCP</h2>
              <p>Converse em tempo real com o agente configurado para executar ações na plataforma.</p>
            </div>
            <button
              type="button"
              className="admin-chat-drawer__close"
              onClick={closeChat}
              aria-label="Fechar chat administrativo"
            >
              ×
            </button>
          </div>
          <div className="admin-chat-drawer__body">
            <Suspense fallback={<div className="admin-chat-launcher__loading">Carregando chat…</div>}>
              <AdminChatFloating />
            </Suspense>
          </div>
        </div>
      ) : null}
      {activePanel === 'onboarding' ? (
        <ModalBase
          isOpen
          onClose={closeOnboarding}
          title="Onboarding assistido MCP"
          description="Preencha as etapas do assistente guiado para configurar um servidor MCP."
          size="xl"
          dialogClassName="modal modal--lg"
          contentClassName="modal__body"
          closeOnBackdrop={false}
        >
          <Suspense fallback={<div className="admin-chat-launcher__loading">Carregando assistente…</div>}>
            <OnboardingWizard hideHeading />
          </Suspense>
        </ModalBase>
      ) : null}
      {activePanel === 'agent-settings' ? (
        <ModalBase
          isOpen
          onClose={() => setActivePanel(null)}
          title="Configurar agente do chat"
          description="Escolha o agente MCP que deve responder às conversas do assistente."
          size="lg"
          dialogClassName="modal modal--lg"
          contentClassName="modal__body"
          closeOnBackdrop
        >
          <Suspense fallback={<div className="admin-chat-launcher__loading">Carregando agentes…</div>}>
            <AdminChatAgentSettings />
          </Suspense>
        </ModalBase>
      ) : null}
    </>
  );
}
