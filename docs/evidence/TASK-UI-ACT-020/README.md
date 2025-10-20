# Evidências — TASK-UI-ACT-020

Este diretório centraliza os registros para a entrega dos componentes de ações, menus, feedback e modais.

## Conteúdo
- `playwright-ui-kit-report.txt`: saída resumida dos testes/execuções manuais sobre o UI Kit.
- `ui-kit-interactions.webm` (gerado localmente): captura curta com dropdown, tooltip, toasts e modais empilhados.

## Como reproduzir
```bash
pnpm --dir tests test -- e2e/ui-kit-components.spec.ts --project=chromium --reporter=line \
  --output=../docs/evidence/TASK-UI-ACT-020
```

O comando acima sobrescreve os artefatos com uma nova execução em modo headless.

> **Observação:** a gravação automática requer dependências nativas (Chrome/FF runtimes). Em ambientes sem suporte, execute `playwright install --with-deps` localmente antes de gerar `ui-kit-interactions.webm`. O vídeo não é versionado no repositório; após a geração, faça o upload no armazenamento interno ou anexe ao ticket.
