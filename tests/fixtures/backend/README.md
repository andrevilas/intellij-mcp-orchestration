# Backend Fixtures compartilhadas

Os JSONs deste diretório são cópias das respostas de referência utilizadas pelo backend de desenvolvimento (`server/routes/fixtures`). Use-as para popular mocks em suites Playwright/Vitest sem depender do servidor FastAPI local. A tabela abaixo aponta os handlers de MSW (`app/src/mocks/handlers.ts`) que consomem cada fixture, garantindo paridade 1:1 entre arquivos e imports `#fixtures`.

| Fixture(s) | Endpoints (mockados em `app/src/mocks/handlers.ts`) |
| --- | --- |
| `servers.json`, `server_processes.json`, `server_health.json` | `GET /api/v1/servers`, `GET /api/v1/servers/processes`, `POST /api/v1/servers/:serverId/process/:action`, `GET /api/v1/servers/:serverId/health`, `POST /api/v1/servers/:serverId/health/ping` |
| `sessions.json` | `GET /api/v1/sessions`, `POST /api/v1/providers/:providerId/sessions` |
| `notifications.json` | `GET /api/v1/notifications` |
| `policy_manifest.json`, `policies_compliance.json` | `GET /api/v1/policies/manifest`, `GET /api/v1/policies/compliance`, `GET /api/v1/policy/compliance` |
| `policy_templates.json`, `policy_deployments.json` | `GET /api/v1/policies/templates`, `GET/POST/DELETE /api/v1/policies/deployments` |
| `providers.json` | `GET /api/v1/providers`, `POST /api/v1/providers/:providerId/sessions` |
| `routing_simulation.json` | `POST /api/v1/routing/simulate` |
| `telemetry_metrics.json`, `telemetry_heatmap.json`, `telemetry_timeseries.json`, `telemetry_pareto.json`, `telemetry_runs.json` | `GET /api/v1/telemetry/metrics`, `GET /api/v1/telemetry/heatmap`, `GET /api/v1/telemetry/timeseries`, `GET /api/v1/telemetry/pareto`, `GET /api/v1/telemetry/runs` |
| `telemetry_experiments.json`, `telemetry_lane_costs.json`, `telemetry_marketplace.json` | `GET /api/v1/telemetry/experiments`, `GET /api/v1/telemetry/lane-costs`, `GET /api/v1/telemetry/marketplace/performance` |
| `finops_sprints.json`, `finops_pull_requests.json`, `finops_events.json` | `GET /api/v1/telemetry/finops/sprints`, `GET /api/v1/telemetry/finops/pull-requests`, `GET /api/v1/telemetry/finops/events` |
| `smoke_endpoints.json` | `GET /api/v1/smoke/endpoints`, `POST /api/v1/smoke/endpoints/:endpointId/run` |
| `agents.json` | `GET */agents/agents` |
| `agent_governed_plan.json` | `POST /api/v1/config/agents?intent=plan` |
| `security_users.json`, `security_roles.json`, `security_api_keys.json`, `security_audit_trail.json`, `security_audit_logs.json` | `GET/POST/PATCH /api/v1/security/users`, `GET/POST/PATCH /api/v1/security/roles`, `GET/POST/PUT/DELETE /api/v1/security/api-keys` (inclui `/rotate`), `GET /api/v1/security/audit/:resource/:resourceId`, `GET /api/v1/audit/logs` |
