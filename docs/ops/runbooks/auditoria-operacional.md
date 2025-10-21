# Runbook — Auditoria Operacional (OPS-302)

## Objetivo

- Transformar as pendências da iniciativa **OPS-ACT-301 / TASK-OPS-302** em rotinas recorrentes de auditoria para segredos e pipelines MCP.
- Garantir que o pipeline CI aplique secret scanning (`security`) e validações de checklist (`ops_compliance`) antes de liberar `lint`, `test` e `smoke`.
- Produzir evidências versionadas em `/docs/evidence/TASK-OPS-302/` sempre que uma auditoria for executada.

## Artefatos obrigatórios

| Arquivo | Finalidade | Frequência |
| ------- | ---------- | ---------- |
| `docs/evidence/TASK-OPS-302/ops-controls-report.json` | Saída do `python3 scripts/ops_controls.py` | Cada execução de auditoria |
| `docs/evidence/TASK-OPS-302/runbooks-activation.md` | Registro de janela, responsáveis e links de PR | Sempre que runbooks ou pipelines forem ajustados |
| `docs/evidence/TASK-OPS-302/README.md` | Checklist consolidado e atualizado | Atualização imediata após cada auditoria |
| Artefato `gitleaks-report` (CI) | Confirmação de secret scanning | Toda execução da pipeline |

## Checklist OPS-302

1. **Secret scanning** — confirmar que o job `security` gerou `gitleaks-report.json` sem violações.
2. **Ops controls** — executar `python3 scripts/ops_controls.py --output docs/evidence/TASK-OPS-302/ops-controls-report.json` e validar `status: pass`.
3. **Runbooks** — revisar `docs/ops/runbooks/secret-management.md` e `docs/ops/runbooks/secrets-incident-playbook.md`, garantindo que refletem o plano `next-steps-activation.md`.
4. **Checklists** — marcar as caixas correspondentes em `docs/evidence/TASK-OPS-302/README.md` e anotar a data em `runbooks-activation.md`.
5. **Pipelines** — verificar se `.github/workflows/ci.yml` mantém `permissions: contents: read` e dependências `needs` para `ops_compliance`.

## Rotina semanal

1. Abrir issue `Audit OPS-302 — <semana ISO>` referenciando os runbooks.
2. Rodar localmente:

   ```bash
   python3 scripts/ops_controls.py --output docs/evidence/TASK-OPS-302/ops-controls-report.json
   gitleaks detect --no-git --config config/gitleaks.toml --report-format json --report-path docs/evidence/TASK-OPS-302/gitleaks-weekly.json
   ```

3. Conferir se o job `ops_compliance` executou com sucesso na pipeline mais recente associada.
4. Atualizar `docs/evidence/TASK-OPS-302/runbooks-activation.md` com o número da issue, executores e links dos artefatos.
5. Notificar o canal `#mcp-ops` com resumo e próximos passos.

## Auditoria sob demanda

- **Antes de PRs críticos** — repetir o checklist completo e anexar relatórios ao PR.
- **Após incidentes** — executar novamente `ops_controls.py` e `gitleaks` registrando as diferenças em `runbooks-activation.md`.
- **Quando scripts/workflows mudarem** — garantir que novas dependências sejam cobertas pela pipeline antes do merge.

## Referências

- [Plano de Ação — Próximos Passos](../../next-steps-activation.md)
- [Runbook de Gestão de Segredos](secret-management.md)
- [Runbook de Incidentes de Segredos](secrets-incident-playbook.md)
- [`scripts/ops_controls.py`](../../../scripts/ops_controls.py)
