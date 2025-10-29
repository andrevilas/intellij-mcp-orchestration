# TASK-OBS-090 evidence

Os artefatos de exportação FinOps (CSV, HTML, JSON) devem ser enviados apenas para o cofre de evidências interno. Não faça commit de cópias neste repositório.

## Execução 2025-10-29 23:50 UTC

- Dataset semeado novamente: `python3 server/scripts/seed_telemetry_events.py --db-path server/routes/fixtures/console.db` (`seeded_finops_dataset` registrou 42 eventos; commit `afdfe67`).
- Conferência direta no SQLite: `python3 -c "import sqlite3, json; conn=sqlite3.connect('server/routes/fixtures/console.db'); print(conn.execute('SELECT COUNT(*) FROM telemetry_events').fetchone()[0])"` → **42** eventos disponíveis (amostra codex/gemini/glm confirmada).
- Validação da exportação CSV: `CONSOLE_MCP_DB_PATH=server/routes/fixtures/console.db PYTHONPATH=server/src:server python3 - <<'PY' ...` chamando `export_finops_telemetry('csv')` retornou `text/csv` com cabeçalho esperado e 43 linhas (1 header + 42 eventos).
- Artefatos CSV/HTML/JSON transferidos para o cofre interno e versionamentos antigos substituídos (não subir para este repositório).
- Próxima verificação agendada: repetir `pytest server/tests/test_finops_exports.py` no próximo ciclo de observabilidade (não necessário nesta rodada).

> **Nota:** lembre-se de definir `CONSOLE_MCP_DB_PATH=server/routes/fixtures/console.db` ao executar `export_finops_telemetry` localmente; caso contrário, a função usa `~/.mcp/console.db` e lançará `ExportValidationError`.

Execução anterior (2025-10-28):
- `python3 server/scripts/seed_telemetry_events.py --db-path server/routes/fixtures/console.db`
- `PYTHONPATH=server/src:server python3 -m pytest server/tests/test_finops_exports.py`
- Exportações (CSV/HTML/JSON) geradas via `server/routes/finops.py::export_finops_telemetry` e armazenadas no cofre interno.
