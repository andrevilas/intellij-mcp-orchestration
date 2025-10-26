import { useId } from 'react';

import type { PolicyTemplate, PolicyTemplateId } from '../api';

type PolicyTemplateRiskLevel = 'controlled' | 'staged' | 'critical';

const POLICY_RISK_METADATA: Record<PolicyTemplateRiskLevel, { title: string; description: string }> = {
  controlled: {
    title: 'Risco controlado',
    description: 'Aplicar templates exige confirmação dupla e gera plano auditável via fixtures.',
  },
  staged: {
    title: 'Rollout monitorado',
    description: 'Use janelas menores e monitore métricas antes de expandir para toda a frota.',
  },
  critical: {
    title: 'Mudança crítica',
    description: 'Aplique apenas após revisar com FinOps e Routing; impacta guardrails globais.',
  },
};

export interface PolicyTemplatePickerProps {
  templates: PolicyTemplate[];
  value: PolicyTemplateId;
  onChange: (templateId: PolicyTemplateId) => void;
  disabled?: boolean;
  riskLevel?: PolicyTemplateRiskLevel;
  riskMessage?: string;
}

export default function PolicyTemplatePicker({
  templates,
  value,
  onChange,
  disabled = false,
  riskLevel = 'controlled',
  riskMessage,
}: PolicyTemplatePickerProps) {
  const riskDescriptorId = useId();
  const baseMetadata = POLICY_RISK_METADATA[riskLevel];
  const resolvedMessage = riskMessage && riskMessage.trim().length > 0 ? riskMessage : baseMetadata.description;
  const hasMessage = resolvedMessage.trim().length > 0;
  const describedBy = hasMessage ? riskDescriptorId : undefined;

  return (
    <fieldset className="policy-picker" aria-describedby={describedBy}>
      <legend>Selecione um template de política</legend>
      {hasMessage && (
        <div
          id={riskDescriptorId}
          className="policy-picker__risk"
          data-risk-level={riskLevel}
          aria-live="polite"
        >
          <strong className="policy-picker__risk-title">{baseMetadata.title}</strong>
          <p className="policy-picker__risk-message">{resolvedMessage}</p>
        </div>
      )}
      <div className="policy-picker__options">
        {templates.map((template) => {
          const isSelected = template.id === value;
          return (
            <label
              key={template.id}
              className={isSelected ? 'policy-card policy-card--selected' : 'policy-card'}
              aria-label={`Template ${template.name}`}
            >
              <input
                type="radio"
                name="policy-template"
                value={template.id}
                checked={isSelected}
                onChange={() => onChange(template.id)}
                disabled={disabled}
              />
              <div className="policy-card__content">
                <header className="policy-card__header">
                  <span className="policy-card__tagline">{template.tagline}</span>
                  <h4>{template.name}</h4>
                </header>
                <p className="policy-card__description">{template.description}</p>
                <dl className="policy-card__metrics">
                  <div>
                    <dt>Custo estimado</dt>
                    <dd>{template.priceDelta}</dd>
                  </div>
                  <div>
                    <dt>Meta de latência</dt>
                    <dd>{template.latencyTarget}</dd>
                  </div>
                  <div>
                    <dt>Guardrails</dt>
                    <dd>{template.guardrailLevel}</dd>
                  </div>
                </dl>
                <ul className="policy-card__features">
                  {template.features.map((feature, index) => (
                    <li key={index}>{feature}</li>
                  ))}
                </ul>
              </div>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
