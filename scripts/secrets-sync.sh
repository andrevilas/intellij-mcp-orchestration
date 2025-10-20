#!/usr/bin/env bash
set -euo pipefail

SOPS_BIN=${SOPS_BIN:-sops}
SOPS_FILE=${SOPS_FILE:-config/secrets.enc.yaml}
MCP_HOME=${MCP_HOME:-"${HOME}/.mcp"}
ENV_FILE=${ENV_FILE:-"${MCP_HOME}/.env"}
SECRETS_JSON=${SECRETS_JSON:-"${MCP_HOME}/console-secrets.json"}

usage() {
  cat <<'USAGE' >&2
Usage: scripts/secrets-sync.sh

Decrypts the SOPS-managed secrets bundle into the local developer workspace.
Requires a valid SOPS age identity either in $SOPS_AGE_KEY or ~/.config/sops/age/keys.txt.
USAGE
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

if ! command -v "$SOPS_BIN" >/dev/null 2>&1; then
  echo "[ERROR] sops not found in PATH. See docs/ops/runbooks/secret-management.md" >&2
  exit 1
fi

if [[ ! -f "$SOPS_FILE" ]]; then
  echo "[ERROR] Encrypted secrets bundle $SOPS_FILE not found." >&2
  exit 1
fi

if [[ -z "${SOPS_AGE_KEY:-}" ]] && [[ ! -f "${HOME}/.config/sops/age/keys.txt" ]]; then
  cat >&2 <<'MSG'
[ERROR] No age identity detected. Export SOPS_AGE_KEY or place your key in ~/.config/sops/age/keys.txt.
MSG
  exit 1
fi

TMP_JSON=$(mktemp)
cleanup() {
  rm -f "$TMP_JSON"
}
trap cleanup EXIT

umask 077
mkdir -p "$MCP_HOME"

# Decrypt as JSON to simplify downstream processing.
if ! "$SOPS_BIN" --decrypt --output-type json "$SOPS_FILE" >"$TMP_JSON"; then
  echo "[ERROR] Failed to decrypt $SOPS_FILE. Check your SOPS_AGE_KEY." >&2
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
