# MCP Console — Desktop Shell (Electron)

This workspace bundles the Vite frontend inside an Electron shell so the
console can run as a desktop application. The backend remains an external
process (run via the Python API server).

## Quickstart

```bash
# 1) Install dependencies
pnpm --dir desktop install

# 2) Start the Vite dev server em outro terminal (ajuste host/porta via
#    CONSOLE_MCP_FRONTEND_HOST/PORT se necessário)
pnpm --dir app dev

# 3) Launch Electron apontando para o mesmo host/porta
pnpm --dir desktop dev:electron
```

## Packaging

```bash
# Build frontend + Electron bundle (outputs to ../dist/electron)
pnpm --dir desktop package:dist
```

> **Tip:** The packaging script expects `pnpm --dir app build` to have run,
which is executed automatically during `package`/`package:dist`.
