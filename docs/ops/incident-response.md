# Incident Response — MCP Secrets & Pipelines

## Escopo

- Vazamento ou suspeita de vazamento de credenciais MCP.
- Falhas no pipeline CI/CD relacionadas a segredos (`make secrets-sync`, `gitleaks`).
- Rotação emergencial de chaves de provedores ou de chaves *age* do SOPS.

## Responsáveis

| Função | Primário | Backup | SLA inicial |
| ------ | -------- | ------ | ----------- |
| Incident Commander | @ops-lider | @ops-backup | 15 min |
| SecOps (SOPS & gitleaks) | @secops-oncall | @secops-backup | 30 min |
| Engenharia de Aplicação | @eng-platform | @eng-backup | 1 h |
| Comunicação | @comms-oncall | @pm-backup | 1 h |

- Rotação de plantão segue o calendário compartilhado no PagerDuty `MCP/Ops`.
- Atualize o contato primário em caso de férias/folgas no máximo 48 h antes.

## Fluxo geral

1. **Detecção** — alerta do GitHub (`security` job), gitleaks local ou reporte externo.
2. **Triagem (≤ 15 min)**
   - Confirmar se o alerta é verdadeiro.
   - Categorizar severidade (`S1` vazamento confirmado, `S2` suspeita, `S3` falso positivo).
3. **Comunicação (≤ 30 min)**
   - Abrir ticket no canal `#mcp-incident` com resumo, timestamp e responsáveis.
   - Atualizar statuspage interna se clientes foram afetados.
4. **Mitigação**
   - Revogar credenciais comprometidas.
   - Rotacionar bundle `config/secrets.enc.yaml` seguindo [runbook de segredos](runbooks/secret-management.md).
   - Reexecutar pipelines (`security`, `lint`, `test`, `smoke`).
5. **Erradicação**
   - Confirmar que `gitleaks detect --no-git --source .` retorna limpo.
   - Rebuscar histórico com `gitleaks detect --no-git --no-report --redact=0 --verbose` se necessário.
6. **Recuperação**
   - Garantir que todas as pipelines verdes, secrets sincronizados.
   - Monitorar logs nos próximos 60 min.
7. **Post-mortem (≤ 24 h)**
   - Registrar timeline, impacto, causa raiz e ações preventivas.
   - Arquivar relatório em `/docs/evidence/<incident>/`.

## Playbooks específicos

### Vazamento confirmado (`S1`)

1. Acionar `@secops-oncall` e `@ops-lider` (PagerDuty).
2. Executar `gitleaks detect --report-format json --report-path gitleaks-incident.json`.
3. Revogar tokens nos provedores afetados.
4. Gerar nova chave *age* e atualizar `.sops.yaml` + `config/secrets.enc.yaml`.
5. Forçar *push* de pipelines com `SOPS_AGE_KEY` rotacionado.
6. Publicar atualização a cada 30 min até encerramento.

### Falha de pipeline (`S2`)

1. Revisar logs do job `security` ou do step `make secrets-sync`.
2. Se falha for ausência de segredo, validar GitHub Secrets (`SOPS_AGE_KEY`).
3. Se gitleaks acusar falso positivo, atualizar `config/gitleaks.toml` com justificativa.
4. Reexecutar pipeline e anexar resultado em `/docs/evidence/TASK-OPS-301/`.

### Solicitação de rotação preventiva (`S3`)

1. Confirmar com Product/Legal o gatilho (fim de contrato, compliance, etc.).
2. Preparar novo bundle sem sobrescrever o atual (`git checkout -b chore/rotation`).
3. Obter aprovação dupla (SecOps + Engenharia) antes do merge.
4. Atualizar checklist em `/docs/evidence/TASK-OPS-301/README.md`.

## Documentação adicional

- [Runbook de Segredos](runbooks/secret-management.md)
- [Runbook de Resposta a Incidentes de Segredos](runbooks/secrets-incident-playbook.md)
- [Politica de Segurança](../../SECURITY.md)
- [Checklists](../checklists)
