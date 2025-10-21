export const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  maximumFractionDigits: 2,
});

export const numberFormatter = new Intl.NumberFormat('pt-BR');

export const percentFormatter = new Intl.NumberFormat('pt-BR', {
  maximumFractionDigits: 1,
  minimumFractionDigits: 0,
});

export const LATENCY_FORMATTER = new Intl.NumberFormat('pt-BR', {
  maximumFractionDigits: 0,
});
