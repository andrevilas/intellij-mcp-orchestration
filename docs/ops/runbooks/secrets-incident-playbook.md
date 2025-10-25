# Runbook — Resposta a Incidentes de Segredos (OPS-301/OPS-302)

## Objetivo

Centralizar a resposta a incidentes envolvendo segredos MCP, alinhando rotação emergencial, auditoria contínua e controles de acesso mínimo definidos para `TASK-OPS-302` no plano de próximos passos.

## Pré-requisitos

- Acesso ao HashiCorp Vault corporativo (`VAULT_ADDR`, `VAULT_SECRET_PATH`, `VAULT_NAMESPACE`) e às credenciais AppRole (`VAULT_ROLE_ID`, `VAULT_SECRET_ID`) ou token dedicado (`VAULT_TOKEN`).
- Acesso ao cofre de emergência (`1Password › MCP – SOPS Age key`) para fallback local.
- Permissão para revogar/gerar tokens nos provedores MCP (Gemini, OpenAI/Codex, Anthropic, Zhipu).
- Familiaridade com [`config/secure_reader.py`](../../../config/secure_reader.py), [`scripts/secrets-sync.sh`](../../../scripts/secrets-sync.sh), [`scripts/secrets-audit.sh`](../../../scripts/secrets-audit.sh) e [`scripts/ops_controls.py`](../../../scripts/ops_controls.py).
- Checklists atualizados em `/docs/evidence/TASK-OPS-302/`.

## Fluxo tático (0–60 min)

1. **Detecção** — alerta dos jobs `security` (`detect-secrets` + `gitleaks`), `ops_compliance` (ops_controls) ou reporte externo.
2. **Triagem** — validar o sinal com artefatos anexados, classificar severidade (`S1` confirmado, `S2` falha de controle, `S3` suspeita).
3. **Comando** — anunciar no canal `#mcp-incident`, nomear Incident Commander, registrar timestamps iniciais.
4. **Mitigação inicial** — pausar deploys que dependem dos segredos afetados e isolar tokens (revogar credenciais diretamente nos provedores).
5. **Comunicação** — alinhar mensagens com Comunicação/Legal quando houver impacto externo.

## Rotação emergencial

1. Revogar os tokens comprometidos diretamente nos provedores MCP e registrar timestamps.
2. Gerar nova chave *age* (`age-keygen > mcp-age-key.txt`) e salvar o segredo em 1Password.
3. Atualizar `.sops.yaml` com a chave pública, executar `sops config/secrets.enc.yaml` substituindo os tokens comprometidos e incrementando `MCP_SECRETS_VERSION`.
4. Publicar o novo JSON de segredos no Vault com `vault kv put <mount>/<path> @config/secrets.enc.yaml` (ou equivalente) garantindo versionamento (`VAULT_SECRETS_KEY` → `secrets`).
5. Rodar `SECRET_PROVIDER=vault make secrets-sync` para validar a sincronização com o Vault e, em seguida, `make secrets-sync` para checar o fallback SOPS.
6. Executar `python3 scripts/ops_controls.py --output docs/evidence/TASK-OPS-302/ops-controls-report.json` antes de abrir o PR de correção.
7. Executar `bash scripts/secrets-audit.sh` e `gitleaks detect --no-git --config config/gitleaks.toml --report-format json --report-path docs/evidence/TASK-OPS-302/gitleaks-post-incident.json` para confirmar limpeza imediata.
8. Preencher `docs/evidence/TASK-OPS-302/runbooks-activation.md` com data, responsáveis, referência do incidente e links de execução registrados.

## Auditoria pós-incidente

- Executar novamente `bash scripts/secrets-audit.sh` (detect-secrets) e `gitleaks detect --no-git` confirmando `exit code 0`; anexar evidências no ticket do incidente.
- Validar que `ops-controls-report.json` registra todos os checks como `pass` e anexar o arquivo ao PR ou issue do incidente.
- Atualizar os checklists de `/docs/evidence/TASK-OPS-302/README.md` marcando as caixas referentes a runbooks, pipelines e execuções registradas.
- Garantir que a execução da CI publica os artefatos `gitleaks-report` e `ops-controls-report`, vinculando-os na seção `Execuções registradas`.
- Compartilhar um resumo com Auditoria Operacional e registrar lições aprendidas no checklist semanal.

## Acesso mínimo

1. Revisar `Settings › Secrets and variables › Actions` no GitHub, removendo credenciais não utilizadas.
2. Verificar permissões das workflows (`permissions: contents: read`) e registrar eventuais ajustes em `/docs/evidence/TASK-OPS-302/runbooks-activation.md`.
3. Conferir se scripts locais (`scripts/secrets-sync.sh`) aplicam `umask 077` e `chmod 600` aos arquivos gerados e se `config/secure_reader.py` está apontando para o Vault correto.
4. Revisar os roles/perfis do Vault (`vault read auth/approle/role/<role_name>`) garantindo TTL e escopos mínimos.
5. Sincronizar a matriz de acesso no cofre compartilhado após a rotação.

## Integração com HashiCorp Vault

1. Os pipelines `lint`, `test` e `smoke` utilizam a etapa **Sync secure secrets (if configured)**. Configure os secrets do repositório (`VAULT_ADDR`, `VAULT_SECRET_PATH`, `VAULT_NAMESPACE`, `VAULT_ROLE_ID`, `VAULT_SECRET_ID` ou `VAULT_TOKEN`) antes de habilitar a extração automática.
2. O script [`config/secure_reader.py`](../../../config/secure_reader.py) negocia o token via AppRole (ou usa `VAULT_TOKEN`) e normaliza a resposta KV2 (`data.data`).
3. Para execução local use `SECRET_PROVIDER=vault make secrets-sync` (Vault) ou omita a variável para fallback SOPS.
4. Mantenha o baseline `config/detect-secrets.baseline` versionado e execute `make secrets-audit` sempre que atualizar segredos ou pipelines.

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
