# MCP Console — Next Steps (Node + Vite)
**Status do plano:** atualizado
**Missão:** console unificado para **gerenciar MCP servers**, **chaves/policies**, e **FinOps** com foco **custo/benefício** e **DX**.

## North Star & KPIs
- **Lead time por PR**: -40% (30 dias)
- **Custo por PR**: -25% vs. baseline
- **Cobertura de testes**: +15 p.p. (60 dias)
- **Intervenções humanas**: apenas validações/merge

---

## Roadmap de Tarefas (Visão Macro)
### Já concluídas
- [x] **TASK-OPS-001 — Criar monorepo ou diretório dual (`/app` e `/server`)**
- [x] **TASK-OPS-002 — Definir stack do frontend e bootstrap inicial**
- [x] **TASK-OPS-003 — Prototipar API mínima do Console MCP Server**
- [x] **TASK-OPS-004 — Integração inicial Console ↔ MCP servers existentes**

### Pendentes (principais trilhas)
- **Frontend/UI (Sprint UI-1 a UI-4)**
- **Backend/API (Sprint BE-1 a BE-3)**
- **Policies & Routing (Sprint PR-1)**
- **Observabilidade & FinOps (Sprint FO-1 a FO-2)**
- **Operações/DevEx (Sprint OPS-2 a OPS-4)**

---

## Convenções (para Codex e equipe)
- **Branch:** `feat/<TASK_ID>-slug-curto`
- **Commits:** prefixo `TASK_ID`
- **PR:** descrição com prints/logs
- **Checklist:** marcar `[x]` neste arquivo ao concluir

---

## Sprint UI-1 — Dashboard & Servers
- [x] **TASK-UI-101 — Dashboard Executivo**
  - KPIs de custo, tokens, latência, top modelos
  - Alertas visuais e heatmap Recharts
  - **Artefatos:** `app/src/pages/Dashboard.tsx`, `components/KpiCard.tsx`

- [x] **TASK-UI-102 — Servers 2.0**
  - Status UP/DOWN, start/stop/restart, log tail, uptime
  - **Artefatos:** `app/src/pages/Servers.tsx`, `components/ServerActions.tsx`

- [x] **TASK-UI-103 — Keys 2.0**
  - Tela de chaves com teste de conectividade
  - **Artefatos:** `app/src/pages/Keys.tsx`

---

## Sprint UI-2 — Policies & Routing
- [x] **TASK-UI-201 — Policies 2.0**
  - Templates (Economy/Balanced/Turbo), rollback
  - **Artefatos:** `pages/Policies.tsx`, `components/PolicyTemplatePicker.tsx`

- [x] **TASK-UI-202 — Routing Lab**
  - Simulador “what-if” com estimativa de custo
  - **Artefatos:** `pages/Routing.tsx`

---

## Sprint UI-3 — FinOps
- [x] **TASK-UI-301 — Séries temporais e filtros**
  - Gráficos, filtros por período/server, export CSV
- [x] **TASK-UI-302 — Pareto & Drill-down**
  - Pareto de custo por modelo/rota + detalhe de runs

---

## Sprint UI-4 — UX/A11y
- [x] **TASK-UI-401 — Command Palette**
- [x] **TASK-UI-402 — Notifications**
- [x] **TASK-UI-403 — A11y & Keyboard-first**

---

## Sprint BE-1 — Backend Base
- [x] **TASK-BE-101 — Secrets**
- [x] **TASK-BE-102 — SQLite + migrations**
- [x] **TASK-BE-103 — MCP Servers CRUD**
- [x] **TASK-BE-104 — Supervisor de processos**

---

## Sprint BE-2 — Policies & Routing
- [ ] **TASK-BE-201 — Cost Policy CRUD**
- [ ] **TASK-BE-202 — Price Table**
- [ ] **TASK-BE-203 — Routing Simulator**

---

## Sprint BE-3 — Observabilidade
- [ ] **TASK-BE-301 — Ingestão JSONL**
- [ ] **TASK-BE-302 — Métricas agregadas**
- [ ] **TASK-BE-303 — Export CSV/HTML**

---

## Sprint PR-1 — Guardrails
- [ ] **TASK-PR-101 — Templates de política**
- [ ] **TASK-PR-102 — Overrides por rota/projeto**
- [ ] **TASK-PR-103 — Dry-run de custo**

---

## Sprint FO-1 — Telemetria
- [ ] **TASK-FO-101 — Modelo de log unificado**
- [ ] **TASK-FO-102 — Alertas básicos**

## Sprint FO-2 — FinOps+
- [ ] **TASK-FO-201 — Pareto e hotspots**
- [ ] **TASK-FO-202 — Relatórios por sprint/PR**

---

## Sprint OPS-2 — DX & Automação
- [ ] **TASK-OPS-205 — Script `dev:all`**
- [ ] **TASK-OPS-206 — Make targets e Doctor**
- [ ] **TASK-OPS-207 — CI básico**

## Sprint OPS-3 — Segurança
- [ ] **TASK-OPS-301 — Segredos**
- [ ] **TASK-OPS-302 — Operações seguras**

## Sprint OPS-4 — Packaging
- [ ] **TASK-OPS-401 — Build local**
- [ ] **TASK-OPS-402 — Electron (opcional)**

---

## Critérios de Aceite
- Funcionar com `pnpm i && pnpm -r dev`
- MCP servers start/stop/health OK
- Policies aplicáveis e simulador ativo
- FinOps exportável
- Zero segredos em git

---

## Dependências
- Wrappers MCP: `~/.local/bin/*-mcp`
- Chaves: `~/.mcp/.env` (600) + keytar
- Logs: `~/.mcp/logs/*.jsonl`
