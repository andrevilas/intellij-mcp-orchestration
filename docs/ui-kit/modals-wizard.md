# Modais & Wizards acessíveis

Os modais MCP seguem práticas de acessibilidade AA+, mantendo trap de foco, anunciando estados via `aria-live` e exigindo
confirmações em dois cliques para ações críticas.

## Componentes disponíveis

- **`ModalBase`** (`app/src/components/modals/ModalBase.tsx`): provê trap de foco, restaura o foco anterior e bloqueia o scroll do
  `body`. Também expõe `data-autofocus` para definir o elemento inicial.
- **`ConfirmationModal`** (`app/src/components/modals/ConfirmationModal.tsx`): fluxo simples com dupla confirmação por padrão,
  permitindo cancelar/confirmar com rótulos e `aria-live` para dicas.
- **`FormModal`** (`app/src/components/modals/FormModal.tsx`): encapsula formulários com submissão controlada e mantém o trap de
  foco quando há poucos elementos.
- **`WizardModal`** (`app/src/components/modals/WizardModal.tsx`): novo componente multi-etapas com indicador lateral,
  rearmamento automático ao voltar etapas e confirmação dupla na etapa final.

## Cenários suportados

1. **Provisionamento governado** — Utilize `WizardModal` para coletar dados em etapas, validar campos com `onNext` e, na etapa
   final, exigir `confirmMode="double"`. A cada tentativa sem checklist marcado, o wizard retorna `false` e exibe um toast de
   erro persistente.
2. **Rollback transparente** — Cancelamentos via botão "Voltar" na primeira etapa ou no `onClose` disparam um toast `warning`
   informando que nenhuma alteração foi aplicada, mantendo histórico auditável.
3. **Feedback deduplicado** — O `ToastProvider` evita enfileirar mensagens idênticas (mesmo título + descrição + variante),
   reposicionando a notificação existente e respeitando `autoDismiss=false` para variantes `error`.
4. **Mensagens de sucesso** — Toasts `success` possuem duração reduzida e continuam anunciando via `aria-live="polite"`, enquanto
   `Alert` expõe `aria-labelledby`/`aria-describedby` para leitores de tela.

## Boas práticas de QA

- Exercite `Tab`/`Shift+Tab` dentro de cada modal para confirmar o trap de foco.
- Valide a dupla confirmação clicando uma vez no CTA final e garantindo que o hint `role="status"` aparece antes do segundo
  clique.
- Dispare o mesmo toast três vezes e verifique que apenas uma notificação permanece na pilha (`ToastProvider.test.tsx`).
- Utilize os testes Playwright em `tests/e2e/ui-overlays.spec.ts` para cobrir abertura, confirmação e rollback do wizard.

