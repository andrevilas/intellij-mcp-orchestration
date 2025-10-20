# Runbook — Gestão de Segredos MCP

## Visão geral

- **Cofre padrão:** [SOPS](https://github.com/getsops/sops) com chaves *age* dedicadas à plataforma MCP.
- **Escopo:** credenciais dos provedores de IA (Gemini, OpenAI/Codex, Anthropic, Zhipu) e tokens operacionais usados pelos pipelines.
- **Artefatos versionados:**
  - `config/secrets.enc.yaml` — bundle criptografado com os valores vigentes.
  - `.sops.yaml` — política de criptografia (recipiente *age* público).
  - `scripts/secrets-sync.sh` — sincronização local e em CI.
- **Identidade privada:** mantida no cofre da equipe (1Password > “MCP – SOPS Age key”) e referenciada pelos pipelines via `SOPS_AGE_KEY`.

## Bootstrapping e rotação

1. Gere uma nova chave *age* somente quando necessário:

   ```bash
   age-keygen > mcp-age-key.txt
   ```

   - O bloco `AGE-SECRET-KEY-*` deve ser copiado para o cofre seguro.
   - A linha `Public key: age1…` é a única parte versionada (atualize `.sops.yaml`).

2. Compartilhe o público com a equipe via pull request e invalide o anterior após validar a rotação.
3. Atualize `config/secrets.enc.yaml` executando, localmente, `sops config/secrets.enc.yaml`.
4. Registre a rotação no change log de operações e anexe o diff criptografado em `/docs/evidence/<ticket>/`.

## Como editar o bundle criptografado

```bash
export SOPS_AGE_KEY="$(op read 'op://MCP/SOPS Age key/private')"
sops config/secrets.enc.yaml
```

- Alterações são auditadas via git; o conteúdo permanece cifrado.
- Utilize o campo `MCP_SECRETS_VERSION` para acompanhar incrementos de versão.

## Sincronização local

```bash
# pré-requisito: sops + age instalados
export SOPS_AGE_KEY="$(op read 'op://MCP/SOPS Age key/private')"
make secrets-sync
```

O script executa as etapas abaixo:

1. Descriptografa `config/secrets.enc.yaml` (formato JSON após o `--output-type`).
2. Publica `~/.mcp/.env` com permissões `600` para os wrappers MCP.
3. Gera `~/.mcp/console-secrets.json` no formato esperado pela API (`SecretStore`).
4. Remove o material sensível do diretório temporário.

## Integração com CI

- O job `security` roda `gitleaks` usando `config/gitleaks.toml` e bloqueia a pipeline em caso de vazamento.
- Os jobs `lint`, `test` e `smoke` executam `make secrets-sync` somente se `SOPS_AGE_KEY` estiver definido no repositório (branch protegida).
- As chaves são injetadas de forma efêmera: o arquivo `~/.config/sops/age/keys.txt` é removido ao final de cada step.

## Resposta a incidentes

1. Acesse o playbook [`docs/ops/incident-response.md`](../incident-response.md) e siga a trilha “Vazamento de segredos MCP”.
2. Revogue imediatamente os tokens afetados nos provedores correspondentes.
3. Gere uma nova chave *age*, recriptografe `config/secrets.enc.yaml` e abra PR com validação de dupla revisão.
4. Execute `gitleaks detect --no-git --source .` para confirmar que o repositório está limpo.

## Monitoramento e auditoria

- Logs do job `security` ficam arquivados como artefatos (`gitleaks-report.json`).
- Evidências de rotações e auditorias devem ser anexadas em `/docs/evidence/TASK-OPS-301/` com checklist preenchido.
- Alterações em `.sops.yaml` requerem aprovação da equipe de segurança.
