# Backend Fixtures compartilhadas

Os JSONs agrupados em `./data` são cópias das respostas de referência utilizadas pelo backend de desenvolvimento (`server/routes/fixtures`). Use-os para popular mocks em suites Playwright/Vitest sem depender do servidor FastAPI local. A tabela abaixo aponta os handlers de MSW (`app/src/mocks/handlers.ts`) que consomem cada fixture, garantindo paridade 1:1 entre arquivos e imports `#fixtures`.

| Fixture(s) | Endpoints (mockados em `app/src/mocks/handlers.ts`) |
| --- | --- |
| `data/servers.json`, `data/server_processes.json`, `data/server_health.json` | `GET /api/v1/servers`, `GET /api/v1/servers/processes`, `POST /api/v1/servers/:serverId/process/:action`, `GET /api/v1/servers/:serverId/health`, `POST /api/v1/servers/:serverId/health/ping` |
| `data/sessions.json` | `GET /api/v1/sessions`, `POST /api/v1/providers/:providerId/sessions` |
| `data/notifications.json` | `GET /api/v1/notifications` |
| `data/policy_manifest.json`, `data/policies_compliance.json` | `GET /api/v1/policies/manifest`, `GET /api/v1/policies/compliance`, `GET /api/v1/policy/compliance` |
| `data/policy_templates.json`, `data/policy_deployments.json` | `GET /api/v1/policies/templates`, `GET/POST/DELETE /api/v1/policies/deployments` |
| `data/providers.json` | `GET /api/v1/providers`, `POST /api/v1/providers/:providerId/sessions` |
| `data/routing_simulation.json` | `POST /api/v1/routing/simulate` |
| `data/routing/plan_with_overrides.json` | `POST /api/v1/routing/simulate` (com intents e regras personalizadas) |
| `data/telemetry_metrics.json`, `data/telemetry_heatmap.json`, `data/telemetry_timeseries.json`, `data/telemetry_pareto.json`, `data/telemetry_runs.json` | `GET /api/v1/telemetry/metrics`, `GET /api/v1/telemetry/heatmap`, `GET /api/v1/telemetry/timeseries`, `GET /api/v1/telemetry/pareto`, `GET /api/v1/telemetry/runs` |
| `data/telemetry_experiments.json`, `data/telemetry_lane_costs.json`, `data/telemetry_marketplace.json` | `GET /api/v1/telemetry/experiments`, `GET /api/v1/telemetry/lane-costs`, `GET /api/v1/telemetry/marketplace/performance` |
| `data/finops_sprints.json`, `data/finops_pull_requests.json`, `data/finops_events.json` | `GET /api/v1/telemetry/finops/sprints`, `GET /api/v1/telemetry/finops/pull-requests`, `GET /api/v1/telemetry/finops/events` |
| `data/smoke_endpoints.json` | `GET /api/v1/smoke/endpoints`, `POST /api/v1/smoke/endpoints/:endpointId/run` |
| `data/agents.json` | `GET */agents/agents` |
| `data/agent_governed_plan.json` | `POST /api/v1/config/agents?intent=plan` |
| `data/security_users.json`, `data/security_roles.json`, `data/security_api_keys.json`, `data/security_audit_trail.json`, `data/security_audit_logs.json` | `GET/POST/PATCH /api/v1/security/users`, `GET/POST/PATCH /api/v1/security/roles`, `GET/POST/PUT/DELETE /api/v1/security/api-keys` (inclui `/rotate`), `GET /api/v1/security/audit/:resource/:resourceId`, `GET /api/v1/audit/logs` |
