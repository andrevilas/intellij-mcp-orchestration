#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR/server"

log() {
  printf '[dev-backend] %s\n' "$*"
}

if command -v console-mcp-server-dev >/dev/null 2>&1; then
  log 'Iniciando console-mcp-server-dev (auto-reload habilitado).'
  exec console-mcp-server-dev
fi

if ! command -v uvicorn >/dev/null 2>&1; then
  log 'Erro: nem console-mcp-server-dev nem uvicorn estão disponíveis. Rode `pip install -e server[dev]`.'
  exit 1
fi

log 'Iniciando uvicorn diretamente com PYTHONPATH=src.'
if [[ -n "${PYTHONPATH:-}" ]]; then
  export PYTHONPATH="$PYTHONPATH:$ROOT_DIR/server/src"
else
  export PYTHONPATH="$ROOT_DIR/server/src"
fi

SERVER_HOST="${CONSOLE_MCP_SERVER_HOST:-127.0.0.1}"
SERVER_PORT="${CONSOLE_MCP_SERVER_PORT:-8000}"
log "Bind configurado para ${SERVER_HOST}:${SERVER_PORT}."
exec uvicorn console_mcp_server.main:app --reload --host "$SERVER_HOST" --port "$SERVER_PORT"
