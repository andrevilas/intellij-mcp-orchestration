# Evidências — 2025-10-25

## Resumo
- `pnpm --dir tests test` continua falhando imediatamente ao iniciar o Playwright.
- O runner Chromium aborta com `browserType.launch` informando dependências de sistema ausentes.
- Mantemos as sprints UI **bloqueadas** até que o ambiente receba `playwright install-deps` ou os pacotes listados via `apt-get`.

## Execuções registradas
| Data/Hora (UTC) | Comando | Resultado |
| --- | --- | --- |
| 2025-10-25 19:27 | `pnpm --dir tests test` | Falha — Playwright não lança Chromium (`browserType.launch`).【4ea611†L1-L205】

## Próximos passos
1. Reexecutar `pnpm --dir tests test` após instalar dependências listadas na mensagem do Playwright.
2. Atualizar os checklists em `docs/archive/next-steps.md` e `docs/archive/ui-next-steps.md` quando a suíte voltar a passar.
3. Sincronizar o status com `docs/audit-ui-m1-m6.md`, garantindo que os bloqueios sejam refletidos no relatório de auditoria e nas atas de governança.
