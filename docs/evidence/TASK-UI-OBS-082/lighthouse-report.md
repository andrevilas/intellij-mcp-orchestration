# Relatório Lighthouse

- Comando: `pnpm --dir app run lighthouse:ci`
- Resultado: falha (Chrome não encontrado no ambiente de execução).【daf5d5†L1-L10】
- Tentativas subsequentes: instalação via `chromium-browser` (requer snap ativo) e `@puppeteer/browsers install chrome@stable` (download 403) — ambas indisponíveis neste container.【25154e†L1-L6】【6b90cf†L1-L3】【4ce451†L1-L37】
- Próximos passos: habilitar Chrome/Chromium na pipeline CI para rodar `lhci autorun` com os asserts definidos em `app/lhci.config.cjs`.
