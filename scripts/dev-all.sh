#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FRONTEND_DIR="$ROOT_DIR/app"

log() {
  printf '[dev:all] %s\n' "$*"
}

normalize_browser_host() {
  case "$1" in
  0.0.0.0|::)
    printf '127.0.0.1'
    ;;
  *)
    printf '%s' "$1"
    ;;
  esac
}

BACKEND_HOST="${CONSOLE_MCP_SERVER_HOST:-127.0.0.1}"
BACKEND_PORT="${CONSOLE_MCP_SERVER_PORT:-8000}"
FRONTEND_HOST="${CONSOLE_MCP_FRONTEND_HOST:-127.0.0.1}"
FRONTEND_PORT="${CONSOLE_MCP_FRONTEND_PORT:-5173}"

if [[ -z "${CONSOLE_MCP_API_PROXY:-}" ]]; then
  NORMALIZED_BACKEND_HOST="$(normalize_browser_host "$BACKEND_HOST")"
  export CONSOLE_MCP_API_PROXY="http://${NORMALIZED_BACKEND_HOST}:${BACKEND_PORT}"
fi

log "Backend em ${BACKEND_HOST}:${BACKEND_PORT} (proxy=${CONSOLE_MCP_API_PROXY})."
log "Frontend em ${FRONTEND_HOST}:${FRONTEND_PORT}."

pids=()
cleanup() {
  local exit_code=$?
  trap - INT TERM EXIT
  set +e
  for pid in "${pids[@]}"; do
    if kill -0 "$pid" >/dev/null 2>&1; then
      kill "$pid" >/dev/null 2>&1 || true
      wait "$pid" 2>/dev/null || true
    fi
  done
  exit "$exit_code"
}
trap cleanup INT TERM EXIT

start_backend() {
  log 'Subindo backend (console-mcp-server-dev)…'
  bash "$ROOT_DIR/scripts/dev-backend.sh" &
  pids+=($!)
}

start_frontend() {
  local cmd=()
  if command -v pnpm >/dev/null 2>&1; then
    cmd=(pnpm dev)
  elif command -v npm >/dev/null 2>&1; then
    cmd=(npm run dev)
  else
    log 'Erro: nem pnpm nem npm estão instalados.'
    exit 1
  fi
  log "Subindo frontend (${cmd[*]})…"
  (cd "$FRONTEND_DIR" && "${cmd[@]}") &
  pids+=($!)
}

start_backend
start_frontend

log 'Ambiente iniciado. Pressione Ctrl+C para finalizar.'

wait -n "${pids[@]}" || true
cleanup
