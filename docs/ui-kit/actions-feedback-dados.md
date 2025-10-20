# Catálogo de ações, feedback e dados

Este resumo consolida os componentes utilizados para desbloquear as histórias UI-ACT-002 e UI-ACT-003 com foco em ações, feedback e dados operacionais. Todos os elementos consomem os tokens do tema MCP para oferecer paridade entre claro/escuro.

## Botões (ações)
- `Button` cobre variantes `primary`, `secondary`, `outline`, `ghost`, `link` e `danger`, incluindo estados `loading` (spinner com `aria-busy`) e `disabled`.
- Grupos (`ButtonGroup`) suportam segmentação e exposição de tooltips para rotinas em lote.
- Tokens chave: `--mcp-interactive`, `--mcp-text-inverse`, `--mcp-focus-ring` e sombras `--mcp-shadow-accent*`.

## Menus e overlays
- `Dropdown` provê ciclo de foco pelo teclado, acessibilidade ARIA e alinhamento configurável. Menu usa `--mcp-z-dropdown` e `--mcp-shadow-soft`.
- `Tooltip` reage a foco, mouse e tecla Escape, usando `--mcp-z-tooltip` e superfície contrastante.
- A hierarquia de sobreposição segue `--mcp-z-dropdown` < `--mcp-z-tooltip` < `--mcp-z-toast` < `--mcp-z-modal`.

## Feedback
- `Alert` e `ToastProvider` compartilham tokens `--mcp-surface-elevated`, `--mcp-border-accent` e variantes (`--mcp-info-stronger`, `--mcp-success-emphasis`, etc.).
- Toasts mantêm máximo configurável, autodismiss opcional e ações secundárias.

## Modais e dados
- `ModalBase` aplica trap de foco, retorno ao gatilho e usa `--mcp-surface-elevated`, `--mcp-backdrop` e `--mcp-shadow-modal`.
- `ConfirmationModal` disponibiliza confirmação em dois cliques com mensagens vivas e `FormModal` cobre envios de dados com validação nativa.

## Formulários
- `Input`, `Select`, `TextArea`, `Switch` e `InputGroup` compartilham `forms.scss`, respeitando tokens `--mcp-form-*`, foco MCP e feedback invalidado via `react-hook-form` (`useMcpForm`/`useMcpField`).【F:app/src/components/forms/forms.scss†L1-L210】【F:app/src/hooks/useMcpForm.ts†L18-L111】
- `FormErrorSummary` reutiliza `Alert` para listar erros navegáveis e o UI Kit demonstra o fluxo completo (`FormControlsSection`) com reset, helper dinâmico e integração aos novos controles.【F:app/src/components/forms/FormErrorSummary.tsx†L1-L67】【F:app/src/components/UiKitShowcase.tsx†L209-L321】
- `FileUploadControl`/`FileDownloadControl` adicionam progresso, limites e toasts/alerts consistentes, mantendo tokens de superfície e feedback MCP.【F:app/src/components/forms/FileUploadControl.tsx†L1-L161】【F:app/src/components/forms/FileDownloadControl.tsx†L1-L147】

## Testes e exemplos
- Showcase (`UiKitShowcase`) demonstra todas as combinações acima, com notas de uso e exemplos de overlay/z-index.
- Cobertura automatizada:
  - Vitest em `app`: `pnpm --filter app test`
  - Playwright em `tests`: `pnpm --filter tests test`
