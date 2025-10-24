# SCSS dependency map

The `scripts/report-scss-dependencies.mjs` helper crawls the `app/src` tree to map
SCSS usage. Run it from the repo root to regenerate the report:

```bash
node scripts/report-scss-dependencies.mjs
```

It produces `app/metrics/scss-dependency-report.json` with three sections:

- `scssGraph` – directed edges for `@use` / `@forward` relationships, starting from
  `app/src/styles/index.scss` and covering every SCSS partial referenced in the
  frontend bundle.
- `scssConsumers` – TypeScript/TSX modules that import each stylesheet. This makes it
  easy to spot barrels importing the same partials already pulled by leaf components.
- `redundant` – derived from the consumers list, highlighting partials that were
  previously loaded both via a barrel file and directly by the components that need
  them.

## Key relationships

- `app/src/styles/index.scss` only delegates to the token registry in
  `app/src/styles/tokens/_index.scss`, which then brings in `_light.scss` and
  `_dark.scss` for theme variable registration. No other global stylesheet depends on
  `index.scss` directly.【F:app/src/styles/index.scss†L1-L8】【F:app/src/styles/tokens/_index.scss†L1-L7】
- Shared status styling is centralized in `app/src/styles/components/_status-block.scss`.
  Components such as the KPI card, resource table, resource detail card, and progress
  indicator pull it via `@use` to share the same mixins.【F:app/src/components/kpi-card.scss†L1-L14】【F:app/src/components/resource-table.scss†L1-L5】
- Form components (`Input`, `Select`, `TextArea`, `Switch`, `InputGroup`,
  `FormErrorSummary`, `FileUploadControl`, `FileDownloadControl`) import only the
  partials they need (`form-base`, `control-inputs`, `switch`, etc.), enabling per-
  component style loading.【F:app/src/components/forms/Input.tsx†L6-L7】【F:app/src/components/forms/Switch.tsx†L5-L6】

## Redundant imports eliminated

The report flagged `app/src/components/forms/index.ts` as a barrel importing every
form stylesheet and icon registry even though the leaf components already loaded
those assets themselves. The barrel no longer pulls any SCSS or icon modules, so
consumers that import just one form control avoid bundling the entire form style
suite. The Admin Chat entry point now delegates its stylesheet import to
`AdminChat.tsx`, removing another barrel-style redundancy.【F:app/src/components/forms/index.ts†L1-L19】【F:app/src/pages/AdminChat/AdminChat.tsx†L1-L18】

Re-run the script after future refactors to keep the dependency report in sync.
