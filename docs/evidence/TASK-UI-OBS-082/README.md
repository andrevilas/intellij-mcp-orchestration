# Evidências — TASK-UI-OBS-082

## Métricas de bundle
- `pnpm --dir app exec -- vite build` gera os artefatos de produção com chunks separados por rota crítica (Dashboard, Servers, FinOps, UiKit).【bffd0a†L1-L24】
- `pnpm --dir app run report:bundle` consolida tamanhos em `bundle-report.json` (copiado abaixo).【2476a5†L1-L14】【9be0b5†L1-L68】

| Chunk | Tipo | Tamanho | Gzip |
| --- | --- | ---: | ---: |
| view-dashboard | JS | 591.4 kB | 163.6 kB |
| index (global) | CSS | 383.7 kB | 55.9 kB |
| flows | JS | 148.9 kB | 47.3 kB |
| shell runtime | JS | 130.2 kB | 41.0 kB |
| view-finops | JS | 120.8 kB | 30.5 kB |
| ui-kit-showcase | JS | 69.5 kB | 22.5 kB |

_Total build_: 1.69 MB (451 kB gzip) considerando assets JS/CSS monitorados.

## Lighthouse (pipeline local)
- `pnpm --dir app run lighthouse:ci` configurado com `lhci autorun` + preview Vite. Execução falhou por ausência de Chrome no ambiente, impedindo coleta automática, mas a configuração garante asserts ≥0.90 para Performance/Best Practices em ambientes com navegador instalado.【f902e5†L1-L6】

## Próximos passos
- Publicar relatórios Lighthouse assim que Chrome estiver disponível na stack CI.
- Reduzir os bundles `view-dashboard` e `index` abaixo de 300 kB gzip (acompanhar com o visualizer gerado em `metrics/bundle-visualizer.html` quando `ANALYZE_BUNDLE=1`).
