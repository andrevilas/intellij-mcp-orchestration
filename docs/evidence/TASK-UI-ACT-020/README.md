# Evidências — TASK-UI-ACT-020

Este diretório centraliza os registros para a entrega dos componentes de ações, menus, feedback e modais.

## Conteúdo
- `playwright-ui-kit-report.txt`: saída resumida dos testes/execuções manuais sobre o UI Kit.
- `ui-kit-interactions.webm` (gerado localmente): captura curta com dropdown, tooltip, toasts e modais empilhados.
- `2025-10-29-vitest.txt`: execução direcionada do Vitest (`Button`, `Dropdown`, `ToastProvider`, `Modal`) comprovando o comportamento após correções da sprint UI M2 (commit `afdfe67`).
- `2025-10-29-vitest.md`: rodada completa `pnpm --dir app test -- --runInBand` (Node 20 via nvm) antes do Go/No-Go.

## Como reproduzir
```bash
pnpm --dir tests test -- e2e/ui-kit-components.spec.ts --project=chromium --reporter=line \
  --output=../docs/evidence/TASK-UI-ACT-020

pnpm --dir app test \
  src/components/actions/Button.test.tsx \
  src/components/menus/Dropdown.test.tsx \
  src/components/feedback/ToastProvider.test.tsx \
  src/components/modals/index.test.tsx \
  -- --runInBand  # commit afdfe67591a1aeaa1a1cac4dbe4e072b5779d30d

# Rodada completa (Go/No-Go pré 2025-10-29)
source ~/.nvm/nvm.sh && nvm use 20
pnpm --dir app test -- --runInBand  # commit afdfe67591a1aeaa1a1cac4dbe4e072b5779d30d
```

O comando acima sobrescreve os artefatos com uma nova execução em modo headless.

> **Observação:** a gravação automática requer dependências nativas (Chrome/FF runtimes). Em ambientes sem suporte, execute `playwright install --with-deps` localmente antes de gerar `ui-kit-interactions.webm`. O vídeo não é versionado no repositório; após a geração, faça o upload no armazenamento interno ou anexe ao ticket.
