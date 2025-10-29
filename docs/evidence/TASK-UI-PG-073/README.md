# Evidência — TASK-UI-PG-073 (Policies)

- **2025-10-28 15:25 UTC** — `pnpm --dir tests exec playwright test tests/e2e/policies-core.spec.ts`
  - ✅ Catálogo, aplicação e rollback governado validados com fixtures.
- **2025-10-29 19:22 UTC** — `pnpm --dir tests exec playwright test tests/e2e/*core.spec.ts --trace on --reporter=line` (commit `afdfe67`)
  - ✅ Suite core sob fixtures; traces anexados (`2025-10-29-policies-trace.zip`, `2025-10-29-ui-smoke-policies-trace.zip`).
- **2025-10-29 22:00 UTC** — Rodada completa `pnpm --dir tests exec playwright test --trace on --reporter=line` (log `docs/evidence/TASK-UI-PG-070/2025-10-29-ci-playwright.txt`). Falhas relacionadas a policies/config reload registradas abaixo.

### Follow-ups abertos (2025-10-29)
- `e2e/policies-hitl.spec.ts` — Conteúdo esperado do diff não bate com fixtures (`2025-10-29-policies-hitl-trace.zip`).
- `e2e/reload-artifact.spec.ts` (`@config-reload` apply/clean) — Mensagens de sucesso divergentes (“Artefato regenerado…” vs. “Plano aplicado…”). Trace: `2025-10-29-reload-apply-trace.zip`.

Os resultados padrão do Playwright permanecem em `tests/test-results`. Utilize este diretório para centralizar novos logs/traces.
