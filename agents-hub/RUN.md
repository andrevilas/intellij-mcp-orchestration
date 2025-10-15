# Execução local do Agents Hub

Este guia descreve o fluxo mínimo para subir o serviço FastAPI de agentes em modo local.

## 1. Preparar o ambiente

1. Crie ou ative um `virtualenv` Python 3.10+.
2. Na raiz de `agents-hub/`, instale as dependências:
   ```bash
   make install
   ```

## 2. Definir variáveis de ambiente (opcional)

| Variável          | Utilidade                                                                                   | Exemplo                                      |
| ----------------- | ------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `API_TITLE`       | Ajusta o título exibido nos metadados do FastAPI.                                           | `API_TITLE="Console Agents Hub"`            |
| `API_DESCRIPTION` | Atualiza a descrição da API.                                                                | `API_DESCRIPTION="Catálogo interno de MCP"` |
| `API_VERSION`     | Sobrescreve a versão publicada.                                                             | `API_VERSION=0.2.0`                          |
| `ENVIRONMENT`     | Marca o ambiente atual (`development`, `staging`, etc.).                                    | `ENVIRONMENT=staging`                        |
| `LOG_LEVEL`       | Define o nível mínimo de log (`debug`, `info`, ...).                                        | `LOG_LEVEL=debug`                            |
| `CORS_ORIGINS`    | Lista separada por vírgula de origens permitidas.                                           | `CORS_ORIGINS="http://localhost:5173"`      |
| `API_KEY`         | Ativa verificação de API key em todas as requisições.                                       | `API_KEY=supersecreta`                       |
| `AGENTS_ROOT`     | Aponta para outro diretório com manifests `agent.yaml`.                                     | `AGENTS_ROOT=/opt/agents`                    |
| `REQUEST_TIMEOUT` | Timeout (segundos) para execuções de agentes.                                               | `REQUEST_TIMEOUT=60`                         |

## 3. Rodar o servidor

Execute:

```bash
make dev
```

O serviço ficará disponível em `http://127.0.0.1:8000` (ou na porta definida via `PORT`).

## 4. Testar com `curl`

### Verificar saúde

```bash
curl http://127.0.0.1:8000/health
```

### Listar agentes cadastrados

```bash
curl http://127.0.0.1:8000/agents
```

### Invocar o agente de catálogo

O nome publicado para o agente exemplo é `catalog-search` (veja `app/agents/catalog/agent.yaml`).

```bash
curl -X POST \
  "http://127.0.0.1:8000/agents/catalog-search/invoke" \
  -H "Content-Type: application/json" \
  -d '{
    "input": {
      "query": "water",
      "limit": 2
    }
  }'
```

O resultado contém os itens filtrados do catálogo estático. Ajuste o nome do agente caso adicione novas opções ao hub.
