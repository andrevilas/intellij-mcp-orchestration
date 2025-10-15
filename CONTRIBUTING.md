# Contributing to Promenade

Thanks for considering a contribution! We keep it pragmatic and welcoming.

## Ground rules
- **License**: By contributing, you agree to Apache-2.0.
- **Code of Conduct**: Follow `CODE_OF_CONDUCT.md`.
- **Commit style**: Conventional Commits (`feat:`, `fix:`, `docs:`...).

## Getting started
1. Fork and clone.
2. Create a scoped branch: `feat/...`, `fix/...`, `docs/...`, `chore/...`.
3. Install & build:
   ```bash
   yarn install
   yarn build
   ```
4. Run smoke tests:
   ```bash
   npx playwright test -g "@smoke"
   ```
5. Lint & format (adjust to your stack):
   ```bash
   yarn lint && yarn format
   ```
6. Open a PR with clear motivation, screenshots/GIFs, and checklist.

## PR checklist
- [ ] Scope and motivation are clear
- [ ] Tests for the happy path
- [ ] No breaking public API changes (or documented)
- [ ] Docs updated
- [ ] Build and linters passing

## Discussions & roadmap
Use issues with labels `proposal`, `bug`, `help wanted`. Larger changes go through short RFCs in `/rfcs`.
