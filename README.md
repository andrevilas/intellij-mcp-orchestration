
# IntelliJ MCP Orchestration – Multi‑Agent Dev Stack (Gemini · Codex · GLM‑4.6 · Claude)

**Objetivo:** provisionar, padronizar e replicar – em qualquer ambiente Ubuntu‑based – uma stack de agentes integrada ao **JetBrains AI Assistant (Ultimate)** via **Model Context Protocol (MCP)**.

## TL;DR
```bash
git clone <seu-fork-ou-este-repo>.git intellij-mcp-orchestration
cd intellij-mcp-orchestration
bash scripts/bootstrap-mcp.sh
# IntelliJ → Settings → Tools → AI Assistant → MCP → Add → Command
#  - ~/.local/bin/gemini-mcp
#  - ~/.local/bin/codex-mcp
#  - ~/.local/bin/glm46-mcp
#  - ~/.local/bin/claude-mcp
```

## Stack
- **Gemini** via FastMCP (rotas stdio/http) – custo/latência amigáveis para throughput alto.
- **Codex (OpenAI compat.)** via MCP server CLI – DX forte para “read‑modify‑run”.
- **GLM‑4.6 (Zhipu)** – janela de **200K tokens** para refactors amplos e planning profundo.
- **Claude** – opcional; quando IDE exposto como MCP server para sessões de teleoperação.

## Pastas
- `scripts/` – instalação, preflight e wrappers.
- `config/` – templates de configuração (AI Assistant MCP, policies de roteamento).
- `docs/` – playbooks por fase (Análise → Planejamento → Execução+Testes → Documentação).

## Guardrails
- `.env` em `~/.mcp/.env` com `chmod 600` (não versionar). Veja `.env.example`.
- Limites de custo/tempo por servidor (definidos em wrappers e políticas).
- Sem execuções “sem confirmação” em prod (opcional habilitar em dev).

---

## Workflow Padrão (4 etapas)

1) **Análise** – triagem de issues, leitura de requisitos, RAG de repositório.  
   - **Roteamento**: Gemini (rápido/barato) → GLM‑4.6 (contexto longo) → Claude (ultra‑longo) conforme necessidade.

2) **Planejamento** – DOR/DOD, riscos, checkpoints, ferramentas MCP.  
   - Artefatos em `docs/plan/` e template `config/ai-assistant-mcp.json` para priorização.

3) **Execução + Testes** – Codex “mão na massa” (MCP CLI), Gemini p/ scaffolds, GLM‑4.6 p/ refactors multi‑file.  
   - Playwright/Jest/PyTest conforme o projeto; gravações de fluxo quando aplicável.

4) **Documentação** – ADR, Changelog, README “How to run”, métricas de FinOps (tokens/latência/PR).

---

## Replicação em Massa
Em cada host/VM/WSL:
```bash
git clone <repo> && cd intellij-mcp-orchestration
bash scripts/bootstrap-mcp.sh    # idempotente, com preflight e self‑heal de PATH
```
Depois, no IntelliJ (Ultimate): **AI Assistant → MCP → Add → Command** apontando para os binários em `~/.local/bin`.

> Dica: use `make doctor` e `make reset` para checkup/rollback rápido (ver `Makefile`).

## Notas de Produção
- Para ambientes travados (sem apt/sem internet), veja `scripts/offline-notes.md` e configure mirrors/artefatos internos.
- Integração com Claude Desktop (teleoperação do IDE): habilite **Settings → Tools → MCP Server → Enable → Auto‑Configure**.
