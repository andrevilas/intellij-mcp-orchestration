# Como adicionar um novo agente ao Agents Hub

Este guia cobre a criação de um agente MCP dentro do serviço `agents-hub`, desde a estrutura de arquivos até a validação local.

## 1. Escolha um identificador e prepare a estrutura

1. Navegue até `agents-hub/app/agents/`.
2. Crie uma pasta com o _slug_ do agente (ex.: `agents-hub/app/agents/reports/`).
3. Dentro dela, adicione:
   - `__init__.py` vazio para tornar o diretório um pacote.
   - `agent.yaml` com o manifesto MCP.
   - `agent.py` com o código Python do agente.

A estrutura final deve ficar assim:

```
agents-hub/app/agents/<slug>/
├── __init__.py
├── agent.yaml
└── agent.py
```

## 2. Preencher o manifesto (`agent.yaml`)

O manifesto segue o schema definido em `app/schemas/manifest.py`. Agora o formato expõe seções tipadas para políticas, roteamento, governança financeira e observabilidade. Principais blocos:

- **Metadados básicos**
  - `name`: identificador único (também usado no endpoint `/agents/{name}`).
  - `title`: nome amigável exibido no catálogo.
  - `version`: versão semântica do agente (`1.0.0`, `0.2.1`, ...).
  - `description`: resumo da função do agente.
  - `capabilities`: lista de _strings_ indicando recursos suportados (ex.: `structured-output`).
- **Ferramentas**
  - `tools[]`: lista de ferramentas disponíveis.
    - `name`: identificador da ferramenta.
    - `description`: texto curto de ajuda.
    - `schema`: objeto JSON Schema descrevendo a entrada. Aliases como `input_schema` ou `parameters` também são aceitos pelo loader.
    - `slo`: objetivos de confiabilidade (`latency_p95_ms`, `success_rate`, `max_error_rate`).
- **Modelo**
  - `model`: informações sobre o modelo subjacente (`provider`, `name`, `parameters`).
- **Políticas (`policies`)**
  - `rate_limits`: limites de requisição (`requests_per_minute`, `burst`, `concurrent_requests`).
  - `safety`: modo de segurança (`mode`, `blocked_categories`, `allow_list`).
  - `budget`: orçamento operacional (`currency`, `limit`, `period`).
- **Roteamento (`routing`)**
  - Define tiers habilitados (`allowed_tiers`), `default_tier`, `fallback_tier`, limites de tentativas (`max_attempts`, `max_iters`) e `request_timeout_seconds`.
- **FinOps (`finops`)**
  - `cost_center`: centro de custo responsável.
  - `budgets`: alocação por tier (`economy`, `balanced`, `turbo`).
  - `alerts`: thresholds para canais como `email`, `slack` ou `pagerduty`.
- **HITL (`hitl`)**
  - Lista de `checkpoints` com `name`, `description`, `required` e `escalation_channel` para pontos de aprovação humana.
- **Observabilidade (`observability`)**
  - `logging`: nível e destino (`stdout`, `stderr`, `file`, `otlp`).
  - `metrics`: exporters suportados (`prometheus`, `otlp`) e intervalo de coleta.
  - `tracing`: configuração de rastreamento (`enabled`, `exporter`, `sample_rate`).

Um manifesto completo fica parecido com o exemplo abaixo (substitua valores conforme sua necessidade):

```yaml
name: reports-agent
title: Relatórios Financeiros
version: 1.2.0
description: Gera relatórios tabulares com consolidação de KPIs.
capabilities:
  - structured-output
tools:
  - name: build_report
    description: Monta um relatório customizado a partir de filtros e período.
    slo:
      latency_p95_ms: 450
      success_rate: 0.99
      max_error_rate: 0.01
    schema:
      type: object
      additionalProperties: false
      properties:
        period:
          type: string
          enum: [monthly, quarterly]
        segment:
          type: string
      required: [period]
model:
  provider: openai
  name: gpt-4o-mini
  parameters:
    temperature: 0.1
policies:
  rate_limits:
    requests_per_minute: 120
    concurrent_requests: 4
  safety:
    mode: balanced
    blocked_categories: [pii]
  budget:
    currency: USD
    limit: 250
    period: monthly
routing:
  default_tier: balanced
  allowed_tiers: [economy, balanced, turbo]
  fallback_tier: economy
  max_attempts: 2
  max_iters: 6
  max_parallel_requests: 2
  request_timeout_seconds: 30
finops:
  cost_center: finance-ops
  budgets:
    economy:
      amount: 60
      currency: USD
      period: monthly
    balanced:
      amount: 120
      currency: USD
      period: monthly
  alerts:
    - threshold: 0.8
      channel: slack
hitl:
  checkpoints:
    - name: Auditoria
      description: Revisão humana dos lançamentos antes da publicação.
      required: true
      escalation_channel: email
observability:
  logging:
    level: info
    destination: stdout
  metrics:
    enabled: true
    exporters: [prometheus]
    interval_seconds: 60
  tracing:
    enabled: true
    exporter: otlp
    sample_rate: 0.2
```

Campos ausentes assumem _defaults_ compatíveis com o schema. Todas as chaves aceitas podem ser sobrescritas por variáveis de ambiente (ex.: `AGENT__ROUTING__DEFAULT_TIER=turbo`) seguindo a convenção FastAPI/Pydantic.

> Dica: use `agents-hub/app/agents/catalog/agent.yaml` como referência de manifesto completo e atualizado.

## 3. Implementar o agente em `agent.py`

O módulo precisa expor pelo menos duas funções:

- `build_agent(manifest: dict[str, Any]) -> Agent`: fábrica chamada pelo `AgentRegistry`. Recebe o manifesto serializado (`AgentManifest.model_dump`) e deve retornar uma instância com métodos `invoke` (síncrono) ou `ainvoke` (assíncrono) que aceitem `payload` e `config` opcionais.
- `get_tools() -> Iterable[Any]` (opcional, porém recomendado): retorna os metadados de ferramentas que o agente expõe. Normalmente basta carregar o manifesto com `load_manifest` e devolver `manifest.tools` para manter consistência com os endpoints HTTP.

Boas práticas:

- Normalize entradas (ex.: `str(payload.get(...)).strip()`) para garantir determinismo.
- Lance `ValidationError` (`app.errors.ValidationError`) quando a entrada não for válida; o middleware converte em resposta HTTP 400.
- Reaproveite o manifesto para preencher atributos default, evitando duplicar informação no código.

Veja implementações existentes em:

- `agents-hub/app/agents/catalog/agent.py` — agente síncrono que filtra um catálogo estático.
- `agents-hub/app/agents/content/agent.py` — agente determinístico que gera CTA com base em tom e produto.

## 4. Cobrir com testes

Adicione casos em `agents-hub/tests/` para garantir comportamento determinístico e compatibilidade com o manifesto:

- Use `tests/test_agents.py` como modelo para validar `build_agent` e `get_tools`.
- Para testes de API, confira `tests/test_http.py`, que exercita os endpoints FastAPI com agentes gerados em tempo de teste via fixture `create_agent` (`tests/conftest.py`).

Execute a suíte completa antes de abrir um PR:

```bash
cd agents-hub
make test
```

## 5. Validar manualmente

1. Rode o serviço: `make dev`.
2. Faça um `POST /agents/<name>/invoke` com `curl` ou via Postman para confirmar o payload e a resposta estruturada.
3. Se alterar o código em tempo de execução, use `POST /reload` para recarregar manifests e módulos sem reiniciar o processo.

Seguindo os passos acima, o novo agente ficará disponível no catálogo e poderá ser consumido pelo Console MCP ou por qualquer cliente HTTP compatível.
