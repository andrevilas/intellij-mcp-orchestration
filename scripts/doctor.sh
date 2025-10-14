
#!/usr/bin/env bash
set -euo pipefail

echo "[Doctor] Validando dependências e PATH…"
command -v jq >/dev/null || { echo "Falta jq"; exit 1; }
command -v curl >/dev/null || { echo "Falta curl"; exit 1; }
command -v python3 >/dev/null || { echo "Falta python3"; exit 1; }
command -v node >/dev/null || echo "[Warn] Node não encontrado (opcional)"
case ":$PATH:" in *":$HOME/.local/bin:"*) ;; *)
  echo "[Warn] ~/.local/bin não está no PATH"; exit 1;;
esac
if command -v glm46-mcp-server >/dev/null 2>&1; then
  if [ -f "$HOME/.mcp/.env" ]; then
    set -a
    # shellcheck disable=SC1090
    . "$HOME/.mcp/.env"
    set +a
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
  echo "$response" | grep -q 'glm46-mcp-server' || { echo "[Warn] Handshake glm46-mcp-server falhou"; }
else
  echo "[Warn] glm46-mcp-server não encontrado no PATH"
fi
[ -f "$HOME/.mcp/cost-policy.json" ] || echo "[Warn] ~/.mcp/cost-policy.json ausente"
echo "[OK] Ambiente saudável."
