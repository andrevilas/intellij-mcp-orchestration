import type { ReactNode } from 'react';

import type { AdminPlanStatus, AdminPlanSummary } from '../../api';

interface PlanSummaryProps {
  plan: AdminPlanSummary | null;
  isLoading: boolean;
  actions?: ReactNode;
}

const STATUS_LABELS: Record<AdminPlanStatus, string> = {
  draft: 'Rascunho',
  ready: 'Pronto para aplicar',
  applied: 'Aplicado',
};

const STEP_STATUS_LABELS = {
  pending: 'Pendente',
  ready: 'Pronto',
  blocked: 'Bloqueado',
} as const;

export default function PlanSummary({ plan, isLoading, actions }: PlanSummaryProps) {
  return (
    <section className="plan-summary" aria-busy={isLoading} aria-live="polite">
      <header className="plan-summary__header">
        <div>
          <h2 className="plan-summary__title">Plano de configuração</h2>
          {plan ? (
            <p className="plan-summary__meta">
              Gerado por <strong>{plan.author}</strong> em{' '}
              <time dateTime={plan.generatedAt}>{new Date(plan.generatedAt).toLocaleString()}</time>.
              Escopo: <strong>{plan.scope}</strong>
            </p>
          ) : (
            <p className="plan-summary__meta">Nenhum plano gerado ainda.</p>
          )}
        </div>
        {plan ? (
          <span className={`plan-summary__badge plan-summary__badge--${plan.status}`}>
            {STATUS_LABELS[plan.status]}
          </span>
        ) : null}
      </header>
      {isLoading ? (
        <p className="plan-summary__placeholder">Gerando plano com sugestões atualizadas…</p>
      ) : plan ? (
        <ol className="plan-summary__steps">
          {plan.steps.map((step) => (
            <li key={step.id} className={`plan-summary__step plan-summary__step--${step.status}`}>
              <div className="plan-summary__step-header">
                <h3>{step.title}</h3>
                <span className={`plan-summary__step-status plan-summary__step-status--${step.status}`}>
                  {STEP_STATUS_LABELS[step.status]}
                </span>
              </div>
              <p>{step.description}</p>
              {step.impact ? <p className="plan-summary__step-impact">Impacto: {step.impact}</p> : null}
            </li>
          ))}
        </ol>
      ) : (
        <p className="plan-summary__placeholder">
          Solicite ao copiloto que gere um plano de rollout antes de aplicar alterações.
        </p>
      )}
      {actions ? <div className="plan-summary__actions">{actions}</div> : null}
    </section>
  );
}
