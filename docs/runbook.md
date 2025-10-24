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

## Operações seguras (OPS-302)

1. Consulte os runbooks dedicados em `docs/ops/runbooks/` antes de qualquer alteração. Confirme que [Gestão de Segredos](ops/runbooks/secret-management.md) cobre rotação programada/emergencial e auditoria contínua, que [Auditoria Operacional](ops/runbooks/auditoria-operacional.md) lista o checklist OPS-302 e indicadores de conformidade, que [Resposta a Incidentes](ops/runbooks/secrets-incident-playbook.md) detalha o fluxo tático, rotação emergencial e auditoria pós-incidente, e que [Ingestão de Telemetria FinOps](ops/runbooks/finops-telemetry-ingestao.md) documenta a recarga determinística usada na revisão periódica.
2. Execute `python3 scripts/ops_controls.py --output docs/evidence/TASK-OPS-302/ops-controls-report.json` e valide o resultado antes de solicitar revisão quando houver mudanças em segredos, workflows ou runbooks. Replique o comando após incidentes de segredos ou rotações emergenciais.
3. Garanta que o job **ops_compliance** na CI (dependente do job `security`) permaneça verde; ele bloqueia `lint`/`test`/`smoke` quando permissões de workflows ou evidências obrigatórias falham. Registre o link da execução correspondente em `docs/evidence/TASK-OPS-302/README.md`.
4. Atualize `/docs/evidence/TASK-OPS-302/README.md` e `runbooks-activation.md` com os checklists, relatórios (`gitleaks`, `ops-controls-report.json`) e links de execução/PR, mantendo as evidências rastreáveis para auditoria.
5. Quando o playbook de incidentes for acionado, sincronize o resumo com Auditoria Operacional e registre lições aprendidas na seção `Execuções registradas` para preservar o histórico de resposta.

## Uso do Config Assistant

- **Chat inicial** — `POST /api/v1/config/chat` aceita mensagem livre e opcionalmente `intent` (`add_agent`, `edit_policies`, `generate_artifact`). 【F:server/src/console_mcp_server/routes.py†L188-L289】【F:server/src/console_mcp_server/config_assistant/intents.py†L1-L39】
- **Gerar plano** — `POST /api/v1/config/plan` valida payloads obrigatórios (`agent_name`, `policy_id`, etc.) e retorna `Plan` + `diffs`.
  Reutilize `threadId` da sessão do Admin Chat para manter contexto. 【F:server/src/console_mcp_server/routes.py†L236-L336】【F:app/src/hooks/useAdminChat.ts†L111-L163】
- **Aplicar** — `POST /api/v1/config/apply` exige `plan`, `patch`, `actor` e `actor_email` para submissões. O executor devolve `PlanExecutionResult` com `branch` e `hitl_required` quando houver aprovação humana. 【F:server/src/console_mcp_server/routes.py†L289-L374】【F:server/src/console_mcp_server/config_assistant/plan_executor.py†L18-L189】
- **Onboarding** — `POST /api/v1/config/mcp/onboard` aceita `intent` (`plan` ou `validate`) para gerar plano completo ou apenas testar o endpoint MCP (quando `validate`, a resposta inclui somente `validation`). 【F:server/src/console_mcp_server/routes.py†L903-L988】
- **Fluxo HITL** — quando `status` = `hitl_required`, reenvie `POST /config/apply` com `approval_id` e `approval_decision: approve|reject`. O log de auditoria grava a decisão com metadados. 【F:server/src/console_mcp_server/routes.py†L312-L374】【F:server/src/console_mcp_server/security.py†L120-L186】

## Simulador de Routing e Telemetria FinOps

- **Dashboard** — `GET /api/v1/telemetry/metrics|heatmap|timeseries|pareto|runs` oferecem agregações completas; quando a base SQLite está vazia o backend responde usando fixtures em `server/routes/fixtures/telemetry_*.json` (espelhadas em `tests/fixtures/backend/`). 【F:server/README.md†L33-L52】【F:server/src/console_mcp_server/routes.py†L2799-L3084】【F:server/src/console_mcp_server/fixtures.py†L1-L45】
- **Routing** — `POST /api/v1/routing/simulate` calcula planos determinísticos; caso a distribuição fique vazia o endpoint retorna `routing_simulation.json` como fallback, mantendo previsibilidade para testes manuais/automáticos. Regere o fixture com `python scripts/generate_routing_fixture.py` (atualiza `server/routes/fixtures/` e `tests/fixtures/backend/`) e valide com `pytest server/tests/test_routing_fixtures.py`. 【F:server/src/console_mcp_server/routes.py†L4159-L4243】【F:scripts/generate_routing_fixture.py†L1-L74】【F:server/tests/test_routing_fixtures.py†L1-L43】
- **FinOps — recarga determinística**
  1. Execute `python scripts/generate_finops_fixtures.py` para reescrever os fixtures (`finops_sprints.json`, `finops_pull_requests.json`) consumidos pelo backend e pelos testes.【F:scripts/generate_finops_fixtures.py†L19-L118】【F:scripts/generate_finops_fixtures.py†L331-L347】
  2. Recarregue o SQLite local com `python scripts/generate_finops_fixtures.py --seed-db --db-path server/routes/fixtures/console.db` (ou caminho equivalente) para garantir que `telemetry_events` e `price_entries` reflitam o dataset mais recente.【F:scripts/generate_finops_fixtures.py†L307-L328】
  3. Exporte `CONSOLE_MCP_DB_PATH=<caminho/console.db>` antes de consultar as rotas e utilize a janela de duas sprints (`start=2025-10-08T00:00:00Z`, `end=2025-10-21T23:59:59Z`, `window_days=7`) ao validar `GET /api/v1/telemetry/finops/sprints`, `GET /api/v1/telemetry/finops/pull-requests`, `GET /api/v1/telemetry/export?format=csv` e `GET /api/v1/telemetry/export?format=html`.【F:docs/evidence/2025-10-24/telemetry_finops_sprints.json†L1-L34】【F:docs/evidence/2025-10-24/telemetry_finops_pull_requests.json†L1-L33】【F:docs/evidence/2025-10-24/telemetry_export.csv†L1-L5】【F:docs/evidence/2025-10-24/telemetry_export.html†L1-L20】
  4. Armazene as respostas em `docs/evidence/<DATA>/` — por exemplo, `docs/evidence/2025-10-24/telemetry_finops_sprints.json`, `telemetry_finops_pull_requests.json`, `telemetry_export.csv`, `telemetry_export.html` — e mantenha os arquivos versionados junto ao PR de auditoria.【F:docs/evidence/2025-10-24/telemetry_finops_sprints.json†L1-L34】【F:docs/evidence/2025-10-24/telemetry_export.html†L1-L20】

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
