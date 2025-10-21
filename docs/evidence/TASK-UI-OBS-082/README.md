# Evidências — TASK-UI-OBS-082

## Métricas de bundle
- `ANALYZE_BUNDLE=1 pnpm --dir app run build` recompila o app, ativa o visualizer e grava `metrics/bundle-visualizer.html` com a visão de treemap dos novos chunks `view-*`.【f84ec6†L1-L26】
- `pnpm --dir app run report:bundle` exporta os principais assets já minificados para `metrics/bundle-report.json`, útil para comparar tamanhos sem abrir o HTML do relatório.【062343†L1-L12】

| Chunk | Tipo | Tamanho | Gzip |
| --- | --- | ---: | ---: |
| view-dashboard | JS | 570.48 kB | 161.49 kB |
| view-flows | JS | 145.41 kB | 46.24 kB |
| view-ui-kit | JS | 129.19 kB | 41.17 kB |
| view-admin-chat | JS | 110.74 kB | 28.18 kB |
| view-finops | JS | 66.62 kB | 17.70 kB |
| index | JS | 63.83 kB | 19.91 kB |
| view-agents | JS | 46.94 kB | 12.81 kB |
| view-security | JS | 42.52 kB | 11.95 kB |
| view-admin-chat | CSS | 40.33 kB | 6.44 kB |
| view-finops | CSS | 37.85 kB | 5.23 kB |

_Destaques_: o CSS global (`dist/assets/index-*.css`) caiu para 28.23 kB (5.00 kB gzip) após remover Bootstrap e criar estilos utilitários sob medida.【f84ec6†L1-L10】

## Lighthouse (ambiente local)
- `pnpm --dir app run lighthouse:ci` falha porque o ambiente não traz Chrome/Chromium pré-instalado; o comando aborta ao validar o healthcheck do `lhci`.【daf5d5†L1-L10】
- Tentativas de instalar um navegador (apt `chromium-browser` → exige snapd funcional; `@puppeteer/browsers install chrome@stable` → download bloqueado com HTTP 403) não foram bem-sucedidas neste container.【25154e†L1-L6】【6b90cf†L1-L3】【4ce451†L1-L37】
- Para gerar relatórios ≥90 localmente será preciso disponibilizar um binário Chrome headless ou ajustar a pipeline CI para rodar em um runner com navegador compatível.

## Próximos passos
- Automatizar a publicação de `metrics/bundle-visualizer.html` e `bundle-report.json` em cada build de performance.
- Disponibilizar um binário Chrome (via cache de artefatos ou runner dedicado) para destravar o `lhci autorun` e registrar as métricas de Lighthouse.
- Avaliar lazy loading adicional dentro de `view-dashboard` para reduzir o bundle inicial abaixo de 500 kB.
