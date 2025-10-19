# UI bundle observability snapshot — Sprint M6 prep

## Build metrics

Command executed: `pnpm --dir app build`

| Asset | Size | Gzip | Notes |
| --- | ---: | ---: | --- |
| `dist/assets/index-CyVenaPb.css` | 383.79 kB | 57.00 kB | Bootstrap base + Console theming (needs diet to reach ≤ 220 kB).
| `dist/assets/index-Ndc6PqDh.js` | 312.73 kB | 96.45 kB | Application shell, React runtime, Font Awesome icon set, notification/command palette logic.
| `dist/assets/index-C0KbhWH9.js` | 50.84 kB | 13.16 kB | Shared UI primitives (breadcrumbs, toasts, theme switch).
| `dist/assets/Dashboard-Ciid2jiq.js` | 55.52 kB | 15.02 kB | Dashboard route payload (charts, cards).
| `dist/assets/FinOps-D0vaRyih.js` | 59.83 kB | 15.21 kB | FinOps route (heavy Recharts helpers).
| `dist/assets/Flows-GISX75i3.js` | 151.31 kB | 48.36 kB | React Flow editor bundle (largest lazy chunk).
| `dist/assets/Observability-TtJmPTOv.js` | 21.29 kB | 6.63 kB | Observability route tables + filters.
| `dist/assets/Servers-B4vDt5vu.js` | 22.93 kB | 6.44 kB | Servers route (status grid + controls).
| `dist/assets/Policies-BXLR0WbX.js` | 27.89 kB | 7.94 kB | Policies route (compliance matrix, drawers).
| `dist/assets/Routing-DC3N_COX.js` | 31.54 kB | 8.62 kB | Routing Lab simulation UI.
| `dist/assets/Agents-CP7NWuEK.js` | 43.91 kB | 11.98 kB | Agents catalog tree + smoke sections.
| `dist/assets/Security-DRlrMCDu.js` | 40.36 kB | 11.12 kB | IAM + audit views.

> Observed sizes generated on 2025-10-19 (UTC) and logged here to mirror the UI observability sheet.

## Main bundle dependency map

The entry chunk (`index-Ndc6PqDh.js`) currently ships:

- **React 18 runtime and JSX transforms** (both `react.production.min.js` and `react-jsx-runtime.production.min.js`).
- **React DOM client renderer** powering the application shell hydration.
- **Font Awesome Free 6.7.2** icon registry plus the React binding (`@fortawesome/react-fontawesome`).
- Core shell widgets: command palette, notification center, theme switcher, breadcrumb builder, provisioning dialog.
- Shared utilities such as the local storage notification cache, keyboard shortcut handlers, and bootstrap-based toast provider.

## Route-level code splitting status

`React.lazy` + `Suspense` now deliver one chunk per navigation tab:

- Dashboard, Observability, Servers, Agents, Keys, Security, Policies, Routing, Flows, FinOps, Marketplace, Admin Chat.
- Each tab mounts under a consistent `<section role="tabpanel">` wrapper with a loading fallback that announces “Carregando {view}…”.
- Heavy feature bundles like React Flow (`Flows-GISX75i3.js`) and Recharts-powered dashboards remain isolated from the initial payload.

## Follow-up opportunities

- Reduce the base CSS (383 kB) by pruning unused Bootstrap modules or moving to modular Sass once upstream migrates from `@import`.
- Evaluate dynamic icon loading to avoid shipping the full Font Awesome set on first paint.
- Automate reporting into the UI observability sheet after each CI build (export this table via script).
