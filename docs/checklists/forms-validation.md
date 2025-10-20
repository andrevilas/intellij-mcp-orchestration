# Sprint M4 — Formulários & Validação checklist

Anexe esta lista aos PRs que evoluírem os formulários MCP.

## Controles básicos
- [ ] Executar `pnpm --dir app test` e garantir que `FormControls.test.tsx` passe sem regressões.
- [ ] Verificar que os componentes `Input/Select/TextArea/Switch/InputGroup` respeitam tokens `--mcp-form-*` nos estados normal/foco/erro.
- [ ] Validar `FormErrorSummary` com leitor de tela (foco ao clicar nos erros e mensagens assertivas).

## Upload & Download
- [ ] Testar `FileUploadControl` com arquivo acima do limite e checar toast + alerta.
- [ ] Confirmar que `FileDownloadControl` gera blob real ou stub e respeita barras de progresso.

## Evidências
- [ ] Atualizar `docs/forms/README.md` com notas da mudança.
- [ ] Salvar artefatos (ex.: `forms-tab-order.json`) em `/docs/evidence/<ID>/`.
- [ ] Mencionar execução do teste Playwright (`tests/e2e/forms-controls.spec.ts`) no PR.
