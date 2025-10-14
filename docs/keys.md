
# Chaves Necessárias

Armazenamento: `~/.mcp/.env` (permissão 600). Exemplo:
```
GEMINI_API_KEY=
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
ZHIPU_API_KEY=
```

Use o script:
```bash
bash scripts/get-keys.sh
```

> Após salvar as chaves, rode `make doctor` para validar handshake do `glm46-mcp-server`.
