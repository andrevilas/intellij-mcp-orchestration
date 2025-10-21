export const latencyFormatter = new Intl.NumberFormat('pt-BR', {
  maximumFractionDigits: 0,
});

export const percentFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'percent',
  maximumFractionDigits: 1,
});

export const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  maximumFractionDigits: 2,
});

export const numberFormatter = new Intl.NumberFormat('pt-BR');

export function formatLatency(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return 'Sem dados';
  }
  return `${latencyFormatter.format(value)} ms`;
}

export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return 'Sem dados';
  }
  return percentFormatter.format(value);
}

export function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return currencyFormatter.format(0);
  }
  return currencyFormatter.format(value);
}
