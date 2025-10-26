# Evidências — TASK-UI-OBS-082

Para instruções operacionais e checklist contínuo, consulte o
[guia de performance do UI Kit](../../ui-kit/performance.md).

## Playbook de build de performance
- `pnpm run evidence:ui-obs-082` executa o fluxo completo (bundle + Lighthouse) reaproveitando o `dist/` gerado e copiando os artefatos consolidados para `docs/evidence/TASK-UI-OBS-082/`.
- `pnpm --dir app run build:bundle-report` recompila o app com `ANALYZE_BUNDLE=1`, gera `metrics/bundle-visualizer.html` e `metrics/bundle-report.json` e publica cópias em `docs/evidence/TASK-UI-OBS-082/` via `scripts/publish-performance-artifacts.mjs`. Para builds locais sem TypeScript limpo, exporte `SKIP_TYPECHECK=1`.
- `pnpm --dir app run lighthouse:ci` provisiona o Chrome headless (via `@puppeteer/browsers`, pacote `.deb` ou `apt-get` para dependências faltantes) sempre que `LHCI_CHROME_PATH` não estiver definido, executa `lhci autorun` contra `vite preview` e salva os relatórios em `docs/evidence/TASK-UI-OBS-082/lighthouse/`. Caso `dist/` já esteja pronto, exporte `LHCI_SKIP_BUILD=true` para reutilizar o build.

## Métricas de bundle (dist/assets)
| Chunk | Tipo | Tamanho | Gzip |
| --- | --- | ---: | ---: |
| vendor-recharts-CPRMPhAO | JS | 403.09 kB | 106.29 kB |
| vendor-reactflow-ZVTnSMpK | JS | 284.16 kB | 92.14 kB |
| view-admin-chat-BZhbUW_4 | JS | 247.69 kB | 72.60 kB |
| view-finops-CKDsogRx | JS | 68.68 kB | 18.31 kB |
| view-admin-chat-BOnUYAmx | CSS | 60.17 kB | 9.61 kB |
| view-agents--seYyXOD | JS | 51.77 kB | 14.48 kB |
| view-ui-kit-BjyihfDZ | JS | 49.02 kB | 15.41 kB |
| index-BrmabLhA | JS | 39.28 kB | 12.92 kB |
| view-security-CljM04qA | JS | 39.27 kB | 11.14 kB |
| view-finops-RU1ND4dF | CSS | 36.88 kB | 5.28 kB |

_Destaques_: o orçamento agregado de CSS ficou em **214.69 kB** (limite 220 kB) após habilitar o `cssnano` no build de produção. Os pacotes de terceiros seguem concentrados em `vendor-recharts` (403 kB) e `vendor-reactflow` (284 kB). Entre as views, `view-admin-chat` lidera tanto em JS quanto CSS, enquanto o bundle base (`index`) permanece abaixo de 40 kB graças ao carregamento via `React.lazy`. Os relatórios HTML/JSON desta coleta (gerados em 2025-10-26T18:57:45Z) estão publicados em `docs/evidence/TASK-UI-OBS-082/`.

## Lighthouse (ambiente local)
- O comando `pnpm --dir app run lighthouse:ci` usa `scripts/run-lighthouse-ci.mjs` para instalar o Chrome (cache em `app/.cache/chrome`, download `.deb` ou fallback `apt-get`). Caso o ambiente possua um binário pré-instalado, é possível apontar `LHCI_CHROME_PATH`/`CHROME_PATH` para reutilizá-lo.
- A configuração de coleta (`app/lhci.config.cjs`) força a abertura da aba Observability (`?view=observability`) e aplica throttling devtools com `cpuSlowdownMultiplier: 1` para medir o shell desktop.
- Execução em 24/10/2025 08:52 UTC:
  - Performance: **0.90**
  - Best Practices: **1.00**
- Relatórios disponíveis em `docs/evidence/TASK-UI-OBS-082/lighthouse/127_0_0_1-_-2025_10_24_08_52_49.report.{html,json}`.
