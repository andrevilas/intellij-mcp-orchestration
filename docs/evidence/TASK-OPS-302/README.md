# Evidências — TASK-OPS-302

## Checklists

- [x] Job `ops_compliance` adicionado à pipeline com dependência dos estágios `lint`, `test` e `smoke`.
- [x] Script `python3 scripts/ops_controls.py` executado localmente gerando `ops-controls-report.json`.
- [x] Runbook `docs/ops/runbooks/secrets-incident-playbook.md` documenta rotação, auditoria e acesso mínimo.

## Controles validados

1. `scripts/ops_controls.py` verifica ausência de artefatos sensíveis versionados, garante permissões `read` nas workflows e exige evidências OPS-301/OPS-302.
2. Job `ops_compliance` publica o artefato `ops-controls-report` para auditoria e bloqueia merges quando algum controle falha.
3. Novos procedimentos operacionais foram incorporados ao runbook principal (`docs/runbook.md`) e ao playbook de incidentes.

## Execução manual

```bash
python3 scripts/ops_controls.py --output docs/evidence/TASK-OPS-302/ops-controls-report.json
```

O relatório anexado é reutilizado como evidência de auditoria e deve ser atualizado sempre que rotinas de rotação/auditoria forem executadas.
