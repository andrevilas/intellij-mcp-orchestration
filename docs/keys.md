# Aquisição e Configuração de Chaves de API

Para utilizar os agentes de IA, você precisa adquirir as chaves de API de cada provedor. O script `scripts/get-keys.sh` irá ajudá-lo a armazená-las de forma segura.

## Passo a Passo

Use o script:
```bash
bash scripts/get-keys.sh
```

> Após salvar as chaves, rode `make doctor` para validar handshake do `glm46-mcp-server`.
