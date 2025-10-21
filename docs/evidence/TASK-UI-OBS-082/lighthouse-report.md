# Relatório Lighthouse

- Comando: `pnpm --dir app run lighthouse:ci`
- Fluxo: `scripts/run-lighthouse-ci.mjs` garante um Chrome headless (cache em `app/.cache/chrome`) com `@puppeteer/browsers`, exporta `LHCI_CHROME_PATH` e executa `lhci autorun --config=./lhci.config.cjs`.
- Status no container atual: falha na instalação do Chrome (HTTP 403 ao baixar `chrome@stable`), portanto nenhum relatório foi emitido. Assim que houver um binário disponível (ex.: definir `LHCI_CHROME_PATH=/usr/bin/google-chrome` ou usar cache de artefatos no CI), os resultados serão gravados em `docs/evidence/TASK-UI-OBS-082/lighthouse/` e devem cumprir os asserts `performance ≥ 0.90` e `best-practices ≥ 0.90`.
