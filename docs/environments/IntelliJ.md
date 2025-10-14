
# IntelliJ (Ultimate) — Configuração

1) **AI Assistant → MCP → Add → Command**
   - `~/.local/bin/gemini-mcp`
   - `~/.local/bin/codex-mcp`
   - `~/.local/bin/glm46-mcp`
   - `~/.local/bin/claude-mcp` (ponte operacional)

2) **MCP Server (opcional)**
   - Settings → Tools → MCP Server → **Enable**
   - Auto-Configure no Claude Desktop (quando quiser teleoperação).

3) **Políticas & Guardrails**
   - Limites de tokens/tempo por servidor respeitam `~/.mcp/cost-policy.json`.
   - Telemetria de chamadas GLM em `~/.mcp/logs/glm46/<data>.jsonl` (tokens, custo estimado, status).
   - Roteamento por contexto/latência ajustável em `config/ai-assistant-mcp.json`.
