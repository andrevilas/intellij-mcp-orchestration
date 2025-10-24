# Evidências — TASK-UI-OBS-082

## Playbook de build de performance
- `pnpm --dir app run build:bundle-report` recompila o app com `ANALYZE_BUNDLE=1`, gera `metrics/bundle-visualizer.html` e `metrics/bundle-report.json` e publica cópias em `docs/evidence/TASK-UI-OBS-082/` via `scripts/publish-performance-artifacts.mjs`.
- `pnpm --dir app run lighthouse:ci` provisiona o Chrome headless (via `@puppeteer/browsers`) sempre que `LHCI_CHROME_PATH` não estiver definido, executa `lhci autorun` contra `vite preview` e salva os relatórios em `docs/evidence/TASK-UI-OBS-082/lighthouse/`.

## Métricas de bundle (dist/assets)
| Chunk | Tipo | Tamanho | Gzip |
| --- | --- | ---: | ---: |
| vendor-recharts-C1DrJ0hD | JS | 403.09 kB | 106.29 kB |
| vendor-reactflow-1obJ9cbP | JS | 284.16 kB | 92.14 kB |
| view-agents-zHZmxk6Z | JS | 158.07 kB | 49.24 kB |
| view-admin-chat-F5OCdkCk | JS | 104.97 kB | 26.35 kB |
| view-finops-BA-lHB-B | JS | 66.92 kB | 17.81 kB |
| index-CDmJmYRY | JS | 54.05 kB | 17.37 kB |
| view-security-BNHw1WOG | JS | 43.26 kB | 12.24 kB |
| view-ui-kit-qI4uvc7R | JS | 40.97 kB | 13.10 kB |
| view-admin-chat-D-DABHmK | CSS | 40.33 kB | 6.44 kB |
| view-finops-CLiuAyCl | CSS | 37.85 kB | 5.23 kB |

_Destaques_: os pacotes de terceiros seguem concentrados em `vendor-recharts` (403 kB) e `vendor-reactflow` (284 kB). Entre os views, `view-agents` e `view-admin-chat` continuam sendo os maiores, enquanto o bundle base (`index`) permanece abaixo de 55 kB graças ao carregamento via `React.lazy` dos módulos específicos. Os relatórios HTML/JSON desta coleta (gerados em 2025-10-24T08:36:40Z) estão publicados em `docs/evidence/TASK-UI-OBS-082/`.

## Lighthouse (ambiente local)
- O comando `pnpm --dir app run lighthouse:ci` usa `scripts/run-lighthouse-ci.mjs` para instalar o Chrome (cache em `app/.cache/chrome`). Em ambientes sem acesso à CDN do Chrome, defina `LHCI_CHROME_PATH`/`CHROME_PATH` para um binário existente.
- No container atual, o download via `@puppeteer/browsers install chrome@stable` falhou com HTTP 403 (provável restrição de rede), impedindo a coleta automática dos relatórios. Assim que houver Chrome disponível, os artefatos serão gravados em `docs/evidence/TASK-UI-OBS-082/lighthouse/` e deverão atender ao mínimo de 0.90 para Performance e Best Practices.
