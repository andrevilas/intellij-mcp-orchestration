import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

export interface FinOpsTimeseriesDatum {
  date: string;
  label: string;
  costUsd: number;
  tokensMillions: number;
  avgLatencyMs: number;
}

export type FinOpsMetricAccessor = 'costUsd' | 'tokensMillions';

export interface FinOpsTimeseriesChartProps {
  availableSeries: FinOpsTimeseriesDatum[];
  metricAccessor: FinOpsMetricAccessor;
  metricLabel: string;
  tooltipFormatter(value: number): string;
  yAxisFormatter(value: number): string;
  emptyStateMessage: string;
}

export function FinOpsTimeseriesChart({
  availableSeries,
  metricAccessor,
  metricLabel,
  tooltipFormatter,
  yAxisFormatter,
  emptyStateMessage,
}: FinOpsTimeseriesChartProps) {
  if (availableSeries.length === 0) {
    return <p className="finops__state">{emptyStateMessage}</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={320}>
      <AreaChart data={availableSeries} margin={{ top: 16, right: 16, left: 0, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" className="finops__chart-grid" />
        <XAxis dataKey="label" className="finops__chart-axis" interval="preserveStartEnd" />
        <YAxis
          className="finops__chart-axis"
          tickFormatter={(value: number) => yAxisFormatter(value)}
          width={80}
        />
        <Tooltip
          formatter={(value: number | string) => {
            const numericValue = typeof value === 'number' ? value : Number(value);
            return tooltipFormatter(numericValue);
          }}
          labelFormatter={(label: string) => label}
          contentStyle={{
            background: 'var(--surface-elevated)',
            borderRadius: '12px',
            border: '1px solid var(--border-strong)',
          }}
        />
        <Area
          type="monotone"
          dataKey={metricAccessor}
          name={metricLabel}
          stroke="var(--accent-primary)"
          fill="var(--accent-primary-transparent)"
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export default FinOpsTimeseriesChart;
