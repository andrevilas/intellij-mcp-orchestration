# Runbook — Resposta a Incidentes de Segredos (OPS-301/OPS-302)

## Objetivo

Fornecer uma trilha única para detectar, conter e erradicar incidentes envolvendo segredos MCP, alinhada aos controles de rotação, auditoria contínua e acesso mínimo definidos nas iniciativas `TASK-OPS-301` e `TASK-OPS-302`.

## Pré-requisitos

- Acesso ao cofre seguro (`1Password › MCP – SOPS Age key`).
- Permissão de escrita nos provedores MCP (Gemini, OpenAI/Codex, Anthropic, Zhipu) para revogar/regenerar tokens.
- Acesso aos pipelines GitHub Actions (`security`, `ops_compliance`, `lint`, `test`, `smoke`).
- Familiaridade com [`scripts/secrets-sync.sh`](../../../scripts/secrets-sync.sh) e [`scripts/ops_controls.py`](../../../scripts/ops_controls.py).

## Fluxo tático (0–60 min)

1. **Detecção** — alertas do job `security`, `ops_compliance` ou reporte externo.
2. **Triagem**
   - Confirmar o sinal (log `gitleaks`, report JSON de `ops_controls`).
   - Classificar severidade: `S1` (vazamento confirmado), `S2` (falha de controle), `S3` (suspeita/falso positivo).
3. **Comando** — anunciar o incidente no canal `#mcp-incident`, nomear Incident Commander e registrar timestamps iniciais.
4. **Mitigação inicial** — isolar tokens afetados e bloquear automações que dependam deles (pausar deploys).
5. **Comunicação** — se clientes impactados, alinhar com Comunicação/Legal antes de publicar atualizações externas.

## Rotação controlada de segredos

1. Gere uma chave *age* dedicada (`age-keygen > mcp-age-key.txt`).
2. Publique a chave pública em `.sops.yaml` e armazene o segredo privado no cofre seguro.
3. Descriptografe o bundle com `sops config/secrets.enc.yaml`, substitua os tokens comprometidos e incremente `MCP_SECRETS_VERSION`.
4. Execute `python3 scripts/ops_controls.py --output /tmp/ops-controls.json` para validar que nenhum artefato sensível ficou versionado.
5. Rode `make secrets-sync` para validar acesso local/CI e confirme permissões `600` dos arquivos gerados.
6. Abra PR com dupla revisão, anexando o relatório `ops-controls.json` e o diff cifrado em `/docs/evidence/TASK-OPS-301/` ou `/docs/evidence/TASK-OPS-302/`.

## Auditoria e evidências

- Reexecute `gitleaks detect --no-git --config config/gitleaks.toml --report-format json --report-path docs/evidence/TASK-OPS-301/gitleaks-report.json`.
- Gere e commite `docs/evidence/TASK-OPS-302/ops-controls-report.json` com `python3 scripts/ops_controls.py --output docs/evidence/TASK-OPS-302/ops-controls-report.json`.
- Atualize os checklists de `/docs/evidence/TASK-OPS-301/README.md` e `/docs/evidence/TASK-OPS-302/README.md`.
- Garanta que o job `ops_compliance` publicou o artefato `ops-controls-report` na execução de CI que valida a correção.

## Acesso mínimo

1. Revise `Settings › Secrets and variables › Actions` no GitHub e invalide tokens sem uso.
2. Confirme que todos os workflows possuem `permissions: contents: read` e não utilizam escopos `write` (validado por `scripts/ops_controls.py`).
3. Verifique se os scripts locais usam `umask 077` e `chmod 600` (vide `scripts/secrets-sync.sh`).
4. Atualize a matriz de acesso no cofre compartilhado e registre mudanças em `/docs/evidence/TASK-OPS-302/README.md`.

## Encerramento e handover

1. Documente a linha do tempo, causa raiz e ações preventivas em `docs/evidence/<incident>/post-mortem.md`.
2. Execute retroativa de 24 h para monitorar novos alertas `security`/`ops_compliance`.
3. Compartilhe resumo com a liderança no relatório semanal de auditoria.
4. Atualize `docs/archive/next-steps.md` marcando `TASK-OPS-302` como concluída quando aplicável.

## Referências

- [Runbook de Gestão de Segredos](secret-management.md)
- [Incident Response — MCP Secrets & Pipelines](../incident-response.md)
- [Plano de Ação — Próximos Passos](../../next-steps-activation.md)
- [Runbook Operacional Principal](../../runbook.md)
