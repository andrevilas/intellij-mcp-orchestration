# Evidências — TASK-OPS-301

## Checklists

- [x] Secret scan executado com `gitleaks detect --no-git --config config/gitleaks.toml` (relatório anexado).
- [x] Pipelines atualizados com gates de segredos e sincronização segura (`security`, `make secrets-sync`).
- [x] Gate `ops_compliance` validando controles de OPS-302 (`scripts/ops_controls.py`).

## Resumo das ações

1. Definido SOPS + age como cofre padrão e documentado no runbook (`docs/ops/runbooks/secret-management.md`).
2. `scripts/secrets-sync.sh` gera `~/.mcp/.env` e `console-secrets.json` com permissões mínimas.
3. Pipelines (`lint`, `test`, `smoke`) dependem dos jobs `security` e `ops_compliance`, bloqueando PRs quando controles de segurança falham.
4. `scripts/ops_controls.py` garante ausência de artefatos sensíveis versionados, valida permissões mínimas nas workflows e exige evidências em `/docs/evidence/TASK-OPS-302/`.
5. `config/gitleaks.toml` estende a política padrão para evitar falsos positivos em placeholders documentados.
6. Relatório `gitleaks-report.json` confirma ausência de segredos versionados (execução local e CI).

## Comandos executados

```bash
gitleaks detect --no-git --source . --config config/gitleaks.toml \
  --report-format json --report-path docs/evidence/TASK-OPS-301/gitleaks-report.json
```

Consulte também [`ci-updates.md`](ci-updates.md) para o diff funcional do workflow.
