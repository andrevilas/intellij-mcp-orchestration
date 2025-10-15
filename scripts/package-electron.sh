#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="$ROOT_DIR/dist/electron"

log() {
  echo "[package-electron] $1"
}

log "Installing desktop dependencies"
pnpm --dir "$ROOT_DIR/desktop" install --frozen-lockfile >/dev/null 2>&1 || pnpm --dir "$ROOT_DIR/desktop" install

log "Building Electron bundle"
pnpm --dir "$ROOT_DIR/desktop" package:dist

log "Electron artifacts available in $DIST_DIR"
