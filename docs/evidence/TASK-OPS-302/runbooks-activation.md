# Registro — Runbooks e Pipelines OPS-302

- **Data:** 2025-10-21 15:00 UTC
- **Responsáveis:** Squad Ops/SRE (`@platform-ops`, `@secops-oncall`)
- **Contexto:** Conclusão da tarefa TASK-OPS-302 alinhada ao plano de próximos passos (`docs/next-steps-activation.md`).

## Atualizações executadas

1. Runbooks finalizados em `docs/ops/runbooks/`:
   - `secret-management.md` — incluiu fluxo de rotação programada, validações pós-rotação e integração com os jobs `security` e `ops_compliance`.
   - `auditoria-operacional.md` — documentou checklist OPS-302, rotina semanal e auditorias sob demanda.
   - `secrets-incident-playbook.md` — alinhou seções de rotação, auditoria, acesso mínimo e resposta a incidentes.
2. Pipeline `.github/workflows/ci.yml` passou a armazenar `docs/evidence/TASK-OPS-302/ops-controls-report.json` como artefato oficial.
3. Evidências consolidadas neste diretório (`README.md`, `ops-controls-report.json`, `runbooks-activation.md`).

## Verificações

- `python3 scripts/ops_controls.py --output docs/evidence/TASK-OPS-302/ops-controls-report.json`
- `gitleaks detect --no-git --config config/gitleaks.toml --report-format json --report-path docs/evidence/TASK-OPS-302/gitleaks-post-incident.json`

## Links de execução

- **Ops controls** — [ops-controls-report.json](ops-controls-report.json) gerado pelo comando `python3 scripts/ops_controls.py --output docs/evidence/TASK-OPS-302/ops-controls-report.json`.
- **GitHub Actions (CI)** — Jobs `security` e `ops_compliance` executados em 2025-10-21 ([workflow CI](../../.github/workflows/ci.yml)); atualizar com o link direto da *run* (`actions/runs/<id>`).

## Próximos passos

- Reexecutar o checklist semanalmente (`auditoria-operacional.md`).
- Atualizar este registro sempre que novos incidentes ou mudanças nos pipelines ocorrerem.
