# Testes automatizados da Console MCP

Este diretório concentra a suíte Playwright utilizada para validar as páginas core do frontend
(Dashboard, Servers, Routing e FinOps). Os testes são executados exclusivamente em modo fixture,
sem depender do backend FastAPI.

## Pré-requisitos

- Node.js >= 18.18
- pnpm >= 8

## Execução

```bash
pnpm --dir tests exec playwright test            # executa toda a suíte em modo headless
pnpm --dir tests exec playwright test dashboard  # executa um arquivo específico
```

Ao inicializar, o Playwright dispara `pnpm --dir ../app exec vite ...` já com
`CONSOLE_MCP_USE_FIXTURES=force` (ver `tests/playwright.config.ts`). O Vite, por sua vez,
injeta `import.meta.env.VITE_CONSOLE_USE_FIXTURES`, garantindo que `app/src/main.tsx`
registre o status em `window.__CONSOLE_MCP_FIXTURES__`.

O helper `tests/e2e/fixtures.ts` aguarda o worker do MSW após cada navegação (`page.goto` ou
`page.reload`), reutilizando `waitForFixtureWorker` com timeout padrão de 10 segundos.
As respostas servidas provêm dos JSONs versionados em `tests/fixtures/backend`, refletindo os
datasets compartilhados com o backend (`server/routes/fixtures`).

Caso seja necessário validar contra um backend real, ajuste `CONSOLE_MCP_USE_FIXTURES=off` tanto
na linha de comando quanto na configuração do Playwright, e remova o override de `page.goto`/`page.reload`
no helper antes de rodar os testes.
