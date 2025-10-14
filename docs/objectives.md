
# Objetivos & KPIs — Esteira de Agentes (Custo/Benefício Máximo)

## North Star
Aumentar velocidade de entrega **sem** inflar OPEX: mais PRs aprovados, menos retrabalho, custo previsível.

## Metas (SMART)
- **Lead time por PR**: -40% em 30 dias.
- **Cobertura de testes**: +15 p.p. em 60 dias.
- **Retrabalho por PR**: < 1 iteração em 70% dos casos.
- **Custo por PR** (tokens+latência): baseline → -25% com roteamento híbrido.

## Alavancas
- Roteamento por contexto/latência (Gemini ↔ GLM-4.6 ↔ Codex ↔ Claude)
- Reuso de prompts e playbooks por fase (Análise → Planejamento → Execução+Testes → Documentação)
- Guardrails de custo e telemetria por execução.
