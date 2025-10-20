# Backend Fixtures — Dashboard, Routing e FinOps

Os arquivos JSON deste diretório representam respostas completas dos endpoints usados pelo Console MCP nas páginas de Dashboard, Servers, Routing e FinOps. Eles são carregados automaticamente pelas rotas do protótipo quando a base SQLite ainda não possui telemetria ou quando o simulador/supervisor não consegue derivar métricas a partir do manifest de providers.

Cada payload corresponde ao formato descrito em `server/README.md` e possui um espelho em `tests/fixtures/backend/` para os times de QA automatizarem cenários offline. Consulte os arquivos `servers*.json`, `sessions.json`, `notifications.json`, `policy_manifest.json` e `telemetry_*.json` para garantir paridade entre backend e mocks do frontend.
