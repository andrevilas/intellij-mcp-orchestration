# MCP Console — Frontend App

O diretório `app/` contém o Console MCP web baseado em **Vite + React + TypeScript**. A stack prioriza DX rápida para
iterações curtas e agora está conectada ao protótipo FastAPI do backend, consumindo os endpoints `/api/v1/providers` e
`/api/v1/sessions` para listar provedores e registrar provisionamentos em memória.

## Requisitos

- Node.js >= 18.18
- pnpm >= 8 (ou npm >= 9)

## Scripts Disponíveis

```bash
pnpm install   # instala dependências
pnpm dev       # inicia Vite em http://127.0.0.1:5173 com HMR
pnpm build     # gera artefatos prontos para deploy estático
pnpm preview   # serve o build final localmente
```

## Integração com o backend

1. Inicie o servidor FastAPI em outro terminal (`console-mcp-server-dev`).
2. Rode `pnpm dev` neste diretório. O proxy embutido encaminha chamadas `/api/*` para `http://127.0.0.1:8000`.
3. A UI exibirá os provedores do manifesto versionado e permitirá criar sessões mock com um clique.

Variáveis de ambiente úteis:
- `VITE_CONSOLE_API_BASE`: altera o path base usado pelo fetch do frontend (default: `/api/v1`).
- `CONSOLE_MCP_API_PROXY`: redefine o destino do proxy HTTP utilizado pelo dev server do Vite.

## Estrutura

- `index.html` – entrypoint SPA tratado pelo Vite.
- `src/main.tsx` – bootstrap React.
- `src/App.tsx` – tela principal com listagem de provedores e ações de provisionamento.
- `src/api.ts` – cliente HTTP tipado para `/api/v1` (providers/sessions).
- `vite.config.ts` – configuração incluindo proxy `/api` durante o desenvolvimento.
- `tsconfig*.json` – regras de compilação TypeScript compartilhadas.

Os próximos incrementos expandirão a experiência (ex.: logs em tempo real, estados de conexão e telemetria por sessão).
