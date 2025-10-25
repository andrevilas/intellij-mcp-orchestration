# Runbook — Ingestão de Telemetria FinOps

## Objetivo

- Garantir que os fixtures (`finops_sprints.json`, `finops_pull_requests.json`) e o SQLite de telemetria estejam sincronizados antes de revisões FinOps.
- Registrar evidências versionadas (`JSON`, `CSV`, `HTML`) geradas pelas rotas `/api/v1/telemetry/finops/*` e `/api/v1/telemetry/export` para auditorias.

## Pré-requisitos

- Python 3.11+ com dependências do backend instaladas (`pip install -e server[dev]` quando aplicável).
- Acesso de escrita ao diretório `docs/evidence/` e permissão para atualizar `server/routes/fixtures/`.
- Variável de ambiente `PYTHONPATH=server/src` durante chamadas diretas ao FastAPI.

## Procedimento

1. **Atualizar fixtures**
   ```bash
   python scripts/generate_finops_fixtures.py
   ```
   Confirma a atualização dos arquivos em `tests/fixtures/backend/` e `server/routes/fixtures/`.
2. **Semear o SQLite local**
   ```bash
   python scripts/generate_finops_fixtures.py --seed-db --db-path server/routes/fixtures/console.db
   ```
   Ajuste o caminho conforme a topologia do ambiente (ex.: `${HOME}/.mcp/console.db`).
3. **Exportar o caminho do banco**
   ```bash
   export CONSOLE_MCP_DB_PATH="server/routes/fixtures/console.db"
   ```
   Necessário para que o FastAPI utilize os dados recém semeados.
4. **Coletar respostas das rotas FinOps**
   ```bash
   DATA=$(date -I)
   DEST="${TMPDIR:-/tmp}/finops-${DATA}"
   mkdir -p "${DEST}"
   export DEST

   PYTHONPATH=server/src python - <<'PY'
   import json
   import os
   from pathlib import Path
   from fastapi.testclient import TestClient
   from console_mcp_server.main import app

   dest = Path(os.environ["DEST"])
   client = TestClient(app)
   with client:
       matrix = {
           "telemetry_finops_sprints.json": ("/api/v1/telemetry/finops/sprints", None),
           "telemetry_finops_pull_requests.json": ("/api/v1/telemetry/finops/pull-requests", None),
           "telemetry_export.csv": ("/api/v1/telemetry/export", {"format": "csv"}),
           "telemetry_export.html": ("/api/v1/telemetry/export", {"format": "html"}),
       }
       for filename, (path, params) in matrix.items():
           response = client.get(path, params=params)
           response.raise_for_status()
           target = dest / filename
           if filename.endswith(".json"):
               target.write_text(json.dumps(response.json(), indent=2, ensure_ascii=False))
           else:
               target.write_text(response.text)
           print(f"gravado {target}")
   PY
   ```
   O script usa o `TestClient` para respeitar os eventos de `startup/shutdown` do FastAPI e grava os arquivos formatados em um diretório temporário (`${TMPDIR}` ou `/tmp`).
5. **Validar janelas e agregações**
   - Conferir se as respostas cobrem o intervalo recomendado (`start=2025-10-08T00:00:00Z`, `end=2025-10-21T23:59:59Z`, `window_days=7`).
   - Revisar `status`, `cost_delta` e `summary` dos relatórios de sprint/PR para detectar regressões antes do go-live.

## Evidências esperadas

- `telemetry_finops_sprints.json`
- `telemetry_finops_pull_requests.json`
- `telemetry_export.csv`
- `telemetry_export.html`

Envie esses arquivos para o cofre corporativo de evidências (SharePoint/Confluence) e **não** faça commit das cópias neste repositório. Referencie o link seguro no dossiê associado ao PR.

## Referências

- `scripts/generate_finops_fixtures.py`
- `server/src/console_mcp_server/main.py`
- `docs/runbook.md` — seção **FinOps — recarga determinística**
