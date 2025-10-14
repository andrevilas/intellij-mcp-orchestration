# MCP Console — Server API Prototype

This directory now contains the **FastAPI** prototype for the Console MCP backend.
It exposes lightweight endpoints that the frontend can use to discover available
MCP providers and bootstrap interactive sessions.

## Features

- `/api/v1/healthz` — liveness/metadata endpoint.
- `/api/v1/providers` — lists MCP providers from `config/console-mcp/servers.example.json`.
- `/api/v1/providers/{id}/sessions` — provisions an in-memory session and echoes context.
- `/api/v1/sessions` — inspects the sessions created during the process lifetime.

The prototype uses in-memory registries so it is safe to restart or adapt quickly
while the orchestration flows evolve.

## Running locally

```bash
cd server
python -m venv .venv
source .venv/bin/activate
pip install -e .
console-mcp-server-dev  # starts uvicorn with auto-reload on http://127.0.0.1:8000
```

The production-style entrypoint (`console-mcp-server`) binds to `0.0.0.0:8000`
sem auto-reload. Ajuste o manifest copiando `config/console-mcp/servers.example.json`
para outro local e definindo `CONSOLE_MCP_SERVERS_PATH=/caminho/novo.json` antes de
iniciar o servidor.

## Next steps

Upcoming roadmap items will connect these endpoints to real MCP server lifecycle
management, including spawning stdio processes, tracking telemetry, and exposing
event streams for the Console frontend.
