# Runbook — Gestão de Segredos MCP

## Objetivo e escopo

- Consolidar o procedimento oficial definido na iniciativa **OPS-ACT-301 / TASK-OPS-302** do plano de próximos passos.
- Garantir rotação preventiva e emergencial das credenciais MCP, mantendo evidências rastreáveis em `/docs/evidence/TASK-OPS-302/`.
- Padronizar integrações de pipelines (`security`, `ops_compliance`, `lint`, `test`, `smoke`) com o cofre SOPS e com o script `ops_controls.py`.

## Inventário crítico

| Item | Origem | Responsável | Observação |
| ---- | ------ | ----------- | ---------- |
| `config/secrets.enc.yaml` | Repositório | SecOps | Bundle cifrado principal, inclui `MCP_SECRETS_VERSION`. |
| `.sops.yaml` | Repositório | SecOps | Politica de criptografia com chaves públicas *age*. |
| `scripts/secrets-sync.sh` | Repositório | Plataforma | Distribui segredos para `~/.mcp` com `chmod 600`. |
| `SOPS_AGE_KEY` | GitHub Secrets / 1Password | Squad Ops | Chave privada efêmera usada em CI/CD e estações locais. |

## Preparação

1. Verificar acesso ao cofre `1Password › MCP – SOPS Age key` e às seções protegidas de GitHub Actions.
2. Atualizar a matriz de contato do plantão em `docs/ops/incident-response.md`.
3. Confirmar que `python3 scripts/ops_controls.py` passa localmente antes de iniciar qualquer rotação.

## Rotação programada

1. **Planejar janela** — alinhar com Incident Commander e comunicar no canal `#mcp-ops` com pelo menos 24 h de antecedência.
2. **Gerar chave** — executar `age-keygen > mcp-age-key.txt`. Registrar o bloco `AGE-SECRET-KEY` no cofre seguro e versionar apenas a chave pública em `.sops.yaml`.
3. **Atualizar bundle** — exportar `SOPS_AGE_KEY` via `op read`, rodar `sops config/secrets.enc.yaml` e substituir tokens expirados. Incrementar `MCP_SECRETS_VERSION` e documentar o motivo no cabeçalho do arquivo.
4. **Validar pipelines** — rodar `make secrets-sync` localmente, confirmar permissões `600` e executar `python3 scripts/ops_controls.py --output docs/evidence/TASK-OPS-302/ops-controls-report.json`.
5. **Abrir PR** — anexar `ops-controls-report.json`, diffs cifrados e checklist atualizado em `/docs/evidence/TASK-OPS-302/`. Solicitar dupla revisão (SecOps + Engenharia) antes do merge.
6. **Sincronizar auditoria** — registrar a execução em `docs/evidence/TASK-OPS-302/README.md` e atualizar o histórico em `runbooks-activation.md`, garantindo que o checklist OPS-302 permaneça marcado.

## Rotação emergencial

1. **Acionamento** — seguir o fluxo de severidade do [playbook de incidentes de segredos](secrets-incident-playbook.md) quando houver vazamento, suspeita confirmada ou ordem externa.
2. **Isolamento** — revogar tokens nos provedores MCP antes de alterar o bundle. Suspender deploys e workflows dependentes quando necessário.
3. **Reconstrução do bundle** — gerar nova chave *age*, atualizar `.sops.yaml` e `config/secrets.enc.yaml`, incrementando `MCP_SECRETS_VERSION` e anotando o incidente associado.
4. **Validação cruzada** — executar `python3 scripts/ops_controls.py` e `gitleaks detect --no-git --config config/gitleaks.toml` registrando os relatórios em `/docs/evidence/TASK-OPS-302/`.
5. **Comunicação** — publicar atualizações a cada 30 minutos no canal `#mcp-incident` até que a rotação esteja concluída e verificada.
6. **Handoff pós-incidente** — entregar um resumo para Auditoria Operacional e incluir os links de execução na seção `Execuções registradas` das evidências OPS-302.

## Validação pós-rotação

1. Garantir execução verde dos jobs `security` (gitleaks) e `ops_compliance` (ops_controls).
2. Reexecutar `gitleaks detect --no-git --config config/gitleaks.toml --report-format json --report-path docs/evidence/TASK-OPS-302/gitleaks-post-rotation.json`.
3. Confirmar que os workflows não retêm o arquivo `~/.config/sops/age/keys.txt` após o step de sincronização.
4. Atualizar `docs/evidence/TASK-OPS-302/runbooks-activation.md` com data/hora da rotação, responsáveis e links diretos para execuções relevantes (CI, relatórios, PRs).
5. Notificar Auditoria Operacional sobre a rotação concluída para que o checklist semanal considere os novos artefatos.

## Auditoria contínua

1. Executar o checklist de [Auditoria Operacional](auditoria-operacional.md) logo após cada rotação programada ou emergencial.
2. Validar que `docs/ops/runbooks/secrets-incident-playbook.md` contém as lições aprendidas mais recentes e que as matrizes de contato estão atualizadas.
3. Comparar o `ops-controls-report.json` atual com a versão anterior para confirmar que não houve regressões em permissões de workflows ou inventário de segredos.
4. Registrar a auditoria concluída em `docs/evidence/TASK-OPS-302/README.md`, vinculando os arquivos anexados e as execuções referenciadas.

## Comunicação e evidências

- Atualizar `docs/evidence/TASK-OPS-302/README.md` marcando os checklists concluídos e vinculando o PR correspondente.
- Registrar notas de mudança em `docs/evidence/TASK-OPS-302/runbooks-activation.md`, incluindo ID do alerta ou motivo (auditoria, incidente, requisito legal).
- Compartilhar resumo no relatório semanal de auditoria (mesmo template usado na trilha OPS-ACT-301).

## Automação de sincronização local

```bash
# pré-requisito: sops + age instalados
export SOPS_AGE_KEY="$(op read 'op://MCP/SOPS Age key/private')"
make secrets-sync
```

Fluxo do script `make secrets-sync`:

1. Descriptografa `config/secrets.enc.yaml` usando SOPS com saída JSON.
2. Publica `~/.mcp/.env` e `~/.mcp/console-secrets.json` com `chmod 600` e `umask 077`.
3. Remove diretórios temporários e o arquivo de chave ao término.

## Integração com CI/CD

- O job `security` executa gitleaks (secret scanning) usando `config/gitleaks.toml` e bloqueia merges quando encontra vazamentos.
- O job `ops_compliance` roda `python3 scripts/ops_controls.py` e exige a presença dos runbooks finais e checklists OPS-302.
- Os jobs `lint`, `test` e `smoke` consomem segredos apenas quando `secrets.SOPS_AGE_KEY` estiver configurado e removem o material sensível ao final do step.

## Referências

- [Plano de Ação — Próximos Passos](../../next-steps-activation.md)
- [Runbook de Auditoria Operacional](auditoria-operacional.md)
- [Playbook de Incidentes de Segredos](secrets-incident-playbook.md)
- [`scripts/ops_controls.py`](../../../scripts/ops_controls.py)
