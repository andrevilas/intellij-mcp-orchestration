import type { PolicyTemplate, PolicyTemplateId } from '../api';

export interface PolicyTemplatePickerProps {
  templates: PolicyTemplate[];
  value: PolicyTemplateId;
  onChange: (templateId: PolicyTemplateId) => void;
  disabled?: boolean;
  riskNote?: string | null;
  riskTestId?: string;
}

export default function PolicyTemplatePicker({
  templates,
  value,
  onChange,
  disabled = false,
  riskNote,
  riskTestId,
}: PolicyTemplatePickerProps) {
  return (
    <fieldset className="policy-picker">
      <legend>Selecione um template de política</legend>
      {riskNote ? (
        <p className="policy-picker__risk" role="note" data-testid={riskTestId}>
          <strong>Risco controlado.</strong> {riskNote}
        </p>
      ) : null}
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
