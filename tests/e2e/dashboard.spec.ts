import { expect, test, loadBackendFixture } from './fixtures';

test('exibe métricas extendidas no dashboard usando fixtures', async ({ page }) => {
  const telemetryMetrics = await loadBackendFixture<{
    total_tokens_in: number;
    total_tokens_out: number;
    extended: {
      cache_hit_rate: number;
      cached_tokens: number;
      latency_p95_ms: number;
      latency_p99_ms: number;
      error_rate: number;
      error_breakdown: { category: string; count: number }[];
    };
  }>('telemetry_metrics.json');

  const percentFormatter = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1, minimumFractionDigits: 0 });
  const numberFormatter = new Intl.NumberFormat('pt-BR');

  const cacheHitPercent = `${percentFormatter.format(Math.round(telemetryMetrics.extended.cache_hit_rate * 1000) / 10)}%`;
  const cachedTokensLabel = `${numberFormatter.format(telemetryMetrics.extended.cached_tokens)} tok`;
  const cacheShare = `${percentFormatter.format(
    (telemetryMetrics.extended.cached_tokens /
      (telemetryMetrics.total_tokens_in + telemetryMetrics.total_tokens_out)) *
      100,
  )}%`;
  const latencyP95Label = `${numberFormatter.format(telemetryMetrics.extended.latency_p95_ms)} ms`;
  const latencyP99Label = `${numberFormatter.format(telemetryMetrics.extended.latency_p99_ms)} ms`;
  const errorRatePercent = `${percentFormatter.format(Math.round(telemetryMetrics.extended.error_rate * 1000) / 10)}%`;
  const totalErrors = telemetryMetrics.extended.error_breakdown.reduce((sum, entry) => sum + entry.count, 0);

  await page.goto('/');

  await expect(page.getByRole('heading', { name: /Dashboard Executivo/ })).toBeVisible();

  const insightsRegion = page.getByRole('region', { name: 'Indicadores complementares de telemetria' });
  await expect(insightsRegion.getByText('Taxa de acertos em cache')).toBeVisible();
  await expect(insightsRegion.getByText(cacheHitPercent)).toBeVisible();
  await expect(insightsRegion.getByText(cachedTokensLabel)).toBeVisible();
  await expect(insightsRegion.getByText(`Equivale a ${cacheShare} do volume total processado.`)).toBeVisible();
  await expect(insightsRegion.getByText('Latência P95')).toBeVisible();
  await expect(insightsRegion.getByText(latencyP95Label)).toBeVisible();
  await expect(insightsRegion.getByText(`P99 registrado em ${latencyP99Label}.`)).toBeVisible();
  await expect(insightsRegion.getByText('Taxa de erro')).toBeVisible();
  await expect(insightsRegion.getByText(errorRatePercent)).toBeVisible();
  await expect(
    insightsRegion.getByText(`${numberFormatter.format(totalErrors)} falhas categorizadas nas últimas execuções.`),
  ).toBeVisible();

  await expect(insightsRegion.getByRole('img', { name: /Distribuição de custo por rota/ })).toBeVisible();
  await expect(insightsRegion.getByRole('img', { name: /Ocorrências de erro por categoria/ })).toBeVisible();
  await expect(insightsRegion.getByText('Sem custos computados na janela selecionada.')).toHaveCount(0);
  await expect(insightsRegion.getByText('Nenhum erro categorizado na janela analisada.')).toHaveCount(0);
});
