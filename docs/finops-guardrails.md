
# FinOps Guardrails — Custos sob controle

## Variáveis (por servidor)
- `MAX_TOKENS` por chamada e por execução.
- `TIMEOUT_S` por chamada.
- `MAX_COST_USD` por execução (abort se exceder).
- `CACHING`: on quando disponível (prompt/context caching).
- `GLM46_PRICE_INPUT_PER_1K` / `GLM46_PRICE_OUTPUT_PER_1K` para estimativas.

## Práticas
- Default barato (Gemini) → escalar só quando preciso (GLM-4.6/Claude).
- Medir custo por PR/sprint: tokens de entrada/saída e latência média.
- Fail-fast em loops improdutivos (limite de iterações).
- `glm46-mcp-server` lê `~/.mcp/cost-policy.json` (gerado no bootstrap) e grava `~/.mcp/logs/glm46/*.jsonl`.
