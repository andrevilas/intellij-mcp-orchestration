# MCP Console — Frontend App

O diretório `app/` agora contém o bootstrap oficial do Console MCP, baseado em **Vite + React + TypeScript**. A stack prioriza
DX rápida para iterações curtas e integração direta com os servidores MCP locais expostos pelo projeto.

## Requisitos

- Node.js >= 18.18
- npm >= 9

## Scripts Disponíveis

```bash
npm install    # instala dependências
npm run dev    # inicia Vite em http://127.0.0.1:5173 com HMR
npm run build  # gera artefatos prontos para deploy estático
npm run preview # serve o build final localmente
```

## Estrutura

- `index.html` – entrypoint SPA tratado pelo Vite.
- `src/main.tsx` – bootstrap React.
- `src/App.tsx` – landing page inicial descrevendo a stack e próximos passos.
- `vite.config.ts` – configuração mínima incluindo porta/host padronizados.
- `tsconfig*.json` – regras de compilação TypeScript compartilhadas.

Os próximos incrementos (TASK-OPS-003+) adicionarão roteamento, chamadas ao backend e componentes para orquestrar MCP servers.
