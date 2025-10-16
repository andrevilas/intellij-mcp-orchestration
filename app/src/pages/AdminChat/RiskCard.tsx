import type { AdminRiskItem, AdminRiskLevel } from '../../api';

interface RiskCardProps {
  risk: AdminRiskItem;
}

const LEVEL_LABELS: Record<AdminRiskLevel, string> = {
  low: 'Baixo',
  medium: 'Médio',
  high: 'Alto',
};

export default function RiskCard({ risk }: RiskCardProps) {
  return (
    <article className={`risk-card risk-card--${risk.level}`}>
      <header className="risk-card__header">
        <h3>{risk.title}</h3>
        <span className="risk-card__badge">{LEVEL_LABELS[risk.level]}</span>
      </header>
      <p className="risk-card__description">{risk.description}</p>
      {risk.mitigation ? <p className="risk-card__mitigation">Mitigação: {risk.mitigation}</p> : null}
    </article>
  );
}
