# Evidências — TASK-UI-FORM-040

- `forms-tab-order.json`: ordem de foco (Tab) capturada via `tests/e2e/forms-controls.spec.ts`.
- `FormControls.test.tsx`: cobertura Vitest para `FormErrorSummary` e `InputGroup` com validação declarativa.
- Documentação atualizada em `docs/forms/README.md` (controles, validação e upload/download).

> Execute `pnpm --dir app test` e `pnpm --dir tests test -- --grep forms-controls` para replicar os resultados.
