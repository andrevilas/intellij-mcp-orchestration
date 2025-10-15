
# IntelliJ MCP Orchestration – Multi‑Agent Dev Stack (Gemini · Codex · GLM‑4.6 · Claude)

## Propósito da aplicação

Esta stack foi criada para oferecer uma forma reprodutível de instalar, operar e observar múltiplos **MCP servers** alinhados ao **JetBrains AI Assistant**. O objetivo é padronizar ambientes (workstations, VMs, WSL) e entregar:

- **Produtividade**: scripts idempotentes (`scripts/bootstrap-mcp.sh` e `make` targets) que configuram agentes e dependências sem intervenção manual extensa.
- **Confiabilidade**: guardrails FinOps, telemetria e manifests de servidores versionados em `config/`.
- **Escalabilidade**: frontend em Vite/React para orquestrar servidores e backend FastAPI que expõe uma API consistente para integrações.

Use este repositório quando precisar replicar rapidamente um ambiente multi‑agente com governança de custo e observabilidade, seja em estações pessoais ou clusters internos.

## Guia passo a passo (instalação completa)

> Os comandos abaixo assumem Ubuntu 22.04+ com `git`, `curl`, `python3` e `pnpm` instalados. Caso esteja em um ambiente limpo, execute `sudo apt-get update && sudo apt-get install -y git curl python3 python3-venv python3-pip` e instale o `pnpm` via `curl -fsSL https://get.pnpm.io/install.sh | sh -` antes de continuar.

1. **Clonar o repositório**
   ```bash
   git clone <seu-fork-ou-este-repo>.git intellij-mcp-orchestration
   cd intellij-mcp-orchestration
   ```

2. **Executar o bootstrap principal** — instala wrappers MCP (Gemini, Codex, GLM‑4.6, Claude), ajusta o `PATH` via `pipx` e cria policies de custo padrão.
   ```bash
   bash scripts/bootstrap-mcp.sh
   ```

3. **Provisionar dependências do monorepo (opcional, porém recomendado)**
   ```bash
   make install      # pnpm install no frontend e pip install -e no backend
   make doctor       # checagens: glm46-mcp-server, policy file, PATH
   ```

4. **Subir o ambiente integrado para desenvolvimento local**
   ```bash
   make dev          # inicia FastAPI (porta 8000) + Vite (porta 5173)
   ```

5. **Configurar o IntelliJ AI Assistant para consumir os MCP servers**
   - Abra **Settings → Tools → AI Assistant → MCP → Add → Command**.
   - Adicione os binários instalados em `~/.local/bin/`:
     - `gemini-mcp`
     - `codex-mcp`
     - `glm46-mcp`
     - `claude-mcp` (opcional)

6. **Validar a experiência end-to-end**
   - Acesse `http://127.0.0.1:5173` e confira a lista de servidores em **Console MCP**.
   - Use o IntelliJ para acionar cada agente e verifique os logs em `~/.mcp/logs/`.
   - Ajuste `config/console-mcp/servers.example.json` conforme necessário e reinicie o backend com `make dev-backend`.

7. **Operação diária**
   - `make dev-backend` ou `make dev-frontend` para executar componentes isoladamente.
   - `make reset` para reconfigurar wrappers caso o ambiente seja movido/atualizado.
   - Monitore custos via JSONL em `~/.mcp/logs/glm46/` e políticas em `~/.mcp/cost-policy.json`.

## Stack
- **Gemini** via FastMCP (rotas stdio/http) – custo/latência amigáveis para throughput alto.
- **Codex (OpenAI compat.)** via MCP server CLI – DX forte para “read‑modify‑run”.
- **GLM‑4.6 (Zhipu)** – janela de **200K tokens** para refactors amplos e planning profundo. Agora com **MCP server stdio próprio** (`glm46-mcp-server`) incluindo guardrails de custo/tokens, telemetria JSON e estimativa de custo por chamada.
- **Claude** – opcional; quando IDE exposto como MCP server para sessões de teleoperação.

## Documentação

- **[GEMINI.md](GEMINI.md)** — Como operar o agente Gemini após o bootstrap.
- **[docs/keys.md](docs/keys.md)** — Checklist de chaves de API e variáveis sensíveis.
- **[docs/environments/IntelliJ.md](docs/environments/IntelliJ.md)** e **[docs/environments/VSCode.md](docs/environments/VSCode.md)** — Ajustes específicos em cada IDE.
- **[docs/packaging.md](docs/packaging.md)** — Empacotamento (Electron + bundles locais).
- **[docs/runbook.md](docs/runbook.md)** — Fluxo operacional resumido (Análise → Planejamento → Execução → Documentação).

> Roadmaps e planos táticos que não são necessários para a operação diária agora residem em [`docs/archive/`](docs/archive/README.md).

## Pastas
- `app/` – frontend do Console MCP, agora iniciado com Vite + React + TypeScript.
- `server/` – backend/API do Console MCP alinhado ao protocolo JSON-RPC do MCP.
- `scripts/` – instalação, preflight e wrappers.
- `config/` – templates de configuração (AI Assistant MCP, policies de roteamento).
- `docs/` – playbooks por fase (Análise → Planejamento → Execução+Testes → Documentação) + guias de ambientes IntelliJ/VS Code.
- `desktop/` – shell opcional em Electron para empacotar o frontend como app desktop.

## Packaging (Sprint OPS-4)

```bash
# Build local bundle (frontend estático + wheel do backend)
pnpm build

# Empacotar shell Electron (opcional)
pnpm run package:electron
```

Detalhes adicionais estão em [`docs/packaging.md`](docs/packaging.md).

## Novidades (v0.2.0)
- `glm46-mcp-server` em Python, integrado ao bootstrap (`pipx install --force wrappers/glm46-mcp-server`).
- Guardrails FinOps seguindo `~/.mcp/cost-policy.json` (default copiado de `config/cost-policy.json`).
- Telemetria de chamadas GLM em `~/.mcp/logs/glm46/<data>.jsonl` com tokens, custo estimado e status.
- `make doctor` validando handshake stdio e presença do policy file.

## Console MCP Frontend (`app/`)

```bash
pnpm --dir app install   # ou `pnpm install && pnpm -r dev`
pnpm --dir app dev       # acessível em http://127.0.0.1:5173
```

> Dica: `make dev-frontend` chama o mesmo comando e mantém logs consistentes com o backend.

Stack escolhida: **Vite 5 + React 18 + TypeScript** para maximizar DX. A interface agora consome os endpoints do servidor
do Console MCP (`/api/v1/providers` e `/api/v1/sessions`), exibe as capacidades do manifesto versionado e permite disparar
provisionamentos em memória diretamente da UI.

Variáveis de ambiente úteis (Vite):
- `VITE_CONSOLE_API_BASE` — sobrescreve o path base usado pelo frontend (default: `/api/v1`).
- `CONSOLE_MCP_API_PROXY` — ajusta o destino do proxy local do Vite durante `pnpm dev` (default: `http://127.0.0.1:8000`).

## Console MCP Server (`server/`)

```bash
cd server
python -m venv .venv
source .venv/bin/activate
pip install -e .
console-mcp-server-dev  # FastAPI + Uvicorn em http://127.0.0.1:8000
```

O protótipo expõe rotas REST (`/api/v1/*`) que retornam os MCP servers definidos em
`config/console-mcp/servers.example.json`, permitindo que o frontend experimente fluxos
de descoberta e provisionamento de sessões. Use `console-mcp-server` para um processo
sem auto-reload (bind em `0.0.0.0:8000`) e ajuste o manifest via `CONSOLE_MCP_SERVERS_PATH`
se quiser apontar para outro arquivo.

Variáveis de ambiente úteis:
- `CONSOLE_MCP_CORS_ORIGINS` — lista separada por vírgulas para definir origens permitidas (default inclui `http://127.0.0.1:5173` e `http://localhost:5173`).
- `CONSOLE_MCP_SERVERS_PATH` — caminho alternativo para o manifest de provedores.

## Execução integrada (app + server)

1. Rode `make install` para garantir dependências (pnpm + pip) sincronizadas.
2. Execute `make dev` para subir backend (uvicorn/auto-reload) e frontend em paralelo.
3. Acesse `http://127.0.0.1:5173` e teste o provisionamento direto da lista de provedores. Cada ação também pode ser observada em `/api/v1/sessions`.

> Dica: personalize as origens CORS ou o proxy do Vite caso exponha o Console MCP em hosts diferentes. Use `make dev-backend` ou `make dev-frontend` para executar componentes isolados.

## Guardrails
- `.env` em `~/.mcp/.env` com `chmod 600` (não versionar). Veja `.env.example`.
- Limites de custo/tempo por servidor (definidos em wrappers e políticas).
- Sem execuções “sem confirmação” em prod (opcional habilitar em dev).

---

## Workflow Padrão (4 etapas)

1) **Análise** – triagem de issues, leitura de requisitos, RAG de repositório.  
   - **Roteamento**: Gemini (rápido/barato) → GLM‑4.6 (contexto longo) → Claude (ultra‑longo) conforme necessidade.

2) **Planejamento** – DOR/DOD, riscos, checkpoints, ferramentas MCP.  
   - Artefatos em `docs/plan/` e template `config/ai-assistant-mcp.json` para priorização.

3) **Execução + Testes** – Codex “mão na massa” (MCP CLI), Gemini p/ scaffolds, GLM‑4.6 p/ refactors multi‑file.  
   - Playwright/Jest/PyTest conforme o projeto; gravações de fluxo quando aplicável.

4) **Documentação** – ADR, Changelog, README “How to run”, métricas de FinOps (tokens/latência/PR).

---

## Replicação em Massa
Em cada host/VM/WSL:
```bash
git clone <repo> && cd intellij-mcp-orchestration
bash scripts/bootstrap-mcp.sh    # idempotente, com preflight e self‑heal de PATH
```
Depois, no IntelliJ (Ultimate): **AI Assistant → MCP → Add → Command** apontando para os binários em `~/.local/bin`.

> Dica: use `make doctor` e `make reset` para checkup/rollback rápido (ver `Makefile`). Logs ficam em `~/.mcp/logs/glm46/`.

## Notas de Produção
- Para ambientes travados (sem apt/sem internet), veja `scripts/offline-notes.md` e configure mirrors/artefatos internos.
- Integração com Claude Desktop (teleoperação do IDE): habilite **Settings → Tools → MCP Server → Enable → Auto‑Configure**.
