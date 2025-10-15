
# Runbook — Ciclo operacional

1) **Análise (Analyzer)**
   - Input: Issue/História + artefatos de negócio
   - Output: Quick spec + test plan stub + riscos

2) **Planejamento (Planner)**
   - Input: Quick spec + repo context
   - Output: WBS + checkpoints + DoR/DoD + matriz de riscos

3) **Execução + Testes (Executor)**
   - Input: WBS + repo
   - Output: Código + testes + build verde + gravações (quando aplicável)

4) **Documentação (Doc)**
   - Input: PR final + diffs
   - Output: README/ADR/Changelog + resumo FinOps (tokens/latência)
   - Capture telemetria do `glm46-mcp-server` (`~/.mcp/logs/glm46/*.jsonl`) para o relatório de custos.
   - Rotacione credenciais MCP pela aba **Chaves** da console e confirme o handshake em tempo real após cada atualização.
