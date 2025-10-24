# Admin Chat — Quickstart de intents

O Admin Chat concentra o fluxo assistido para configurar o Console MCP. A interface encadeia o chat com o Config Assistant,
a geração de planos e o onboarding de novos provedores em uma única página (`AdminChat.tsx`).
Use este quickstart para validar o fluxo ponta a ponta com exemplos reais de mensagens e intents. 【F:app/src/pages/AdminChat/AdminChat.tsx†L1-L120】【F:app/src/pages/AdminChat/AdminChat.test.tsx†L1-L120】

## Pré-requisitos

- Console MCP rodando (`pnpm run dev:all`) ou backend FastAPI disponível em `http://127.0.0.1:8000`.
- Token RBAC provisionado com pelo menos os papéis `viewer` e `planner` para gerar planos e `approver` para aprovações HITL. 【F:server/src/console_mcp_server/security.py†L206-L244】【F:server/src/console_mcp_server/database.py†L240-L348】
- Credenciais MCP configuradas nos manifests ou via `CONSOLE_MCP_SERVERS_PATH`.

## Fluxo guiado

1. **Inicie a conversa** — pergunte algo contextual, por exemplo `Quais guardrails devo atualizar?`. O hook `useAdminChat` envia a intent `message` para `/config/chat` e guarda o `threadId` retornado. 【F:app/src/hooks/useAdminChat.ts†L51-L109】【F:app/src/pages/AdminChat/AdminChat.test.tsx†L60-L99】
2. **Gere um plano** — informe um escopo como `Habilitar checkpoints HITL nas rotas prioritárias` e clique em "Gerar plano". O frontend chama `/config/plan` com a intent `generate`, e renderiza diffs/risks retornados. 【F:app/src/hooks/useAdminChat.ts†L111-L163】【F:app/src/pages/AdminChat/AdminChat.test.tsx†L99-L147】
3. **Solicite aplicação** — descreva uma nota opcional (ex.: `Validar com FinOps antes de aplicar.`) e acione "Aplicar plano". Se o executor exigir HITL, a resposta virá com `status: 'hitl_required'`. 【F:app/src/hooks/useAdminChat.ts†L165-L216】【F:app/src/pages/AdminChat/AdminChat.test.tsx†L147-L191】
4. **Aprove ou finalize HITL** — informe a justificativa (ex.: `Aprovado manualmente pelo time de risco.`) e confirme. O backend aprova o pedido via `/config/apply` com `approval_decision` apropriado. 【F:app/src/hooks/useAdminChat.ts†L218-L278】【F:app/src/pages/AdminChat/AdminChat.test.tsx†L191-L222】
5. **Onboard automático** — preencha o ID do provedor (`openai-gpt4o`) e o comando opcional (`./run-mcp --profile production`). O hook chama `/config/mcp/onboard` primeiro com `intent: 'validate'` para testar o endpoint e, na sequência, com `intent: 'plan'` para gerar o plano completo. 【F:app/src/hooks/useAdminChat.ts†L280-L324】【F:app/src/pages/AdminChat/AdminChat.test.tsx†L222-L258】【F:tests/e2e/onboarding.spec.ts†L148-L236】

Ao final, a barra de status exibirá mensagens como `Plano aplicado com sucesso.` ou `Onboarding iniciado para openai-gpt4o.` confirmando o sucesso da operação. 【F:app/src/hooks/useAdminChat.ts†L180-L216】【F:app/src/pages/AdminChat/AdminChat.test.tsx†L191-L258】

## Intents suportadas

Os endpoints do Config Assistant aceitam intents tipadas — use-as tanto pela UI quanto via HTTP.

| Intent | Endpoint | Payload mínimo | Descrição |
| --- | --- | --- | --- |
| `message` | `POST /api/v1/config/chat` | `{ "message": "..." }` | Mensagem livre com resposta contextual. 【F:server/src/console_mcp_server/routes.py†L188-L235】 |
| `add_agent` | `POST /api/v1/config/plan` | `{ "intent": "add_agent", "payload": { "agent_name": "demo" } }` | Gera plano para adicionar agente MCP, incluindo diffs e riscos. 【F:server/src/console_mcp_server/config_assistant/intents.py†L1-L39】【F:server/src/console_mcp_server/routes.py†L236-L289】 |
| `edit_policies` | `POST /api/v1/config/plan` | `{ "intent": "edit_policies", "payload": { "policy_id": "spend-guard" } }` | Cria plano para ajustar políticas existentes. 【F:server/src/console_mcp_server/config_assistant/intents.py†L21-L32】【F:server/src/console_mcp_server/routes.py†L289-L336】 |
| `generate_artifact` | `POST /api/v1/config/reload` | `{ "artifact_type": "finops.checklist", "target_path": "generated/cache.md" }` | Planeja regeneração de artefatos. 【F:server/src/console_mcp_server/config_assistant/intents.py†L33-L39】【F:server/src/console_mcp_server/routes.py†L336-L374】 |
| `plan` / `validate` | `POST /api/v1/config/mcp/onboard` | `{ "repository": "agents/new-agent", "intent": "plan" }` | Gera plano completo (`plan`) ou apenas valida o endpoint (`validate`, resposta só traz `validation`). 【F:server/src/console_mcp_server/routes.py†L903-L988】 |

## Exemplos de comando (HTTP)

Autentique-se via header `Authorization: Bearer <token>` — o middleware RBAC bloqueia qualquer rota `/api/v1/config` sem token válido. 【F:server/src/console_mcp_server/security.py†L206-L244】

```bash
# Conversa inicial
curl -X POST http://127.0.0.1:8000/api/v1/config/chat \
  -H 'Authorization: Bearer <TOKEN>' \
  -H 'Content-Type: application/json' \
  -d '{"message":"Quais guardrails devo atualizar?"}'

# Geração de plano para novo agente
curl -X POST http://127.0.0.1:8000/api/v1/config/plan \
  -H 'Authorization: Bearer <TOKEN>' \
  -H 'Content-Type: application/json' \
  -d '{"intent":"add_agent","payload":{"agent_name":"catalog","repository":"agents-hub"}}'

# Submissão para aprovação (mode branch)
curl -X POST http://127.0.0.1:8000/api/v1/config/apply \
  -H 'Authorization: Bearer <TOKEN>' \
  -H 'Content-Type: application/json' \
  -d '{"plan_id":"plan-123","plan":{...},"patch":"...","mode":"branch_pr","actor":"Console","actor_email":"ops@example.com"}'

# Aprovação HITL
curl -X POST http://127.0.0.1:8000/api/v1/config/apply \
  -H 'Authorization: Bearer <TOKEN>' \
  -H 'Content-Type: application/json' \
  -d '{"plan_id":"plan-123","approval_id":"approval-456","approval_decision":"approve"}'

# Onboarding automatizado (plano completo)
curl -X POST http://127.0.0.1:8000/api/v1/config/mcp/onboard \
  -H 'Authorization: Bearer <TOKEN>' \
  -H 'Content-Type: application/json' \
  -d '{"repository":"agents/demo-agent","capabilities":["chat","planning"],"intent":"plan"}'

# Apenas validar endpoint MCP
curl -X POST http://127.0.0.1:8000/api/v1/config/mcp/onboard \
  -H 'Authorization: Bearer <TOKEN>' \
  -H 'Content-Type: application/json' \
  -d '{"repository":"agents/demo-agent","endpoint":"wss://demo.example/ws","intent":"validate"}'
```

> Para rollback de branches gerados durante a submissão, use o método `PlanExecutor.rollback` informado no runbook operacional. 【F:server/src/console_mcp_server/config_assistant/plan_executor.py†L378-L417】
