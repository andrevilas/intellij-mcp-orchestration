# Auditoria de componentes de status

## KpiCard

### Estados e atributos ARIA
- **`default`**: conteúdo principal exibido; o `<article>` mantém `aria-live="off"` e `aria-busy="false"`. A tendência usa `aria-label` descritivo enquanto o símbolo permanece oculto com `aria-hidden`.【F:app/src/components/KpiCard.tsx†L55-L101】
- **`loading`**: aplica `data-status="loading"`, aciona `aria-busy="true"` e `aria-live="polite"` no `<article>`. O painel de status usa `role="status"`, mostra um esqueleto `aria-hidden` e mensagem com tom atenuado.【F:app/src/components/KpiCard.tsx†L55-L101】【F:app/src/components/kpi-card.scss†L87-L107】【F:app/src/components/kpi-card.scss†L135-L142】
- **`empty`**: apenas o contêiner de status fica visível com `role="status"`, mensagem padrão e `data-status="empty"` para trocar tokens de cor.【F:app/src/components/KpiCard.tsx†L85-L101】【F:app/src/components/kpi-card.scss†L144-L150】
- **`error`**: o status passa a `role="alert"`, habilita botão de nova tentativa e colore todos os textos com tokens de erro.【F:app/src/components/KpiCard.tsx†L85-L101】【F:app/src/components/kpi-card.scss†L152-L158】

### Tokens CSS e reutilização
- Define variáveis internas (`--kpi-card-bg`, `--kpi-card-border`, `--kpi-card-status*`) mapeadas para tokens da fundação (`--mcp-state-*`, `--mcp-text-*`, `--mcp-shadow-elevated`).【F:app/src/components/kpi-card.scss†L1-L24】
- Estados redefinem esses tokens em cascata via `data-status`, evitando duplicação de regras por estado.【F:app/src/components/kpi-card.scss†L135-L158】
- Elementos de tendência e ações compartilham tokens globais de feedback (`--mcp-success-emphasis`, `--mcp-danger-strong`, `--mcp-interactive`). Focus usa `--mcp-focus-ring` alinhado com outros componentes.【F:app/src/components/kpi-card.scss†L67-L123】
- Tema escuro substitui apenas algumas variáveis sem duplicar estilos estruturais.【F:app/src/components/kpi-card.scss†L174-L185】

### Lacunas e oportunidades
- Mensagens em estados `loading`/`empty` usam `--mcp-state-fg-loading` e `--mcp-state-fg-empty`, que podem ter contraste insuficiente sobre superfícies tonais; validar WCAG com paletas reais.【F:app/src/components/kpi-card.scss†L135-L150】
- O botão de nova tentativa repete padrão de pill button visto em outras peças; poderia virar utilitário compartilhado (mesmas propriedades em ResourceTable/Detail).【F:app/src/components/kpi-card.scss†L109-L123】【F:app/src/components/resource-table.scss†L95-L108】【F:app/src/components/resource-detail-card.scss†L112-L126】
- Medições manuais com `scripts/contrast-check.mjs` confirmaram contraste 5.05:1 para o estado `loading`, 9.3:1 para `empty` e 5.46:1 para `error` sobre as superfícies mistas (`color-mix`). O valor de 5.05:1 fica pouco acima da meta AA (4.5:1); monitorar ajustes de cor para evitar regressões.

## ResourceTable

### Estados e atributos ARIA
- `data-status` sinaliza `loading`, `empty` ou `error`, enquanto `aria-busy` acompanha o carregamento. O cabeçalho e descrição são associados via `aria-labelledby`/`aria-describedby` e o status tem `aria-live="polite"`.【F:app/src/components/ResourceTable.tsx†L160-L207】
- Erros usam `role="alert"` e incluem ação de retry; loading publica `role="status"` com barra animada; empty rende cards dentro de `<div role="note">`.【F:app/src/components/ResourceTable.tsx†L182-L205】
- Cabeçalhos ordenáveis aplicam `aria-sort` e botões com `aria-label`. Linhas clicáveis adotam `role="button"`, `tabIndex` e tratamento de teclado/descrição via ids dedicados.【F:app/src/components/ResourceTable.tsx†L208-L285】

### Tokens CSS e reutilização
- Estrutura principal usa variáveis `--resource-table-*` apontando para tokens de estado, reforçando consistência entre estados.【F:app/src/components/resource-table.scss†L1-L18】【F:app/src/components/resource-table.scss†L312-L333】
- Diversos elementos compartilham tokens globais (ex.: filtros com `--mcp-border-strong`, feedback com `--mcp-state-*`, botões com `--mcp-focus-ring`).【F:app/src/components/resource-table.scss†L52-L209】
- Animações e planos de fundo usam `color-mix` com tokens `--mcp-overlay`, `--mcp-info-soft`, garantindo look consistente porém dependente de contraste final.【F:app/src/components/resource-table.scss†L119-L170】【F:app/src/components/resource-table.scss†L220-L263】
- Tema escuro altera apenas variáveis críticas (`heading`, `description`, `status`), reaproveitando estrutura base.【F:app/src/components/resource-table.scss†L347-L364】

### Lacunas e oportunidades
- Texto de status usa `--mcp-state-fg-loading/empty/error`, potencialmente pouco contrastante sobre backgrounds misturados (`color-mix` com 75–85% opacidade). Recomenda-se verificar contraste real, principalmente para o card vazio e as listras alternadas da tabela.【F:app/src/components/resource-table.scss†L83-L170】【F:app/src/components/resource-table.scss†L220-L263】
- Focos, botões pill e padrões de `color-mix` repetem-se em KpiCard e ResourceDetailCard; um módulo utilitário poderia reduzir divergências e facilitar manutenção.【F:app/src/components/resource-table.scss†L95-L209】【F:app/src/components/resource-detail-card.scss†L112-L126】【F:app/src/components/kpi-card.scss†L109-L123】
- Linhas clicáveis dependem apenas de `color-mix` com `--mcp-interactive-soft`; garantir contraste mínimo com texto (`--mcp-surface-contrast`) quando selecionadas/hover.【F:app/src/components/resource-table.scss†L168-L297】
- O mesmo relatório de contraste mostrou 6.92:1 para o texto `status-muted loading` em tema claro e 13.58:1 em tema escuro, indicando folga suficiente mesmo com superfícies translúcidas.

## ResourceDetailCard

### Estados e atributos ARIA
- O `<section>` utiliza `data-status`, `aria-busy` e associa título/descrição via `aria-labelledby`/`aria-describedby`; `aria-label` personaliza o nome do grupo.【F:app/src/components/ResourceDetailCard.tsx†L55-L123】
- Estado padrão exibe descrição de termos (`<dl>`), preservando ícones com `aria-hidden`. Estados alternativos usam contêiner `role="status"` ou `alert`, spinner `aria-hidden`, retry e blocos de empty state com `role` herdado.【F:app/src/components/ResourceDetailCard.tsx†L75-L119】

### Tokens CSS e reutilização
- Variáveis `--detail-card-*` seguem padrão das demais peças, trocando superfícies/bordas/status via `--mcp-state-*`.【F:app/src/components/resource-detail-card.scss†L1-L181】
- Cards de item e estados reutilizam tokens de `color-mix` semelhantes aos da tabela para fundos suaves e contornos, incluindo foco consistente com `--mcp-focus-ring`.【F:app/src/components/resource-detail-card.scss†L53-L153】
- Tema escuro ajusta somente variáveis de cor (heading, description, status), evitando duplicidade estrutural.【F:app/src/components/resource-detail-card.scss†L193-L210】

### Lacunas e oportunidades
- Como em outros componentes, `--detail-card-status-muted` vira `--mcp-state-fg-loading`/`empty`, que pode ficar apagado sobre superfícies tonais; validação de contraste necessária.【F:app/src/components/resource-detail-card.scss†L161-L181】
- Retry button e empty illustration repetem padrões de cor/raio presentes em outros SCSS — consolidar em mixins ou tokens específicos pode reduzir variação manual.【F:app/src/components/resource-detail-card.scss†L112-L153】【F:app/src/components/resource-table.scss†L95-L263】

## ProgressIndicator

### Estados e atributos ARIA
- Container `role="group"` com `aria-label` descreve o indicador. No estado padrão, mostra `role="progressbar"` com `aria-valuenow`, `aria-valuemin` e `aria-valuemax`; o valor textual fica em `aria-live="polite"` para anunciar mudanças.【F:app/src/components/indicators/ProgressIndicator.tsx†L43-L74】
- Estados `loading`/`empty`/`error` alternam `data-status`, `aria-busy`, e usam painel `role="status"` ou `alert`, com spinner `aria-hidden` e ação opcional.【F:app/src/components/indicators/ProgressIndicator.tsx†L43-L88】

### Tokens CSS e reutilização
- Define variáveis `--progress-*` ligadas a tokens `--mcp-state-*`/`--mcp-info-*`, com modificadores de `tone` sobrescrevendo `--progress-bar-bg` por classe (info/success/warning/danger/neutral).【F:app/src/components/indicators/progress-indicator.scss†L1-L107】
- Estados aplicados via `data-status` substituem `--progress-status`, borda e superfície, alinhando-se aos demais componentes.【F:app/src/components/indicators/progress-indicator.scss†L108-L128】
- Tema escuro atualiza apenas variáveis críticas (`--progress-track-bg`, `--progress-label`, `--progress-status`), mantendo layout compartilhado.【F:app/src/components/indicators/progress-indicator.scss†L130-L136】

### Lacunas e oportunidades
- O tom `neutral` reutiliza `--mcp-text-muted` como cor da barra; sobre a trilha `color-mix` pode gerar contraste baixo (barra e track próximas). Avaliar aumento de contraste ou uso de token específico para neutro.【F:app/src/components/indicators/progress-indicator.scss†L1-L106】
- `--progress-status-muted` igual a `--mcp-state-fg-loading` em vários estados pode reduzir legibilidade semelhante às demais peças; possível criar escala de status mais contrastante.【F:app/src/components/indicators/progress-indicator.scss†L108-L128】
- Em medições dark mode, `--mcp-state-fg-loading` atingiu 13.62:1 contra a superfície `loading`, reforçando que os ajustes de tema escuro garantem contraste AA com margem.

## StatusBadge

### Estados e atributos ARIA
- Componente puramente visual (`<span>`), controla variações via `data-tone`/`data-appearance`. Ícone recebe `aria-hidden`. Não há `role` adicional, confiando no texto para semântica.【F:app/src/components/indicators/StatusBadge.tsx†L16-L37】

### Tokens CSS e reutilização
- Declara variáveis `--status-badge-*` derivadas de tokens globais (overlays, borders, info/success/warning/danger). Aparência (`solid`, `soft`, `outline`) e tonalidades ajustam as variáveis sem redefinir estrutura.【F:app/src/components/indicators/status-badge.scss†L1-L90】
- Tema escuro só ajusta o caso `outline neutral`, sugerindo que demais estados dependem de tokens já compatíveis.【F:app/src/components/indicators/status-badge.scss†L83-L90】

### Lacunas e oportunidades
- Modos `soft/outline` usam `color-mix` com até 55% de transparência; verificar contraste entre texto `--mcp-info-stronger/--mcp-success-emphasis` e o fundo diluído, especialmente para warning neutral em temas claros e escuros.【F:app/src/components/indicators/status-badge.scss†L33-L85】
- Aparência `solid` warning aplica `--mcp-action-primary-fg` como texto, divergindo do padrão `--mcp-text-inverse`; garantir que o token forneça contraste adequado sobre `--mcp-warning-strong` e avaliar se deve ser padronizado com outros sólidos.【F:app/src/components/indicators/status-badge.scss†L73-L76】

## Recomendações transversais
- Consolidar padrões recorrentes (botões pill de retry, containers de status, focus rings) em mixins ou componentes utilitários reduz manutenção duplicada e garante consistência de acessibilidade.【F:app/src/components/kpi-card.scss†L109-L123】【F:app/src/components/resource-table.scss†L95-L209】【F:app/src/components/resource-detail-card.scss†L112-L126】
- Revisar contrastes reais das cores derivadas de `color-mix` com tokens de overlay/surface; diversos componentes dependem dessas misturas para estado vazio/hover/loading, o que pode cair abaixo de 4.5:1 dependendo da base.【F:app/src/components/kpi-card.scss†L87-L158】【F:app/src/components/resource-table.scss†L119-L333】【F:app/src/components/resource-detail-card.scss†L53-L181】【F:app/src/components/indicators/progress-indicator.scss†L1-L128】【F:app/src/components/indicators/status-badge.scss†L1-L85】
- Avaliar criação de uma escala de `--mcp-state-fg-*` com níveis "muted" e "strong" para mensagens secundárias; atualmente múltiplos estados reutilizam `--mcp-state-fg-loading/empty/error`, o que pode limitar contraste e hierarquia visual.【F:app/src/components/kpi-card.scss†L135-L158】【F:app/src/components/resource-table.scss†L312-L333】【F:app/src/components/resource-detail-card.scss†L161-L181】【F:app/src/components/indicators/progress-indicator.scss†L108-L128】
- Publicar o relatório de contraste (`node scripts/contrast-check.mjs`) ao lado do relatório axe garante rastreabilidade das verificações manuais sem depender do DevTools. Os resultados atuais estão anexados em `docs/evidence/TASK-UI-DATA-030/` junto ao JSON do Axe.
- Wizards governados (ex.: criação de agents) passam a consumir os mesmos padrões de status e validação de formulários, incluindo `FormErrorSummary` e mensagens sincronizadas com fixtures MSW, reduzindo divergências com tabelas e cards.【F:app/src/pages/Agents/NewAgentWizard.tsx†L222-L768】【F:app/src/components/UiKitShowcase.tsx†L35-L118】
