import type { ReactNode } from 'react';

export type PolicyTemplateId = 'economy' | 'balanced' | 'turbo';

export interface PolicyTemplate {
  id: PolicyTemplateId;
  name: string;
  tagline: string;
  description: string;
  priceDelta: string;
  latencyTarget: string;
  guardrailLevel: string;
  features: ReactNode[];
}

export interface PolicyTemplatePickerProps {
  templates: PolicyTemplate[];
  value: PolicyTemplateId;
  onChange: (templateId: PolicyTemplateId) => void;
  disabled?: boolean;
}

export default function PolicyTemplatePicker({ templates, value, onChange, disabled = false }: PolicyTemplatePickerProps) {
  return (
    <fieldset className="policy-picker">
      <legend>Selecione um template de política</legend>
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
