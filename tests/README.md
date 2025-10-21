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
datasets compartilhados com o backend (`server/routes/fixtures`). Incluímos catálogos adicionais
(`agents.json`, `smoke_endpoints.json`) para cobrir os fluxos de Agents e smoke tests usando as
mesmas estruturas esperadas pela API.

## Modo fixture-only

Quando o backend FastAPI não está acessível localmente, o `vite.config.ts` força automaticamente o
modo fixtures mesmo que `CONSOLE_MCP_USE_FIXTURES=off`. Durante os testes o Playwright também
habilita o modo fixtures ao sobrescrever `page.goto`/`page.reload`. Após cada navegação os helpers
aguardam o `networkidle` para garantir que o service worker do MSW esteja pronto antes das
asserções.

Para consumir os mesmos dados nos testes, utilize `loadBackendFixture`:

```ts
import { loadBackendFixture } from './fixtures';

const sessions = await loadBackendFixture<{ sessions: unknown[] }>('sessions.json');
```

O helper funciona via `import(..., { with: { type: 'json' } })`, possibilitando reuso direto dos
JSONs versionados em `tests/fixtures/backend`.

O worker do MSW roda com `onUnhandledRequest: 'error'`, portanto qualquer endpoint ausente irá
falhar explicitamente durante os testes. O helper também limpa `localStorage`/`sessionStorage`
antes da primeira navegação para evitar interferências entre cenários.

Caso seja necessário validar contra um backend real, ajuste `CONSOLE_MCP_USE_FIXTURES=off` tanto
na linha de comando quanto na configuração do Playwright, e remova o override de `page.goto`/`page.reload`
no helper antes de rodar os testes.
