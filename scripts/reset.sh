
#!/usr/bin/env bash
set -euo pipefail
echo "[Reset] Removendo wrappers e env local (não remove pacotes do sistema)…"
rm -f ~/.local/bin/gemini-mcp ~/.local/bin/codex-mcp ~/.local/bin/glm46-mcp ~/.local/bin/claude-mcp || true
echo "[Reset] Done."
