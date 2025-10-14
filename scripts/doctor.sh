
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
echo "[OK] Ambiente saudável."
