# Relatório Lighthouse

- Comando: `pnpm --dir app run lighthouse:ci`
- Resultado: falha (Chrome não encontrado no ambiente de execução).【f902e5†L1-L6】
- Próximos passos: habilitar Chrome/Chromium na pipeline CI para rodar `lhci autorun` com os asserts definidos em `app/lhci.config.cjs`.
