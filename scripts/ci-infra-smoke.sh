#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/infra-smoke-XXXXXX")"
BACKEND_LOG="${TMP_DIR}/backend.log"
FRONTEND_LOG="${TMP_DIR}/frontend.log"
HEALTH_PAYLOAD="${TMP_DIR}/health.json"
SIMULATION_PAYLOAD_FILE="${TMP_DIR}/routing-simulate.json"
EXPORT_HEADERS="${TMP_DIR}/telemetry-headers.txt"
EXPORT_BODY="${TMP_DIR}/telemetry-export.csv"

BACKEND_HOST="${CONSOLE_MCP_SERVER_HOST:-127.0.0.1}"
BACKEND_PORT="${CONSOLE_MCP_SERVER_PORT:-8000}"
FRONTEND_HOST="${CONSOLE_MCP_FRONTEND_HOST:-127.0.0.1}"
FRONTEND_PORT="${CONSOLE_MCP_FRONTEND_PORT:-5173}"

BACKEND_PID=""
FRONTEND_PID=""

PYTHON_BIN="$(command -v python3 || command -v python || true)"
if [[ -z "$PYTHON_BIN" ]]; then
  echo "Python 3 não está disponível no PATH."
  exit 1
fi

choose_port() {
  local requested="$1"
  "$PYTHON_BIN" - "$requested" <<'PY'
import socket
import sys

requested = int(sys.argv[1])

def is_available(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            sock.bind(("127.0.0.1", port))
        except OSError:
            return False
    return True

if is_available(requested):
    print(requested)
else:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        sock.bind(("127.0.0.1", 0))
        print(sock.getsockname()[1])
PY
}

BACKEND_PORT="$(choose_port "$BACKEND_PORT")"

cleanup() {
  local exit_code=$?
  trap - EXIT INT TERM

  kill_tree "${FRONTEND_PID:-}"
  kill_tree "${BACKEND_PID:-}"

  if [[ $exit_code -ne 0 ]]; then
    echo "::warning::infra smoke failed — dumping backend log"
    if [[ -s "$BACKEND_LOG" ]]; then
      sed 's/^/[backend] /' "$BACKEND_LOG" >&2 || true
    fi
    echo "::warning::infra smoke failed — dumping frontend log"
    if [[ -s "$FRONTEND_LOG" ]]; then
      sed 's/^/[frontend] /' "$FRONTEND_LOG" >&2 || true
    fi
  fi

  rm -rf "$TMP_DIR"
  exit "$exit_code"
}
trap cleanup EXIT INT TERM

kill_tree() {
  local pid=$1
  if [[ -z "$pid" ]]; then
    return
  fi
  if ! kill -0 "$pid" >/dev/null 2>&1; then
    return
  fi
  if command -v pkill >/dev/null 2>&1; then
    pkill -TERM -P "$pid" 2>/dev/null || true
  fi
  kill -TERM "$pid" 2>/dev/null || true
  wait "$pid" 2>/dev/null || true
}

wait_for_http() {
  local url=$1
  local attempts=${2:-30}
  local delay=${3:-2}

  for ((i = 1; i <= attempts; i++)); do
    if curl -sSf "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep "$delay"
  done

  echo "Timed out waiting for $url" >&2
  return 1
}

start_backend() {
  CONSOLE_MCP_SERVER_HOST="$BACKEND_HOST" \
  CONSOLE_MCP_SERVER_PORT="$BACKEND_PORT" \
  CONSOLE_MCP_API_PROXY="http://${FRONTEND_HOST}:${FRONTEND_PORT}" \
  CONSOLE_MCP_USE_FIXTURES="${CONSOLE_MCP_USE_FIXTURES:-force}" \
  bash "$ROOT_DIR/scripts/dev-backend.sh" \
    >"$BACKEND_LOG" 2>&1 &
  BACKEND_PID=$!
}

start_frontend() {
  (
    cd "$ROOT_DIR"
    CONSOLE_MCP_USE_FIXTURES="${CONSOLE_MCP_USE_FIXTURES:-force}" \
      pnpm -r --workspace-concurrency=1 --if-present dev \
      >"$FRONTEND_LOG" 2>&1
  ) &
  FRONTEND_PID=$!
}

write_simulation_payload() {
  cat >"$SIMULATION_PAYLOAD_FILE" <<'JSON'
{
  "provider_ids": ["glm46", "codex"],
  "strategy": "balanced",
  "failover_provider_id": "codex",
  "volume_millions": 10
}
JSON
}

main() {
  start_backend
  start_frontend

  local health_url="http://${BACKEND_HOST}:${BACKEND_PORT}/api/v1/healthz"
  local simulate_url="http://${BACKEND_HOST}:${BACKEND_PORT}/api/v1/routing/simulate"
  local export_url="http://${BACKEND_HOST}:${BACKEND_PORT}/api/v1/telemetry/export"

  wait_for_http "$health_url" 45 2

  curl -sSf "$health_url" -o "$HEALTH_PAYLOAD"

  write_simulation_payload
  curl -sSf -X POST \
    -H 'Content-Type: application/json' \
    --data-binary "@$SIMULATION_PAYLOAD_FILE" \
    "$simulate_url" \
    -o "${TMP_DIR}/simulate.json"

  curl -sSf -D "$EXPORT_HEADERS" "$export_url" -o "$EXPORT_BODY"

  "$PYTHON_BIN" - "$HEALTH_PAYLOAD" "${TMP_DIR}/simulate.json" <<'PY'
import json
import sys
from pathlib import Path

health_path = Path(sys.argv[1])
simulate_path = Path(sys.argv[2])

health = json.loads(health_path.read_text())
if health.get("status") not in {"ok", "healthy"}:
    raise SystemExit(f"unexpected health status: {health!r}")

simulation = json.loads(simulate_path.read_text())
if not simulation.get("distribution"):
    raise SystemExit("routing simulation returned no distribution")
PY

  if ! grep -iq '^content-type:.*text/csv' "$EXPORT_HEADERS"; then
    echo "telemetry export did not return CSV" >&2
    exit 1
  fi

  if [[ ! -s "$EXPORT_BODY" ]]; then
    echo "telemetry export produced an empty document" >&2
    exit 1
  fi

  echo "Infrastructure smoke checks passed."
}

main
