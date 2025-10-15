#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FRONTEND_DIR="$ROOT_DIR/app"

log() {
  printf '[dev:all] %s\n' "$*"
}

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
