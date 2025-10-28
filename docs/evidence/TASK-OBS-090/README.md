# TASK-OBS-090 evidence

Os artefatos de exportação FinOps (CSV, HTML, JSON) devem ser enviados apenas para o cofre de evidências interno. Não faça commit de cópias neste repositório.

## Execução 2025-10-28

- Dataset semeado: `python3 server/scripts/seed_telemetry_events.py --db-path server/routes/fixtures/console.db` (42 eventos gravados no SQLite de fixtures).
- Sanidade automatizada: `PYTHONPATH=server/src:server python3 -m pytest server/tests/test_finops_exports.py`.
- Exportações (CSV/HTML/JSON) geradas via `server/routes/finops.py::export_finops_telemetry` e anexadas no cofre interno.
