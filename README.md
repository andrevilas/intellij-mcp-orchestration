# IntelliJ MCP Orchestration

**Uma console aberta para conectar agentes MCP ao seu fluxo de desenvolvimento.**

Este repositório reúne tudo o que você precisa para publicar e operar o Console MCP: uma UI web/electron feita em
React + Vite, um backend FastAPI para descoberta de provedores e provisionamento de sessões e os manifests que alinham
os agentes usados no dia a dia da equipe. O objetivo é simples: facilitar que desenvolvedores conectem agentes MCP aos
seus projetos (localmente ou em equipe) sem fricção.

## Recursos principais

- **Catálogo de agentes**: leia manifests MCP versionados em `config/console-mcp` e descubra rapidamente quais
  provedores estão disponíveis, seus comandos e capacidades.
- **Orquestração de sessões**: crie sessões efêmeras via backend FastAPI e acompanhe o contexto retornado por cada
  agente.
- **DX pensada para IDEs**: scripts prontos para integrar o Console MCP ao IntelliJ ou a qualquer editor que consuma o
  protocolo MCP.
- **Empacotamento flexível**: gere desde um bundle estático até um wrapper Electron completo usando os scripts em
  `scripts/` e `desktop/`.
- **Agents Hub dedicado**: serviço FastAPI em `agents-hub/` que lista e invoca agentes MCP locais via HTTP.

## Arquitetura em alto nível

```
+------------------+      HTTP (JSON)       +-------------------------+
| Frontend (Vite)  | <--------------------> | FastAPI Orchestration   |
| React, TypeScript|                         | Lista providers e cria |
| UI para devs     |                         | sessões em memória      |
+------------------+                         +-------------------------+
          |                                                |
          | lê                                            | consulta
          v                                                v
   config/console-mcp/servers.*                   Manifests MCP locais

```

O diretório `agents-hub/` hospeda um serviço FastAPI independente que lê manifests MCP em `app/agents/*`, expõe o catálogo em
`/agents` e oferece o endpoint `/agents/{name}/invoke`. Ele pode ser iniciado com `cd agents-hub && make dev`. O frontend consome
esses dados através dos wrappers HTTP centralizados em `app/src/api.ts`, acionados no efeito de carregamento inicial em
`app/src/App.tsx` (veja o bloco `Promise.all([...fetchProviders(...)...])`), que serve de ponto para plugar chamadas adicionais ao
hub.

## Requisitos

- Node.js >= 18.18
- pnpm >= 8 (ou npm >= 9)
- Python >= 3.10

## Como começar

1. **Instale as dependências do workspace**
   ```bash
   pnpm install
   ```
2. **Prepare o backend**
   ```bash
   cd server
   python -m venv .venv
   source .venv/bin/activate
   pip install -e .
   cd ..
   ```
3. **Configure os provedores**
   ```bash
   cp config/console-mcp/servers.example.json ~/.config/console-mcp/servers.json
   export CONSOLE_MCP_SERVERS_PATH=~/.config/console-mcp/servers.json
   # Ajuste os comandos/paths para os seus MCPs locais
   ```
4. **Suba tudo em modo desenvolvimento**
   ```bash
   pnpm run dev:all
   ```
   - O backend fica disponível em `http://127.0.0.1:8000` (ajuste via `CONSOLE_MCP_SERVER_HOST`/`CONSOLE_MCP_SERVER_PORT`).
   - O frontend roda em `http://127.0.0.1:5173` (ajuste via `CONSOLE_MCP_FRONTEND_HOST`/`CONSOLE_MCP_FRONTEND_PORT`) e faz proxy automático para `/api`.

### Rodando serviços de forma independente

- Frontend: `pnpm --dir app dev`
- Backend: `source server/.venv/bin/activate && console-mcp-server-dev`
- Agents Hub: `cd agents-hub && make dev`

### Testes automatizados

- **Playwright (E2E)** — execute a instalação de dependências nativas do Chromium uma vez por host antes de rodar a suíte:

  ```bash
  pnpm --dir tests exec playwright install-deps
  pnpm --dir tests exec playwright test
  ```

  O primeiro comando garante que bibliotecas do sistema como `libxkbcommon`, `libasound2`, `libgtk-3` e codecs de mídia sejam
  provisionados. Sem ele, o Playwright aborta com erros `browserType.launch`.

### Modo offline com fixtures compartilhadas

- Exporte `CONSOLE_MCP_USE_FIXTURES=true` para forçar o frontend a usar os handlers locais (`app/src/mocks/*`) em vez do proxy
  `/api`. Quando a flag não é definida, o Vite tenta conectar no backend configurado e faz **fallback automático** para as fixtures
  quando não encontra o serviço real.
- O toggle injeta `import.meta.env.VITE_CONSOLE_USE_FIXTURES`, permitindo que componentes e suites de teste detectem se o modo
  offline está ativo. O `main.tsx` inicializa o service worker do MSW apenas quando este valor é `true`.
- Os payloads retornados pelos mocks reaproveitam os JSONs em `tests/fixtures/backend/` e possuem equivalentes servidos pelo
  backend em `server/routes/fixtures/` para manter paridade entre ambientes.

### Consumindo no IntelliJ

1. Com o Console MCP rodando, abra o IntelliJ IDEA (2024.1+).
2. Configure um **AI Actions Provider** apontando para o endpoint MCP que você deseja usar (ex.: `console-mcp-server`).
3. Use os agentes cadastrados via as paletas do IDE: geração de código, roteamento de testes e documentação.

> Consulte `config/ai-assistant-mcp.json` para um exemplo de configuração pronta para importar.

## Config Assistant, RBAC e rollback

O backend FastAPI expõe o Config Assistant sob `/api/v1/config/*`, protegido por RBAC. As tabelas `users`, `roles` e `user_roles` são criadas automaticamente e os papéis padrão (`viewer`, `planner`, `approver`) são semeados na migração inicial. 【F:server/src/console_mcp_server/security.py†L206-L244】【F:server/src/console_mcp_server/database.py†L240-L348】

### Provisionando tokens e papéis

1. Gere um token secreto para o operador (ex.: `openssl rand -hex 32`).
2. Calcule o hash SHA-256 com `console_mcp_server.security.hash_token` e insira o usuário na tabela `users` com esse hash.
3. Associe os papéis necessários em `user_roles` (`viewer` para leitura, `planner` para gerar/aplicar e `approver` para aprovar HITL).

```bash
python - <<'PY'
from datetime import datetime, timezone
from uuid import uuid4
from sqlalchemy import text
from console_mcp_server.database import session_scope
from console_mcp_server.security import hash_token

token = "<TOKEN_PLANO>"
user_id = f"user-{uuid4().hex}"
now = datetime.now(timezone.utc).isoformat()

with session_scope() as session:
    session.execute(
        text(
            "INSERT INTO users (id, name, email, api_token_hash, created_at, updated_at) \n                VALUES (:id, :name, :email, :hash, :now, :now)"
        ),
        {"id": user_id, "name": "Config Operator", "email": "ops@example.com", "hash": hash_token(token), "now": now},
    )
    for role in ("viewer", "planner", "approver"):
        session.execute(
            text(
                "INSERT OR IGNORE INTO user_roles (user_id, role_id, assigned_at) \n                    VALUES (:user, (SELECT id FROM roles WHERE name = :role), :now)"
            ),
            {"user": user_id, "role": role, "now": now},
        )
print("Token provisionado; utilize o valor bruto em Authorization: Bearer <TOKEN_PLANO>.")
PY
```

As rotas verificam o token via header `Authorization: Bearer <token>` e retornam `403` quando o usuário não possui os papéis necessários. 【F:server/src/console_mcp_server/security.py†L206-L244】【F:server/src/console_mcp_server/routes.py†L236-L336】

### Fluxo de intents do Config Assistant

- `POST /api/v1/config/chat`: conversa rápida com intent opcional. 【F:server/src/console_mcp_server/routes.py†L188-L235】
- `POST /api/v1/config/plan`: gera planos tipados (adicionar agente, editar políticas, artefatos). 【F:server/src/console_mcp_server/routes.py†L236-L336】
- `POST /api/v1/config/apply`: executa dry-run, solicita aprovação ou conclui merges conforme `mode`/`approval_decision`. 【F:server/src/console_mcp_server/routes.py†L289-L374】
- `POST /api/v1/config/mcp/onboard`: monta plano de onboarding com manifestos/registry. 【F:server/src/console_mcp_server/routes.py†L374-L412】

Os planos retornam `PlanExecutionDiff` com `diff_stat`/`diff_patch`, status e modo de execução para auditoria. 【F:server/src/console_mcp_server/config_assistant/plan_executor.py†L18-L189】

### Rollback de branches

Quando o executor cria branches (`PlanExecutionMode.BRANCH_PR`), a resposta inclui `branch` e `base_branch`. Em caso de rollback,
use `PlanExecutor.rollback` apontando para o mesmo repositório:

```bash
python - <<'PY'
from console_mcp_server.config_assistant.plan_executor import PlanExecutor

executor = PlanExecutor("/path/para/repositorio")
outcome = executor.rollback(plan_id="plan-123", branch="chore/config-assistant/plan-123", actor="Console")
print(outcome.message)
PY
```

O método remove o branch local e remoto, registra o rollback e retorna um `PlanExecutionResult` marcado como `FAILED`. 【F:server/src/console_mcp_server/config_assistant/plan_executor.py†L360-L417】

## Build e distribuição

- **Bundle local**: `pnpm run build` gera artefatos em `dist/` (frontend estático + wheel do backend).
- **Electron opcional**: `pnpm run package:electron` embala a UI em um app desktop.
- Para validar os artefatos siga o guia em [`docs/packaging.md`](docs/packaging.md).

## Documentação adicional

- [Arquitetura de agentes](docs/agents-and-routing.md)
- [Criar um novo agente no hub](docs/agents/new-agent.md)
- [Objetivos e métricas](docs/objectives.md)
- [Runbook operacional](docs/runbook.md)
- [Quickstart de intents no Admin Chat](docs/admin-chat-quickstart.md)

## Contribuindo

- Abra issues e PRs com propostas de melhoria.
- Veja [`CONTRIBUTING.md`](CONTRIBUTING.md) para o fluxo completo.

## Licença

Distribuído sob licença Apache-2.0. Consulte [`LICENSE`](LICENSE) e [`NOTICE`](NOTICE) para detalhes e créditos.
