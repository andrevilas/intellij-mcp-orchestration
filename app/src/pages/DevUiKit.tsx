import { Suspense, lazy } from 'react';
import { ToastProvider } from '../components/feedback/ToastProvider';
import '../styles/dev-ui-kit.scss';

const UiKitShowcase = lazy(() => import('../components/UiKitShowcase'));
const ThemeSwitch = lazy(() => import('../theme/ThemeSwitch'));

function DevUiKitContent(): JSX.Element {
  return (
    <div className="dev-ui-kit">
      <header className="dev-ui-kit__header">
        <a className="dev-ui-kit__back-link" href="/">
          ← Voltar para o console
        </a>
        <Suspense
          fallback={
            <span className="dev-ui-kit__theme-placeholder" aria-hidden="true">
              Tema
            </span>
          }
        >
          <ThemeSwitch className="dev-ui-kit__theme-switch" />
        </Suspense>
      </header>
      <main className="dev-ui-kit__main" role="main" aria-label="Laboratório de componentes UI Kit">
        <Suspense
          fallback={
            <div className="dev-ui-kit__loading" role="status" aria-live="polite">
              Carregando catálogo de componentes…
            </div>
          }
        >
          <UiKitShowcase />
        </Suspense>
      </main>
      <footer className="dev-ui-kit__footer">
        Ambiente dedicado para testar componentes com fixtures — /dev/ui-kit
      </footer>
    </div>
  );
}

export default function DevUiKitPage(): JSX.Element {
  return (
    <ToastProvider>
      <DevUiKitContent />
    </ToastProvider>
  );
}
