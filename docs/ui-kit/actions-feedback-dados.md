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

## Testes e exemplos
- Showcase (`UiKitShowcase`) demonstra todas as combinações acima, com notas de uso e exemplos de overlay/z-index.
- Cobertura automatizada:
  - Vitest em `app`: `pnpm --filter app test`
  - Playwright em `tests`: `pnpm --filter tests test`
