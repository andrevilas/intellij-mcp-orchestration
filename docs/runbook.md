# Runbook — Ciclo operacional

## Provisionamento e RBAC

1. **Criar token** — gere um segredo com `openssl rand -hex 32`.
2. **Persistir usuário** — utilize `console_mcp_server.security.hash_token` para salvar o hash em `users.api_token_hash`.
3. **Atribuir papéis** — associe `viewer`, `planner` e `approver` em `user_roles` para operadores que precisam gerar e aplicar planos.
   Use o snippet do README ou `session_scope()` para executar os `INSERT` correspondentes. 【F:server/src/console_mcp_server/database.py†L240-L348】【F:server/src/console_mcp_server/security.py†L206-L244】
4. **Validar acesso** — chame `GET /api/v1/config/chat` com `Authorization: Bearer <token>` e confirme `200`. Falhas retornam `401`/`403` com mensagem de permissão insuficiente. 【F:server/src/console_mcp_server/routes.py†L188-L235】【F:server/src/console_mcp_server/security.py†L206-L244】

## Ciclo operacional padrão

1. **Análise (Analyzer)**
   - Input: Issue/História + artefatos de negócio
   - Output: Quick spec + test plan stub + riscos
2. **Planejamento (Planner)**
   - Input: Quick spec + repo context
   - Output: WBS + checkpoints + DoR/DoD + matriz de riscos
3. **Execução + Testes (Executor)**
   - Input: WBS + repo
   - Output: Código + testes + build verde + gravações (quando aplicável)
4. **Documentação (Doc)**
   - Input: PR final + diffs
   - Output: README/ADR/Changelog + resumo FinOps (tokens/latência)
   - Capture telemetria do `glm46-mcp-server` (`~/.mcp/logs/glm46/*.jsonl`) para o relatório de custos.
   - Rotacione credenciais MCP pela aba **Chaves** da console e confirme o handshake em tempo real após cada atualização.

## Uso do Config Assistant

- **Chat inicial** — `POST /api/v1/config/chat` aceita mensagem livre e opcionalmente `intent` (`add_agent`, `edit_policies`, `generate_artifact`). 【F:server/src/console_mcp_server/routes.py†L188-L289】【F:server/src/console_mcp_server/config_assistant/intents.py†L1-L39】
- **Gerar plano** — `POST /api/v1/config/plan` valida payloads obrigatórios (`agent_name`, `policy_id`, etc.) e retorna `Plan` + `diffs`.
  Reutilize `threadId` da sessão do Admin Chat para manter contexto. 【F:server/src/console_mcp_server/routes.py†L236-L336】【F:app/src/hooks/useAdminChat.ts†L111-L163】
- **Aplicar** — `POST /api/v1/config/apply` exige `plan`, `patch`, `actor` e `actor_email` para submissões. O executor devolve `PlanExecutionResult` com `branch` e `hitl_required` quando houver aprovação humana. 【F:server/src/console_mcp_server/routes.py†L289-L374】【F:server/src/console_mcp_server/config_assistant/plan_executor.py†L18-L189】
- **Onboarding** — `POST /api/v1/config/mcp/onboard` aceita `intent` (`plan` ou `validate`) para gerar plano completo ou apenas testar o endpoint MCP. 【F:server/src/console_mcp_server/routes.py†L876-L956】
- **Fluxo HITL** — quando `status` = `hitl_required`, reenvie `POST /config/apply` com `approval_id` e `approval_decision: approve|reject`. O log de auditoria grava a decisão com metadados. 【F:server/src/console_mcp_server/routes.py†L312-L374】【F:server/src/console_mcp_server/security.py†L120-L186】

## Rollback de planos

- Capture `plan_id`, `branch` e `base_branch` retornados durante `submit_for_approval`.
- Em caso de falha no canário ou reprovação pós-merge, execute:

```bash
python - <<'PY'
from console_mcp_server.config_assistant.plan_executor import PlanExecutor

executor = PlanExecutor("/path/para/repositorio")
outcome = executor.rollback(plan_id="<plan_id>", branch="<branch>", actor="rollback-bot")
print(outcome.status, outcome.message)
PY
```

- O método remove branches locais/remotos e registra o evento na tabela `change_plans` com status `FAILED`. 【F:server/src/console_mcp_server/config_assistant/plan_executor.py†L360-L417】

## Referências úteis

- Quickstart de intents no Admin Chat (`docs/admin-chat-quickstart.md`).
- README → seção **Config Assistant, RBAC e rollback** para scripts de provisionamento.
