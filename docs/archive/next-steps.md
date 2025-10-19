# Promenade Agent Hub — Next Steps (Node + Vite)
**Status do plano:** atualizado
**Missão:** console unificado para **gerenciar MCP servers**, **chaves/policies**, e **FinOps** com foco **custo/benefício** e **DX**.

> Atualização 2025-10-15 08:29: roadmap revisado com **sprints explícitas (M1–M6)** e inclusão de **suporte a temas (Light/Dark)** para a UI. Consulte `ui-next-steps.md` para o detalhamento operacional.

## Status auditado (2025-10-18)
- [ ] **M1 — Fundamentos & Shell** · Em progresso — Bootstrap/FA, ThemeProvider e tokens Light/Dark entregues; seguir com dieta de bundle e métricas (ver [Audit UI M1–M6](../audit-ui-m1-m6.md)).
  - [x] **TASK-UI-SH-010** — Shell com `skip-link`, roving tabindex e atalhos documentados.
  - [x] **TASK-UI-NAV-011** — Breadcrumbs + Pagination com tokens `--mcp-*` e foco visível.
- [ ] **M2 — Ações & Feedback** · Bloqueado — componentes críticos (wizards/modais) ausentes (ver [Audit UI M1–M6](../audit-ui-m1-m6.md)).
- [ ] **M3 — Dados & Estruturas** · Bloqueado — dependência de backend real impede validação (ver [Audit UI M1–M6](../audit-ui-m1-m6.md)).
- [ ] **M4 — Formulários & Validação** · Bloqueado — formulários principais indisponíveis (ver [Audit UI M1–M6](../audit-ui-m1-m6.md)).
- [ ] **M5 — Páginas Core** · Bloqueado — fluxos Dashboard/Servers/FinOps/Policies/Routing falhando (ver [Audit UI M1–M6](../audit-ui-m1-m6.md)).
- [ ] **M6 — Performance & Observabilidade** · Bloqueado — build quebrado impede métricas (ver [Audit UI M1–M6](../audit-ui-m1-m6.md)).

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
- **Frontend/UI (Sprint M1–M6)** — ver `ui-next-steps.md`
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

## Sprints (planejamento macro)

### M1 — Fundamentos & Shell (UI) · 1,5–2,0 semanas
- AppShell (Navbar+Sidebar) e Navegação (Breadcrumbs/Pagination) (TASK-UI-SH-010/ UI-NAV-011)

### M2 — Ações & Feedback (UI) · 1,0–1,5 semanas
- Buttons & Groups (TASK-UI-ACT-020)
- Dropdowns/Tooltips (TASK-UI-ACT-021)
- Alerts/Toasts (TASK-UI-FB-022)
- Modals (Confirm/Form) (TASK-UI-MOD-023)

### M3 — Dados & Estruturas (UI) · 1,5 semanas
- Cards KPI/Lista/Detalhe (TASK-UI-DATA-030)
- Tabela + EmptyState (TASK-UI-DATA-031)
- Badges & Progress (TASK-UI-DATA-032)

### M4 — Formulários & Validação (UI) · 1,0–1,5 semanas
- Form Controls (TASK-UI-FORM-040)
- Validação & Estados (TASK-UI-FORM-041)
- Upload/Download (TASK-UI-FORM-042)

### M5 — Páginas Core (UI) · 1,5–2,0 semanas
- Dashboard (TASK-UI-PG-070)
- Servers (TASK-UI-PG-071)
- Keys (TASK-UI-PG-072)
- Policies (TASK-UI-PG-073)
- Routing Lab (TASK-UI-PG-074)
- FinOps (TASK-UI-PG-075)

### M6 — Performance & Observabilidade de UI · 1,0 semana
- UI Kit vivo (TASK-UI-OBS-082)

> Nota: as sprints de **backend (BE-1 a BE-3)**, **policies/routing (PR-1)**, **observabilidade/finops (FO-1, FO-2)** e **ops (OPS-2 a OPS-4)** seguem plano já descrito anteriormente e podem rodar **paralelamente** às sprints UI quando não houver bloqueios.

---

## Backlog técnico consolidado
### Sprint BE-1 — Backend Base
- [x] **TASK-BE-101 — Secrets**
- [x] **TASK-BE-102 — SQLite + migrations**
- [x] **TASK-BE-103 — MCP Servers CRUD**
- [x] **TASK-BE-104 — Supervisor de processos**

### Sprint BE-2 — Policies & Routing
- [x] **TASK-BE-201 — Cost Policy CRUD**
- [x] **TASK-BE-202 — Price Table**
- [ ] **TASK-BE-203 — Routing Simulator**

### Sprint BE-3 — Observabilidade
- [x] **TASK-BE-301 — Ingestão JSONL**
- [x] **TASK-BE-302 — Métricas agregadas**
- [x] **TASK-BE-303 — Export CSV/HTML**

### Sprint PR-1 — Guardrails
- [x] **TASK-PR-101 — Templates de política**
- [x] **TASK-PR-102 — Overrides por rota/projeto**
- [x] **TASK-PR-103 — Dry-run de custo**

### Sprint FO-1 — Telemetria
- [x] **TASK-FO-101 — Modelo de log unificado**
- [x] **TASK-FO-102 — Alertas básicos**

### Sprint FO-2 — FinOps+
- [x] **TASK-FO-201 — Pareto e hotspots**
- [x] **TASK-FO-202 — Relatórios por sprint/PR**

### Sprint OPS-2 — DX & Automação
- [x] **TASK-OPS-205 — Script `dev:all`**
- [x] **TASK-OPS-206 — Make targets e Doctor**
- [x] **TASK-OPS-207 — CI básico**

### Sprint OPS-3 — Segurança
- [ ] **TASK-OPS-301 — Segredos**
- [ ] **TASK-OPS-302 — Operações seguras**

### Sprint OPS-4 — Packaging
- [x] **TASK-OPS-401 — Build local**
- [x] **TASK-OPS-402 — Electron (opcional)**

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
