
# VS Code — Configuração (Copilot MCP + Cline opcional)

## 1) Copilot MCP
Adicione em `settings.json`:
```json
{
  "chat.mcp.access": "all",
  "chat.mcp.servers": [
    { "name": "Gemini (FastMCP)", "type": "command", "command": "/home/andre/.local/bin/gemini-mcp", "args": [] },
    { "name": "Codex (OpenAI)",   "type": "command", "command": "/home/andre/.local/bin/codex-mcp",  "args": [] },
    { "name": "GLM-4.6 (Zhipu)",  "type": "command", "command": "/home/andre/.local/bin/glm46-mcp", "args": [] }
  ]
}
```

## 2) Cline (opcional)
Cadastra os mesmos MCP servers pela UI da extensão e use o modo Agent para execução “fim-a-fim”.

> Template pronto em `config/cline.config.json`.

> Guardrails: `glm46-mcp-server` consome `~/.mcp/cost-policy.json` e registra telemetria em `~/.mcp/logs/glm46/`.
