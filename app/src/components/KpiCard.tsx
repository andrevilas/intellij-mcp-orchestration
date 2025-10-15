import type { ReactNode } from 'react';

export type Trend = 'up' | 'down' | 'flat';

export interface KpiCardProps {
  label: string;
  value: string;
  caption?: string;
  trend?: Trend;
  trendLabel?: string;
  icon?: ReactNode;
}

const TREND_SYMBOL: Record<Trend, string> = {
  up: '▲',
  down: '▼',
  flat: '■',
};

export function KpiCard({ label, value, caption, trend = 'flat', trendLabel, icon }: KpiCardProps) {
  return (
    <article className="kpi-card" aria-label={label}>
      <header className="kpi-card__header">
        <span className="kpi-card__label">{label}</span>
        {icon ? <span className="kpi-card__icon" aria-hidden="true">{icon}</span> : null}
      </header>
      <strong className="kpi-card__value">{value}</strong>
      {caption ? <p className="kpi-card__caption">{caption}</p> : null}
      {trendLabel ? (
        <small
          className={`kpi-card__trend kpi-card__trend--${trend}`}
          aria-label={`Tendência ${trend === 'up' ? 'positiva' : trend === 'down' ? 'negativa' : 'estável'}`}
        >
          <span aria-hidden="true">{TREND_SYMBOL[trend]}</span> {trendLabel}
        </small>
      ) : null}
    </article>
  );
}

export default KpiCard;
