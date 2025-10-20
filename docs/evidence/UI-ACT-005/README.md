# UI-ACT-005 — Fixture Toggle Evidence

## Resumo
- `CONSOLE_MCP_USE_FIXTURES` ativa automaticamente o modo offline quando o backend não responde. O Vite injeta `VITE_CONSOLE_USE_FIXTURES` e o `main.tsx` inicia os handlers do MSW, expondo o status via `window.__CONSOLE_MCP_FIXTURES__`.
- Os handlers do MSW leem os payloads versionados em `tests/fixtures/backend` (mirrors em `server/routes/fixtures`) para cobrir dashboards, servidores, FinOps e Routing.
- Playwright utiliza `tests/e2e/fixtures.ts` para aguardar o worker de fixtures via `waitForFixtureWorker`.

## Testes executados
- `pnpm --dir app exec vitest run src/pages/FinOps.test.tsx` ✅【7e705a†L1-L9】
- `pnpm --dir app exec vitest run src/test/McpServersList.test.tsx` ✅【6a1f36†L1-L9】
- `pnpm --dir app exec vitest run src/pages/Dashboard.test.tsx` ✅【d9a7a7†L1-L9】
- `pnpm --dir app exec vitest run src/pages/Routing.test.tsx` ⚠️ Espera adicional da suíte (6 chamadas vs 4); permanece pendente para revisão.【47bcfb†L1-L27】【47bcfb†L70-L78】
- `pnpm --dir tests exec playwright test dashboard.spec.ts` ⚠️ Falha por requisito de `import` JSON com atributo em runtime Node ESM; ajustes futuros no setup do Playwright ainda necessários.【f795a9†L1-L6】

## Observações
- As fixtures adicionadas (`servers*.json`, `sessions.json`, `notifications.json`, `policy_manifest.json`, `telemetry_experiments.json`, etc.) são replicadas em `server/routes/fixtures` para manter paridade.
- Vitest já inicializa `__CONSOLE_MCP_FIXTURES__ = 'ready'` via `app/src/test/setup.ts`, permitindo que os helpers Playwright/Vitest identifiquem o modo ativo.
