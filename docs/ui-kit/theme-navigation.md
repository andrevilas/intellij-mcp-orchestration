# Theme & Navigation Kit — Quick Manual

Este guia resume o funcionamento dos componentes recém-introduzidos no shell da Promenade: **ThemeSwitch**, **Breadcrumbs** e **Pagination**. Utilize-o como referência rápida para consumo em telas existentes ou futuras.

---

## Tokens MCP — Guia rápido (Designers & QA)

- **Fonte de verdade:** `app/src/styles/index.scss` — seção `:root` lista tokens Light e `[data-theme='dark']` mapeia equivalentes para modo escuro.【F:app/src/styles/index.scss†L4-L123】
- **Superfícies e alertas:** `app/src/styles/base.scss` aplica `--mcp-surface*`, `--mcp-success-*`, `--mcp-warning-*` e `--mcp-danger-*` em painéis, alerts e quick actions; use essas referências ao revisar contrastes ou aprovar mocks.【F:app/src/styles/base.scss†L38-L336】
- **Como consumir:** em Figma/QA, alinhe tokens ao tema ativo (`document.documentElement.dataset.theme`). Designers podem mapear `--mcp-interactive`, `--mcp-info-*` e `--mcp-focus-ring` para estados de foco/hover; QA deve verificar via DevTools (`Computed → var(--token)`).
- **Checklist visual:** sempre validar Light & Dark com capturas anexadas aos dossiês de sprint e registrar desvios no Audit Report.

---

## ThemeSwitch (`app/src/theme/ThemeSwitch.tsx`)

| Prop | Tipo | Default | Descrição |
| --- | --- | --- | --- |
| `className` | `string?` | `undefined` | Classes adicionais aplicadas ao contêiner `btn-group`. |

**Comportamento:**
- Consome `useTheme()` para ler e atualizar `theme` (`'light' | 'dark'`).【F:app/src/theme/ThemeSwitch.tsx†L8-L20】
- Renderiza um `btn-group` com `role="group"` e cada botão expõe `aria-pressed` conforme o estado atual, preservando compatibilidade com leitores de tela.【F:app/src/theme/ThemeSwitch.tsx†L16-L34】
- Estilos principais vivem em `app/src/styles/index.scss` (tokens `--mcp-interactive`, `--mcp-focus-ring`).【F:app/src/styles/index.scss†L20-L63】

**Padrões de uso:**
- Sempre incluir um rótulo contextual (ex.: `<ThemeSwitch aria-label="Alternar tema" />` quando usado fora do header padrão).
- Em layouts compactos, combine com utilitários responsivos (`d-none d-lg-inline-flex`).
- Para persistência entre sessões, garanta que `ThemeContext` esteja montado no topo da árvore.

**Checklist de A11y:**
- [x] Botões acessíveis via teclado (Tab/Shift+Tab).
- [x] Anúncio textual persistente do tema atual via `aria-live` dentro do grupo.【F:app/src/theme/ThemeSwitch.tsx†L11-L47】

---

## Breadcrumbs (`app/src/components/navigation/Breadcrumbs.tsx`)

| Prop | Tipo | Default | Descrição |
| --- | --- | --- | --- |
| `items` | `BreadcrumbItem[]` | — | Lista ordenada de trilhas. Cada item aceita `label`, `href?`, `isCurrent?`. |
| `className` | `string?` | `undefined` | Classes extra para o `<nav>`. |

**Comportamento:**
- Reusa a semântica padrão de navegação (`<nav aria-label="Trilha de navegação">` + `<ol>`).【F:app/src/components/navigation/Breadcrumbs.tsx†L17-L35】
- Links ativos utilizam tokens `--mcp-interactive` para cor e `--mcp-border-subtle` para divisores.【F:app/src/styles/index.scss†L65-L82】
- Último item (ou `isCurrent`) assume `aria-current="page"` para leitores de tela.【F:app/src/components/navigation/Breadcrumbs.tsx†L24-L34】

**Padrões de uso:**
- Limite a 3–4 níveis; use `isCurrent` quando o último item não possui `href`.
- Em telas densas, combine com truncamento CSS (`text-truncate`) via `className` externo.

**Checklist de A11y:**
- [x] Ordem Tab respeita semântica (`a` → `span`).
- [ ] Incluir fallback de ícone/`sr-only` para indicar “Você está aqui” quando houver múltiplos itens ativos.

---

## Pagination (`app/src/components/navigation/Pagination.tsx`)

| Prop | Tipo | Default | Descrição |
| --- | --- | --- | --- |
| `currentPage` | `number` | — | Página ativa (1-indexed). |
| `pageCount` | `number` | — | Total de páginas. Valores ≤1 retornam `null`. |
| `onPageChange` | `(page: number) => void` | — | Callback ao selecionar nova página. |
| `ariaLabel` | `string?` | `'Paginação'` | Rotulo de navegação para leitores de tela. |

**Comportamento:**
- Normaliza entradas com `clamp` e ignora re-renderizações redundantes.【F:app/src/components/navigation/Pagination.tsx†L10-L33】
- Usa botões `<button type="button">` com `aria-current` quando ativo e rótulos explícitos para anterior/próximo.【F:app/src/components/navigation/Pagination.tsx†L35-L58】
- Estilização se apoia em tokens `--mcp-interactive` e `--mcp-focus-ring` para contraste AA.【F:app/src/styles/index.scss†L84-L101】

**Padrões de uso:**
- Para conjuntos grandes, filtrar `pages` antes de renderizar (p.ex. janela de 5 itens) e manter `aria-live` no container consumidor.
- Combine com `aria-describedby` em tabelas para anunciar faixa de itens exibida.

**Checklist de A11y:**
- [x] Foco visível com outline customizado.
- [x] Botões anunciam contexto (labels anterior/próximo).
- [ ] Implementar suporte a atalhos `PageUp/PageDown` quando houver grandes volumes.

---

## Button (`app/src/components/actions/Button.tsx`)

| Prop | Tipo | Default | Descrição |
| --- | --- | --- | --- |
| `variant` | `'primary' \| 'secondary' \| 'ghost' \| 'danger'` | `'primary'` | Define tokens de cor e sombra para cada contexto. |
| `size` | `'md' \| 'sm'` | `'md'` | Ajusta tipografia/padding conforme densidade. |
| `loading` | `boolean` | `false` | Exibe spinner, ativa `aria-busy` e força `disabled`. |
| `icon` | `ReactNode?` | `undefined` | Conteúdo extra alinhado à esquerda. |

**Comportamento:**
- ForwardRef para `<button>` preserva integração com formulários e atalhos.【F:app/src/components/actions/Button.tsx†L11-L68】
- Variantes mapeiam para tokens MCP (interativo, superfícies, sombras) definidos em `button.scss`.【F:app/src/components/actions/button.scss†L1-L80】
- Estado `loading` injeta spinner com animação suave e bloqueia cliques subsequentes.【F:app/src/components/actions/Button.tsx†L40-L57】

**Padrões de uso:**
- Prefira `variant="secondary"` para ações neutras e `danger` apenas quando houver confirmação extra (ex.: remoção).【F:app/src/components/actions/button.scss†L38-L55】
- Combine com `Tooltip` em espaços reduzidos para manter discoverability.

**Checklist de A11y:**
- [x] Mantém contraste AA em todos os temas.
- [x] Foco visível com `outline` customizado (`--mcp-focus-ring`).
- [ ] Adicionar `aria-live` dedicado quando usado como CTA crítico.

---

## Dropdown (`app/src/components/menus/Dropdown.tsx`)

| Prop | Tipo | Default | Descrição |
| --- | --- | --- | --- |
| `label` | `ReactNode` | — | Conteúdo do botão gatilho. |
| `options` | `DropdownOption[]` | — | Lista de ações (`id`, `label`, `description?`, `disabled?`, `onSelect`). |
| `align` | `'start' \| 'end'` | `'start'` | Alinhamento horizontal do menu. |
| `triggerAriaLabel` | `string?` | `undefined` | Label adicional quando `label` não é autoexplicativo. |

**Comportamento:**
- Controla estado com `useState` + `useEffect` para fechar com clique fora/ESC.【F:app/src/components/menus/Dropdown.tsx†L33-L88】
- Navegação por setas, `Home`/`End` e retorno do foco ao gatilho ao fechar.【F:app/src/components/menus/Dropdown.tsx†L90-L170】
- Layout utiliza tokens MCP para hover e modo dark em `dropdown.scss`.【F:app/src/components/menus/dropdown.scss†L1-L60】

**Padrões de uso:**
- Use descrições curtas (`description`) para clarificar ações destrutivas.
- Evite mais de 6 opções; para listas longas, considere `CommandPalette`.

**Checklist de A11y:**
- [x] `aria-haspopup="menu"` + `aria-expanded` sincronizados.【F:app/src/components/menus/Dropdown.tsx†L178-L205】
- [x] ESC fecha menu e devolve foco ao gatilho.【F:app/src/components/menus/Dropdown.tsx†L62-L83】
- [ ] Suporte a atalhos globais (ex.: `Alt+ArrowDown`).

---

## Tooltip (`app/src/components/menus/Tooltip.tsx`)

| Prop | Tipo | Default | Descrição |
| --- | --- | --- | --- |
| `content` | `ReactNode` | — | Texto/elementos exibidos no balão. |
| `placement` | `'top' \| 'right' \| 'bottom' \| 'left'` | `'top'` | Posição relativa ao trigger. |
| `delay` | `number` | `120` | Delay em ms antes de exibir (hover/foco). |

**Comportamento:**
- Clona o filho, injeta handlers de foco/pointer e `aria-describedby` dinâmico.【F:app/src/components/menus/Tooltip.tsx†L29-L77】
- ESC cancela tooltip imediatamente, garantindo controle via teclado.【F:app/src/components/menus/Tooltip.tsx†L60-L65】
- Estilos usam `mcp-shadow-soft` para sombras suaves e invertem cores em tema escuro.【F:app/src/components/menus/tooltip.scss†L1-L30】

**Checklist de A11y:**
- [x] Compatível com foco + pointer.
- [ ] Anunciar via `aria-live` quando texto for crítico.

---

## Alerts & Toasts (`app/src/components/feedback/Alert.tsx`, `ToastProvider.tsx`)

| Item | Descrição |
| --- | --- |
| `Alert` | Componente inline para status persistentes, com variantes `info/success/warning/error`. |
| `ToastProvider` | Contexto que gerencia pilha controlada (`maxVisible`), `pushToast`, `dismissToast`. |

**Comportamento:**
- `Alert` usa grid + tokens MCP para borda lateral e ações opcionais.【F:app/src/components/feedback/Alert.tsx†L5-L31】【F:app/src/components/feedback/feedback.scss†L1-L50】
- `ToastProvider` integra `useTheme()` para refletir modo atual no viewport (`data-theme`).【F:app/src/components/feedback/ToastProvider.tsx†L28-L114】
- Pilha controlada limita visibilidade, auto-dismiss configurável com timers limpos no `useEffect` de cleanup.【F:app/src/components/feedback/ToastProvider.tsx†L56-L110】

**Padrões de uso:**
- Envolver a árvore da UI (App) com `ToastProvider` para permitir `useToast()` em qualquer componente.【F:app/src/App.tsx†L690-L939】
- Usar `dismissible={false}` para mensagens que exigem reconhecimento explícito (ex.: incidentes críticos).

**Checklist de A11y:**
- [x] `role="status"` + `aria-live="polite"` no viewport.【F:app/src/components/feedback/ToastProvider.tsx†L116-L134】
- [ ] Acrescentar opções de prioridade (`assertive`) para alertas bloqueantes.

---

## Modals (`app/src/components/modals/ConfirmationModal.tsx`, `FormModal.tsx`)

**Componentes principais:**
- `ModalBase`: Responsável por portal, trap de foco e ESC/outside click.【F:app/src/components/modals/ModalBase.tsx†L1-L118】
- `ConfirmationModal`: Usa `ModalBase` com footer padrão (Cancelar/Confirmar).【F:app/src/components/modals/ConfirmationModal.tsx†L1-L33】
- `FormModal`: Encapsula `<form>` e expõe `onSubmit` com loading state reutilizando `Button`.【F:app/src/components/modals/FormModal.tsx†L1-L44】

**Boas práticas:**
- Sempre prover `onCancel` para restaurar foco original (feito automaticamente no cleanup).【F:app/src/components/modals/ModalBase.tsx†L37-L83】
- Use `isSubmitting` para bloquear duplo envio em formulários longos.

**Checklist de A11y:**
- [x] `aria-labelledby`/`aria-describedby` gerados via `useId` para unicidade.【F:app/src/components/modals/ModalBase.tsx†L19-L31】
- [x] Trap de foco circular com suporte a `Shift+Tab`.【F:app/src/components/modals/ModalBase.tsx†L45-L78】
- [ ] Implementar `aria-live` para confirmar submissões dentro do modal sem depender de Toast externo.

---

## Showcase (`app/src/components/UiKitShowcase.tsx`)

- Painel usado apenas em ambientes internos para demonstrar o conjunto completo; renderizado dentro da aplicação principal e coberto por testes e2e.【F:app/src/components/UiKitShowcase.tsx†L1-L137】【F:app/src/App.tsx†L690-L939】
- Exercita interações de toasts/modais e reaproveita tokens via `ui-kit-showcase.scss`.【F:app/src/components/ui-kit-showcase.scss†L1-L43】

---

## Evidências visuais
- Dossiê `UI-ACT-001` (repositório interno) — capturas Light/Dark com destaque de tokens de superfície e interação.

Mantenha este manual próximo ao backlog UI; atualize os checklists (`ui-next-steps.md`) a cada iteração para refletir o estado real dos componentes.
