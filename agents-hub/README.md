# Agents Hub

Serviço FastAPI que empacota e expõe os agentes MCP mantidos neste monorepo. Ele carrega manifests versionados, instancia os agentes correspondentes e oferece endpoints REST para descoberta e invocação. Use-o para integrar agentes determinísticos ao Console MCP sem precisar publicar um servidor MCP completo.

## Visão geral

- **Catálogo único**: lê automaticamente manifestos `agent.yaml` em `app/agents/*` e publica o inventário com metadata, tools e políticas declaradas.
- **Invocação consistente**: instância única por agente por processo, com suporte a métodos síncronos (`invoke`) ou assíncronos (`ainvoke`).
- **Observabilidade pronta**: logging estruturado com IDs de requisição e suporte opcional a API key e CORS.

## Requisitos

- Python 3.10 ou superior
- `pip` atualizado (o Makefile trata disso)
- Ferramentas de desenvolvimento opcionais: `uvicorn`, `pytest`, `ruff`, `black` e `isort` (instaladas via extras `dev`)

## Setup

```bash
cd agents-hub
make install
```

O alvo `install` executa `pip install -e .[dev]`, garantindo que as dependências de runtime e de desenvolvimento sejam instaladas no ambiente ativo (recomenda-se usar um `venv`).

## Execução em desenvolvimento

```bash
make dev
```

O servidor será iniciado com `uvicorn` em `http://127.0.0.1:8000` por padrão. Ajuste a porta exportando `PORT=8765 make dev` ou definindo as variáveis de ambiente abaixo antes de iniciar o processo.

### Variáveis de ambiente suportadas

| Variável            | Descrição                                                                                  | Padrão                              |
| ------------------- | ------------------------------------------------------------------------------------------ | ----------------------------------- |
| `API_TITLE`         | Título exibido nos metadados do FastAPI                                                     | `Promenade Agents Hub`              |
| `API_VERSION`       | Versão reportada pela API                                                                   | `0.1.0`                             |
| `API_DESCRIPTION`   | Descrição do serviço                                                                        | Texto padrão em `config.Settings`   |
| `ENVIRONMENT`       | Indicador de ambiente (ex.: `development`, `production`)                                    | `development`                       |
| `LOG_LEVEL`         | Nível de log (ex.: `debug`, `info`)                                                         | `info`                              |
| `CORS_ORIGINS`      | Lista separada por vírgula de origens autorizadas                                           | `*`                                 |
| `API_KEY`           | Chave para proteger os endpoints. Quando definida ativa o middleware de API key            | _não definido_                      |
| `AGENTS_ROOT`       | Diretório onde os manifests e módulos dos agentes residem                                   | `app/agents`                        |
| `REQUEST_TIMEOUT`   | Timeout (segundos) aplicado às invocações                                                   | `30`                                |

## Endpoints

| Método | Caminho                       | Descrição                                                     |
| ------ | ---------------------------- | ------------------------------------------------------------- |
| GET    | `/health`                    | Verifica se o serviço está ativo.                             |
| GET    | `/agents`                    | Lista os agentes registrados com metadados completos.         |
| GET    | `/agents/{name}`             | Retorna os detalhes de um agente específico.                  |
| POST   | `/agents/{name}/invoke`      | Invoca o agente com um payload opcional.                      |
| POST   | `/reload`                    | Recarrega os manifests e módulos Python do diretório alvo.    |

### Exemplo de resposta (`GET /agents`)

```json
{
  "agents": [
    {
      "name": "catalog-search",
      "title": "Sample Catalog Browser",
      "version": "1.0.0",
      "description": "Provides deterministic catalogue lookups over a curated in-memory dataset.",
      "capabilities": ["structured-output"],
      "tools": [
        {
          "name": "search_catalog",
          "description": "Filter the static catalogue using simple substring matching with deterministic ordering.",
          "schema": {
            "type": "object",
            "additionalProperties": false,
            "properties": {
              "query": {
                "type": "string",
                "description": "Terms used to filter catalogue entries. Matches against name, category and tags."
              },
              "limit": {
                "type": "integer",
                "minimum": 1,
                "maximum": 10,
                "description": "Maximum number of items to return. Defaults to the agent's preset limit."
              }
            },
            "required": ["query"]
          }
        }
      ],
      "model": null,
      "policies": null
    }
  ]
}
```

### Invocando o agente de catálogo

```bash
curl -X POST \
  "http://127.0.0.1:8000/agents/catalog-search/invoke" \
  -H "Content-Type: application/json" \
  -d '{
    "input": {
      "query": "organizer",
      "limit": 3
    }
  }'
```

Resposta resumida:

```json
{
  "result": {
    "items": [
      {
        "sku": "SKU-004",
        "name": "Desk Organizer Set",
        "category": "Workspace",
        "price": 32.0,
        "tags": ["office", "storage", "productivity"],
        "description": "Stackable organizers to keep stationery and cables tidy."
      }
    ]
  }
}
```

## Próximos passos

- Consulte [`docs/agents/new-agent.md`](../docs/agents/new-agent.md) para aprender a criar novos agentes.
- Use `make test` para validar a suíte de testes antes de subir alterações.
