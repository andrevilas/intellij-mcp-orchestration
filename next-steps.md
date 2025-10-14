# MCP Console — Next Steps

Este roteiro consolida as atividades planejadas para o Console MCP e define o fluxo de trabalho esperado para cada entrega.

## Roadmap de Tarefas

- [x] **TASK-OPS-001 — Criar monorepo ou diretório dual (`/app` e `/server`)**
- [x] **TASK-OPS-002 — Definir stack do frontend e bootstrap inicial**
- [x] **TASK-OPS-003 — Prototipar API do Console MCP Server**
- [ ] **TASK-OPS-004 — Integração inicial Console ↔️ MCP servers existentes**

### TASK-OPS-001 — Criar monorepo ou diretório dual (`/app` e `/server`)

**Objetivo**

Preparar a estrutura do repositório para acomodar, lado a lado, os componentes de aplicação (`app/`) e serviços (`server/`), evitando refatorações futuras quando o desenvolvimento da interface e do backend avançarem.

**Passos sugeridos**

1. Criar os diretórios `app/` e `server/` na raiz do repositório.
2. Adicionar arquivos de documentação mínima explicando o propósito de cada diretório.
3. Atualizar o roteiro (`next-steps.md`) marcando a tarefa como concluída e mantendo o contexto para as próximas atividades.

**Definition of Done (DoD)**

- Estrutura de diretórios `app/` e `server/` versionada.
- Documentação básica em cada diretório descrevendo o uso planejado.
- `next-steps.md` atualizado com a tarefa marcada como concluída e roadmap preservado.

### TASK-OPS-002 — Definir stack do frontend e bootstrap inicial

**Objetivo**

Selecionar a stack do Console MCP frontend, instalar o tooling base e garantir que o projeto possa ser iniciado localmente
com comandos padronizados.

**Passos sugeridos**

1. Escolher framework/build tool (ex.: Vite + React + TypeScript) alinhado ao foco SPA.
2. Versionar `package.json`, configs do bundler e landing page inicial em `app/`.
3. Documentar scripts de execução e requisitos mínimos (Node/npm) no `README` do diretório e no README principal.

**Definition of Done (DoD)**

- `app/` com dependências e scripts (`npm run dev/build/preview`) funcionando.
- Código-fonte inicial (`src/`) exibindo landing page da Console MCP.
- Documentação atualizada refletindo a stack escolhida e instruções de uso.

### TASK-OPS-003 — Prototipar API do Console MCP Server

**Objetivo**

Fornecer um backend mínimo para o Console MCP capaz de listar MCP servers conhecidos e
iniciar sessões lógicas em memória, preparando o terreno para orquestração real.

**Passos sugeridos**

1. Selecionar framework HTTP (FastAPI recomendado) e estruturar `server/` como pacote instalável.
2. Ler manifest de provedores (ex.: `config/console-mcp/servers.example.json`) e expor
   endpoints REST para health check, listagem e criação de sessões.
3. Publicar entrypoints (`console-mcp-server`, `console-mcp-server-dev`) e documentar execução local.
4. Atualizar README/roadmap com instruções de uso e checklist da tarefa.

**Definition of Done (DoD)**

- FastAPI (ou equivalente) rodando com endpoints `/api/v1/healthz`, `/providers`, `/sessions`.
- Manifesto de provedores versionado e carregado pelo backend.
- Entry points disponíveis via `pyproject.toml` com instruções claras no README.
- `next-steps.md` atualizado marcando a tarefa como concluída.

### TASK-OPS-004 — Integração inicial Console ↔️ MCP servers existentes

**Objetivo**

Conectar o frontend ao backend prototipado, habilitando descoberta de provedores e teste de provisionamento.

**Passos sugeridos**

1. Criar client HTTP no frontend para consumir `/api/v1/providers`.
2. Exibir lista e detalhes dos provedores na UI (estado e filtro básico).
3. Invocar `/providers/{id}/sessions` a partir de interações da interface e apresentar feedback.
4. Ajustar documentação ensinando a executar app + server em paralelo.

**Definition of Done (DoD)**

- Frontend consome API local e renderiza provedores.
- Ações de provisionamento registram sessão (mock) e retornam mensagem ao usuário.
- Docs atualizadas com fluxo completo (app + server).

## Instruções para o Agente (Codex)

1. Sempre iniciar o trabalho criando um branch com o padrão `feat/<TASK_ID>-<slug-curto>` a partir da `main`.
2. Implementar a tarefa seguindo os passos e o DoD da seção correspondente.
3. Ao finalizar, atualizar este arquivo marcando a checkbox da tarefa entregue.
4. Commits devem referenciar explicitamente o `TASK_ID` na mensagem (ex.: `TASK-OPS-001: ...`).
5. Após os testes relevantes, abrir um PR seguindo o template padrão e anexar evidências quando aplicável.
