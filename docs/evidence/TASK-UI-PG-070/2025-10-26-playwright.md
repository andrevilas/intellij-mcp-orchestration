# Execução Playwright — 2025-10-26

- **Comando**: `pnpm --dir tests exec playwright test`
- **Ambiente**: contêiner Ubuntu 24.04 (root), com `pnpm exec playwright install-deps` executado previamente.
- **Resultado**: o Vite sobe em modo fixtures e as 49 specs Chromium executam sem abortar, embora falhem em validações de fluxo
de negócio (ex.: agent governance, marketplace, observability).【e12ebc†L1-L21】【6aa09c†L1-L168】
- **Observações**: a suite agora alcança asserções de UI; os erros decorrem de comportamentos da aplicação (ex.: elementos não
renderizados, múltiplos botões "Gerar plano"). Investigar cenários listados na saída agregada do Playwright.【6aa09c†L169-L305】
