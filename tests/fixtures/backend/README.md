# Backend Fixtures compartilhadas

Os JSONs deste diretório são cópias das respostas de referência utilizadas pelo backend de desenvolvimento (`server/routes/fixtures`). Use-as para popular mocks em suites Playwright/Vitest sem depender do servidor FastAPI local.

- `servers.json`, `server_processes.json`, `server_health.json`: catálogo, snapshots e histórico de healthchecks usados na página **Servers**.
- `sessions.json`, `notifications.json`: fluxos de sessão em memória e timeline de alertas para o **Dashboard** e Admin Chat.
- `policy_manifest.json`, `policies_compliance.json`: contratos exibidos em **Routing**/**Policies** e cartões de conformidade.
- `providers.json`: catálogo de providers consumido pelo wizard de agentes e pela página **Routing Lab**.
- `telemetry_*.json`: dashboards (métricas, heatmap, timeseries, pareto, runs).
- `telemetry_experiments.json`, `telemetry_lane_costs.json`, `telemetry_marketplace.json`: datasets auxiliares para FinOps e marketplace.
- `routing_simulation.json`: resposta padrão do simulador determinístico.
- `finops_*.json`: relatórios de sprint e de pull request exibidos na página **FinOps**.
