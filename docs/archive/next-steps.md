# Promenade Agent Hub — Next Steps (Node + Vite)
**Status do plano:** bloqueado (aguardando ambiente Playwright)
**Missão:** console unificado para **gerenciar MCP servers**, **chaves/policies**, e **FinOps** com foco **custo/benefício** e **DX**.

> Atualização 2025-10-15 08:29: roadmap revisado com **sprints explícitas (M1–M6)** e inclusão de **suporte a temas (Light/Dark)** para a UI. Consulte `ui-next-steps.md` para o detalhamento operacional.

## Governança e follow-up
- Use `docs/audit-ui-m1-m6.md` como fonte única de verdade: qualquer mudança de status deve primeiro ser refletida na auditoria e, em seguida, sincronizada neste documento e em `ui-next-steps.md` (duplo check após cada review de sprint).
- Ao concluir qualquer ID listado neste documento ou em `ui-next-steps.md`, registre o progresso marcando o checklist correspondente **neste arquivo** e detalhe ajustes relevantes.
- Armazene as evidências (prints, logs, anexos) em `/docs/evidence/<ID>/`, garantindo rastreabilidade completa.
- Atualize `docs/archive/ui-next-steps.md` quando a entrega for de escopo UI, mantendo a paridade entre os planos macro e detalhado.
- Reavalie `docs/audit-ui-m1-m6.md` a cada sprint desbloqueada, anotando impactos e novos bloqueios.

## Status auditado (2025-10-25)
- [ ] **M1 — Fundamentos & Shell** · Bloqueado — shell configurado, mas suite Playwright aborta por dependências ausentes; ambiente precisa de `playwright install-deps` antes de retomar (ver [Audit UI M1–M6](../audit-ui-m1-m6.md)).【4ea611†L1-L205】
  - [x] **TASK-UI-SH-010** — Shell com `skip-link`, roving tabindex e atalhos documentados.
  - [x] **TASK-UI-NAV-011** — Breadcrumbs + Pagination com tokens `--mcp-*` e foco visível.
- [ ] **M2 — Ações & Feedback** · Bloqueado — componentes só podem ser validados após liberar runner Chromium (ver [Audit UI M1–M6](../audit-ui-m1-m6.md)).【4ea611†L1-L205】【F:docs/evidence/TASK-UI-ACT-020/README.md†L1-L17】
- [ ] **M3 — Dados & Estruturas** · Bloqueado — dependência de backend real permanece e Playwright não executa sem deps nativas (ver [Audit UI M1–M6](../audit-ui-m1-m6.md)).【4ea611†L1-L205】
- [ ] **M4 — Formulários & Validação** · Bloqueado — validações não podem ser auditadas com a suite quebrada (ver [Audit UI M1–M6](../audit-ui-m1-m6.md)).【4ea611†L1-L205】
- [ ] **M5 — Páginas Core** · Bloqueado — smoke UI travado por `browserType.launch` e dados FinOps pendentes (ver [Audit UI M1–M6](../audit-ui-m1-m6.md)).【4ea611†L1-L205】【F:docs/evidence/UI-ACT-005/README.md†L1-L17】
- [ ] **M6 — Performance & Observabilidade** · Bloqueado — métricas paralisadas até restabelecer as suites e telemetria (ver [Audit UI M1–M6](../audit-ui-m1-m6.md)).【4ea611†L1-L205】【F:docs/evidence/TASK-UI-OBS-082/README.md†L1-L23】

## Auditoria Final — 2025-10-20
- `pnpm i` e `pnpm -r dev` executados sem erros imediatos (processos encerrados manualmente após o boot) confirmam que a toolchain continua instalável em modo dev.【231433†L1-L9】【2b58dd†L1-L5】
- Backend FastAPI validado end-to-end: `/api/v1/healthz` responde 200, templates de policies permanecem disponíveis, o simulador de routing retorna distribuição/custos coerentes e os relatórios FinOps exibem dados determinísticos dos fixtures.【2c5a62†L1-L6】【c5de4c†L1-L18】【4318f3†L1-L9】【0c07a3†L1-L39】【d2ef4c†L1-L17】【c6d23f†L1-L17】【6e0762†L1-L20】
- Export CSV/HTML permanece acessível (HTTP 200), porém apenas o cabeçalho é gerado enquanto a base SQLite está vazia — risco de ausência de histórico até que novas ingestas/fixtures sejam aplicadas.【82a64e†L1-L2】【a7a14c†L1-L3】
- Bloqueios críticos seguem concentrados na sprint M5: o smoke Playwright das páginas core ainda falha e o link FinOps permanece congelando a navegação inicial.【F:docs/evidence/TASK-UI-PG-070/README.md†L11-L18】
- Reforço 2025-10-25: a tentativa mais recente registrou falha geral (`browserType.launch`) com 45 testes abortados por dependências nativas ausentes — consultar `docs/evidence/2025-10-25/README.md` antes de qualquer rebaseline.【F:docs/evidence/2025-10-25/README.md†L1-L16】
- Recomendação: manter **No-Go** até estabilizar smoke UI/FinOps e restaurar a telemetria; ver detalhamento atualizado no Audit Report.【F:docs/audit-ui-m1-m6.md†L1-L200】

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
- Form Controls (TASK-UI-FORM-040) ✅ UI Kit atualizado com controles MCP + docs em `docs/forms/README.md`.【F:docs/evidence/TASK-UI-FORM-040/README.md†L1-L7】
- Validação & Estados (TASK-UI-FORM-041)
- Upload/Download (TASK-UI-FORM-042)

### M5 — Páginas Core (UI) · 1,5–2,0 semanas
- Dashboard (TASK-UI-PG-070) ⚠️ Smoke Playwright segue falhando (cards não aparecem; ver sumário de evidências).【F:docs/evidence/TASK-UI-PG-070/README.md†L11-L11】
- Servers (TASK-UI-PG-071) ⚠️ Indicadores de health inconsistentes (`['4','0','0','0']`).【F:docs/evidence/TASK-UI-PG-070/README.md†L17-L17】
- Keys (TASK-UI-PG-072) ⚠️ Console de segurança sem dados para usuários/auditoria.【F:docs/evidence/TASK-UI-PG-070/README.md†L16-L16】
- Policies (TASK-UI-PG-073) ⚠️ Heading "Runtime, timeouts e tracing" não renderiza.【F:docs/evidence/TASK-UI-PG-070/README.md†L14-L14】
- Routing Lab (TASK-UI-PG-074) ⚠️ Formulário não aceita seleção nem exibe mensagem de erro.【F:docs/evidence/TASK-UI-PG-070/README.md†L15-L15】
- FinOps (TASK-UI-PG-075) ⚠️ Link de navegação "FinOps" não responde; suite expira no clique inicial.【F:docs/evidence/TASK-UI-PG-070/README.md†L13-L13】

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
- [x] **TASK-BE-203 — Routing Simulator**【F:docs/evidence/TASK-BE-203/README.md†L1-L69】

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
- [x] **TASK-OPS-301 — Segredos**【F:docs/evidence/TASK-OPS-301/README.md†L1-L21】
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

## Próximo ciclo de auditoria (handover)
1. Reaplique `python scripts/generate_finops_fixtures.py` para atualizar os fixtures consumidos pelo backend e, em seguida, `python scripts/generate_finops_fixtures.py --seed-db --db-path <caminho/console.db>` para recarregar `telemetry_events`/`price_entries` no SQLite. Depois exporte `CONSOLE_MCP_DB_PATH=<caminho/console.db>` e repita `GET /api/v1/telemetry/finops/sprints`, `GET /api/v1/telemetry/finops/pull-requests`, `GET /api/v1/telemetry/export?format=csv` e `GET /api/v1/telemetry/export?format=html` usando a janela recomendada (duas sprints consecutivas: `start=2025-10-08T00:00:00Z`, `end=2025-10-21T23:59:59Z`, `window_days=7`). Armazene os relatórios resultantes no cofre interno de evidências em vez de `docs/evidence/` e registre o link seguro no dossiê do PR.【F:scripts/generate_finops_fixtures.py†L19-L118】【F:scripts/generate_finops_fixtures.py†L307-L347】【F:docs/evidence/2025-10-21/README.md†L1-L4】【F:docs/observability/finops-telemetry-seeding.md†L33-L43】
2. Estabilizar as páginas core (TASK-UI-PG-070..075) antes de reexecutar a suíte Playwright e atualizar os evidenciais das rotas de FinOps/Policies.【F:docs/evidence/TASK-UI-PG-070/README.md†L11-L18】
3. Automatizar no CI a rotina `pnpm i → pnpm -r dev → healthz/simulate/export` para sinalizar rapidamente futuras regressões de infraestrutura ou políticas.【231433†L1-L9】【2b58dd†L1-L5】【6e0762†L1-L20】
4. Atualizar o runbook/handbook com o plano de ingestão FinOps e os limites atuais dos endpoints para orientar o próximo time durante o handover.【c6d23f†L1-L17】【82a64e†L1-L2】

---

## Dependências
- Wrappers MCP: `~/.local/bin/*-mcp`
- Chaves: `~/.mcp/.env` (600) + keytar
- Logs: `~/.mcp/logs/*.jsonl`
