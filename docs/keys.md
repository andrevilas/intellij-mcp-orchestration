# Gestão de chaves MCP

A console MCP permite cadastrar, atualizar e remover chaves de acesso diretamente pela interface. Cada provedor listado na aba **Chaves** exibe o status da credencial, a data da última atualização e atalhos para testar a conectividade do agente.

## Como gerenciar chaves pela interface

1. Acesse a aba **Chaves** na barra superior da console.
2. Cada cartão exibe o resumo do provedor, o transporte configurado e os escopos anunciados. Use o botão **Configurar chave** para cadastrar uma credencial ou **Atualizar chave** para editar a existente.
3. Ao editar, a console carrega o valor atual sob demanda e permite salvar alterações em tempo real. Também é possível remover a credencial sem sair da página.
4. Utilize **Testar conectividade** para executar um handshake rápido com o agente e verificar latência e mensagens de retorno.

As chaves agora são provisionadas a partir do bundle `config/secrets.enc.yaml`, cifrado com SOPS. Use `make secrets-sync` (ou `scripts/secrets-sync.sh`) para gerar `~/.mcp/.env` e `~/.mcp/console-secrets.json` com permissões `600`. O script `scripts/get-keys.sh` mantém um modo interativo apenas para contingências, exibindo aviso sempre que o cofre seguro estiver indisponível.

## Boas práticas

- Rotacione as credenciais sempre que detectar aumento de erros ou degradação de latência nas validações.
- Aproveite o resumo superior para identificar provedores sem chave ativa ou que exigem atenção adicional.
- Após salvar uma nova credencial, acione o teste de conectividade para confirmar que o agente responde com o handshake esperado.
