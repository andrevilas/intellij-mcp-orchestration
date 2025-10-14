# MCP Console — Server API Prototype

Este diretório contém o **FastAPI** prototype para o Console MCP backend. Ele expõe endpoints leves que o frontend usa para
descobrir provedores MCP e iniciar sessões lógicas em memória.

## Features

- `/api/v1/healthz` — liveness/metadata endpoint.
- `/api/v1/providers` — lista MCP providers a partir de `config/console-mcp/servers.example.json`.
- `/api/v1/providers/{id}/sessions` — provisiona uma sessão em memória e ecoa o contexto.
- `/api/v1/sessions` — inspeciona as sessões criadas durante o ciclo de vida do processo.

## Rodando localmente

```bash
cd server
python -m venv .venv
source .venv/bin/activate
pip install -e .
console-mcp-server-dev  # inicia uvicorn com auto-reload em http://127.0.0.1:8000
```

O entrypoint de produção (`console-mcp-server`) faz bind em `0.0.0.0:8000` sem auto-reload. Ajuste o manifest copiando
`config/console-mcp/servers.example.json` para outro local e definindo `CONSOLE_MCP_SERVERS_PATH=/caminho/novo.json`
antes de iniciar o servidor.

### Configuração de CORS

Por padrão, o backend libera `http://127.0.0.1:5173` e `http://localhost:5173` para desenvolvimento. Para ampliar ou
restringir a lista, defina `CONSOLE_MCP_CORS_ORIGINS` com origens separadas por vírgula (ex.:
`CONSOLE_MCP_CORS_ORIGINS=http://127.0.0.1:4173,https://console.internal`).

## Próximos passos

Os próximos itens do roadmap conectarão essas rotas a lifecycle real de MCP servers, incluindo spawn de processos stdio,
telemetria contínua e event streaming para o frontend.
