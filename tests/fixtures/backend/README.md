# Backend Fixtures compartilhadas

Os JSONs deste diretório são cópias das respostas de referência utilizadas pelo backend de desenvolvimento (`server/routes/fixtures`). Use-as para popular mocks em suites Playwright/Vitest sem depender do servidor FastAPI local.

- `telemetry_*.json`: dashboards (métricas, heatmap, timeseries, pareto, runs).
- `routing_simulation.json`: resposta padrão do simulador determinístico.
- `finops_*.json`: relatórios de sprint e de pull request exibidos na página FinOps.
