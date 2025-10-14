# MCP Console — Next Steps

Este roteiro consolida as atividades planejadas para o Console MCP e define o fluxo de trabalho esperado para cada entrega.

## Roadmap de Tarefas

- [x] **TASK-OPS-001 — Criar monorepo ou diretório dual (`/app` e `/server`)**
- [ ] **TASK-OPS-002 — Definir stack do frontend e bootstrap inicial**
- [ ] **TASK-OPS-003 — Prototipar API do Console MCP Server**
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

## Instruções para o Agente (Codex)

1. Sempre iniciar o trabalho criando um branch com o padrão `feat/<TASK_ID>-<slug-curto>` a partir da `main`.
2. Implementar a tarefa seguindo os passos e o DoD da seção correspondente.
3. Ao finalizar, atualizar este arquivo marcando a checkbox da tarefa entregue.
4. Commits devem referenciar explicitamente o `TASK_ID` na mensagem (ex.: `TASK-OPS-001: ...`).
5. Após os testes relevantes, abrir um PR seguindo o template padrão e anexar evidências quando aplicável.
