#!/usr/bin/env bash
set -euo pipefail

SOPS_BIN=${SOPS_BIN:-sops}
SOPS_FILE=${SOPS_FILE:-config/secrets.enc.yaml}
MCP_HOME=${MCP_HOME:-"${HOME}/.mcp"}
ENV_FILE=${ENV_FILE:-"${MCP_HOME}/.env"}
SECRETS_JSON=${SECRETS_JSON:-"${MCP_HOME}/console-secrets.json"}
SECRET_PROVIDER=${SECRET_PROVIDER:-auto}
export SOPS_BIN SOPS_FILE

usage() {
  cat <<'USAGE' >&2
Usage: scripts/secrets-sync.sh

Sincroniza segredos para o ambiente local utilizando HashiCorp Vault ou o
bundle SOPS criptografado (fallback). Quando VAULT_ADDR e VAULT_SECRET_PATH
estiverem definidos, o Vault será priorizado; caso contrário, o bundle SOPS
é utilizado (requer chave age via $SOPS_AGE_KEY ou ~/.config/sops/age/keys.txt).
USAGE
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

TMP_JSON=$(mktemp)
cleanup() {
  rm -f "$TMP_JSON"
}
trap cleanup EXIT

umask 077
mkdir -p "$MCP_HOME"

# Carrega o bundle seguro em JSON utilizando o reader consolidado.
if ! python3 config/secure_reader.py --provider "$SECRET_PROVIDER" --output "$TMP_JSON" >/dev/null; then
  echo "[ERROR] Falha ao carregar segredos. Consulte a saída acima." >&2
  exit 1
fi

python3 <<'PYCODE' "$TMP_JSON" "$ENV_FILE" "$SECRETS_JSON"
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

source_path, env_path_str, secrets_json_str = sys.argv[1:4]
with open(source_path, "r", encoding="utf-8") as handle:
    payload = json.load(handle)

secrets = payload.get("secrets", payload)
now = datetime.now(timezone.utc).isoformat()

provider_map = {
    "GEMINI_API_KEY": "gemini",
    "OPENAI_API_KEY": "codex",
    "ANTHROPIC_API_KEY": "claude",
    "ZHIPU_API_KEY": "glm46",
}

# Write .env file consumed by local wrappers/SDKs.
env_lines = []
for key, value in sorted(secrets.items()):
    if not isinstance(value, str):
        continue
    env_lines.append(f"{key}={value}\n")

env_path = Path(env_path_str)
env_path.parent.mkdir(parents=True, exist_ok=True)
with open(env_path, "w", encoding="utf-8") as env_file:
    env_file.writelines(env_lines)
os.chmod(env_path, 0o600)

# Prepare JSON secrets store for the MCP server prototype.
store = {"version": 1, "secrets": {}}
for key, value in secrets.items():
    if not isinstance(value, str) or not value.strip():
        continue
    provider_id = provider_map.get(key)
    if not provider_id:
        continue
    store["secrets"][provider_id] = {
        "value": value,
        "created_at": now,
        "updated_at": now,
    }

secrets_path = Path(secrets_json_str)
secrets_path.parent.mkdir(parents=True, exist_ok=True)
with open(secrets_path, "w", encoding="utf-8") as secrets_file:
    json.dump(store, secrets_file, indent=2)
os.chmod(secrets_path, 0o600)
PYCODE

echo "[OK] Secrets synced to $ENV_FILE and $SECRETS_JSON"
