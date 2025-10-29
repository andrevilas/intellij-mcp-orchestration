# Evidência — TASK-UI-PG-071 (Servers)

- **2025-10-28 15:22 UTC** — `pnpm --dir tests exec playwright test tests/e2e/servers-core.spec.ts`
  - ✅ Passou — fluxo de start/stop/restart auditado com fixtures locais.
- **2025-10-29 19:22 UTC** — `pnpm --dir tests exec playwright test tests/e2e/*core.spec.ts --trace on --reporter=line` (commit `afdfe67`)
  - ✅ Passou — suite core completa com fixtures; trace anexo (`2025-10-29-servers-trace.zip`).

Os artefatos históricos permanecem em `tests/test-results`. Para novas execuções, anexar o trace/resultados a este diretório e atualizar `docs/audit-ui-m1-m6.md`.
