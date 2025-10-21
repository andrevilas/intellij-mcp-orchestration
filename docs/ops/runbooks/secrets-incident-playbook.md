# Runbook — Resposta a Incidentes de Segredos (OPS-301/OPS-302)

## Objetivo

Centralizar a resposta a incidentes envolvendo segredos MCP, alinhando rotação emergencial, auditoria contínua e controles de acesso mínimo definidos para `TASK-OPS-302` no plano de próximos passos.

## Pré-requisitos

- Acesso ao cofre seguro (`1Password › MCP – SOPS Age key`) e aos secrets de GitHub Actions.
- Permissão para revogar/gerar tokens nos provedores MCP (Gemini, OpenAI/Codex, Anthropic, Zhipu).
- Familiaridade com [`scripts/secrets-sync.sh`](../../../scripts/secrets-sync.sh) e [`scripts/ops_controls.py`](../../../scripts/ops_controls.py).
- Checklists atualizados em `/docs/evidence/TASK-OPS-302/`.

## Fluxo tático (0–60 min)

1. **Detecção** — alerta dos jobs `security` (gitleaks), `ops_compliance` (ops_controls) ou reporte externo.
2. **Triagem** — validar o sinal com artefatos anexados, classificar severidade (`S1` confirmado, `S2` falha de controle, `S3` suspeita).
3. **Comando** — anunciar no canal `#mcp-incident`, nomear Incident Commander, registrar timestamps iniciais.
4. **Mitigação inicial** — pausar deploys que dependem dos segredos afetados e isolar tokens (revogar credenciais diretamente nos provedores).
5. **Comunicação** — alinhar mensagens com Comunicação/Legal quando houver impacto externo.

## Rotação

1. Gerar nova chave *age* (`age-keygen > mcp-age-key.txt`) e salvar o segredo em 1Password.
2. Atualizar `.sops.yaml` com a chave pública, executar `sops config/secrets.enc.yaml` substituindo os tokens comprometidos e incrementando `MCP_SECRETS_VERSION`.
3. Rodar `make secrets-sync` localmente para validar permissões e sincronização.
4. Executar `python3 scripts/ops_controls.py --output docs/evidence/TASK-OPS-302/ops-controls-report.json` antes de abrir o PR de correção.
5. Preencher `docs/evidence/TASK-OPS-302/runbooks-activation.md` com data, responsáveis e referência do incidente.

## Auditoria

- Reexecutar `gitleaks detect --no-git --config config/gitleaks.toml --report-format json --report-path docs/evidence/TASK-OPS-302/gitleaks-post-incident.json` para confirmar limpeza do repositório.
- Validar que `ops-controls-report.json` registra todos os checks como `pass` e anexar o arquivo ao PR.
- Atualizar os checklists de `/docs/evidence/TASK-OPS-302/README.md` marcando as caixas referentes a runbooks e pipelines.
- Garantir que a execução da CI publica os artefatos `gitleaks-report` e `ops-controls-report`.

## Acesso mínimo

1. Revisar `Settings › Secrets and variables › Actions` no GitHub, removendo credenciais não utilizadas.
2. Verificar permissões das workflows (`permissions: contents: read`) e registrar eventuais ajustes em `/docs/evidence/TASK-OPS-302/runbooks-activation.md`.
3. Conferir se scripts locais (`scripts/secrets-sync.sh`) aplicam `umask 077` e `chmod 600` aos arquivos gerados.
4. Sincronizar a matriz de acesso no cofre compartilhado após a rotação.

## Resposta a incidentes

1. **Erradicação** — após a rotação, reexecutar os pipelines `security`, `ops_compliance`, `lint`, `test` e `smoke` garantindo verde completo.
2. **Recuperação** — monitorar alertas por 24 h e confirmar que não há recriação de tokens comprometidos.
3. **Post-mortem** — produzir relatório em `docs/evidence/<incident>/post-mortem.md` com causa raiz, impacto e ações preventivas.
4. **Follow-up** — atualizar `docs/archive/next-steps.md` marcando `TASK-OPS-302` conforme aplicável e incluir resumo no relatório semanal.

## Referências

- [Runbook de Gestão de Segredos](secret-management.md)
- [Runbook de Auditoria Operacional](auditoria-operacional.md)
- [Incident Response — MCP Secrets & Pipelines](../incident-response.md)
- [Plano de Ação — Próximos Passos](../../next-steps-activation.md)
- [Runbook Operacional Principal](../../runbook.md)
