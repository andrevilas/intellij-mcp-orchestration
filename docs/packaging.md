# Packaging Playbook (Sprint OPS-4)

This document outlines how to produce installable artifacts for the MCP
Console. Two deliverables are supported:

1. **Local Build** — static frontend bundle + Python wheel artifacts.
2. **Desktop Shell (optional)** — Electron wrapper for the frontend.

---

## 1. Local Build (`TASK-OPS-401`)

```bash
# Generate artifacts under dist/
pnpm build
```

The script `scripts/build-local.sh` performs:

- Installs frontend dependencies on demand and runs the local TypeScript + Vite
  pipeline (`./node_modules/.bin/tsc && ./node_modules/.bin/vite build`).
- Copies the Vite output to `dist/frontend/web`.
- Builds a Python wheel for the API server inside `dist/backend/` via
  `python -m pip wheel --no-deps`.
- Emits `dist/README.md` with usage instructions.

### Testing the Local Artifacts

```bash
# Serve the frontend bundle
python3 -m http.server --directory dist/frontend/web 4173

# Install and run the backend server
python3 -m pip install dist/backend/console_mcp_server-*.whl
console-mcp-server
```

---

## 2. Electron Shell (`TASK-OPS-402`)

Electron assets live under `desktop/` and are part of the pnpm workspace.

```bash
# Build distributables (outputs to dist/electron)
pnpm run package:electron
```

The command wraps the Vite bundle inside an Electron app via
`scripts/package-electron.sh`. It executes:

1. `pnpm --dir desktop install` (once).
2. `pnpm --dir desktop package:dist` — copies `app/dist` into
   `desktop/resources/frontend`, compiles the Electron main/preload scripts and
   invokes `electron-builder`.

### Development Loop

```bash
# Terminal A — Vite dev server (ports configuráveis via CONSOLE_MCP_FRONTEND_HOST/PORT)
pnpm --dir app dev

# Terminal B — Electron shell apontando para o mesmo host/porta
pnpm --dir desktop dev:electron
```

Artifacts are written to `dist/electron/` and include platform installers where
supported (`zip`, `dmg`, `AppImage`, `tar.gz`).
