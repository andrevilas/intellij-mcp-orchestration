# Evidências UI Kit

Este diretório armazena artefatos determinísticos gerados pelos testes E2E para o showcase do UI Kit.

- `axe-ui-kit.json`: relatório de acessibilidade produzido com axe-core a partir do fluxo `ui-kit-components.spec.ts`.
- `ui-kit-states.json`: instantâneo dos estados (default/loading/empty/error) renderizados para KPI, indicadores de progresso, tabela e cartão de detalhes utilizando os fixtures compartilhados.

Os arquivos são recriados durante a execução da suíte e podem ser utilizados para auditoria visual ou regressões de acessibilidade.
