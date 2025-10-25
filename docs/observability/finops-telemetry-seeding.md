# FinOps telemetry export seeding runbook

Este procedimento garante que a base SQLite utilizada pelo backend possua eventos suficientes para validar os relatórios e exportações FinOps.

## 1. Semear `telemetry_events`

```bash
python -m server.scripts.seed_telemetry_events --db-path server/routes/fixtures/console.db
```

O script lê `server/routes/fixtures/finops_events.json`, limpa a tabela `telemetry_events` e insere o dataset completo (incluindo coortes de experimento). O log final reporta o caminho da base e a quantidade de eventos gravados.

## 2. Validar exportações

Utilize os helpers de `server/routes/finops.py` para emitir e inspecionar cada formato suportado:

```bash
python - <<'PY'
from datetime import datetime, timezone

from server.routes.finops import export_finops_telemetry

window_start = datetime(2025, 10, 8, tzinfo=timezone.utc)
window_end = datetime(2025, 10, 21, 23, 59, 59, tzinfo=timezone.utc)

for fmt in ("csv", "html", "json"):
    export = export_finops_telemetry(fmt, start=window_start, end=window_end)
    print(fmt, len(export.document), export.media_type)
PY
```

Os validadores garantem que cada exportação possua colunas/chaves esperadas. Caso a tabela esteja vazia, uma exceção `ExportValidationError` será lançada para evitar evidências incorretas.

## 3. Arquivar evidências

Exporte os artefatos (`telemetry_export.csv`, `telemetry_export.html`, `telemetry_export.json`) e anexe-os ao dossiê **TASK-OBS-090** no cofre de evidências interno. Não faça commit desses arquivos no repositório git; utilize o upload no SharePoint/Confluence para preservar a rastreabilidade.

## 4. Executar testes automatizados

```bash
pytest server/tests/test_finops_exports.py
```

O teste cobre todos os formatos e confirma que o helper falha quando não há eventos na base, prevenindo regressões futuras.
