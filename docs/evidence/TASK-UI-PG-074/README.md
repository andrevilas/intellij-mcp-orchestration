# Evidência — TASK-UI-PG-074 (Routing Lab)

- **2025-10-28 15:26 UTC** — `pnpm --dir tests exec playwright test tests/e2e/routing-core.spec.ts`
  - ✅ Geração/aplicação de plano e cenários de erro controlado validados com fixtures.
- **2025-10-29 19:22 UTC** — `pnpm --dir tests exec playwright test tests/e2e/*core.spec.ts --trace on --reporter=line` (commit `afdfe67`)
  - ✅ Suite core completa, incluindo caminhos positivos/negativos de roteamento; traces anexados (`2025-10-29-routing-plan-trace.zip`, `2025-10-29-routing-validation-trace.zip`).

Traces adicionais permanecem em `tests/test-results`. Registre novas execuções aqui e sincronize com os checklists de auditoria.
