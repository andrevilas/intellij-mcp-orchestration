# Relatório Lighthouse — atualização 2025-10-24

- Comando executado: `pnpm --dir app run lighthouse:ci`.
- O script `app/scripts/run-lighthouse-ci.mjs` agora instala automaticamente o Chrome via cache local, pacote `.deb` ou `apt-get` (com fallback para `fonts-liberation`, `libgtk-3-0`, etc.) antes de executar `lhci autorun --config=./lhci.config.cjs`.
- A configuração (`app/lhci.config.cjs`) mede o percurso `http://127.0.0.1:4173/?view=observability`, garantindo que o console abra na aba Observability durante a coleta.
- Resultado local de 24/10/2025 08:52 UTC:
  - Performance: **0.90**
  - Best Practices: **1.00**
- Artefatos publicados em `docs/evidence/TASK-UI-OBS-082/lighthouse/`:
  - `127_0_0_1-_-2025_10_24_08_52_49.report.html`
  - `127_0_0_1-_-2025_10_24_08_52_49.report.json`
- Referência rápida: `pnpm --dir app preview --host 0.0.0.0 --port 4173` levanta o servidor utilizado pelo `lhci` durante a coleta.
