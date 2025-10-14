
# next-steps.md — Plano Operacional para o Console MCP (Node + Vite)

> **Nota do Agente:** Este documento descreve a **Fase 2** do projeto, a construção de um console de gerenciamento. A **Fase 1**, que consiste na configuração e integração baseada em scripts (o estado atual do projeto), é um pré-requisito para esta fase e já está funcional. As tarefas abaixo representam o trabalho futuro para evoluir a solução.

**Última atualização:** 2025-10-14 16:23 UTC

Este documento é a **fonte de verdade** do backlog para construir o **Console MCP** (app Node + Vite) que gerencia servidores MCP, chaves, políticas de custo/roteamento e observabilidade/FinOps.
É **rastreável** por IDs e **autoatualizável**: o agente deve marcar as _checkboxes_ dos itens concluídos e commitar o diff.

---

## 🎯 Objetivo
Entregar um **painel unificado** para controlar MCP servers (Gemini, Codex, GLM-4.6, Claude), gerenciar **chaves/policies**, e acompanhar **uso/custos** por execução — priorizando **custo/benefício** e **DX**.

## 🧱 Escopo de MVP
- Web app local (frontend **React+Vite+TS**; backend **Node+Fastify+tRPC**).
- Inventário/controle de MCP servers (start/stop/restart/health).
- Chaves com **keytar** (fallback `~/.mcp/.env` 600).
- Policies (MAX_TOKENS, MAX_COST_USD, TIMEOUT_S, roteamento).
- Observabilidade/FinOps: ingestão JSONL (`~/.mcp/logs/**`) → SQLite → dashboard + export CSV/HTML.
- Empacotamento local; Electron opcional pós-MVP.

## 🧰 Stack (proposta)
- **Frontend:** Vite + React + TS, Tailwind + shadcn/ui, lucide-react, Recharts, react-hook-form, Zod, TanStack Query.
- **Backend:** Fastify + tRPC + Zod, better-sqlite3 (SQLite), keytar, node-cron, child_process (supervisor), dotenv (fallback).
- **Infra local:** pm2 (opcional) / systemd user (opcional).
- **Observabilidade:** parser de JSONL → agregação em SQLite → API → gráficos e export.
- **Empacotamento:** fase 1 web (localhost); fase 2 Electron (opcional).

---

# 🔎 Estrutura de tarefas (IDs rastreáveis)

> Convenção: `TASK-<Área>-<Número>`. Ex.: `TASK-FE-101`, `TASK-BE-203`, `TASK-OPS-301`.
> Cada tarefa tem **DoD**, **Passos**, **Artefatos** e **Comandos**.

## Sprint 0 — Bootstrap do projeto
- [ ] **TASK-OPS-001** — Criar monorepo ou diretório dual (`/app` e `/server`)
  - **DoD:** pastas criadas, `README` raiz atualizado, scripts `dev` e `build` esqueleto.
  - **Passos:**
    1. Criar `app/` com Vite React TS; criar `server/` Node TS com Fastify+tRPC.
    2. Configurar `pnpm` (preferível) ou `npm` workspaces.
  - **Artefatos:** `package.json` (raiz), `app/package.json`, `server/package.json`.
  - **Comandos:**
    ```bash
    pnpm dlx create-vite app -- --template react-ts
    cd server && npm init -y
    ```

- [ ] **TASK-OPS-002** — Tailwind + shadcn/ui + base UI
  - **DoD:** Tailwind configurado; shadcn instalado; tema base; layout com Sidebar/Topbar.
  - **Passos:** instalar deps, gerar config, criar `AppShell` com navegação.
  - **Artefatos:** `tailwind.config.ts`, `src/components/ui/*`.

- [ ] **TASK-OPS-003** — Fastify + tRPC + Zod no backend
  - **DoD:** servidor `fastify` iniciado com `tRPC` em `localhost:3030`, rota `/health`.
  - **Passos:** setup tsconfig/tsx; provider tRPC; schema Zod de hello.
  - **Artefatos:** `server/src/index.ts`, `server/src/trpc/*`.
  - **Comandos:**
    ```bash
    npm i fastify @trpc/server @trpc/client zod better-sqlite3 keytar node-cron
    npm i -D tsx typescript @types/node
    npx tsc --init
    npm run dev  # tsx src/index.ts
    ```

---

## Sprint 1 — Inventário & Chaves
- [ ] **TASK-BE-101** — Key store (keytar + fallback .env)
  - **DoD:** endpoints: `GET/POST /keys` (get/set por provider); persistência no keytar; fallback em `~/.mcp/.env` (600).
  - **Passos:** criar service `secrets.ts`; integrar keytar; sanitizar I/O.
  - **Artefatos:** `server/src/services/secrets.ts`.
  - **Comandos:** —

- [ ] **TASK-BE-102** — SQLite + models iniciais
  - **DoD:** tabelas `mcp_servers`, `cost_policy`, `price_table`, `telemetry`.
  - **Passos:** criar `db.ts` (better-sqlite3); migrations iniciais.
  - **Artefatos:** `server/src/db/*` (migrations + DAL).

- [ ] **TASK-BE-103** — Inventário MCP: CRUD + autodiscovery
  - **DoD:** API `GET/POST/PUT/DELETE /mcp/servers`; autodetecta wrappers em `~/.local/bin`.
  - **Passos:** listar arquivos executáveis com sufixo `-mcp`; mapear `command/args`.
  - **Artefatos:** `server/src/routes/mcp-servers.ts`.

- [ ] **TASK-BE-104** — Supervisor (start/stop/restart/health)
  - **DoD:** API `POST /mcp/servers/:id/start|stop|restart`; `GET /mcp/health/:id` (liveness via pid/stdio ping).
  - **Passos:** child_process spawn; tabela de processos em memória + persistência do estado.
  - **Artefatos:** `server/src/services/supervisor.ts`.

- [ ] **TASK-FE-101** — UI: MCP Servers
  - **DoD:** listagem, criação/edição, enable/disable, start/stop/restart, status.
  - **Passos:** tRPC hooks; formulário com react-hook-form + Zod; tabela com ações.
  - **Artefatos:** `app/src/pages/Servers.tsx`, `app/src/components/ServerForm.tsx`.

- [ ] **TASK-FE-102** — UI: Keys
  - **DoD:** tela para set/get keys (Gemini, OpenAI/Codex, Anthropic, Zhipu).
  - **Passos:** máscaras/sanitize, testes de leitura.
  - **Artefatos:** `app/src/pages/Keys.tsx`.

---

## Sprint 2 — Policies & Routing
- [ ] **TASK-BE-201** — Cost Policy CRUD + load
  - **DoD:** API `GET/POST /policies`; estrutura `MAX_TOKENS`, `MAX_COST_USD`, `TIMEOUT_S`, `MAX_STEPS`; active flag.
  - **Passos:** schema Zod; leitura default de `config/cost-policy.json` (se existir).
  - **Artefatos:** `server/src/routes/policies.ts`.

- [ ] **TASK-BE-202** — Price Table (editável)
  - **DoD:** API `GET/POST /prices`; fallback `config/price-table.json`.
  - **Passos:** validação; cache em memória; persistência.
  - **Artefatos:** `server/src/routes/prices.ts`.

- [ ] **TASK-BE-203** — Roteamento (simulador)
  - **DoD:** endpoint `POST /routing/test` que escolhe servidor com base em `context_size`, `latency_sla`, `task_type`.
  - **Passos:** heurística simples (Gemini=rápido/barato; GLM-4.6=200K; Codex=execução; Claude=ultra).
  - **Artefatos:** `server/src/services/routing.ts`.

- [ ] **TASK-FE-201** — UI: Policies & Routing
  - **DoD:** telas para editar policy e price table; simulador de roteamento com preview do custo/latência.
  - **Artefatos:** `app/src/pages/Policies.tsx`, `app/src/pages/Routing.tsx`.

---

## Sprint 3 — Observabilidade & FinOps
- [ ] **TASK-BE-301** — Ingestão JSONL → SQLite
  - **DoD:** job (node-cron) que varre `~/.mcp/logs/**.jsonl`, parseia registros, grava em `telemetry`.
  - **Passos:** idempotência (checkpoint de arquivo+offset), tolerância a erro.
  - **Artefatos:** `server/src/jobs/ingest-logs.ts`.

- [ ] **TASK-BE-302** — API de métricas agregadas
  - **DoD:** `GET /finops/summary?from&to&server` com total custo, tokens e latência média.
  - **Passos:** queries agregadas; paginação para séries longas.
  - **Artefatos:** `server/src/routes/finops.ts`.

- [ ] **TASK-FE-301** — Dashboard FinOps
  - **DoD:** gráficos de custo (por server/rota) e tabela de runs; export CSV/HTML.
  - **Passos:** Recharts + download; filtros por data/server.
  - **Artefatos:** `app/src/pages/FinOps.tsx`.

---

## Sprint 4 — UX, Docs e Empacotamento
- [ ] **TASK-FE-401** — UX refinado (shadcn + feedbacks)
  - **DoD:** toasts/skeletons; loading states; navegação fluida.
- [ ] **TASK-OPS-402** — Script `dev up`
  - **DoD:** comando único que sobe backend e frontend em dev (`concurrently` ou 2 terminais com instruções).
  - **Artefatos:** `package.json` raiz com `dev:all`.
- [ ] **TASK-OPS-403** — Docs finais
  - **DoD:** README de como rodar, configurar e operar; screenshots; seção de troubleshooting.
- [ ] **TASK-OPS-404** — Electron (opcional, pós-MVP)
  - **DoD:** _packaging_ básico para desktop; verificação de keytar/paths.
  - **Artefatos:** `electron/main.ts` (se aplicável).

---

## ✅ Critérios de Aceite (gerais)
- Rodar **localmente**: `pnpm i && pnpm -r dev` (ou `npm`).
- Configurar servers MCP pelo Console e iniciar/pausar com sucesso.
- Policies aplicáveis e roteamento simulável.
- Dashboard FinOps exibe dados agregados e exporta CSV/HTML.
- Nenhum segredo em git; chaves no keytar/`~/.mcp/.env` (600).

## 🔒 Segurança & Compliance
- Nunca persistir chaves em BD em texto puro.
- Logs **sem PII**; apenas metadados técnicos.
- Botões perigosos requerem confirmação (start/stop massivos).

---

# 📌 Instruções para o Agente (Codex)
1. **Pegar um TASK-*** e criar branch `feat/<task-id>-descricao-curta`.
2. Implementar conforme **Passos** e **DoD** da tarefa.
3. Atualizar este arquivo **next-steps.md** marcando a checkbox da tarefa concluída.
4. Abrir PR referenciando o **Task ID** no título e na descrição.
5. Anexar prints da UI e logs de `server` quando aplicável.
6. Após merge, marcar a tarefa como `[x]` e versionar `CHANGELOG.md`.

---

## 🔗 Dependências externas e caminhos padrão
- Wrappers MCP: `~/.local/bin/{{gemini-mcp,codex-mcp,glm46-mcp,claude-mcp}}`
- Env/Keys: `~/.mcp/.env` (600)
- Logs MCP: `~/.mcp/logs/**.jsonl`
- Price Table (default): `config/price-table.json` (pode ser importada para o BD)

---

## 🧪 Testes mínimos por Sprint
- **S0–S1:** API health + CRUD servers + start/stop simulado (sem rede).
- **S2:** policies salvas/recuperadas + roteamento simulado com inputs variados.
- **S3:** ingestão de amostras JSONL e gráficos com dados fictícios.
- **S4:** fluxo completo (criar server, iniciar, ver métricas, exportar CSV).

---

## 📅 Roadmap (estimativa)
- S0–S1: 3–5 dias úteis
- S2: 2 dias
- S3: 2 dias
- S4: 2 dias
> Ajustar conforme feedback e volume de integrações reais dos MCP servers.

---

## 📝 Anotações
- Podemos portar para Tauri (Rust) no futuro para footprint menor.
- Suporte VS Code / IntelliJ independe: ambos consumirão os **mesmos MCP servers**.
- Integrações extras (ex.: Cline) são plugáveis sem alterar o backend.
