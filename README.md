# IntelliJ MCP Orchestration

**Uma console aberta para conectar agentes MCP ao seu fluxo de desenvolvimento.**

Este repositório reúne tudo o que você precisa para publicar e operar o Console MCP: uma UI web/electron feita em
React + Vite, um backend FastAPI para descoberta de provedores e provisionamento de sessões e os manifests que alinham
os agentes usados no dia a dia da equipe. O objetivo é simples: facilitar que desenvolvedores conectem agentes MCP aos
seus projetos (localmente ou em equipe) sem fricção.

## Recursos principais

- **Catálogo de agentes**: leia manifests MCP versionados em `config/console-mcp` e descubra rapidamente quais
  provedores estão disponíveis, seus comandos e capacidades.
- **Orquestração de sessões**: crie sessões efêmeras via backend FastAPI e acompanhe o contexto retornado por cada
  agente.
- **DX pensada para IDEs**: scripts prontos para integrar o Console MCP ao IntelliJ ou a qualquer editor que consuma o
  protocolo MCP.
- **Empacotamento flexível**: gere desde um bundle estático até um wrapper Electron completo usando os scripts em
  `scripts/` e `desktop/`.

## Arquitetura em alto nível

```
+------------------+      HTTP (JSON)       +-------------------------+
| Frontend (Vite)  | <--------------------> | FastAPI Orchestration   |
| React, TypeScript|                         | Lista providers e cria |
| UI para devs     |                         | sessões em memória      |
+------------------+                         +-------------------------+
          |                                                |
          | lê                                            | consulta
          v                                                v
   config/console-mcp/servers.*                   Manifests MCP locais
```

## Requisitos

- Node.js >= 18.18
- pnpm >= 8 (ou npm >= 9)
- Python >= 3.10

## Como começar

1. **Instale as dependências do workspace**
   ```bash
   pnpm install
   ```
2. **Prepare o backend**
   ```bash
   cd server
   python -m venv .venv
   source .venv/bin/activate
   pip install -e .
   cd ..
   ```
3. **Configure os provedores**
   ```bash
   cp config/console-mcp/servers.example.json ~/.config/console-mcp/servers.json
   export CONSOLE_MCP_SERVERS_PATH=~/.config/console-mcp/servers.json
   # Ajuste os comandos/paths para os seus MCPs locais
   ```
4. **Suba tudo em modo desenvolvimento**
   ```bash
   pnpm run dev:all
   ```
   - O backend fica disponível em `http://127.0.0.1:8000` (ajuste via `CONSOLE_MCP_SERVER_HOST`/`CONSOLE_MCP_SERVER_PORT`).
   - O frontend roda em `http://127.0.0.1:5173` (ajuste via `CONSOLE_MCP_FRONTEND_HOST`/`CONSOLE_MCP_FRONTEND_PORT`) e faz proxy automático para `/api`.

### Rodando serviços de forma independente

- Frontend: `pnpm --dir app dev`
- Backend: `source server/.venv/bin/activate && console-mcp-server-dev`

### Consumindo no IntelliJ

1. Com o Console MCP rodando, abra o IntelliJ IDEA (2024.1+).
2. Configure um **AI Actions Provider** apontando para o endpoint MCP que você deseja usar (ex.: `console-mcp-server`).
3. Use os agentes cadastrados via as paletas do IDE: geração de código, roteamento de testes e documentação.

> Consulte `config/ai-assistant-mcp.json` para um exemplo de configuração pronta para importar.

## Build e distribuição

- **Bundle local**: `pnpm run build` gera artefatos em `dist/` (frontend estático + wheel do backend).
- **Electron opcional**: `pnpm run package:electron` embala a UI em um app desktop.
- Para validar os artefatos siga o guia em [`docs/packaging.md`](docs/packaging.md).

## Documentação adicional

- [Arquitetura de agentes](docs/agents-and-routing.md)
- [Objetivos e métricas](docs/objectives.md)
- [Runbook operacional](docs/runbook.md)

## Contribuindo

- Abra issues e PRs com propostas de melhoria.
- Veja [`CONTRIBUTING.md`](CONTRIBUTING.md) para o fluxo completo.

## Licença

Distribuído sob licença Apache-2.0. Consulte [`LICENSE`](LICENSE) e [`NOTICE`](NOTICE) para detalhes e créditos.
