# Relatórios de performance do UI Kit

Os relatórios de bundle e Lighthouse agora são publicados em `docs/ui-kit/performance/`.

## Como gerar

```bash
cd app
pnpm install
pnpm run report:performance
```

O comando executa o build otimizado com análise, gera o relatório de bundle (`bundle-report.json` e `bundle-visualizer.html`) e roda o Lighthouse CI com saída em `docs/ui-kit/performance/lighthouse/`.

Caso apenas os artefatos de bundle sejam necessários, utilize:

```bash
pnpm run build:bundle-report
```

## Limites de CSS

Durante a geração do relatório de bundle, o script `report-bundle.mjs` aplica um orçamento máximo de **220 kB** para arquivos CSS agregados. Se o limite for excedido, o processo finaliza com código de erro para sinalizar o ajuste necessário.
