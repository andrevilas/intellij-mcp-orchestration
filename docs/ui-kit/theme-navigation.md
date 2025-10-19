# Theme & Navigation Kit — Quick Manual

Este guia resume o funcionamento dos componentes recém-introduzidos no shell da Promenade: **ThemeSwitch**, **Breadcrumbs** e **Pagination**. Utilize-o como referência rápida para consumo em telas existentes ou futuras.

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
- [ ] Adicionar anúncio textual do tema atual no grupo (ex.: `aria-live="polite"`).

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

## Evidências visuais
- Dossiê `UI-ACT-001` (repositório interno) — capturas Light/Dark com destaque de tokens de superfície e interação.

Mantenha este manual próximo ao backlog UI; atualize os checklists (`ui-next-steps.md`) a cada iteração para refletir o estado real dos componentes.
