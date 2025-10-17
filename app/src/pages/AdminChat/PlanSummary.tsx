import type { ReactNode } from 'react';

import type { AdminPlanReviewer, AdminPlanStatus, AdminPlanSummary } from '../../api';

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

const PR_STATE_LABELS: Record<string, string> = {
  open: 'Aberto',
  closed: 'Fechado',
  merged: 'Mergeado',
  draft: 'Rascunho',
  locked: 'Bloqueado',
};

const REVIEW_STATUS_LABELS: Record<string, string> = {
  approved: 'Aprovado',
  satisfied: 'Satisfeito',
  changes_requested: 'Mudanças solicitadas',
  changesrequested: 'Mudanças solicitadas',
  pending: 'Aguardando revisão',
  review_required: 'Revisão obrigatória',
  reviewrequired: 'Revisão obrigatória',
  dismissed: 'Dispensado',
  draft: 'Rascunho',
};

const REVIEWER_STATUS_LABELS: Record<string, string> = {
  approved: 'Aprovado',
  pending: 'Pendente',
  changes_requested: 'Mudanças solicitadas',
  changesrequested: 'Mudanças solicitadas',
  commented: 'Comentado',
  dismissed: 'Dispensado',
};

function formatStatus(value: string | null | undefined, labels: Record<string, string>): string | null {
  if (!value) {
    return null;
  }
  const normalized = value.toLowerCase();
  if (normalized in labels) {
    return labels[normalized];
  }
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function getStatusModifier(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

function buildChipClass(value: string | null | undefined): string {
  const modifier = getStatusModifier(value);
  return modifier ? `plan-summary__chip plan-summary__chip--${modifier}` : 'plan-summary__chip';
}

function collectReviewers(plan: AdminPlanSummary | null): AdminPlanReviewer[] {
  if (!plan) {
    return [];
  }
  const combined = [...(plan.reviewers ?? []), ...(plan.pullRequest?.reviewers ?? [])];
  const seen = new Set<string>();
  const unique: AdminPlanReviewer[] = [];
  for (const reviewer of combined) {
    if (!reviewer) {
      continue;
    }
    const key = reviewer.id || reviewer.name;
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(reviewer);
  }
  return unique;
}

export default function PlanSummary({ plan, isLoading, actions }: PlanSummaryProps) {
  const reviewers = collectReviewers(plan);
  const prStateLabel = plan?.pullRequest
    ? formatStatus(plan.pullRequest.state, PR_STATE_LABELS)
    : null;
  const prReviewLabel = plan?.pullRequest
    ? formatStatus(plan.pullRequest.reviewStatus ?? null, REVIEW_STATUS_LABELS)
    : null;
  const hasMetadata = Boolean(
    plan && (plan.branch || plan.baseBranch || plan.pullRequest || reviewers.length > 0),
  );
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
      {plan && hasMetadata ? (
        <dl className="plan-summary__details">
          {plan.branch || plan.baseBranch ? (
            <div className="plan-summary__detail">
              <dt>Branch</dt>
              <dd>
                {plan.branch ? <code>{plan.branch}</code> : <span className="plan-summary__muted">Não informado</span>}
                {plan.baseBranch ? (
                  <span className="plan-summary__branch">
                    <span className="plan-summary__sr-only"> para </span>
                    <span aria-hidden="true" className="plan-summary__branch-arrow">
                      →
                    </span>
                    <code>{plan.baseBranch}</code>
                  </span>
                ) : null}
              </dd>
            </div>
          ) : null}
          {plan.pullRequest ? (
            <div className="plan-summary__detail">
              <dt>Pull request</dt>
              <dd>
                <div className="plan-summary__pr">
                  {plan.pullRequest.url ? (
                    <a
                      href={plan.pullRequest.url}
                      className="plan-summary__link"
                      target="_blank"
                      rel="noreferrer"
                    >
                      {plan.pullRequest.number ? `#${plan.pullRequest.number} — ${plan.pullRequest.title}` : plan.pullRequest.title}
                    </a>
                  ) : (
                    <span>{plan.pullRequest.number ? `#${plan.pullRequest.number} — ` : null}{plan.pullRequest.title}</span>
                  )}
                  <div className="plan-summary__chip-group">
                    {prStateLabel ? (
                      <span className={buildChipClass(plan.pullRequest.state)}>{prStateLabel}</span>
                    ) : null}
                    {prReviewLabel ? (
                      <span className={buildChipClass(plan.pullRequest.reviewStatus ?? null)}>{prReviewLabel}</span>
                    ) : null}
                  </div>
                </div>
              </dd>
            </div>
          ) : null}
          {reviewers.length > 0 ? (
            <div className="plan-summary__detail">
              <dt>Revisores</dt>
              <dd>
                <ul className="plan-summary__reviewers">
                  {reviewers.map((reviewer) => {
                    const statusLabel = formatStatus(reviewer.status ?? null, REVIEWER_STATUS_LABELS);
                    return (
                      <li key={reviewer.id} className="plan-summary__reviewer">
                        <span className="plan-summary__reviewer-name">{reviewer.name}</span>
                        {statusLabel ? (
                          <span className={buildChipClass(reviewer.status ?? null)}>{statusLabel}</span>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </dd>
            </div>
          ) : null}
        </dl>
      ) : null}
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
