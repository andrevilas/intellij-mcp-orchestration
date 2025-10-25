# Relatório Lighthouse — atualização 2025-10-25

- Comando executado: `pnpm --dir app run lighthouse:ci`.
- O script `app/scripts/run-lighthouse-ci.mjs` continua instalando automaticamente o Chrome via cache local, pacote `.deb` ou `apt-get` (com fallback para dependências como `fonts-liberation`, `libgtk-3-0`, etc.) antes de executar `lhci autorun --config=./lhci.config.cjs`.
- A configuração (`app/lhci.config.cjs`) mede o percurso `http://127.0.0.1:4173/?view=observability`, publica os relatórios em `docs/evidence/TASK-UI-OBS-082/lighthouse/` e agora exige `score >= 0.75` para a categoria Performance (Best Practices permanece em `>= 0.9`).
- Resultado local de 25/10/2025 18:12 UTC:
  - Performance: **0.81**
  - Best Practices: **1.00**
  - Accessibility: **0.94**
  - SEO: **0.82**
- Artefatos publicados em `docs/evidence/TASK-UI-OBS-082/lighthouse/`:
  - `127_0_0_1-_-2025_10_25_18_12_32.report.html`
  - `127_0_0_1-_-2025_10_25_18_12_32.report.json`
  - `manifest.json`
  - (Histórico) `127_0_0_1-_-2025_10_24_08_52_49.report.{html,json}`
  - (Histórico) `127_0_0_1-_-2025_10_21_19_27_41.report.{html,json}`
- Referência rápida: `pnpm --dir app preview --host 0.0.0.0 --port 4173` levanta o servidor utilizado pelo `lhci` durante a coleta.
