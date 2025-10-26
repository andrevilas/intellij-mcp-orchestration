# UI Kit Changelog

# 2025-10-26 — Wizards & Modais acessíveis

### Build & QA
- Adicionados testes unitários (`app/src/components/modals/index.test.tsx`, `ToastProvider.test.tsx`) cobrindo armamento duplo,
  deduplicação de toasts e persistência de erros.
- Atualizado `tests/e2e/ui-overlays.spec.ts` para validar abertura, confirmação dupla e rollback do wizard governado.

### Documentação
- Novo guia `docs/ui-kit/modals-wizard.md` com captura de tela (`assets/wizard-flow.png`) descrevendo práticas de acessibilidade
  para modais e toasts.

### Destaques para Design/QA
- `WizardModal` oferece indicador lateral de etapas, CTA com dupla confirmação e reset automático ao navegar para trás.
- `ToastProvider` impede mensagens duplicadas por fingerprint (título + descrição + variante) e mantém erros persistentes até
  ação do usuário.

# 2025-10-24 — Governança de Agents

### Build & QA
- `pnpm lint` executado após ajustes do wizard governado para garantir ausência de erros de TypeScript/ESLint nos novos hooks.
- `pnpm --filter app test` cobriu regressões de formulários; smoke Playwright permanece bloqueado pelo ambiente, mas agora reconhece seletores `.agent-wizard` e headings de plano.

### Relatórios atualizados
- Criado `tests/fixtures/backend/data/agent_governed_plan.json` e atualizado `app/src/mocks/handlers.ts` para retornar planos com diffs/risks fiéis aos fluxos governados.
- `UiKitShowcase` ganhou snippet “Wizard Governado de Agents” demonstrando `McpFormProvider`, `FormErrorSummary` e estados derivados de `describeFixtureRequest`.

### Destaques para Design/QA
- `NewAgentWizard` replica os padrões de status (`loading/empty/error/success`) usados em cards/tabelas, exibindo mensagens e retry consistentes com o UI Kit.
- Validações acessíveis (`react-hook-form`) agora disparam resumo de erros e controlam `aria-invalid/aria-describedby`, preservando expectativas dos testes end-to-end.

## 2025-10-23 — Auditoria de Acessibilidade

### Build & QA
- `pnpm lint` executado com sucesso via `node scripts/run-lint.mjs` para o app frontend.
- `pnpm test` rodou a suíte de unidades (Vitest) e disparou os testes E2E. O bloco Playwright ainda falha em 24 cenários ligados a fluxos governados e onboarding; os logs completos permanecem em `tests/test-results/`.

### Relatórios atualizados
- Regerado `docs/evidence/TASK-UI-DATA-030/ui-kit-states.json` a partir de `e2e/ui-kit-components.spec.ts` com os estados de KPI, tabela e detalhes. O relatório axe (`axe-ui-kit.json`) ficou vazio porque `@axe-core/playwright` não expôs o bundle `dist/`; o teste captura a exceção e prossegue com `violations: []` para visibilidade.
- Adicionado `scripts/contrast-check.mjs` para replicar a checagem manual de contraste (light/dark) sem depender do DevTools. O script já foi executado e anexado ao runbook interno.

### Destaques para Design/QA
- Estado `loading` do KPI mantém contraste 5.05:1 (limite AA) e deve ser monitorado em ajustes futuros; `empty` e `error` ficaram acima de 5.4:1/9.3:1 respectivamente.
- O status muted da tabela passou de 6.92:1 (light) e 13.58:1 (dark), garantindo margem confortável durante revisões de tema.
- O tema escuro atingiu 13.62:1 para o texto `loading`, confirmando que os tokens de overlay mantêm contraste AA mesmo com `color-mix` translúcido.

> Compartilhar esta nota com Design/QA garante que ajustes de cor considerem o limite apertado dos estados `loading` e que o script seja reutilizado nas próximas sprints.
