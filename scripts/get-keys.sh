
#!/usr/bin/env bash
set -euo pipefail

MCP_HOME="${HOME}/.mcp"
ENV_FILE="${MCP_HOME}/.env"
mkdir -p "${MCP_HOME}"
touch "${ENV_FILE}"
chmod 600 "${ENV_FILE}"

declare -A VARS=(
  [GEMINI_API_KEY]="Chave Google Gemini"
  [OPENAI_API_KEY]="Chave OpenAI/Codex"
  [ANTHROPIC_API_KEY]="Chave Anthropic (opcional)"
  [ZHIPU_API_KEY]="Chave Zhipu GLM-4.6"
)

for key in "${!VARS[@]}"; do
  if ! grep -q "^${key}=" "$ENV_FILE" 2>/dev/null; then
    read -r -p "👉 ${VARS[$key]}: " value || true
    [ -n "${value:-}" ] && echo "${key}=${value}" >> "$ENV_FILE"
  fi
done

echo "[OK] Chaves salvas em ${ENV_FILE} (600)."
