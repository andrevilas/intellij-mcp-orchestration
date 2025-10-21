import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import type { TraceRow } from '../Observability';
import {
  currencyFormatter,
  latencyFormatter,
  percentFormatter,
} from './formatters';

export interface ObservabilityChartsProps {
  traceRows: TraceRow[];
}

export function ObservabilityCharts({ traceRows }: ObservabilityChartsProps) {
  return (
    <>
      <article className="observability__chart" aria-label="Latência média por provedor">
        <header>
          <h3>Latência média por provedor</h3>
          <p>Compare a latência das execuções para identificar outliers rapidamente.</p>
        </header>
        <div className="observability__chart-canvas">
          {traceRows.length === 0 ? (
            <p>Sem execuções registradas na janela selecionada.</p>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={traceRows} margin={{ top: 16, right: 24, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#cbd5f5" />
                <XAxis dataKey="providerName" tick={{ fill: '#475569' }} />
                <YAxis tick={{ fill: '#475569' }} tickFormatter={(value) => `${value} ms`} />
                <Tooltip
                  formatter={(value: number | string) => {
                    const numericValue = typeof value === 'number' ? value : Number(value);
                    return `${latencyFormatter.format(numericValue)} ms`;
                  }}
                  labelFormatter={(label: string) => `Provedor: ${label}`}
                />
                <Area type="monotone" dataKey="avgLatency" stroke="#4338ca" fill="#818cf8" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </article>

      <article className="observability__chart" aria-label="Distribuição de sucesso por provedor">
        <header>
          <h3>Distribuição de sucesso por provedor</h3>
          <p>Relacione volume de execuções, sucesso e custo médio.</p>
        </header>
        <div className="observability__chart-canvas">
          {traceRows.length === 0 ? (
            <p>Cadastre provedores e gere tráfego para visualizar distribuição.</p>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={traceRows} margin={{ top: 16, right: 24, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="providerName" tick={{ fill: '#475569' }} />
                <YAxis
                  yAxisId="success"
                  orientation="left"
                  tickFormatter={(value) => `${value}%`}
                  tick={{ fill: '#475569' }}
                />
                <YAxis
                  yAxisId="cost"
                  orientation="right"
                  tickFormatter={(value) => currencyFormatter.format(Number(value))}
                  tick={{ fill: '#475569' }}
                />
                <Tooltip
                  formatter={(value: number | string, _name, item) => {
                    const numericValue = typeof value === 'number' ? value : Number(value);
                    if (item && 'dataKey' in item && item.dataKey === 'successRateDisplay') {
                      return percentFormatter.format(numericValue / 100);
                    }
                    return currencyFormatter.format(numericValue);
                  }}
                  labelFormatter={(label: string) => `Provedor: ${label}`}
                />
                <Bar
                  yAxisId="success"
                  dataKey="successRateDisplay"
                  fill="#10b981"
                  name="Taxa de sucesso"
                />
                <Bar yAxisId="cost" dataKey="costUsd" fill="#f97316" name="Custo (BRL)" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </article>
    </>
  );
}
