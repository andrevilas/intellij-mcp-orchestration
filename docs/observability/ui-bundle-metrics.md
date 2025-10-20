# UI bundle observability snapshot — Sprint M6 prep

## Build metrics

Command executed: `pnpm --dir app build`

> **Atualização rápida:** execute `pnpm --dir app build:bundle-report` para gerar `dist/` e capturar o snapshot mais recente em `app/metrics/bundle-report.json`. O script `app/scripts/report-bundle.mjs` também imprime um top 10 resumido no terminal, facilitando a revisão durante auditorias UI-ACT-006.

| Asset | Size | Gzip | Notes |
| --- | ---: | ---: | --- |
| `dist/assets/index-DyWZ9ss9.css` | 395.45 kB | 58.01 kB | Bootstrap base + Console theming (still exceeds ≤ 220 kB target).
| `dist/assets/index-Co_Qq_Z0.js` | 318.88 kB | 98.22 kB | Application shell, React runtime, Font Awesome icon registry, notification/command palette logic.
| `dist/assets/index-bA_wXgQz.js` | 50.84 kB | 13.16 kB | Shared UI primitives (breadcrumbs, toasts, theme switch).
| `dist/assets/Dashboard-BKUJ25g0.js` | 55.52 kB | 15.01 kB | Dashboard route payload (charts, cards).
| `dist/assets/FinOps-BQPrGaCv.js` | 59.83 kB | 15.21 kB | FinOps route (heavy Recharts helpers).
| `dist/assets/Flows-BE8RSHvx.js` | 151.31 kB | 48.36 kB | React Flow editor bundle (largest lazy chunk).
| `dist/assets/Observability-BqUZlmFg.js` | 21.29 kB | 6.63 kB | Observability route tables + filters.
| `dist/assets/Servers-Ddbhe7Gw.js` | 22.93 kB | 6.44 kB | Servers route (status grid + controls).
| `dist/assets/Policies-fs5MAg0m.js` | 27.89 kB | 7.93 kB | Policies route (compliance matrix, drawers).
| `dist/assets/Routing-CKuurdQo.js` | 31.54 kB | 8.62 kB | Routing Lab simulation UI.
| `dist/assets/Agents-DyqpEf-k.js` | 43.91 kB | 11.97 kB | Agents catalog tree + smoke sections.
| `dist/assets/Security-BGcbYWze.js` | 40.36 kB | 11.12 kB | IAM + audit views.
| `dist/assets/Marketplace-CQ6XnO0W.js` | 6.41 kB | 2.17 kB | Marketplace carousel + filters.
| `dist/assets/PlanSummary-BO9tmlX8.js` | 5.90 kB | 1.85 kB | Plan summary modal (lazy overlay).
| `dist/assets/PlanDiffViewer-Ctq82bi-.js` | 0.96 kB | 0.40 kB | Diff viewer helpers loaded on demand.

> Observed sizes generated on 2025-10-20 (UTC) and logged here to mirror the UI observability sheet.

## Main bundle dependency map

The entry chunk (`index-Co_Qq_Z0.js`) currently ships:

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

- Reduce the base CSS (≈395 kB) by pruning unused Bootstrap modules or moving to modular Sass once upstream migrates from `@import`.
- Evaluate dynamic icon loading to avoid shipping the full Font Awesome set on first paint.
- Automate reporting into the UI observability sheet after each CI build (export this table via script).
