# Formulários MCP

Este guia documenta os controles de formulário introduzidos na sprint TASK-UI-FORM-040 e como integrá-los à camada de validação declarativa.

## Controles básicos
- `Input`, `Select`, `TextArea`, `Switch` e `InputGroup` compartilham estilos em `styles/form-base.scss` e `styles/control-inputs.scss`, com extensões pontuais para `switch.scss` e `input-group.scss`, usando tokens `--mcp-form-*` para superfícies, foco e estados inválidos.【F:app/src/components/forms/styles/form-base.scss†L1-L44】【F:app/src/components/forms/styles/control-inputs.scss†L1-L79】【F:app/src/components/forms/styles/switch.scss†L1-L86】
- Componentes suportam rótulos, mensagens auxiliares e `invalid-feedback`, propagando `aria-invalid` automaticamente quando usados com `useMcpField`.【F:app/src/components/forms/Select.tsx†L1-L59】【F:app/src/hooks/useMcpForm.ts†L62-L111】
- `InputGroup` aceita ícones Font Awesome para pré/pós fixo, mantendo foco e descrição combinada.【F:app/src/components/forms/InputGroup.tsx†L1-L63】

## Validação declarativa
- O hook `useMcpForm` encapsula `react-hook-form` com modo `onBlur` e expõe `useMcpField` para registrar campos com regras tipadas e IDs consistentes.【F:app/src/hooks/useMcpForm.ts†L18-L111】
- `FormErrorSummary` reutiliza `Alert` para listar erros focáveis, atualizando `setFocus` ao clicar e fornecendo mensagem padrão acessível.【F:app/src/components/forms/FormErrorSummary.tsx†L1-L67】
- Exemplo de integração completa está disponível no UI Kit (`FormControlsSection`), incluindo reset, helper dinâmico e botões MCP.【F:app/src/components/UiKitShowcase.tsx†L209-L321】

## Upload e download
- `FileUploadControl` aplica limites configuráveis, barra de progresso MCP e reaproveita toasts/alerts para informar sucesso ou erro.【F:app/src/components/forms/FileUploadControl.tsx†L1-L161】
- `FileDownloadControl` acompanha progresso, gera blobs e dispara download automático, registrando feedback visual e via toast.【F:app/src/components/forms/FileDownloadControl.tsx†L1-L147】

## Testes e evidências
- Cobertura unitária valida propagação de `aria-invalid`, resumo de erros e `InputGroup` com feedback combinada.【F:app/src/components/forms/FormControls.test.tsx†L1-L104】
- Teste Playwright garante ordem de tabulação e gera artefato `forms-tab-order.json` em `/docs/evidence/TASK-UI-FORM-040/`.【F:tests/e2e/forms-controls.spec.ts†L1-L83】
