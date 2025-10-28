# Evidências — TASK-UI-OBS-082

Para instruções operacionais e checklist contínuo, consulte o
[guia de performance do UI Kit](../../ui-kit/performance.md).

## Playbook de build de performance
- `pnpm run evidence:ui-obs-082` executa o fluxo completo (bundle + Lighthouse) reaproveitando o `dist/` gerado e copiando os artefatos consolidados para `docs/evidence/TASK-UI-OBS-082/`.
- `pnpm --dir app run build:bundle-report` recompila o app com `ANALYZE_BUNDLE=1`, gera `metrics/bundle-visualizer.html` e `metrics/bundle-report.json` e publica cópias em `docs/evidence/TASK-UI-OBS-082/` via `scripts/publish-performance-artifacts.mjs`. Para builds locais sem TypeScript limpo, exporte `SKIP_TYPECHECK=1`.
- `pnpm --dir app run lighthouse:ci` provisiona o Chrome headless (via `@puppeteer/browsers`, pacote `.deb` ou `apt-get` para dependências faltantes) sempre que `LHCI_CHROME_PATH` não estiver definido, executa `lhci autorun` contra `vite preview` e salva os relatórios em `docs/evidence/TASK-UI-OBS-082/lighthouse/`. Caso `dist/` já esteja pronto, exporte `LHCI_SKIP_BUILD=true` para reutilizar o build.

## Métricas de bundle (dist/assets)
| Asset | Tipo | Tamanho | Gzip |
| --- | --- | ---: | ---: |
| generateCategoricalChart-CgO3yDsp.js | JS | 356.24 kB | 97.12 kB |
| index-E8zTdNPG.js | JS | 309.50 kB | 95.78 kB |
| Flows-Br6YXNZi.js | JS | 147.84 kB | 47.26 kB |
| FinOps-CFcWD5qg.js | JS | 63.05 kB | 16.11 kB |
| index-CD-vx779.js | JS | 58.60 kB | 16.28 kB |
| UiKitShowcase-BNmV1dOf.js | JS | 48.64 kB | 15.41 kB |
| Agents-C3huNBUJ.js | JS | 46.01 kB | 12.74 kB |
| visual-sections-DypSsalq.js | JS | 41.86 kB | 10.77 kB |
| Security-DsLqV7UC.js | JS | 39.33 kB | 11.19 kB |
| index-DtwPWf7g.css | CSS | 37.87 kB | 6.44 kB |

_Destaques (28/10/2025)_: o orçamento agregado de CSS ficou em **214.70 kB** (limite 220 kB) com `cssnano` habilitado no build de produção. Os maiores blocos continuam concentrados em componentes de visualização (`generateCategoricalChart`, `Flows`, `FinOps`), enquanto o bundle base (`index`) permanece <60 kB graças ao `React.lazy`. Os relatórios atualizados (`bundle-report.json` e `bundle-visualizer.html`) foram sincronizados a partir de `pnpm --dir app run build:bundle-report`.

## Lighthouse (ambiente local)
- O comando `pnpm --dir app run lighthouse:ci` usa `scripts/run-lighthouse-ci.mjs` para instalar o Chrome (cache em `app/.cache/chrome`, download `.deb` ou fallback `apt-get`). Caso o ambiente possua um binário pré-instalado, é possível apontar `LHCI_CHROME_PATH`/`CHROME_PATH` para reutilizá-lo.
- A configuração de coleta (`app/lhci.config.cjs`) força a abertura da aba Observability (`?view=observability`) e aplica throttling devtools com `cpuSlowdownMultiplier: 1` para medir o shell desktop.
- Execução em 24/10/2025 08:52 UTC:
  - Performance: **0.90**
  - Best Practices: **1.00**
- Relatórios disponíveis em `docs/evidence/TASK-UI-OBS-082/lighthouse/127_0_0_1-_-2025_10_24_08_52_49.report.{html,json}`.
