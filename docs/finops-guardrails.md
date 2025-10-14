
# FinOps Guardrails — Custos sob controle

## Variáveis (por servidor)
- `MAX_TOKENS` por chamada e por execução.
- `TIMEOUT_S` por chamada.
- `MAX_COST_USD` por execução (abort se exceder).
- `CACHING`: on quando disponível (prompt/context caching).

## Práticas
- Default barato (Gemini) → escalar só quando preciso (GLM-4.6/Claude).
- Medir custo por PR/sprint: tokens de entrada/saída e latência média.
- Fail-fast em loops improdutivos (limite de iterações).
