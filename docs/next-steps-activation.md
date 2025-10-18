# Plano de Ação — Próximos Passos (UI + Plataforma)

> Fonte de verdade: [`docs/archive/next-steps.md`](archive/next-steps.md) — extração em 2025-10-18 14:30 UTC.
>
> Objetivo: transformar pendências marcadas como `[ ]` em atividades acionáveis, prontas para kickoff imediato pelas squads responsáveis.

## Como usar
- Cada atividade já traz **branch sugerida**, **responsável primário**, **pré-requisitos**, **entregáveis** e **evidências** esperadas.
- Ao iniciar, abra issue/PR referenciando o **ID** indicado e atualize o checklist de origem.
- Todas as atividades devem reportar progresso no Audit Report até desbloquear a sprint correspondente.

---

## Trilha UI — Sprints M1–M6

### UI-ACT-001 — Desbloquear Sprint M1 (Fundamentos & Shell)
- **Scope:** Bootstrap/Font Awesome com import seletivo, tokens e temas (Light/Dark), AppShell (Navbar, Sidebar colapsável, Breadcrumbs, Pagination), acessibilidade AA.
- **Branch sugerida:** `feat/TASK-UI-M1-shell`
- **Responsável primário:** Squad UI
- **Pré-requisitos:** nenhum (greenfield)
- **Passos principais:**
  1. Configurar SCSS modular importando apenas componentes utilizados.
  2. Registrar ícones FA via `library.add()` apenas para ícones necessários.
  3. Implementar tokens (cores, tipografia) e toggle de tema com persistência.
  4. Construir Navbar + Sidebar responsivos, estados ativos, foco visível.
  5. Implementar Breadcrumbs e Pagination com leitura por leitores de tela.
  6. Garantir navegação 100% teclado e contraste AA para Light/Dark.
- **Entregáveis:** componentes publicados em UI Kit, manual de uso (MDX ou README).
- **Evidências:** screenshots Light/Dark, resultado Playwright smoke para navegação.
- **Bloqueios atuais:** apontados em [`docs/audit-ui-m1-m6.md`](audit-ui-m1-m6.md#sprint-m1).

### UI-ACT-002 — Desbloquear Sprint M2 (Ações & Feedback)
- **Scope:** Buttons/Groups, Dropdowns/Tooltips, Alerts/Toasts, Modais com fluxos de confirmação.
- **Branch sugerida:** `feat/TASK-UI-M2-actions`
- **Responsável primário:** Squad UI
- **Pré-requisitos:** UI-ACT-001 concluído.
- **Passos principais:**
  1. Completar componente Button com estados loading/disabled e toolbar.
  2. Implementar Dropdowns/Tooltips acessíveis (ESC fecha, foco controlado).
  3. Criar Alerts/Toasts com pilha controlada e sem interferir em modais.
  4. Construir Modais de confirmação/form com trap de foco e 2-cliques.
  5. Atualizar Playwright com casos de overlays e ações destrutivas.
- **Entregáveis:** UI Kit com estados documentados, testes Playwright.
- **Evidências:** vídeo curto (opcional), relatório Playwright overlays.
- **Bloqueios atuais:** [`audit-ui-m1-m6.md#sprint-m2`](audit-ui-m1-m6.md#sprint-m2).

### UI-ACT-003 — Desbloquear Sprint M3 (Dados & Estruturas)
- **Scope:** Cards KPI/Lista/Detalhe, Tabela com sort/linha clicável, Badges & Progress.
- **Branch sugerida:** `feat/TASK-UI-M3-data`
- **Responsável primário:** Squad UI
- **Pré-requisitos:** UI-ACT-001, UI-ACT-002.
- **Passos principais:**
  1. Criar componentes de Card com estados loading/empty/error.
  2. Implementar tabela com aria-describedby, sort e empty state com CTA.
  3. Entregar Badges/Progress com tokens semânticos (Light/Dark).
  4. Stub de dados para testes (sem backend real).
  5. Playwright: fluxo de cards/tabelas com cenários de erro.
- **Entregáveis:** Storybook/Docs, fixtures de dados.
- **Evidências:** screenshots dark mode, relatório a11y (axe).
- **Bloqueios atuais:** [`audit-ui-m1-m6.md#sprint-m3`](audit-ui-m1-m6.md#sprint-m3).

### UI-ACT-004 — Desbloquear Sprint M4 (Formulários & Validação)
- **Scope:** Form controls, validação Bootstrap + aria, upload/download com feedback.
- **Branch sugerida:** `feat/TASK-UI-M4-forms`
- **Responsável primário:** Squad UI
- **Pré-requisitos:** UI-ACT-001 a UI-ACT-003.
- **Passos principais:**
  1. Componentizar inputs, selects, input-groups com ícones.
  2. Implementar validação cliente (is-invalid) + resumo de erros.
  3. Construir upload/download com progresso e mensagens claras.
  4. Testes Playwright focados em acessibilidade (tab/shift+tab, aria-invalid).
- **Entregáveis:** Documentação e exemplos no UI Kit.
- **Evidências:** relatório Playwright forms, captura de resumo de erros.
- **Bloqueios atuais:** [`audit-ui-m1-m6.md#sprint-m4`](audit-ui-m1-m6.md#sprint-m4).

### UI-ACT-005 — Desbloquear Sprint M5 (Páginas Core)
- **Scope:** Dashboard, Servers, Keys, Policies, Routing Lab, FinOps com fluxos completos.
- **Branch sugerida:** `feat/TASK-UI-M5-core-pages`
- **Responsável primário:** Squads UI + Produto
- **Pré-requisitos:** UI-ACT-001 a UI-ACT-004, BE-ACT-003 (stubs/simuladores).
- **Passos principais:**
  1. Construir fluxos com dados fictícios e fixtures.
  2. Implementar gráficos (custo/tokens, FinOps) com estados e toasts.
  3. Garantir modais de confirmação nos controles de servidores.
  4. Políticas: templates, rollback modal, validação preventiva.
  5. Routing Lab: formulário completo + tabela comparativa + CTA Aplicar.
  6. FinOps: zoom/brush, Pareto, drill-down, export CSV/HTML.
  7. Playwright: smoke + fluxos E2E para cada página.
- **Entregáveis:** Páginas integradas no console, scripts de dados mockados.
- **Evidências:** suite Playwright E2E, vídeos/screen captures.
- **Bloqueios atuais:** [`audit-ui-m1-m6.md#sprint-m5`](audit-ui-m1-m6.md#sprint-m5).

### UI-ACT-006 — Desbloquear Sprint M6 (Theming, Performance & Observabilidade)
- **Scope:** Refinar tema Dark, otimizar bundle (CSS ≤ 220KB), code splitting, UI Kit vivo atualizado.
- **Branch sugerida:** `feat/TASK-UI-M6-theming`
- **Responsável primário:** Squad UI
- **Pré-requisitos:** UI-ACT-001 a UI-ACT-005.
- **Passos principais:**
  1. Auditar tokens e estados de foco/hover para Dark Mode.
  2. Revisar imports SCSS e garantir tree shaking FA.
  3. Implementar split por rota crítica (Dashboard/Servers/FinOps).
  4. Rodar Lighthouse (Desktop) e garantir Performance/Best Practices ≥ 90.
  5. Atualizar UI Kit com componentes finais.
- **Entregáveis:** Relatórios Lighthouse, planilha bundle, release notes UI Kit.
- **Evidências:** prints comparativos Light/Dark, métricas bundle.
- **Bloqueios atuais:** [`audit-ui-m1-m6.md#sprint-m6`](audit-ui-m1-m6.md#sprint-m6).

---

## Trilha Backend & Operações

### BE-ACT-003 — Completar Sprint BE-2 (Routing Simulator)
- **Scope:** Implementar `TASK-BE-203 — Routing Simulator` com API e stubs para UI.
- **Branch sugerida:** `feat/TASK-BE-203-routing-sim`
- **Responsável primário:** Squad Backend
- **Pré-requisitos:** BE-201/202 concluídos (OK), disponibilidade de dados de preço.
- **Passos principais:**
  1. Definir contrato do simulador (input context/latency/task, outputs custo/latência).
  2. Implementar serviço e endpoints REST/IPC.
  3. Fornecer fixtures para UI (Routing Lab) e testes automatizados.
  4. Documentar no runbook + README backend.
- **Entregáveis:** API ativa com testes, mocks distribuídos ao frontend.
- **Evidências:** testes automatizados (unit/integration), snippets curl.

### OPS-ACT-301 — Implantar Gestão de Segredos (Sprint OPS-3)
- **Scope:** Executar `TASK-OPS-301 — Segredos` e `TASK-OPS-302 — Operações seguras`.
- **Branch sugerida:** `feat/TASK-OPS-301-secrets`
- **Responsável primário:** Squad Ops/SRE
- **Pré-requisitos:** revisão de segurança, inventário de segredos atual.
- **Passos principais:**
  1. Definir vault/local secure store padrão.
  2. Atualizar pipelines e scripts para leitura segura.
  3. Documentar procedimentos incident response.
  4. Validar ausência de segredos no repo e pipelines.
- **Entregáveis:** Playbook de segredos, validação em CI.
- **Evidências:** relatório de secret scan, checklists CI atualizados.

---

## Governança & Follow-up
- Atualizar `docs/archive/next-steps.md` e `docs/archive/ui-next-steps.md` após concluir cada atividade.
- Registrar descobertas adicionais no próximo ciclo de auditoria.
- Manter artefatos de evidência em `/docs/evidence/<ID>/` (padrão novo a ser seguido).

---

## Contatos de Escalação
- **UI:** @design-systems-lead / @frontend-lead
- **Backend:** @mcp-core-lead
- **Ops/SRE:** @platform-ops

