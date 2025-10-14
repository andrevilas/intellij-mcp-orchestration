# VS Code — Configuração

O VS Code pode ser integrado aos agentes MCP através das configurações do editor. A configuração assume que você já executou o script `bootstrap-mcp.sh` e que os executáveis dos agentes estão disponíveis em `~/.local/bin`.

## Pré-requisitos

1.  **Chaves de API**: Certifique-se de que suas chaves de API estão configuradas em `~/.mcp/.env`. Veja o guia [Aquisição e Configuração de Chaves de API](../keys.md) para mais detalhes.
2.  **Agentes Instalados**: Execute o script de bootstrap para instalar os agentes:
    ```bash
    bash scripts/bootstrap-mcp.sh
    ```

## Configuração do `settings.json`

1.  Abra o seu arquivo `settings.json` no VS Code (pressione `Ctrl+Shift+P` e procure por `Preferences: Open User Settings (JSON)`).
2.  Adicione ou modifique o seguinte bloco de configuração para registrar os agentes MCP:

    ```json
    {
      // ... outras configurações

      "chat.mcp.access": "all",
      "chat.mcp.servers": [
        {
          "name": "Gemini (FastMCP)",
          "type": "command",
          "command": "~/.local/bin/gemini-mcp",
          "args": []
        },
        {
          "name": "Codex (OpenAI)",
          "type": "command",
          "command": "~/.local/bin/codex-mcp",
          "args": []
        },
        {
          "name": "GLM-4.6 (Zhipu)",
          "type": "command",
          "command": "~/.local/bin/glm46-mcp",
          "args": []
        }
      ]
    }
    ```

3.  Salve o arquivo. Após salvar, os novos agentes estarão disponíveis no painel de Chat do VS Code, permitindo que você os selecione para interagir.

## Uso

Com os agentes configurados, você pode invocá-los no chat do VS Code usando `@` seguido do nome do agente (e.g., `@Gemini`, `@Codex`).