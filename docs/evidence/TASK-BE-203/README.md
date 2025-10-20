# Evidências — TASK-BE-203

## Snippet de simulação

```bash
# servidor iniciado localmente com `console-mcp-server-dev`
curl -s \
  -X POST http://127.0.0.1:8000/api/v1/routing/simulate \
  -H 'content-type: application/json' \
  -d '{
        "provider_ids": ["gemini", "codex", "glm46", "claude"],
        "strategy": "balanced",
        "failover_provider_id": null,
        "volume_millions": 10
      }' | jq
```

Resposta resumida:

```json
{
  "context": {
    "strategy": "balanced",
    "provider_ids": ["gemini", "codex", "glm46", "claude"],
    "provider_count": 4,
    "volume_millions": 10.0,
    "failover_provider_id": null
  },
  "cost": {
    "total_usd": 241.46,
    "cost_per_million_usd": 24.15
  },
  "latency": {
    "avg_latency_ms": 1307.45,
    "reliability_score": 94.47
  },
  "distribution": [
    { "route": { "id": "gemini", "lane": "balanced" }, "share": 0.2893, "tokens_millions": 2.8933, "cost": 58.82 },
    { "route": { "id": "codex", "lane": "balanced" }, "share": 0.2351, "tokens_millions": 2.3508, "cost": 44.67 },
    { "route": { "id": "claude", "lane": "balanced" }, "share": 0.1899, "tokens_millions": 1.8987, "cost": 32.83 },
    { "route": { "id": "glm46", "lane": "turbo" }, "share": 0.2857, "tokens_millions": 2.8571, "cost": 105.14 }
  ]
}
```

## Testes executados

- `PYTHONPATH=src:.. pytest tests/test_routing_fixtures.py tests/test_routes.py::test_routing_simulation_uses_price_table tests/test_routes.py::test_routing_simulation_rejects_unknown_provider tests/test_routes.py::test_routing_simulation_endpoint_returns_distribution tests/test_routes.py::test_routing_simulation_endpoint_validates_provider_ids`
- `pnpm --dir app test -- src/api.test.ts src/pages/Routing.test.tsx`

## Validações extras

```bash
curl -s \
  -X POST http://127.0.0.1:8000/api/v1/routing/simulate \
  -H 'content-type: application/json' \
  -d '{
        "provider_ids": ["gemini"],
        "strategy": "balanced",
        "failover_provider_id": "claude",
        "volume_millions": 5
      }'
```

Resposta:

```json
{"detail":"Failover provider must be included in provider_ids"}
```
