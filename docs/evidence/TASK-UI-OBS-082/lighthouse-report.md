# Relatório Lighthouse — atualização 2025-10-28

- Comando executado: `pnpm --dir app run lighthouse:ci`.
- O script `app/scripts/run-lighthouse-ci.mjs` continua instalando automaticamente o Chrome via cache local, pacote `.deb` ou `apt-get` (com fallback para dependências como `fonts-liberation`, `libgtk-3-0`, etc.) antes de executar `lhci autorun --config=./lhci.config.cjs`.
- A configuração (`app/lhci.config.cjs`) mede o percurso `http://127.0.0.1:4173/?view=observability`, publica os relatórios em `docs/evidence/TASK-UI-OBS-082/lighthouse/` e agora exige `score >= 0.75` para a categoria Performance (Best Practices permanece em `>= 0.9`).
- Resultado local de 28/10/2025 17:26 UTC:
  - Performance: **0.90**
  - Best Practices: **0.96**
  - Accessibility: **0.94**
  - SEO: **0.82**
- Artefatos publicados em `docs/evidence/TASK-UI-OBS-082/lighthouse/`:
  - `127_0_0_1-_-2025_10_28_17_26_39.report.{html,json}`
  - `127_0_0_1-_-2025_10_28_17_24_34.report.{html,json}` (execução anterior no mesmo dia)
  - `manifest.json`
  - Histórico preservado das rodadas de 26/10, 24/10 e 21/10.
- Referência rápida: `pnpm --dir app preview --host 0.0.0.0 --port 4173` levanta o servidor utilizado pelo `lhci` durante a coleta.
