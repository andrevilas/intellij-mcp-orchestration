
# Offline / Ambientes Restritos

1) Baixe previamente:
   - pacotes .deb de jq, curl, python3, python3-venv, python3-pip
   - pipx wheel/cached
   - fastmcp (wheel) se aplicável
2) Configure repositórios internos ou artifactory para npm/pypi.
3) Ajuste scripts para apontar para mirrors internos.

## Executar o Console MCP totalmente offline

1. Instale dependências com o cache local do PNPM (ex.: `pnpm install --offline`).
2. Garanta que as fixtures estejam disponíveis (padrão do repositório em `tests/fixtures/backend` e espelho em `server/routes/fixtures`).
3. Exporte a flag para habilitar o modo MSW/fixtures (já habilitada por padrão):

   ```bash
   export CONSOLE_MCP_USE_FIXTURES=1
   ```

4. Inicie o frontend usando apenas as fixtures locais:

   ```bash
   pnpm --dir app dev
   ```

   O Vite ativa o worker do MSW automaticamente e todas as respostas são servidas a partir de `app/src/mocks/handlers.ts`, reutilizando os mesmos JSONs do backend.

5. Para voltar ao backend real (quando disponível), force o modo proxy:

   ```bash
   export CONSOLE_MCP_USE_FIXTURES=0
   pnpm --dir app dev
   ```

   Caso o backend não esteja acessível, o Vite retorna automaticamente às fixtures determinísticas, alinhadas com `server/routes/fixtures`.
