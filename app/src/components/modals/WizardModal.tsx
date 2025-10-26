import { Fragment, useEffect, useId, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import Button from '../actions/Button';
import ModalBase from './ModalBase';

export interface WizardStep {
  id: string;
  title: string;
  description?: ReactNode;
  content: ReactNode | (() => ReactNode);
  nextLabel?: string;
  onNext?: () => boolean | Promise<boolean>;
  onBack?: () => void;
}

export interface WizardModalProps {
  isOpen: boolean;
  title: string;
  description?: ReactNode;
  steps: WizardStep[];
  onClose: () => void;
  onComplete: () => void | boolean | Promise<void | boolean>;
  initialStepId?: string;
  confirmLabel?: string;
  confirmArmedLabel?: string;
  confirmHint?: string;
  confirmArmedHint?: string;
  confirmMode?: 'single' | 'double';
  backLabel?: string;
  nextLabel?: string;
  isCompleting?: boolean;
  size?: 'md' | 'lg' | 'xl';
}

function resolveContent(content: WizardStep['content']): ReactNode {
  return typeof content === 'function' ? content() : content;
}

export default function WizardModal({
  isOpen,
  title,
  description,
  steps,
  onClose,
  onComplete,
  initialStepId,
  confirmLabel = 'Confirmar',
  confirmArmedLabel = 'Confirmar agora',
  confirmHint = 'Revise os dados e avance para habilitar a confirmação.',
  confirmArmedHint = 'Clique novamente para concluir.',
  confirmMode = 'double',
  backLabel = 'Voltar',
  nextLabel = 'Continuar',
  isCompleting = false,
  size = 'lg',
}: WizardModalProps): JSX.Element | null {
  if (steps.length === 0) {
    return null;
  }

  const [activeStepId, setActiveStepId] = useState<string | undefined>(initialStepId ?? steps[0]?.id);
  const [isArmed, setArmed] = useState(false);
  const hintId = useId();

  const activeIndex = useMemo(() => steps.findIndex((step) => step.id === activeStepId), [steps, activeStepId]);
  const activeStep = activeIndex >= 0 ? steps[activeIndex] : undefined;
  const isLastStep = activeIndex === steps.length - 1;
  const requiresDoubleConfirm = confirmMode === 'double';

  useEffect(() => {
    if (!isOpen) {
      setActiveStepId(initialStepId ?? steps[0]?.id);
      setArmed(false);
    }
  }, [initialStepId, isOpen, steps]);

  useEffect(() => {
    if (!isLastStep) {
      setArmed(false);
    }
  }, [isLastStep, activeIndex]);

  const handleSelectStep = (stepId: string) => {
    const targetIndex = steps.findIndex((step) => step.id === stepId);
    if (targetIndex === -1 || targetIndex > activeIndex || targetIndex === activeIndex) {
      return;
    }
    setActiveStepId(stepId);
    steps[targetIndex]?.onBack?.();
  };

  const handleBack = () => {
    if (activeIndex <= 0) {
      onClose();
      return;
    }
    const previous = steps[activeIndex - 1];
    setActiveStepId(previous.id);
    previous.onBack?.();
  };

  const handleAdvance = async () => {
    if (!activeStep) {
      return;
    }

    const shouldContinue = (await activeStep.onNext?.()) ?? true;
    if (!shouldContinue) {
      return;
    }

    if (isLastStep) {
      if (isCompleting) {
        return;
      }
      if (requiresDoubleConfirm && !isArmed) {
        setArmed(true);
        return;
      }
      const completionResult = await onComplete();
      if (completionResult === false) {
        return;
      }
      if (requiresDoubleConfirm) {
        setArmed(false);
      }
      return;
    }

    setActiveStepId(steps[activeIndex + 1]?.id);
  };

  const currentProgress = useMemo(() => {
    return steps.map((step, index) => ({
      ...step,
      status: index < activeIndex ? 'complete' : index === activeIndex ? 'current' : 'upcoming',
    }));
  }, [steps, activeIndex]);

  const effectiveNextLabel = activeStep?.nextLabel ?? (isLastStep ? confirmLabel : nextLabel);
  const armedLabel = isLastStep ? confirmArmedLabel : effectiveNextLabel;
  const liveHint = isLastStep && requiresDoubleConfirm ? (isArmed ? confirmArmedHint : confirmHint) : undefined;

  return (
    <ModalBase
      isOpen={isOpen}
      title={title}
      description={description}
      onClose={onClose}
      closeOnBackdrop={false}
      size={size}
      contentClassName="mcp-modal__wizard"
      footer={null}
    >
      <div className="mcp-modal__wizard-layout">
        <nav aria-label="Etapas do wizard" className="mcp-modal__wizard-steps">
          <ol>
            {currentProgress.map((step) => (
              <li key={step.id} data-status={step.status}>
                <button
                  type="button"
                  onClick={() => handleSelectStep(step.id)}
                  disabled={step.status === 'upcoming'}
                  aria-current={step.status === 'current' ? 'step' : undefined}
                >
                  <span className="mcp-modal__wizard-step-title">{step.title}</span>
                  {step.description ? (
                    <span className="mcp-modal__wizard-step-description">{step.description}</span>
                  ) : null}
                </button>
              </li>
            ))}
          </ol>
        </nav>
        <div className="mcp-modal__wizard-content">
          {activeStep ? <Fragment>{resolveContent(activeStep.content)}</Fragment> : null}
        </div>
      </div>
      <footer className="mcp-modal__footer">
        <div className="mcp-modal__actions">
          <Button variant="outline" onClick={handleBack} data-modal-close={activeIndex <= 0}>
            {backLabel}
          </Button>
          <Button
            variant={isLastStep ? 'primary' : 'secondary'}
            onClick={handleAdvance}
            loading={isCompleting}
            aria-describedby={liveHint ? hintId : undefined}
            data-state={isArmed ? 'armed' : 'idle'}
          >
            {isArmed ? armedLabel : effectiveNextLabel}
          </Button>
        </div>
        {liveHint ? (
          <p
            id={hintId}
            className={`mcp-modal__confirm-hint${isArmed ? ' mcp-modal__confirm-hint--armed' : ''}`}
            role="status"
            aria-live="polite"
          >
            {liveHint}
          </p>
        ) : null}
      </footer>
    </ModalBase>
  );
}
