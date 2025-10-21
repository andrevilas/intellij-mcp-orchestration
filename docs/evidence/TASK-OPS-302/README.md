# Evidências — TASK-OPS-302

## Checklists

- [x] Runbooks finais publicados em docs/ops/runbooks (rotação, auditoria, incidentes).
- [x] Pipelines atualizadas com secret scanning e ops_compliance (gates antes de lint/test/smoke).
- [x] Evidências registradas em /docs/evidence/TASK-OPS-302 (relatórios e runbooks-activation).
- [x] Job `ops_compliance` adicionado à pipeline com dependência dos estágios `lint`, `test` e `smoke`.
- [x] Script `python3 scripts/ops_controls.py` executado localmente gerando `ops-controls-report.json`.

## Controles validados

1. `scripts/ops_controls.py` verifica ausência de artefatos sensíveis versionados, garante permissões `read` nas workflows e exige evidências OPS-301/OPS-302.
2. Job `ops_compliance` publica o artefato `ops-controls-report` para auditoria e bloqueia merges quando algum controle falha.
3. Novos procedimentos operacionais foram incorporados ao runbook principal (`docs/runbook.md`) e ao playbook de incidentes.
4. A rotina de auditoria OPS-302 está definida em `docs/ops/runbooks/auditoria-operacional.md` e validada pelo `ops_controls.py`.

## Execução manual

```bash
python3 scripts/ops_controls.py --output docs/evidence/TASK-OPS-302/ops-controls-report.json
```

O relatório anexado é reutilizado como evidência de auditoria e deve ser atualizado sempre que rotinas de rotação/auditoria forem executadas.

## Execuções registradas

| Data | Execução | Evidência |
| ---- | -------- | --------- |
| 2025-10-21 | `python3 scripts/ops_controls.py --output docs/evidence/TASK-OPS-302/ops-controls-report.json` | [ops-controls-report.json](ops-controls-report.json) |
| 2025-10-21 | GitHub Actions — jobs `security` e `ops_compliance` (branch `main`) | [Workflow CI](../../.github/workflows/ci.yml) |

> Atualize esta tabela sempre que houver novas rotações, auditorias ou incidentes, adicionando o link direto para a execução (ex.: `https://github.com/<org>/<repo>/actions/runs/<id>`).
