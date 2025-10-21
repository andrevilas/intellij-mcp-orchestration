import { useMemo } from 'react';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  CartesianGrid,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ScatterChart,
  Scatter,
  ZAxis,
} from 'recharts';

import type { DerivedDashboardData, HeatmapPoint } from '../Dashboard';
import { currencyFormatter, numberFormatter, percentFormatter } from './formatters';

const INSIGHT_COLORS = ['#2563eb', '#0ea5e9', '#22c55e', '#f97316', '#a855f7', '#06b6d4', '#f43f5e'];

function formatCostTooltip(value: number, name: string | number): [string, string] {
  const label = typeof name === 'string' ? name : String(name);
  return [currencyFormatter.format(value), label];
}

function formatErrorTooltip(value: number, name: string | number): [string, string] {
  const label = typeof name === 'string' ? name : String(name);
  return [`${numberFormatter.format(value)} falha(s)`, label];
}

function formatHeatmapTooltip(value: number, _name: string | number, entry?: { payload?: HeatmapPoint }): string {
  const payload = entry?.payload;
  if (!payload) {
    return `${value} execução(ões)`;
  }
  return `${payload.provider} — ${payload.day}: ${value} execução(ões)`;
}

function getHeatmapColor(value: number, max: number): string {
  if (max === 0) {
    return 'var(--heatmap-neutral)';
  }
  const intensity = value / max;
  if (intensity === 0) {
    return 'var(--heatmap-neutral)';
  }
  const start = { r: 24, g: 90, b: 157 };
  const end = { r: 122, g: 216, b: 162 };
  const r = Math.round(start.r + (end.r - start.r) * intensity);
  const g = Math.round(start.g + (end.g - start.g) * intensity);
  const b = Math.round(start.b + (end.b - start.b) * intensity);
  return `rgb(${r}, ${g}, ${b})`;
}

function createHeatSquareRenderer(max: number) {
  return (props: unknown) => {
    const { cx, cy, payload } = props as { cx?: number; cy?: number; payload?: HeatmapPoint };
    if (typeof cx !== 'number' || typeof cy !== 'number' || !payload) {
      return <g />;
    }
    const size = 36;
    const x = cx - size / 2;
    const y = cy - size / 2;
    return <rect x={x} y={y} width={size} height={size} rx={8} fill={getHeatmapColor(payload.value, max)} />;
  };
}

export interface DashboardInsightVisualsProps {
  derived: DerivedDashboardData;
  costChartTitleId: string;
  costChartDescriptionId: string;
  errorChartTitleId: string;
  errorChartDescriptionId: string;
}

export function DashboardInsightVisuals({
  derived,
  costChartTitleId,
  costChartDescriptionId,
  errorChartTitleId,
  errorChartDescriptionId,
}: DashboardInsightVisualsProps) {
  return (
    <div className="dashboard__insight-visuals">
      <figure
        className="insight-chart"
        aria-labelledby={costChartTitleId}
        aria-describedby={costChartDescriptionId}
        data-testid="dashboard-cost-breakdown"
      >
        <div className="insight-chart__header">
          <h3 id={costChartTitleId}>Distribuição de custo por rota</h3>
          <p>Participação relativa por lane/rota nas últimas 24h.</p>
        </div>
        <div className="insight-chart__canvas" role="img" aria-labelledby={`${costChartTitleId} ${costChartDescriptionId}`}>
          {derived.costBreakdown.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Tooltip formatter={(value, name) => formatCostTooltip(value as number, name)} />
                <Pie
                  data={derived.costBreakdown}
                  dataKey="cost"
                  nameKey="label"
                  innerRadius={60}
                  outerRadius={110}
                  paddingAngle={4}
                >
                  {derived.costBreakdown.map((entry, index) => (
                    <Cell key={entry.label} fill={INSIGHT_COLORS[index % INSIGHT_COLORS.length]} />
                  ))}
                </Pie>
                <Legend
                  formatter={(value: string) => {
                    const entry = derived.costBreakdown.find((item) => item.label === value);
                    const percent = entry ? percentFormatter.format(entry.percent) : undefined;
                    return percent ? `${value} — ${percent}%` : value;
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="info">Sem custos computados na janela selecionada.</p>
          )}
        </div>
        <figcaption id={costChartDescriptionId} className="visually-hidden">
          {derived.costBreakdown.length > 0
            ? `Distribuição percentual de custo entre ${derived.costBreakdown.length} rota(s).`
            : 'Sem dados de custo disponíveis para calcular a distribuição.'}
        </figcaption>
      </figure>

      <figure
        className="insight-chart"
        aria-labelledby={errorChartTitleId}
        aria-describedby={errorChartDescriptionId}
        data-testid="dashboard-error-breakdown"
      >
        <div className="insight-chart__header">
          <h3 id={errorChartTitleId}>Ocorrências de erro por categoria</h3>
          <p>Principais motivos de falha registrados.</p>
        </div>
        <div className="insight-chart__canvas" role="img" aria-labelledby={`${errorChartTitleId} ${errorChartDescriptionId}`}>
          {derived.errorBreakdown.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={derived.errorBreakdown} margin={{ top: 8, right: 16, left: 0, bottom: 16 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="category" />
                <YAxis allowDecimals={false} />
                <Tooltip formatter={(value, name) => formatErrorTooltip(value as number, name)} />
                <Bar dataKey="count" name="Falhas" radius={[8, 8, 0, 0]} fill="#f97316" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="info">Nenhum erro categorizado na janela analisada.</p>
          )}
        </div>
        <figcaption id={errorChartDescriptionId} className="visually-hidden">
          {derived.errorBreakdown.length > 0
            ? `Total de ${numberFormatter.format(derived.totalErrorCount)} falhas distribuídas em ${derived.errorBreakdown.length} categoria(s).`
            : 'Sem dados categorizados de falhas disponíveis.'}
        </figcaption>
      </figure>
    </div>
  );
}

export interface DashboardHeatmapProps {
  derived: DerivedDashboardData;
}

export function DashboardHeatmap({ derived }: DashboardHeatmapProps) {
  const renderHeatSquare = useMemo(
    () => createHeatSquareRenderer(derived.maxHeatmapValue),
    [derived.maxHeatmapValue],
  );

  return (
    <section className="dashboard__heatmap" data-testid="dashboard-heatmap">
      <header>
        <h2>Uso por modelo · últimos 7 dias</h2>
        <p>Heatmap baseado na distribuição diária de execuções.</p>
      </header>
      <div className="heatmap__container">
        {derived.heatmapProviderCount === 0 ? (
          <p className="info">Cadastre provedores para visualizar o uso agregado.</p>
        ) : derived.heatmap.every((entry) => entry.value === 0) ? (
          <p className="info">Sem execuções registradas nos últimos 7 dias.</p>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <ScatterChart margin={{ top: 16, right: 16, bottom: 24, left: 80 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="category" dataKey="day" />
              <YAxis type="category" dataKey="provider" width={140} />
              <ZAxis type="number" dataKey="value" range={[0, derived.maxHeatmapValue || 1]} />
              <Tooltip
                cursor={{ fill: 'rgba(17, 24, 39, 0.06)' }}
                formatter={(value, name, entry) => formatHeatmapTooltip(value as number, name, entry)}
              />
              <Scatter data={derived.heatmap} shape={renderHeatSquare} />
            </ScatterChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  );
}
