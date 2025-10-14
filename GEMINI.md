# Agente Gemini (Analyzer/Doc)

O Gemini é o agente padrão para tarefas de **análise, documentação e scaffolding** de baixo custo e alta velocidade. Ele é otimizado para interações rápidas e eficientes, sendo o ponto de partida para a maioria dos workflows.

## Casos de Uso

1.  **Análise Rápida (Analyzer)**
    *   **Triagem de Issues**: Cole um bug report ou uma feature request no chat do AI Assistant com o Gemini selecionado para obter um resumo, uma análise inicial de impacto e um rascunho de "Definition of Ready" (DOR).
    *   **Leitura de Código**: Peça para o Gemini explicar um trecho de código, identificar possíveis bugs ou sugerir melhorias de legibilidade.
    *   **Geração de Testes Iniciais**: A partir de uma classe ou função, peça para o Gemini criar um plano de testes ou o scaffold de um arquivo de teste (e.g., `*.test.js`, `*_test.py`).

2.  **Geração de Código (Scaffolding)**
    *   Use o Gemini para criar o esqueleto de novos componentes, classes ou módulos.
    *   Peça para gerar boilerplate, como configurações de projetos, arquivos `Dockerfile` básicos ou scripts de CI/CD.

3.  **Documentação (Doc)**
    *   **README**: Cole o código de um script ou funcionalidade e peça um `README.md` explicando seu propósito e como usá-lo.
    *   **ADR (Architecture Decision Record)**: Descreva uma decisão de arquitetura e peça para o Gemini formatá-la como um ADR.
    *   **Changelog**: A partir de um diff de `git`, peça para o Gemini gerar um rascunho das notas de release.

## Configuração

A integração do Gemini é feita via **FastMCP**, um servidor de rotas stdio/http que garante baixa latência.

1.  **Instalação**: O script `scripts/bootstrap-mcp.sh` instala o wrapper `gemini-mcp` em `~/.local/bin/gemini-mcp`.
2.  **IntelliJ**:
    *   Vá em `Settings → Tools → AI Assistant → MCP`.
    *   Clique em `Add → Command`.
    *   Adicione o caminho: `~/.local/bin/gemini-mcp`.

## FinOps

O Gemini é configurado para ser o agente mais **custo-efetivo**. Ele é a escolha ideal para tarefas que não exigem a janela de contexto gigante do GLM-4.6 ou a capacidade de execução de código do Codex.

- **Roteamento**: O roteador MCP prioriza o Gemini para a maioria das tarefas de "primeiro contato".
- **Políticas**: As políticas de custo (`config/cost-policy.json`) podem ser ajustadas para limitar o uso ou definir orçamentos específicos, mas o Gemini raramente excede os limites padrão.
