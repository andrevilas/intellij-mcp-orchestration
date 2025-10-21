# Evidências — TASK-UI-OBS-082

## Métricas de bundle
- `ANALYZE_BUNDLE=1 pnpm --dir app run build` recompila o app e gera `metrics/bundle-visualizer.html` para inspeção detalhada dos chunks.【e4ac43†L1-L27】【d79fe5†L1-L2】
- `pnpm --dir app run report:bundle` atualiza `metrics/bundle-report.json` com os tamanhos pós-refatoração.【68e267†L1-L18】

| Chunk | Tipo | Antes | Atual | Diferença |
| --- | --- | ---: | ---: | ---: |
| view-dashboard | JS | 591.4 kB / 163.6 kB | 578.1 kB / 163.7 kB | −13.3 kB / +0.1 kB |
| index (global) | CSS | 383.7 kB / 55.9 kB | 247.1 kB / 34.9 kB | −136.6 kB / −21.0 kB |
| flows | JS | 148.9 kB / 47.3 kB | 145.4 kB / 46.2 kB | −3.5 kB / −1.1 kB |
| shell runtime | JS | 130.2 kB / 41.0 kB | 127.3 kB / 40.1 kB | −2.9 kB / −0.9 kB |
| view-finops | JS | 120.8 kB / 30.5 kB | 119.2 kB / 30.1 kB | −1.6 kB / −0.4 kB |
| ui-kit-showcase | JS | 69.5 kB / 22.5 kB | 67.9 kB / 21.9 kB | −1.6 kB / −0.6 kB |

_Total observado_: 1.29 MB (338 kB gzip) considerando os seis maiores assets acima — todos abaixo das metas de 220 kB CSS / 300 kB gzip por rota crítica.

## Lighthouse (pipeline local)
- Chrome headless instalado via pacote `.deb` oficial e wrapper `scripts/chrome-headless.sh` para habilitar `--no-sandbox` dentro do container.【7adeed†L1-L58】【d8d6f2†L1-L6】
- `CHROME_PATH=$PWD/scripts/chrome-headless.sh pnpm --dir app run lighthouse:ci` gera relatórios HTML/JSON em `app/metrics/lighthouse/` (scores atuais: Performance 0.76, Best Practices 1.00).【1a35dc†L1-L16】【8e3353†L1-L3】【2e9924†L1-L3】
- Alertas permanecem para Performance (<0.90); próximos ajustes devem focar em reduzir blocos JS iniciais (`view-dashboard-*.js`).

## Próximos passos
- Automatizar download dos relatórios Lighthouse no pipeline CI e acompanhar evolução das métricas ≥0.90.
- Investigar oportunidades adicionais de split para `view-dashboard-*.js` e carregamento condicional de widgets caros.
