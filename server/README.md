# Promenade Agent Hub — Server API Prototype

Este diretório contém o **FastAPI** prototype para o Console MCP backend. Ele expõe endpoints leves que o frontend usa para
descobrir provedores MCP e iniciar sessões lógicas em memória.

## Features

- `/api/v1/healthz` — liveness/metadata endpoint.
- `/api/v1/providers` — lista MCP providers a partir de `config/console-mcp/servers.example.json`.
- `/api/v1/providers/{id}/sessions` — provisiona uma sessão em memória e ecoa o contexto.
- `/api/v1/sessions` — inspeciona as sessões criadas durante o ciclo de vida do processo.

## Rodando localmente

```bash
cd server
python -m venv .venv
source .venv/bin/activate
pip install -e .
CONSOLE_MCP_SERVER_HOST=127.0.0.1 \\
CONSOLE_MCP_SERVER_PORT=8000 \\
  console-mcp-server-dev  # inicia uvicorn com auto-reload
```

Use `CONSOLE_MCP_SERVER_HOST`/`CONSOLE_MCP_SERVER_PORT` para definir o bind desejado tanto no modo dev quanto no modo
de produção. O entrypoint (`console-mcp-server`) mantém os defaults anteriores (`0.0.0.0:8000`) caso as variáveis não
sejam fornecidas. Ajuste o manifest copiando `config/console-mcp/servers.example.json` para outro local e definindo
`CONSOLE_MCP_SERVERS_PATH=/caminho/novo.json` antes de iniciar o servidor.

### Configuração de CORS

Por padrão, o backend libera as origens equivalentes ao frontend configurado (ex.:
`CONSOLE_MCP_FRONTEND_HOST=127.0.0.1`/`CONSOLE_MCP_FRONTEND_PORT=5173` resulta em `http://127.0.0.1:5173` e
`http://localhost:5173`). Para ampliar ou restringir a lista, defina `CONSOLE_MCP_CORS_ORIGINS` com origens separadas por
vírgula (ex.: `CONSOLE_MCP_CORS_ORIGINS=http://127.0.0.1:4173,https://console.internal`).

## Próximos passos

Os próximos itens do roadmap conectarão essas rotas a lifecycle real de MCP servers, incluindo spawn de processos stdio,
telemetria contínua e event streaming para o frontend.

## Contratos expostos para o frontend

As telas de Dashboard, Routing e FinOps consomem os endpoints abaixo. Quando a base SQLite estiver vazia o backend carrega
fixtures em `server/routes/fixtures/*.json`, garantindo respostas determinísticas durante o desenvolvimento.

### Telemetria (Dashboard)

| Endpoint | Parâmetros | Payload (resumo) |
| --- | --- | --- |
| `GET /api/v1/telemetry/metrics` | `start`, `end`, `provider_id`, `route` (ISO 8601 / strings) | `{ "start": string, "end": string, "total_runs": number, "total_tokens_in": number, "total_tokens_out": number, "total_cost_usd": number, "avg_latency_ms": number, "success_rate": number, "providers": TelemetryProviderMetrics[], "extended": { ... } }` |
| `GET /api/v1/telemetry/heatmap` | `start`, `end`, `provider_id`, `route` | `{ "buckets": [{ "day": "2025-03-01", "provider_id": "glm46", "run_count": 96 }, ...] }` |
| `GET /api/v1/telemetry/timeseries` | `start`, `end`, `provider_id`, `lane` | `{ "items": [{ "day": "2025-03-01", "provider_id": "glm46", "run_count": 96, "tokens_in": 49211, "tokens_out": 38102, "cost_usd": 21.84, "avg_latency_ms": 742.0, "success_count": 94 }], "next_cursor": null }` |
| `GET /api/v1/telemetry/pareto` | `start`, `end`, `provider_id`, `lane` | `{ "items": [{ "id": "glm46:balanced", "provider_id": "glm46", "provider_name": "GLM-4.6", "route": "balanced", "lane": "balanced", "run_count": 412, "tokens_in": 198411, "tokens_out": 151202, "cost_usd": 108.43, "avg_latency_ms": 755.0, "success_rate": 0.988 }], "next_cursor": null }` |
| `GET /api/v1/telemetry/runs` | `start`, `end`, `provider_id`, `lane`, `route`, `limit`, `cursor` | `{ "items": [{ "id": 987654321, "provider_id": "glm46", "provider_name": "GLM-4.6", "route": "balanced", "lane": "balanced", "ts": "2025-03-07T21:45:12Z", "tokens_in": 1289, "tokens_out": 972, "duration_ms": 842, "status": "success", "cost_usd": 0.082, "metadata": { ... }, "experiment_cohort": "cohort-a", "experiment_tag": "march-rollout" }], "next_cursor": "cursor:2025-03-07T21:43:48Z" }` |

### Routing

- `POST /api/v1/routing/simulate` recebe `{ "provider_ids": ["glm46", "codex"], "strategy": "balanced", "failover_provider_id": "claude", "volume_millions": 10 }` e devolve `RoutingSimulationResponse`, incluindo `total_cost`, `cost_per_million`, `avg_latency`, `reliability_score`, `distribution[]` (cada item com `route` → `RoutingRouteProfile` + `share`, `tokens_millions`, `cost`) e `excluded_route` quando aplicável.

### FinOps

- `GET /api/v1/telemetry/finops/sprints` aceita `start`, `end`, `provider_id`, `lane`, `window_days`, `limit` e retorna `{ "items": [{ "id": "sprint-m2", "name": "Sprint M2", "period_start": "2025-02-24", "period_end": "2025-03-02", "total_cost_usd": 482.37, "total_tokens_in": 932145, "total_tokens_out": 712804, "avg_latency_ms": 842.4, "success_rate": 0.978, "cost_delta": -0.064, "status": "on_track", "summary": "..." }] }`.
- `GET /api/v1/telemetry/finops/pull-requests` usa filtros semelhantes (`start`, `end`, `provider_id`, `lane`, `window_days`, `limit`) e devolve `{ "items": [{ "id": "pr-1298", "provider_id": "glm46", "route": "balanced", "lane": "balanced", "title": "Optimize prompt caching for churn playbook", "owner": "joana.santos", "merged_at": "2025-03-01T15:22:04Z", "cost_impact_usd": -42.18, "cost_delta": -0.082, "tokens_impact": -98211, "status": "on_track", "summary": "..." }] }`.
