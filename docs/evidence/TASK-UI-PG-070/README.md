# Evidências — TASK-UI-PG-070

## Execução dos testes
- Comando: `PLAYWRIGHT_VIDEO=on PLAYWRIGHT_TRACE=on pnpm --dir tests exec playwright test`
- Data: 2025-10-24 00:40 UTC (chromium, 1 worker).
- Resultado: ❌ Falha antes da execução das specs — o host de CI local não possui as dependências de sistema exigidas pelo Chromium/Playwright (`libatk1.0-0t64`, `libxkbcommon0`, `libasound2t64`, etc.).【c726ac†L7-L162】

Os relatórios (`test-results/**/trace.zip`) foram mantidos na pasta padrão `tests/test-results`. Para habilitar a suíte em ambientes limpos, instale os pacotes listados pelo Playwright (`pnpm exec playwright install-deps`) ou habilite a camada de cache de navegadores do pipeline.
