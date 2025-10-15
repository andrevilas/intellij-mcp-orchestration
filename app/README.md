# Promenade Agent Hub — Frontend App

O diretório `app/` contém o Console MCP web baseado em **Vite + React + TypeScript**. A stack prioriza DX rápida para
iterações curtas e agora está conectada ao protótipo FastAPI do backend, consumindo os endpoints `/api/v1/providers` e
`/api/v1/sessions` para listar provedores e registrar provisionamentos em memória.

## Requisitos

- Node.js >= 18.18
- pnpm >= 8 (ou npm >= 9)

## Scripts Disponíveis

```bash
pnpm install   # instala dependências
CONSOLE_MCP_FRONTEND_HOST=127.0.0.1 \\
CONSOLE_MCP_FRONTEND_PORT=5173 \\
  pnpm dev     # inicia Vite com HMR respeitando as variáveis acima
pnpm build     # gera artefatos prontos para deploy estático
pnpm preview   # serve o build final localmente
```

## Integração com o backend

1. Inicie o servidor FastAPI em outro terminal (`console-mcp-server-dev`).
2. Rode `pnpm dev` neste diretório. O proxy embutido encaminha chamadas `/api/*` para o host/porta do backend
   (`CONSOLE_MCP_SERVER_HOST`/`CONSOLE_MCP_SERVER_PORT`, padrão `127.0.0.1:8000`).
3. A UI exibirá os provedores do manifesto versionado e permitirá criar sessões mock com um clique.

Variáveis de ambiente úteis:
- `VITE_CONSOLE_API_BASE`: altera o path base usado pelo fetch do frontend (default: `/api/v1`).
- `VITE_CONSOLE_AGENTS_BASE`: redefine o caminho base dos endpoints do hub de agentes (default: `/agents`).
- `VITE_CONSOLE_API_KEY`: quando definido, injeta o header `X-API-Key` em todas as chamadas HTTP do frontend.
- `CONSOLE_MCP_FRONTEND_HOST` / `CONSOLE_MCP_FRONTEND_PORT`: bind do dev server do Vite.
- `CONSOLE_MCP_API_PROXY`: redefine o destino do proxy HTTP utilizado pelo dev server do Vite (por padrão usa os valores
  de `CONSOLE_MCP_SERVER_HOST`/`CONSOLE_MCP_SERVER_PORT`).
- `CONSOLE_MCP_AGENTS_PROXY`: sobrescreve apenas o alvo do proxy `/agents` quando o hub de agentes roda em host/porta separados.

## Estrutura

- `index.html` – entrypoint SPA tratado pelo Vite.
- `src/main.tsx` – bootstrap React.
- `src/App.tsx` – tela principal com listagem de provedores e ações de provisionamento.
- `src/api.ts` – cliente HTTP tipado para `/api/v1` (providers/sessions).
- `src/hooks/useAgent.ts` – hook reutilizável para acionar agentes via `/agents/{name}/invoke`, com tratamento de fallback.
- `vite.config.ts` – configuração incluindo proxy `/api` durante o desenvolvimento.
- `tsconfig*.json` – regras de compilação TypeScript compartilhadas.

Os próximos incrementos expandirão a experiência (ex.: logs em tempo real, estados de conexão e telemetria por sessão).

### Fallback de busca assistida

A busca da home (command palette) agora consulta o agente `catalog-search` através do hook `useAgent`. Quando o hub
retorna `404` (agente indisponível ou não publicado), o hook sinaliza `isFallback` para que a UI mantenha o catálogo
legado. Esse estado também é propagado visualmente, informando ao usuário que a busca inteligente está offline e que os
resultados locais continuam funcionando sem interrupções.
