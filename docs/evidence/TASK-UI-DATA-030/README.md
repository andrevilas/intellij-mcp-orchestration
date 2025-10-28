# Evidências UI Kit

Este diretório armazena artefatos determinísticos gerados pelos testes E2E para o showcase do UI Kit.

- `axe-ui-kit.json`: relatório de acessibilidade produzido com axe-core a partir do fluxo `ui-kit-components.spec.ts`.
- `ui-kit-states.json`: instantâneo dos estados (default/loading/empty/error) renderizados para KPI, indicadores de progresso, tabela e cartão de detalhes utilizando os fixtures compartilhados.
- `2025-10-29-vitest.txt`: saída consolidada do Vitest exercitando Dashboard, Observability e FinOps após os ajustes da sprint UI M3.

Os arquivos são recriados durante a execução da suíte e podem ser utilizados para auditoria visual ou regressões de acessibilidade.

```bash
pnpm --dir app test \
  src/pages/Dashboard.test.tsx \
  src/pages/Observability.test.tsx \
  src/pages/FinOps.test.tsx \
  -- --runInBand
```
