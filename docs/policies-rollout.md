# Catálogo de templates e plano de rollout

O endpoint `GET /api/v1/policies/templates` agora agrega duas fontes de informação:

* **Catálogo de templates** — Lista estática de templates MCP com nome, tagline, custos e guardrails.
* **Plano de rollout** — Distribuição calculada a partir do histórico real de deploys armazenado em `policy_deployments`.

## Estrutura da resposta

```jsonc
{
  "templates": [
    {
      "id": "balanced",
      "name": "Equilíbrio",
      "priceDelta": "-12% vs. baseline",
      "guardrailLevel": "Nível 3 · Avançado",
      "features": ["…"]
    }
  ],
  "rollout": {
    "generatedAt": "2025-04-15T09:30:00+00:00",
    "plans": [
      {
        "templateId": "balanced",
        "generatedAt": "2025-04-15T09:30:00+00:00",
        "allocations": [
          {
            "segment": {
              "id": "canary",
              "name": "Canário",
              "description": "Rotas críticas monitoradas em tempo real com dashboards dedicados."
            },
            "coverage": 62,
            "providers": [
              {
                "id": "gemini",
                "name": "Gemini MCP",
                "command": "~/.local/bin/gemini-mcp",
                "capabilities": ["chat", "tools"],
                "tags": ["llm", "google"],
                "transport": "stdio",
                "is_available": true
              }
            ]
          }
        ]
      }
    ]
  }
}
```

* `generatedAt` reflete o `updated_at` do último deploy considerado.
* Cada plano replica os segmentos (`canary`, `general`, `fallback`) com cobertura proporcional às métricas do deploy (latência, incidentes, budget) e lista os provedores MCP atribuídos a cada estágio.

## Uso no frontend

O `Policies.tsx` consome somente `fetchPolicyTemplates`, eliminando dados seedados. Caso o plano esteja vazio, a UI informa que ainda não há deploys suficientes para distribuir os provedores.
