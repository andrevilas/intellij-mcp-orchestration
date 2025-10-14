# Aquisição e Configuração de Chaves de API

Para utilizar os agentes de IA, você precisa adquirir as chaves de API de cada provedor. O script `scripts/get-keys.sh` irá ajudá-lo a armazená-las de forma segura.

## Passo a Passo

1.  **Execute o Script de Configuração**:
    ```bash
    bash scripts/get-keys.sh
    ```
    O script irá criar o diretório `~/.mcp` e o arquivo `.env` (`~/.mcp/.env`) com as permissões corretas (`600`), e então irá solicitar cada chave.

2.  **Adquira e Insira as Chaves**:
    Abaixo estão as instruções para obter cada chave necessária.

### 1. Gemini (Google AI)

-   **Propósito**: Usado para análise rápida, scaffolding e documentação (Agente Analyzer/Doc).
-   **Onde Obter**:
    1.  Acesse o [Google AI Studio](https://aistudio.google.com/app/apikey).
    2.  Faça login com sua conta Google.
    3.  Clique em "**Create API key**".
    4.  Copie a chave gerada.
-   **Variável de Ambiente**: `GEMINI_API_KEY`

### 2. Codex (OpenAI)

-   **Propósito**: Usado para execução de código, refatoração e testes (Agente Executor).
-   **Onde Obter**:
    1.  Acesse a [página de chaves de API da OpenAI](https://platform.openai.com/api-keys).
    2.  Faça login ou crie uma conta.
    3.  Clique em "**Create new secret key**".
    4.  Copie a chave gerada.
-   **Variável de Ambiente**: `OPENAI_API_KEY`

### 3. GLM-4.6 (Zhipu)

-   **Propósito**: Usado para planejamento profundo e refatorações complexas que exigem uma grande janela de contexto (Agente Planner).
-   **Onde Obter**:
    1.  Acesse o [painel da Zhipu AI](https://open.bigmodel.cn/usercenter/apikeys).
    2.  Crie uma conta e navegue até a seção de chaves de API.
    3.  Gere e copie sua chave.
-   **Variável de Ambiente**: `ZHIPU_API_KEY`

### 4. Claude (Anthropic) - Opcional

-   **Propósito**: Usado para tarefas que exigem contexto ultra-longo ou para teleoperação do IDE.
-   **Onde Obter**:
    1.  Acesse as [configurações da sua conta Anthropic](https://console.anthropic.com/settings/keys).
    2.  Gere uma nova chave de API.
-   **Variável de Ambiente**: `ANTHROPIC_API_KEY`

Após inserir todas as chaves no prompt do script, o arquivo `~/.mcp/.env` estará completo e pronto para ser usado pela orquestração MCP.
