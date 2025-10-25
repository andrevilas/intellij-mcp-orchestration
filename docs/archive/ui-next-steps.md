# ui-next-steps.md — Roadmap UI (Bootstrap 5 + Font Awesome + Vite/React/TS)
**Última atualização:** 2025-10-25 19:30
**Objetivo:** acelerar o time-to-value da UI com **Bootstrap 5 (SCSS seletivo)** + **Font Awesome** e **suporte completo a temas (Light/Dark)**, garantindo **a11y AA**, **performance ≥90** e **consistência visual**.

## Governança e follow-up
- Consuma `docs/audit-ui-m1-m6.md` como fonte de verdade: só atualize este roadmap após refletir o mesmo status na auditoria e validar a paridade com `next-steps.md`.
- Registre cada ID concluído atualizando os checklists deste arquivo e do `next-steps.md`, mantendo a sincronização entre roadmap macro e detalhado.
- Publique as evidências correspondentes em `/docs/evidence/<ID>/` (prints, gravações, relatórios técnicos, etc.).
- Sempre que uma sprint UI for desbloqueada, reavalie `docs/audit-ui-m1-m6.md` e documente novos riscos ou pendências.

## Premissas de implementação
- Sem Tailwind/shadcn nesta camada (evitar conflito de design systems).
- Importar **somente** módulos SCSS do Bootstrap que serão usados.
- Font Awesome via `@fortawesome/*` + `library.add()` (tree-shaking).
- Cada componente com estados: `loading`, `empty`, `error`, `success`.
- Telemetria leve de UI (console/log dev) para rastrear interações críticas.

## Status auditado (2025-10-25)
- `[x]` indica implementado, porém o valor de sprint continua **bloqueado** enquanto o ambiente Playwright não sobe.
- [x] **TASK-UI-SH-010** · Implementação concluída, mas ver bloqueio global de execução da suíte.【4ea611†L1-L205】
- [x] **TASK-UI-NAV-011** · Breadcrumbs/Pagination entregues, aguardando revalidação após `playwright install-deps`.【4ea611†L1-L205】
- [x] **TASK-UI-ACT-020** · Componentes prontos, sem possibilidade de auditoria enquanto Chromium não inicia.【4ea611†L1-L205】【F:docs/evidence/TASK-UI-ACT-020/README.md†L1-L17】
- [x] **TASK-UI-ACT-021** · Dropdowns/tooltips implementados, revalidação bloqueada pelo runner Chromium.【4ea611†L1-L205】
- [x] **TASK-UI-FB-022** · Alerts/toasts entregues, aguardando smoke real para fechar sprint.【4ea611†L1-L205】
- [x] **TASK-UI-MOD-023** · Modais auditados previamente; bloqueio persiste por falha da suíte E2E.【4ea611†L1-L205】
- [x] **UI-ACT-005** · Toggle de fixtures ativo, mas sem suite não há evidência atualizada de desbloqueio da sprint.【4ea611†L1-L205】【F:docs/evidence/UI-ACT-005/README.md†L1-L17】
- [ ] **TASK-UI-DATA-030** · Bloqueado — componentes de dados aguardam validação com Playwright operacional.【4ea611†L1-L205】
- [ ] **TASK-UI-DATA-031** · Bloqueado — tabela/EmptyState continuam sem cobertura de teste por falha geral do runner.【4ea611†L1-L205】
- [ ] **TASK-UI-DATA-032** · Bloqueado — progresso depende das mesmas dependências nativas ausentes.【4ea611†L1-L205】
- [x] **TASK-UI-FORM-040** · Controles disponíveis; suite inacessível impede validação contínua.【4ea611†L1-L205】【F:docs/evidence/TASK-UI-FORM-040/README.md†L1-L7】
- [ ] **TASK-UI-FORM-041** · Bloqueado — validações aguardam reexecução após corrigir ambiente.【4ea611†L1-L205】
- [ ] **TASK-UI-FORM-042** · Bloqueado — upload/download pendentes e sem evidência atualizada.【4ea611†L1-L205】
- [ ] **TASK-UI-PG-070** · Bloqueado — dashboard depende das fixtures porém Chromium não inicia para validar.【4ea611†L1-L205】【F:docs/evidence/TASK-UI-PG-070/README.md†L1-L21】
- [ ] **TASK-UI-PG-071** · Bloqueado — página Servers sem smoke por `browserType.launch` falhando.【4ea611†L1-L205】【F:docs/evidence/TASK-UI-PG-070/README.md†L1-L21】
- [ ] **TASK-UI-PG-072** · Bloqueado — console de segurança não pode ser auditado até restaurar suíte.【4ea611†L1-L205】【F:docs/evidence/TASK-UI-PG-070/README.md†L1-L21】
- [ ] **TASK-UI-PG-073** · Bloqueado — policies HITL aguardam reexecução da suíte para confirmar fluxo.【4ea611†L1-L205】【F:docs/evidence/TASK-UI-PG-070/README.md†L1-L21】
- [ ] **TASK-UI-PG-074** · Bloqueado — Routing Lab segue sem evidência nova por falha global do Chromium.【4ea611†L1-L205】【F:docs/evidence/TASK-UI-PG-070/README.md†L1-L21】
- [ ] **TASK-UI-PG-075** · Bloqueado — FinOps continua sem teste automatizado válido pela falta de dependências do host.【4ea611†L1-L205】【F:docs/evidence/TASK-UI-PG-070/README.md†L1-L21】
- [x] **TASK-UI-OBS-082** · UI Kit entregue; bloquear sprint até retestar com Playwright operacional.【4ea611†L1-L205】【F:docs/evidence/TASK-UI-OBS-082/README.md†L1-L23】

## Auditoria Final UI — 2025-10-20
- `pnpm -r dev` inicializa o shell Vite e permanece em execução até ser encerrado manualmente, confirmando que o toolkit React continua pronto para desenvolvimento local.【2b58dd†L1-L5】
- Fixtures ativados (`UI-ACT-005`) e backend simulador entregam respostas de FinOps/Routing consistentes, mas o export CSV segue sem eventos — apenas cabeçalho — até que a base SQLite receba ingestão real ou fixtures atualizados.【F:docs/evidence/UI-ACT-005/README.md†L1-L17】【d2ef4c†L1-L17】【a7a14c†L1-L3】
- Fluxos das páginas core dependem do runner com dependências Chromium instaladas; no contêiner padrão, o smoke Playwright aborta ainda na inicialização do browser (`browserType.launch`).【F:docs/evidence/TASK-UI-PG-070/README.md†L1-L21】
- Mantemos recomendação **No-Go** para UI até restabelecer dados de telemetria e fechar as lacunas da sprint M5/M6 (vide atualização em `docs/audit-ui-m1-m6.md`).【F:docs/audit-ui-m1-m6.md†L1-L200】

## Plano UI — Próximo ciclo (handover)
1. Completar componentes de dados (TASK-UI-DATA-030..032) e estabilizar smoke Playwright das páginas core antes de retestar FinOps e Policies.【F:docs/evidence/TASK-UI-PG-070/README.md†L11-L18】
2. Restaurar ingestão ou fixtures de telemetria para que `GET /telemetry/finops/*` e o export CSV entreguem séries completas — pré-requisito para gráficos e drill-down da sprint M5.【d2ef4c†L1-L17】【a7a14c†L1-L3】【c6d23f†L1-L17】
3. Automatizar no CI os checks de boot (`pnpm -r dev`), healthz e simulador para evitar regressões silenciosas em ambientes sem backend real.【2b58dd†L1-L5】【6e0762†L1-L20】
4. Documentar claramente no runbook quando ativar `CONSOLE_MCP_USE_FIXTURES` vs. backend real, garantindo que QA siga o mesmo fluxo de toggles descrito em `UI-ACT-005`.【F:docs/evidence/UI-ACT-005/README.md†L1-L17】

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

### TASK-UI-FORM-040 · Form Controls (✅ entregue)
- Inputs MCP (`Input`, `Select`, `TextArea`, `Switch`, `InputGroup`) com tokens `--mcp-form-*`, resumo de erros e integrações `react-hook-form` (`useMcpForm`/`useMcpField`).【F:app/src/components/forms/index.ts†L1-L16】【F:app/src/hooks/useMcpForm.ts†L18-L111】
- **DoD**: showcase atualizado (`FormControlsSection`), documentação em `docs/forms/README.md` e testes (Vitest + Playwright) garantindo foco/tab order.【F:app/src/components/UiKitShowcase.tsx†L209-L321】【F:app/src/components/forms/FormControls.test.tsx†L1-L104】【F:tests/e2e/forms-controls.spec.ts†L1-L83】

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
