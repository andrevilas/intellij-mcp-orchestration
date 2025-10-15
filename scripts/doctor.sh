#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

info() { printf '[Doctor] %s\n' "$*"; }
warn() { printf '[Doctor][Warn] %s\n' "$*"; }
pass() { printf '[Doctor][OK] %s\n' "$*"; }

info 'Validando dependências obrigatórias…'
for binary in jq curl python3; do
  if command -v "$binary" >/dev/null 2>&1; then
    pass "${binary} encontrado"
  else
    printf '[Doctor][Error] %s ausente no PATH.\n' "$binary" >&2
    exit 1
  fi
done

if command -v pnpm >/dev/null 2>&1; then
  pass "pnpm $(pnpm --version)"
else
  warn 'pnpm não encontrado – scripts `pnpm -r dev` não irão funcionar.'
fi

if command -v npm >/dev/null 2>&1; then
  pass "npm $(npm --version)"
else
  warn 'npm não encontrado – fallback do frontend indisponível.'
fi

case ":$PATH:" in
  *":$HOME/.local/bin:"*) pass '~/.local/bin presente no PATH'; ;;
  *) warn '~/.local/bin não está no PATH – wrappers MCP podem não iniciar.'; ;;
esac

info 'Validando dependências Python do servidor…'
if python3 -c "import uvicorn" >/dev/null 2>&1; then
  pass 'uvicorn disponível'
else
  warn 'uvicorn não instalado; rode `make install-backend`.'
fi

if python3 -c "import fastapi" >/dev/null 2>&1; then
  pass 'fastapi disponível'
else
  warn 'fastapi não instalado; rode `make install-backend`.'
fi

info 'Checando workspace do frontend…'
if [ -f "$ROOT_DIR/pnpm-workspace.yaml" ]; then
  pass 'pnpm-workspace.yaml presente'
else
  warn 'pnpm-workspace.yaml ausente (rode git pull?).'
fi

if [ -f "$ROOT_DIR/app/package.json" ]; then
  pass 'app/package.json encontrado'
else
  warn 'app/package.json ausente – frontend não configurado.'
fi

if command -v glm46-mcp-server >/dev/null 2>&1; then
  info 'Testando handshake com glm46-mcp-server…'
  if [ -f "$HOME/.mcp/.env" ]; then
    set +u
    # shellcheck disable=SC1090
    source "$HOME/.mcp/.env"
    set -u
  fi
  payload="$(python3 - <<'PY'
import json
import sys


def frame(obj):
    body = json.dumps(obj)
    return f"Content-Length: {len(body.encode('utf-8'))}\r\n\r\n{body}"

sys.stdout.write(frame({"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {}}))
sys.stdout.write(frame({"jsonrpc": "2.0", "id": 2, "method": "shutdown", "params": {}}))
PY
)"
  response=$(printf "%s" "$payload" | glm46-mcp-server --stdio | head -n 6 || true)
  if echo "$response" | grep -q 'glm46-mcp-server'; then
    pass 'Handshake glm46-mcp-server OK'
  else
    warn 'Handshake glm46-mcp-server falhou'
  fi
else
  warn 'glm46-mcp-server não encontrado no PATH'
fi

if [ -f "$HOME/.mcp/cost-policy.json" ]; then
  pass '~/.mcp/cost-policy.json presente'
else
  warn '~/.mcp/cost-policy.json ausente'
fi

info 'Diagnóstico concluído.'
