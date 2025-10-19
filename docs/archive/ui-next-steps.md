# ui-next-steps.md — Roadmap UI (Bootstrap 5 + Font Awesome + Vite/React/TS)
**Última atualização:** 2025-10-15 08:29
**Objetivo:** acelerar o time-to-value da UI com **Bootstrap 5 (SCSS seletivo)** + **Font Awesome** e **suporte completo a temas (Light/Dark)**, garantindo **a11y AA**, **performance ≥90** e **consistência visual**.

## Premissas de implementação
- Sem Tailwind/shadcn nesta camada (evitar conflito de design systems).
- Importar **somente** módulos SCSS do Bootstrap que serão usados.
- Font Awesome via `@fortawesome/*` + `library.add()` (tree-shaking).
- Cada componente com estados: `loading`, `empty`, `error`, `success`.
- Telemetria leve de UI (console/log dev) para rastrear interações críticas.

## Status auditado (2025-10-18)
- [x] **TASK-UI-SH-010** · Shell auditado com `skip-link`, atalhos (`⌘K`/`⇧⌘N`) e roving tabindex; ainda requer mocks para dados dinâmicos (ver [Audit UI M1–M6](../audit-ui-m1-m6.md)).
- [x] **TASK-UI-NAV-011** · Breadcrumbs + Pagination ativos, tokens documentados e foco visível nas interações (ver [Audit UI M1–M6](../audit-ui-m1-m6.md)).
- [ ] **TASK-UI-ACT-020** · Catálogo de botões/instrumentos incompleto (ver [Audit UI M1–M6](../audit-ui-m1-m6.md)).
- [ ] **TASK-UI-ACT-021** · Dropdowns/tooltips sem cobertura (ver [Audit UI M1–M6](../audit-ui-m1-m6.md)).
- [ ] **TASK-UI-FB-022** · Alerts/toasts inconsistentes (ver [Audit UI M1–M6](../audit-ui-m1-m6.md)).
- [ ] **TASK-UI-MOD-023** · Modais críticos não presentes (ver [Audit UI M1–M6](../audit-ui-m1-m6.md)).
- [ ] **TASK-UI-DATA-030** · Cards KPI/lista/detalhe incompletos (ver [Audit UI M1–M6](../audit-ui-m1-m6.md)).
- [ ] **TASK-UI-DATA-031** · Tabela + EmptyState sem comportamento esperado (ver [Audit UI M1–M6](../audit-ui-m1-m6.md)).
- [ ] **TASK-UI-DATA-032** · Badges/progress não padronizados (ver [Audit UI M1–M6](../audit-ui-m1-m6.md)).
- [ ] **TASK-UI-FORM-040** · Controles de formulário fora do padrão Bootstrap (ver [Audit UI M1–M6](../audit-ui-m1-m6.md)).
- [ ] **TASK-UI-FORM-041** · Validação e feedback inacessíveis (ver [Audit UI M1–M6](../audit-ui-m1-m6.md)).
- [ ] **TASK-UI-FORM-042** · Upload/download não implementados (ver [Audit UI M1–M6](../audit-ui-m1-m6.md)).
- [ ] **TASK-UI-PG-070** · Dashboard sem fluxos funcionais (ver [Audit UI M1–M6](../audit-ui-m1-m6.md)).
- [ ] **TASK-UI-PG-071** · Página Servers depende de backend real (ver [Audit UI M1–M6](../audit-ui-m1-m6.md)).
- [ ] **TASK-UI-PG-072** · Keys sem máscara/validação confiável (ver [Audit UI M1–M6](../audit-ui-m1-m6.md)).
- [ ] **TASK-UI-PG-073** · Policies não aplicam templates/rollback (ver [Audit UI M1–M6](../audit-ui-m1-m6.md)).
- [ ] **TASK-UI-PG-074** · Routing Lab incompleto (ver [Audit UI M1–M6](../audit-ui-m1-m6.md)).
- [ ] **TASK-UI-PG-075** · FinOps sem gráficos exportáveis (ver [Audit UI M1–M6](../audit-ui-m1-m6.md)).
- [ ] **TASK-UI-OBS-082** · UI Kit vivo não disponível (ver [Audit UI M1–M6](../audit-ui-m1-m6.md)).

---

# Sprint M1 — Fundamentos & Shell (1,5–2,0 semanas)
**North Star:** base visual escalável e navegação produtiva.

### TASK-UI-SH-010 · AppShell (Navbar + Sidebar)
- **Passos**: header com busca/ações; sidebar colapsável; rota ativa; breakpoint `lg`.
- **DoD**: navegação por teclado; aria-labels; foco visível.

### TASK-UI-NAV-011 · Breadcrumbs + Pagination
- **Passos**: breadcrumbs com truncamento em telas pequenas; paginação com chevrons FA.
- **DoD**: leitores de tela anunciam posição/total.

**Entregáveis**: AppShell funcional e navegação base.

---

# Sprint M2 — Ações & Feedback (1,0–1,5 semanas)
**North Star:** operações claras com guardrails visuais.

### TASK-UI-ACT-020 · Buttons & Groups
- Variantes (`primary/secondary/danger/outline/link`), `loading` (spinner), `disabled`; grupos tipo toolbar.
- **DoD**: catálogo com todos os estados.

### TASK-UI-ACT-021 · Dropdowns + Tooltips
- Menus contextuais; tooltips acessíveis; ESC fecha; delay configurável.
- **DoD**: roles/aria corretos; sem conflito de foco.

### TASK-UI-FB-022 · Alerts & Toasts
- Alertas (success/info/warn/danger) + toasts empilhados (auto-hide).
- **DoD**: z-index mapeado (sem sobrepor modals).

### TASK-UI-MOD-023 · Modals (Confirm & Form)
- Confirm 2 cliques (ações destrutivas) e Form modal; `backdrop: static` em críticos.
- **DoD**: trap de foco; ESC respeitado; sem scroll bleed.

**Entregáveis**: UI Kit de ações/feedback + modais, coerentes nos dois temas.

---

# Sprint M3 — Dados & Estruturas (1,5 semanas)
**North Star:** leitura rápida, acessível e responsiva.

### TASK-UI-DATA-030 · Cards (KPI/Lista/Detalhe)
- KPI com variação % e ícone; Lista com meta-info+ações; Detalhe com footer/CTAs; grid 1–3 colunas.
- **DoD**: estados `loading/empty/error` prontos; tema aplicado.

### TASK-UI-DATA-031 · Table + EmptyState
- Sort; linha clicável; placeholders; `aria-describedby` nos headers.
- **DoD**: acessibilidade validada (leitor de tela).

### TASK-UI-DATA-032 · Badges & Progress
- Badges UP/DOWN/DEGRADED; progress bars; cores semânticas dos tokens.
- **DoD**: contraste AA; nomes consistentes entre temas.

**Entregáveis**: componentes de dados consistentes e responsivos.

---

# Sprint M4 — Formulários & Validação (1,0–1,5 semanas)
**North Star:** coleta de dados robusta e a prova de erro.

### TASK-UI-FORM-040 · Form Controls
- Inputs texto/número/select/textarea/switch; input-group com FA; máscaras leves opt-in.
- **DoD**: exemplos documentados; tema consistente.

### TASK-UI-FORM-041 · Validação & Estados
- `react-hook-form` + feedback Bootstrap (`is-invalid`/`invalid-feedback`); `aria-*` correto; error summary.
- **DoD**: acessibilidade verificada (tab/shift+tab).

### TASK-UI-FORM-042 · Upload/Download
- FA upload/download; barra de progresso; drag & drop opcional.
- **DoD**: limites claros; mensagens de erro úteis.

**Entregáveis**: camada de forms pronta para Keys/Policies/Routing.

---

# Sprint M5 — Páginas Core (1,5–2,0 semanas)
**North Star:** valor de negócio tangível no front.

### TASK-UI-PG-070 · Dashboard
- Cards KPI, Recharts (custo/tokens), toasts de alertas; filtros de período.
- **DoD**: estados completos e tema aplicado.

### TASK-UI-PG-071 · Servers
- Tabela + start/stop/restart; badges; log tail (N linhas); offcanvas filtro; confirmações 2 cliques.
- **DoD**: teclabilidade; mensagens de erro úteis.

### TASK-UI-PG-072 · Keys
- Form mask/unmask; teste de credencial (toast); sem logar valores.
- **DoD**: segurança preservada; tema consistente.

### TASK-UI-PG-073 · Policies
- Templates (Economy/Balanced/Turbo); rollback modal; validação preventiva.
- **DoD**: não salvar configs incoerentes (guardrails).

### TASK-UI-PG-074 · Routing Lab
- Form (context/latency/task); tabela comparativa; economia em % e $; CTA “Aplicar”.
- **DoD**: UX clara; a11y mantida.

### TASK-UI-PG-075 · FinOps
- Séries temporais (zoom/brush), Pareto, drill-down modal; export CSV/HTML.
- **DoD**: performance aceitável; tema Dark ok.

**Entregáveis**: todas as páginas core integradas e estáveis.

---

# Sprint M6 — Performance & UI Observability (1,0 semana)
**North Star:** acabamento, governança e qualidade contínua.

### TASK-UI-OBS-082 · UI Kit vivo
- Página catálogo com **todos** os componentes contendo **snippet** de uso e variações; referência oficial da squad.

**Entregáveis**: UI polida, leve e documentada.

---

## Critérios Globais de Aceite (UI)
- **A11y** AA, navegação por teclado 100%, roles/aria consistentes.
- **Perf** ≥ 90 (Lighthouse local) e **bundle CSS** sob controle.
- **Consistência** via tokens/temas; ícones FA padronizados.
- **Documentação**: UI Kit atualizado ao final de cada sprint.

## Métricas de Sucesso
- Tempo para construir uma nova tela **–30%** (baseline).
- Reuso de componentes **≥70%** em telas novas.
- Bugs críticos de UI por release **< 2**.

## Dependências
- APIs do backend: `servers`, `keys`, `policies`, `routing`, `finops`.
- Artefatos: `price-table.json`, `cost-policy.json`.
- Dados sintéticos para testes de UI.

---

## Sequenciamento sugerido
M1 (fundamentos) → M2 (ações/feedback) → M3 (dados) → M4 (forms) → M5 (páginas) → M6 (refino/perf/temas).
