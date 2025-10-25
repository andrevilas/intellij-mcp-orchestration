#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
DEFAULT_SOPS_FILE="${REPO_ROOT}/config/secrets.enc.yaml"

MCP_HOME="${HOME}/.mcp"
ENV_FILE="${MCP_HOME}/.env"

mkdir -p "${MCP_HOME}"
chmod 700 "${MCP_HOME}" 2>/dev/null || true

if [[ -n "${VAULT_ADDR:-}" && -n "${VAULT_SECRET_PATH:-}" ]]; then
  echo "[INFO] Configuração do HashiCorp Vault detectada em $VAULT_ADDR (${VAULT_SECRET_PATH})."
  if SECRET_PROVIDER=vault "${SCRIPT_DIR}/secrets-sync.sh"; then
    exit 0
  fi
  echo "[WARN] Falha ao sincronizar via Vault; tentando fallback local." >&2
fi

if [[ -f "$DEFAULT_SOPS_FILE" ]]; then
  echo "[INFO] Encontrado cofre SOPS em ${DEFAULT_SOPS_FILE}."
  if "${SCRIPT_DIR}/secrets-sync.sh"; then
    exit 0
  fi
  echo "[WARN] Falha ao sincronizar via SOPS; solicitando entrada manual." >&2
fi

declare -A VARS=(
  [GEMINI_API_KEY]="Chave Google Gemini"
  [OPENAI_API_KEY]="Chave OpenAI/Codex"
  [ANTHROPIC_API_KEY]="Chave Anthropic (opcional)"
  [ZHIPU_API_KEY]="Chave Zhipu GLM-4.6"
)

umask 077
cat <<'BANNER'
[!] Cofre seguro indisponível — os valores digitados serão gravados somente em ~/.mcp/.env (600).
    Execute scripts/secrets-sync.sh assim que o bundle criptografado estiver acessível.
BANNER

: > "$ENV_FILE"
chmod 600 "$ENV_FILE"

for key in "${!VARS[@]}"; do
  read -r -p "👉 ${VARS[$key]}: " value || true
  [ -n "${value:-}" ] && printf '%s\n' "${key}=${value}" >> "$ENV_FILE"
done

echo "[OK] Chaves salvas em ${ENV_FILE} (600)."
