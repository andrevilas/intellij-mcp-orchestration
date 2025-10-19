# Sprint M6 — Lighthouse ≥90 checklist

Attach this checklist to the PR description for the Sprint M6 performance/theming delivery.

## Prep

- [ ] Update `pnpm-lock.yaml` + dependencies, then run `pnpm --dir app build` without warnings.
- [ ] Ensure `app/dist` assets are rebuilt from a clean workspace (`rm -rf app/dist`).
- [ ] Verify feature flags and mock APIs mirror production defaults.
- [ ] Clear browser storage/cache before each Lighthouse run.

## Audit runs

- [ ] Desktop Lighthouse (Chrome) — Dashboard route.
- [ ] Desktop Lighthouse — Observability route (heavy charts).
- [ ] Desktop Lighthouse — Flows route (React Flow editor).
- [ ] Record Performance, Best Practices, Accessibility, SEO. Confirm Performance ≥ 90.
- [ ] Capture screenshots and JSON reports for each run.

## Follow-up actions

- [ ] Compare bundle sizes against the latest UI observability snapshot.
- [ ] File tickets for regressions (Performance < 90 or major metric drops).
- [ ] Update the observability sheet with new Lighthouse metrics/notes.
- [ ] Attach screenshots + reports to the PR artifacts.
- [ ] Mention this checklist completion in the PR summary (Sprint M6).
