
# Agentes & Roteamento (Who does what)

## Perfis de agente
- **Analyzer (Gemini)**: leitura de requisitos, *quick specs*, criação de test-plan inicial.
- **Planner (GLM-4.6)**: planejamento profundo (até 200K de contexto), WBS, riscos e checkpoints.
- **Executor (Codex MCP)**: codificação/refactor, rodar testes, ajustar até *green build*.
- **Doc (Gemini/Claude)**: README/ADR/Changelog; sumário técnico e rationale.

## Roteamento (regra simples)
- **Tarefas rápidas/low-cost** → Gemini
- **Contexto longo (≤200K)** → GLM-4.6
- **Hands-on coding/executar** → Codex MCP
- **Ultra-contexto/premium** → Claude (apenas quando necessário)

## Handoffs
1) Analyzer produz *spec + test plan stub*.
2) Planner converte em backlog priorizado com checkpoints.
3) Executor implementa + cria testes; roda e ajusta.
4) Doc formaliza ADR/README/Changelog + métricas FinOps.
