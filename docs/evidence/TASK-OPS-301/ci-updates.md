# Atualizações de CI — TASK-OPS-301

## Mudanças principais

- Novo job **security** executa `gitleaks` e publica `gitleaks-report.json`. Os demais jobs dependem dele (`needs: security`).
- Jobs `lint`, `test` e `smoke` possuem `permissions: contents: read` e sincronizam segredos via `make secrets-sync` apenas quando `SOPS_AGE_KEY` está definido.
- Segredos efêmeros: o arquivo `~/.config/sops/age/keys.txt` é removido ao final de cada step para evitar resíduos.
- Job **ops_compliance** executa `python3 scripts/ops_controls.py` e impede avanços caso permissões ou evidências (OPS-302) estejam ausentes.
- `Makefile` expõe alvo `secrets-sync` para uso local e em pipelines.

## Impacto esperado

- Bloqueio imediato de PRs com segredos através do gate `security`.
- Gate `ops_compliance` garante rastreabilidade das evidências OPS-301/OPS-302 e mantém workflows em modo least-privilege.
- Pipelines consistentes com o runbook de segredos, evitando armazenamento permanente de chaves.
- Facilita auditorias com artefatos (`gitleaks-report.json`) anexados automaticamente.
