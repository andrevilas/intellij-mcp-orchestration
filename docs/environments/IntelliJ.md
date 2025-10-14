# IntelliJ (Ultimate) — Configuração

A integração com o IntelliJ AI Assistant é o principal alvo deste projeto. A configuração é feita diretamente nas configurações do IDE.

## Pré-requisitos

1.  **Chaves de API**: Garanta que suas chaves de API estão configuradas em `~/.mcp/.env`. Consulte o guia [Aquisição e Configuração de Chaves de API](../keys.md) para o passo a passo.
2.  **Agentes Instalados**: Execute o script de bootstrap para instalar os agentes no seu ambiente:
    ```bash
    bash scripts/bootstrap-mcp.sh
    ```

## Configuração do AI Assistant

1.  Abra as configurações do IntelliJ: `File → Settings` (ou `Ctrl+Alt+S`).
2.  Navegue até `Tools → AI Assistant`.
3.  No painel à direita, localize a seção `MCP`.
4.  Clique em `Add` e selecione `Command`.
5.  Adicione uma entrada para cada agente, especificando o caminho para o executável correspondente. Repita o processo para cada um dos seguintes agentes:

    *   `~/.local/bin/gemini-mcp`
    *   `~/.local/bin/codex-mcp`
    *   `~/.local/bin/glm46-mcp`
    *   `~/.local/bin/claude-mcp` (opcional)

    ![IntelliJ MCP Configuration](https://i.imgur.com/example.png) <!-- Imagem de exemplo -->

6.  Clique em `Apply` e `OK` para salvar as configurações.

## Uso

Após a configuração, os agentes estarão disponíveis como contextos no chat do AI Assistant. Você pode selecioná-los na lista de modelos disponíveis para direcionar suas solicitações.

## Servidor MCP (Opcional)

Para cenários de "teleoperação" (onde outro sistema, como o Claude Desktop, se conecta ao seu IDE), você pode habilitar o servidor MCP integrado do IntelliJ:

3) **Políticas & Guardrails**
   - Limites de tokens/tempo por servidor respeitam `~/.mcp/cost-policy.json`.
   - Telemetria de chamadas GLM em `~/.mcp/logs/glm46/<data>.jsonl` (tokens, custo estimado, status).
   - Roteamento por contexto/latência ajustável em `config/ai-assistant-mcp.json`.
