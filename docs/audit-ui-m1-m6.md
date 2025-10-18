# Audit Report — MCP Console UI (Sprints M1–M6)

**Data:** 2025-10-18 13:40 UTC  
**Auditor:** QA & Reliability Engineering  
**Escopo:** Avaliação ponta a ponta do console MCP (Node + Vite + React) cobrindo UI M1–M6, integrações front/back e observabilidade.

## Sumário Executivo

| Sprint | Status | Evidências-chave |
| --- | --- | --- |
| M1 — Fundamentos & Shell | :red_circle: **Bloqueado** | Bootstrap/Font Awesome ausentes; tema único; navegação sem tokens compartilhados.【F:app/package.json†L1-L35】【F:app/src/main.tsx†L1-L16】 |
| M2 — Ações & Feedback | :red_circle: **Bloqueado** | Componentes críticos (wizards, modais) inexistentes; testes de geração/aplicação de plano falham.【035a17†L15-L92】 |
| M3 — Dados & Estruturas | :red_circle: **Bloqueado** | Tabelas/relatórios não atendem aos fluxos simulados; dashboard quebra sem backend stub.【035a17†L99-L128】【68dd4b†L1-L6】 |
| M4 — Formulários & Validação | :red_circle: **Bloqueado** | Wizard de onboarding não renderiza, validações indisponíveis; testes interrompidos.【035a17†L175-L209】 |
| M5 — Páginas Core | :red_circle: **Bloqueado** | Dashboard, FinOps, Servers, Policies e Routing não executam fluxos previstos (timeout ou erros).【035a17†L99-L175】 |
| M6 — Theming/Performance/Observabilidade | :red_circle: **Bloqueado** | Build falha (TS), impossibilitando medição de bundle, Lighthouse ou a11y; sem dark mode/tokenização.【957f66†L1-L124】【F:app/src/styles.css†L1-L152】 |

**Go/No-Go:** :no_entry_sign: **BARRAR** — P0s impedem release (build quebrado, backend real obrigatório, fluxos core indisponíveis).

## Principais Achados por Sprint

### M1 — Fundamentos & Shell
- **Bootstrap/FA não instalados**: `package.json` não contém dependências exigidas; UI utiliza CSS ad-hoc.【F:app/package.json†L1-L35】【F:app/src/styles.css†L1-L152】
- **Tema único sem persistência/FOUC**: `main.tsx` importa apenas `styles.css`; não há `ThemeProvider` nem switches de tema.【F:app/src/main.tsx†L1-L16】
- **Shell sem tokens**: estilos usam cores hardcoded e não há catálogo SCSS modular para reaproveitamento.【F:app/src/styles.css†L17-L152】

### M2 — Ações & Feedback
- **Wizards/modais ausentes**: Seletores esperados pelos testes (`.agent-wizard`, headings “Plano de configuração”) não são renderizados, ocasionando falhas críticas nos fluxos governados.【035a17†L33-L73】
- **Stack de toasts/alerts não validada**: Falhas ao aplicar updates e rollback indicam ausência de feedback consistente (mensagens duplicadas e falta de estados).【035a17†L73-L110】

### M3 — Dados & Estruturas
- **Tabelas e dashboards dependem do backend real**: `App.tsx` carrega dados via `fetch*` e, sem stub, Vite proxy tenta `127.0.0.1:8000`, quebrando testes/smoke.【F:app/src/App.tsx†L255-L338】【68dd4b†L1-L6】
- **Estruturas não exibem estados alternativos**: E2E de catálogo/diagnósticos falham por ausência de registros e componentes de fallback.【035a17†L92-L118】

### M4 — Formulários & Validação
- **Onboarding bloqueado**: wizard não progride; botões continuam desabilitados e componentes esperados não existem, impedindo validações e resumo de erros.【035a17†L209-L230】
- **Tests unitários mal configurados**: suites em `src/test/*.test.tsx` referenciam `jest` globals sem setup, fazendo o build travar antes do bundle.【957f66†L82-L124】

### M5 — Páginas Core
- **Dashboard/FinOps**: sem interceptors nativos, filtros acionam chamadas reais causando `ECONNREFUSED` e timeouts.【68dd4b†L1-L6】【9399da†L1-L1】
- **Servers/Policies/Routing**: mensagens esperadas não aparecem; fluxos de confirmação/rollback não existem, bloqueando operações destrutivas/controladas.【035a17†L33-L145】

### M6 — Theming, Performance & UI Observability
- **Build TypeScript quebrado (69 erros)**: `pnpm --dir app build` falha por typings inconsistentes e testes configurados incorretamente — impede geração de bundle e auditorias (Lighthouse, a11y).【957f66†L1-L124】
- **Proxy padrão mantém dependência de backend**: `vite.config.ts` fixa proxy em `http://127.0.0.1:8000`, ferindo premissa de rodar com fixtures isoladas.【F:app/vite.config.ts†L1-L44】
- **Sem dark mode**: nenhuma classe/variável de tema; não há persistência de preferência ou contraste AA revisado.【F:app/src/styles.css†L1-L152】

## Checklist de Tasks (UI)

| Task | Descrição | Status | Evidência |
| --- | --- | --- | --- |
| TASK-UI-BS-000 | Setup Bootstrap/Font Awesome | ❌ NOT OK | Dependências ausentes; apenas CSS customizado.【F:app/package.json†L1-L35】【F:app/src/styles.css†L1-L152】 |
| TASK-UI-BS-001 | Tokens & temas Light/Dark | ❌ NOT OK | Sem provider/switch; somente `styles.css` global.【F:app/src/main.tsx†L1-L16】 |
| TASK-UI-SH-010 | AppShell acessível | ⚠️ Parcial | Navegação tabular existe, porém sem tokens/temas e depende de dados iniciais falhando.【F:app/src/App.tsx†L640-L686】【035a17†L92-L118】 |
| TASK-UI-NAV-011 | Breadcrumbs/Pagination | ❌ NOT OK | Ausência de componentes dedicados; Playwright não alcança estados com paginação/breadcrumbs.【035a17†L99-L145】 |
| TASK-UI-ACT-020/021/FB-022/MOD-023 | Buttons/Dropdowns/Alerts/Modals | ❌ NOT OK | Falhas ao abrir wizards, aplicar planos e rollback; sem trap de foco ou confirmações em 2 cliques.【035a17†L15-L110】 |
| TASK-UI-DATA-030/031/032 | Cards/Tabelas/Badges | ❌ NOT OK | Falta de dados stubados trava dashboard, catálogo e diagnósticos.【68dd4b†L1-L6】【035a17†L92-L128】 |
| TASK-UI-FORM-040/041/042 | Controles, validação, upload | ❌ NOT OK | Formulários principais não renderizam; botões permanecem desabilitados.【035a17†L145-L209】 |
| TASK-UI-PG-070..075 | Páginas core | ❌ NOT OK | Fluxos Dashboard/Servers/Keys/Policies/Routing/FinOps reprovam ou não executam devido a timeouts/ausência de UI.【035a17†L33-L175】 |
| TASK-UI-TH-080/081/OBS-082 | Tema dark, dieta de bundle, UI kit | ❌ NOT OK | Build com 69 erros; sem splitting, sem catálogo vivo.【957f66†L1-L124】 |

## Issues Abertas (Prioridade)

### P0 — Build TypeScript falha (bloqueia release)
- **Descrição:** `pnpm --dir app build` retorna 69 erros TS envolvendo tipos inconsistentes e suites Jest sem configuração.
- **Como reproduzir:** `pnpm --dir app build`.
- **Evidência:** Log de compilação.【957f66†L1-L124】

### P0 — UI depende de backend real (sem stubs)
- **Descrição:** Vite proxy envia requisições para `127.0.0.1:8000`; sem servidor, fluxos Dashboard/Servers/FinOps quebram.
- **Como reproduzir:** `pnpm --dir tests test` (ou abrir app em dev); observar erros `ECONNREFUSED` no console.
- **Evidência:** Proxy config + logs Playwright.【F:app/vite.config.ts†L24-L44】【68dd4b†L1-L6】

### P0 — Fluxos governados/FinOps indisponíveis
- **Descrição:** Wizards e planos não renderizam; Playwright registra elementos ausentes/timeouts em 10+ casos.
- **Como reproduzir:** `pnpm --dir tests test`.
- **Evidência:** Relatório Playwright com 10 falhas e 1 teste interrompido.【035a17†L1-L209】

### P1 — Tema único sem contraste/a11y
- **Descrição:** Não há dark mode, tokens ou verificação AA; cores hardcoded dificultam ajustes.
- **Como reproduzir:** Inspecionar `styles.css` / UI.
- **Evidência:** CSS custom ad-hoc.【F:app/src/styles.css†L1-L152】

### P1 — Suites unitárias mal configuradas
- **Descrição:** Testes Vitest/Jest misturados; falta de `setup` causa erros em build.
- **Como reproduzir:** `pnpm --dir app build`.
- **Evidência:** Erros `Cannot find name 'expect'` etc.【957f66†L55-L124】

### P2 — Navegação sem code splitting/bundle diet
- **Descrição:** Sem dados de bundle por build quebrar; suspeita de CSS único >200KB.
- **Recomendação:** corrigir build e medir.

## Recomendações

### Quick Wins
1. **Corrigir toolchain TS/Vitest** — Remover suites Jest ou configurar `vitest` apropriadamente; ajustar tipos em `api.ts`, `App.test.tsx`.【957f66†L1-L124】
2. **Parametrizar API via mocks** — Implementar MSW (Mock Service Worker) ou interceptadores locais para `/api/*`, evitando dependência 127.0.0.1:8000.【F:app/vite.config.ts†L24-L44】
3. **Introduzir design tokens e tema toggle mínimo** — Criar `ThemeProvider` com persistência; aplicar CSS variables base.【F:app/src/main.tsx†L1-L16】【F:app/src/styles.css†L1-L152】

### Backlog Técnico
- **Reimplementar UI kit com Bootstrap 5 modular + Font Awesome tree-shaking.**
- **Criar catálogo de componentes com estados loading/empty/error e documentação.**
- **Adicionar suites Playwright focadas em acessibilidade (axe) após estabilizar UI.**
- **Configurar build metrics (Lighthouse CI, bundle analyzer) após corrigir `pnpm build`.**

## Métricas
- **Playwright:** 6 passados / 10 falhos / 1 interrompido / 9 não executados em ~3.2 min.【035a17†L1-L209】
- **Cobertura Playwright:** Baixa — fluxos core não atingem finalização.
- **Build (Vite):** Falha com 69 erros TS; sem artefatos CSS/JS, impossibilitando medir tamanho ou Lighthouse.【957f66†L1-L124】
- **A11y & Performance:** Não testados devido a build quebrado e falta de UI funcional.
- **Regressões Visuais:** Não avaliadas — ausência de UI kit e falhas e2e impedem captura consistente.

## Go/No-Go
- **Recomendação:** **BARRAR** go-live até sanar P0s: build TypeScript, mocks de backend e implementação efetiva das páginas core. Plano de ação detalhado acima.

