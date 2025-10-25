#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
BASELINE="${BASELINE:-${REPO_ROOT}/config/detect-secrets.baseline}"
DETECT_SECRETS_BIN=${DETECT_SECRETS_BIN:-detect-secrets}
HOOK_BIN=${HOOK_BIN:-detect-secrets-hook}

TARGETS=(
  server
  scripts
  config
  .github
  agents-hub
  wrappers
  desktop
  tests
  Makefile
  package.json
  pnpm-workspace.yaml
)

if ! command -v "$HOOK_BIN" >/dev/null 2>&1; then
  if command -v python3 >/dev/null 2>&1; then
    echo "[INFO] Instalando detect-secrets via pip..." >&2
    python3 -m pip install --quiet --upgrade detect-secrets
  fi
fi

if ! command -v "$HOOK_BIN" >/dev/null 2>&1; then
  echo "[ERROR] detect-secrets-hook não encontrado no PATH." >&2
  exit 1
fi

if [[ ! -f "$BASELINE" ]]; then
  echo "[ERROR] Baseline detect-secrets não encontrada em ${BASELINE}." >&2
  exit 1
fi

mapfile -t FILES < <(cd "$REPO_ROOT" && git ls-files "${TARGETS[@]}")

for idx in "${!FILES[@]}"; do
  if [[ "${FILES[$idx]}" == "config/detect-secrets.baseline" ]]; then
    unset 'FILES[idx]'
  fi
done

if [[ ${#FILES[@]} -eq 0 ]]; then
  echo "[WARN] Nenhum arquivo identificado para auditoria de segredos." >&2
  exit 0
fi

"$HOOK_BIN" --baseline "$BASELINE" "${FILES[@]}"
