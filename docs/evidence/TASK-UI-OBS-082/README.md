# Evidências — TASK-UI-OBS-082

## Playbook de build de performance
- `pnpm --dir app run build:bundle-report` recompila o app com `ANALYZE_BUNDLE=1`, gera `metrics/bundle-visualizer.html` e `metrics/bundle-report.json` e publica cópias em `docs/evidence/TASK-UI-OBS-082/` via `scripts/publish-performance-artifacts.mjs`.
- `pnpm --dir app run lighthouse:ci` provisiona o Chrome headless (via `@puppeteer/browsers`, pacote `.deb` ou `apt-get` para dependências faltantes) sempre que `LHCI_CHROME_PATH` não estiver definido, executa `lhci autorun` contra `vite preview` e salva os relatórios em `docs/evidence/TASK-UI-OBS-082/lighthouse/`.

## Métricas de bundle (dist/assets)
| Chunk | Tipo | Tamanho | Gzip |
| --- | --- | ---: | ---: |
| view-finops | JS | 613.28 kB | 171.11 kB |
| view-flows | JS | 145.44 kB | 46.25 kB |
| view-ui-kit | JS | 129.22 kB | 41.19 kB |
| view-admin-chat | JS | 110.74 kB | 28.18 kB |
| index | JS | 62.87 kB | 19.48 kB |
| view-dashboard | JS | 22.63 kB | 7.83 kB |
| view-observability | JS | 20.09 kB | 6.27 kB |
| visual-sections | JS | 4.68 kB | 1.88 kB |
| metrics-visuals | JS | 2.47 kB | 0.95 kB |

_Destaques_: os gráficos do dashboard e da página de observabilidade agora são carregados via `React.lazy`, deixando `view-dashboard` em ~23 kB e movendo as bibliotecas do `recharts` para chunks separados de até 5 kB. Os formatadores numéricos foram extraídos para módulos compartilhados (`pages/dashboard/formatters.ts` e `pages/observability/formatters.ts`) reutilizados pelos gráficos e pelos KPIs.

## Lighthouse (ambiente local)
- O comando `pnpm --dir app run lighthouse:ci` usa `scripts/run-lighthouse-ci.mjs` para instalar o Chrome (cache em `app/.cache/chrome`, download `.deb` ou fallback `apt-get`). Caso o ambiente possua um binário pré-instalado, é possível apontar `LHCI_CHROME_PATH`/`CHROME_PATH` para reutilizá-lo.
- A configuração de coleta (`app/lhci.config.cjs`) força a abertura da aba Observability (`?view=observability`) e aplica throttling devtools com `cpuSlowdownMultiplier: 1` para medir o shell desktop.
- Execução em 24/10/2025 08:52 UTC:
  - Performance: **0.90**
  - Best Practices: **1.00**
- Relatórios disponíveis em `docs/evidence/TASK-UI-OBS-082/lighthouse/127_0_0_1-_-2025_10_24_08_52_49.report.{html,json}`.
