# Evidências — TASK-UI-PG-070

## Execução dos testes
- Comando: `PLAYWRIGHT_VIDEO=on PLAYWRIGHT_TRACE=on pnpm --dir tests exec playwright test`
- Data: 2025-10-24 00:40 UTC (chromium, 1 worker).
- Resultado: ❌ Falha antes da execução das specs — o host de CI local não possui as dependências de sistema exigidas pelo Chromium/Playwright (`libatk1.0-0t64`, `libxkbcommon0`, `libasound2t64`, etc.).【c726ac†L7-L162】

Os relatórios (`test-results/**/trace.zip`) foram mantidos na pasta padrão `tests/test-results`. Para habilitar a suíte em ambientes limpos, instale os pacotes listados pelo Playwright (`pnpm exec playwright install-deps`) ou habilite a camada de cache de navegadores do pipeline.

## Histórico de reexecuções

- **2025-10-26 10:05 UTC** — `pnpm --dir tests exec playwright test` executa 49 specs Chromium com Vite em modo fixtures. Asserções de negócio ainda falham (ex.: agent governance, marketplace), mas não há mais abortos por dependências ausentes. Ver detalhes em `2025-10-26-playwright.md`.【F:docs/evidence/TASK-UI-PG-070/2025-10-26-playwright.md†L1-L6】
- **2025-10-28 15:20 UTC** — `pnpm --dir tests exec playwright test tests/e2e/dashboard-core.spec.ts` confirma o dashboard governado com fixtures (KPIs, recortes estendidos) em ambiente local estável. Log preservado no histórico padrão (`tests/test-results`).【F:tests/e2e/dashboard-core.spec.ts†L1-L120】
- **2025-10-29 19:22 UTC** — `pnpm --dir tests exec playwright test tests/e2e/*core.spec.ts --trace on --reporter=line` concluiu 13/13 specs com sucesso sob modo fixtures (commit `afdfe67`). Log armazenado em `2025-10-29-playwright-core.txt` e traces anexados (`2025-10-29-dashboard-trace.zip`, `2025-10-29-ui-smoke-dashboard-trace.zip`). Nenhum follow-up aberto.
- **2025-10-29 22:00 UTC** — Rodada completa `pnpm --dir tests exec playwright test --trace on --reporter=line` (log em `2025-10-29-ci-playwright.txt`). Falha remanescente: `e2e/ui-overlays.spec.ts` (botão “Notificações” não renderizado/timeout). Trace: `2025-10-29-ui-overlays-trace.zip`.
- **2025-10-29 23:23 UTC** — Reteste direcionado `pnpm --dir tests exec playwright test tests/e2e/ui-overlays.spec.ts --reporter=line` confirma 1/1 spec verde após corrigir o `confirmArmedHint` do wizard governado (`app/src/components/modals/WizardModal.tsx`). Log: `2025-10-29-ui-overlays-retest.txt`.
- **2025-10-29 23:50 UTC** — Nova rodada `pnpm --dir tests exec playwright test --trace on --reporter=line` cobre as 51 specs com os ajustes consolidados. Log: `2025-10-29-playwright-full.txt`; traces mantidos em `tests/test-results/**`.

### Follow-ups abertos (2025-10-29)
- Nenhum follow-up pendente após o reteste de 2025-10-29 23:23 UTC. Histórico mantido para rastreabilidade nos arquivos acima.
