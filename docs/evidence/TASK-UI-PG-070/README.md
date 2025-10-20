# Evidências — TASK-UI-PG-070

## Execução dos testes
- Comando: `PLAYWRIGHT_VIDEO=on PLAYWRIGHT_TRACE=on pnpm --dir tests exec playwright test dashboard.spec.ts agents.spec.ts servers.spec.ts security.spec.ts policies-hitl.spec.ts routing-rules.spec.ts finops-plan.spec.ts smoke-endpoints.spec.ts --project=chromium --workers=1 --output=../docs/evidence/TASK-UI-PG-070/playwright-artifacts --reporter=list`
- Data: 2025-10-18 14:05 UTC (chromium, 1 worker).
- Logs, vídeos e traces foram exportados para o cofre de QA (`TASK-UI-PG-070` na pasta compartilhada da squad). Solicite acesso a QA caso precise revisar o material bruto.

## Resumo do smoke Playwright (chromium)
| Rota | Status | Observações principais |
| --- | --- | --- |
| Dashboard | ❌ Falha | Cards de métricas não renderizam; a asserção quebra por valores duplicados ainda no carregamento inicial. |
| Agents (catálogo + playground) | ❌ Falha | Grid permanece vazio e o botão "Detalhes" nunca habilita porque as fixtures não sobem o estado `ready`. |
| FinOps | ❌ Falha | Link de navegação "FinOps" não responde ao primeiro clique e a suite expira por timeout. |
| Policies HITL | ❌ Falha | Placeholder "ex.: Ops review" resulta em inputs duplicados e impede o preenchimento do formulário. |
| Routing Lab | ❌ Falha | Não é possível selecionar intents fallback e o fluxo de erro não apresenta mensagem ao usuário. |
| Security (Keys/Audit) | ❌ Falha | Tabelas de usuários e auditoria não populam linhas; a tela permanece vazia. |
| Servers | ❌ Falha | Painel de health devolve contagens `['4','0','0','0']` em vez de `['1','0','0','0']`, quebrando as verificações. |
| Smoke endpoints | ❌ Falha | Nenhuma linha `row` é renderizada no painel, indicando ausência de dados persistidos. |

> Todos os testes geraram `video.webm`, `trace.zip` e `error-context.md`. O material bruto está disponível junto ao time de QA.
