"""High level planner responsible for building configuration plans."""

from __future__ import annotations

from typing import Any, Callable, Mapping, Sequence
import difflib
import re

import structlog

from ..schemas_plan import (
    Plan,
    PlanAction,
    PlanContextReference,
    PlanExecutionStatus,
    PlanStep,
    Risk,
)
from .artifacts import generate_artifact
from .langgraph import FlowGraph, graph_to_agent
from .git import create_diff
from .intents import AssistantIntent, validate_intent_payload
from .rag import rag_service
from .validation import MCPClientError, MCPValidationOutcome, validate_server

logger = structlog.get_logger("console.config.planner")


PlanBuilder = Callable[[Mapping[str, Any]], Plan]


def _slugify_agent(value: str) -> str:
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", value).strip("-")
    return slug.casefold() or "agent"


DEFAULT_APPROVAL_RULES: dict[AssistantIntent, tuple[str, ...]] = {
    AssistantIntent.ADD_AGENT: ("maintainers",),
}


def plan_intent(intent: AssistantIntent | str, payload: Mapping[str, Any] | None = None) -> Plan:
    """Create a plan for the requested intent using the provided context."""

    payload = payload or {}

    try:
        resolved = intent if isinstance(intent, AssistantIntent) else AssistantIntent(intent)
    except ValueError as exc:  # pragma: no cover - defensive guard
        logger.warning("plan.unsupported_intent", intent=intent)
        raise ValueError(f"Unsupported intent: {intent}") from exc

    validate_intent_payload(resolved, payload)

    builder = _BUILDERS[resolved]
    plan = builder(payload)
    plan = _attach_context(plan, resolved, payload)
    plan = _apply_approval_rules(plan, resolved, payload)
    logger.info(
        "plan.generated",
        intent=resolved.value,
        steps=len(plan.steps),
        diffs=len(plan.diffs),
        risks=len(plan.risks),
    )
    return plan


def _apply_approval_rules(
    plan: Plan, intent: AssistantIntent, payload: Mapping[str, Any]
) -> Plan:
    requested = payload.get("approval_rules")
    if requested is None:
        requested = DEFAULT_APPROVAL_RULES.get(intent, ())

    if isinstance(requested, str):
        rules: Sequence[str] = (requested,)
    else:
        rules = tuple(str(rule) for rule in requested)

    normalized = [
        rule.strip()
        for rule in rules
        if isinstance(rule, str) and rule.strip()
    ]
    if not normalized:
        return plan

    unique_rules = list(dict.fromkeys(normalized))
    return plan.model_copy(update={"approval_rules": unique_rules})


def _attach_context(plan: Plan, intent: AssistantIntent, payload: Mapping[str, Any]) -> Plan:
    references = [
        PlanContextReference(
            path=result.path,
            snippet=result.snippet,
            score=result.score,
            title=result.title,
            chunk=result.chunk,
        )
        for result in rag_service.suggest_context(intent, payload)
    ]
    if not references:
        return plan
    return plan.model_copy(update={"context": references})


def _plan_add_agent(payload: Mapping[str, Any]) -> Plan:
    agent_name = str(payload["agent_name"])
    repository = str(payload.get("repository", "agents-hub"))
    agent_slug = _slugify_agent(agent_name)
    capabilities: Sequence[str] = tuple(payload.get("capabilities", ()))

    validation_details: MCPValidationOutcome | None = None
    if payload.get("endpoint"):
        try:
            validation_details = validate_server(payload)
        except MCPClientError as exc:
            raise ValueError(f"Falha ao validar servidor MCP: {exc}") from exc
        except ValueError as exc:
            raise ValueError(str(exc)) from exc

    manifest_path = f"{repository}/app/agents/{agent_slug}/agent.yaml"
    module_path = f"{repository}/app/agents/{agent_slug}/agent.py"
    package_init = f"{repository}/app/agents/{agent_slug}/__init__.py"
    registry_path = f"{repository}/mcp-registry.yaml"

    capability_summary = ", ".join(capabilities) if capabilities else "default capabilities"

    steps = [
        PlanStep(
            id="discover-server",
            title="Descobrir servidor MCP",
            description=(
                "Executar o cliente MCP interno para listar tools e schemas via stdio/WebSocket "
                "antes de gerar o scaffold."
            ),
        ),
        PlanStep(
            id="scaffold-agent",
            title=f"Scaffold agent '{agent_slug}'",
            description=(
                "Gerar manifesto e stub LangGraph com o template padrão, garantindo pacote Python válido."
            ),
            depends_on=["discover-server"],
        ),
        PlanStep(
            id="merge-registry",
            title="Atualizar mcp-registry",
            description="Mesclar entrada do agente no mcp-registry.yaml apontando para o servidor MCP escolhido.",
            depends_on=["scaffold-agent"],
        ),
        PlanStep(
            id="reload-agents-hub",
            title="Recarregar Agents Hub",
            description=(
                "Emitir POST /reload ou tocar o sentinel .reload para aplicar as alterações; "
                "se o processo não recarregar, planejar reinício controlado."
            ),
            depends_on=["merge-registry"],
        ),
        PlanStep(
            id="document-agent",
            title="Documentar onboarding",
            description="Atualizar README com capacidades, fluxo de reload e fallback de restart quando necessário.",
            depends_on=["reload-agents-hub"],
        ),
    ]

    diffs = [
        create_diff(
            path=manifest_path,
            summary="Gerar manifesto MCP inicial com tool stub estruturado",
            change_type="create",
        ),
        create_diff(
            path=module_path,
            summary="Adicionar stub LangGraph com nó de tool determinístico",
            change_type="create",
        ),
        create_diff(
            path=package_init,
            summary="Criar pacote Python para o novo agente",
            change_type="create",
        ),
        create_diff(
            path=registry_path,
            summary=f"Registrar agente {agent_slug} expondo {capability_summary}",
        ),
    ]

    risks = [
        Risk(
            title="Servidor MCP inacessível",
            impact="high",
            mitigation="Validar respostas de tools/list e schemas/list antes do merge.",
        ),
        Risk(
            title="Reload inconclusivo",
            impact="medium",
            mitigation="Se /reload falhar, tocar sentinel .reload ou reiniciar o serviço controladamente.",
        ),
        Risk(
            title="Dependências operacionais",
            impact="medium",
            mitigation="Provisionar secrets e budgets necessários antes da promoção a produção.",
        ),
    ]

    if validation_details and validation_details.missing_tools:
        missing = ", ".join(validation_details.missing_tools)
        risks.append(
            Risk(
                title="Ferramentas ausentes",
                impact="high",
                mitigation=f"Investigar ferramentas não encontradas: {missing}.",
            )
        )

    return Plan(
        intent=AssistantIntent.ADD_AGENT.value,
        summary=f"Adicionar agente {agent_name} ao repositório {repository}",
        steps=steps,
        diffs=diffs,
        risks=risks,
        status=PlanExecutionStatus.PENDING,
    )


def _plan_validate_agent(payload: Mapping[str, Any]) -> Plan:
    try:
        outcome = validate_server(payload)
    except MCPClientError as exc:
        raise ValueError(f"Falha ao validar servidor MCP: {exc}") from exc
    except ValueError as exc:
        raise ValueError(str(exc)) from exc

    tool_names = [tool.name for tool in outcome.tools]
    if tool_names:
        tools_description = ", ".join(tool_names)
    else:
        tools_description = "nenhuma ferramenta foi retornada"

    steps = [
        PlanStep(
            id="connect-mcp",
            title="Conectar ao servidor MCP",
            description=(
                "Estabelecer sessão "
                f"{outcome.transport} com {outcome.endpoint} e executar tools/list e schemas/list."
            ),
        ),
        PlanStep(
            id="review-tools",
            title="Revisar ferramentas disponíveis",
            description=f"Ferramentas detectadas: {tools_description}.",
            depends_on=["connect-mcp"],
        ),
    ]

    risks: list[Risk] = []
    if outcome.missing_tools:
        missing = ", ".join(outcome.missing_tools)
        risks.append(
            Risk(
                title="Ferramentas esperadas não encontradas",
                impact="high",
                mitigation=f"Confirmar implementação das tools: {missing}.",
            )
        )

    summary = f"Validar servidor MCP em {outcome.endpoint}"

    return Plan(
        intent=AssistantIntent.VALIDATE.value,
        summary=summary,
        steps=steps,
        diffs=[],
        risks=risks,
        status=PlanExecutionStatus.PENDING,
    )


def _plan_edit_policies(payload: Mapping[str, Any]) -> Plan:
    policy_id = str(payload["policy_id"])
    changes = payload.get("changes", {})

    steps = [
        PlanStep(
            id="review-policy",
            title="Revisar política existente",
            description=f"Avaliar política {policy_id} e impactos associados.",
        ),
        PlanStep(
            id="apply-updates",
            title="Aplicar atualizações",
            description="Atualizar limites e metadados conforme mudanças solicitadas.",
            depends_on=["review-policy"],
        ),
        PlanStep(
            id="rollout",
            title="Planejar rollout",
            description="Testar alterações em ambiente de staging antes de publicar.",
            depends_on=["apply-updates"],
        ),
    ]

    diffs = [
        create_diff(
            path=f"policies/{policy_id}.json",
            summary="Atualizar política com os novos parâmetros",
        ),
    ]

    if changes:
        diffs.append(
            create_diff(
                path="docs/policies/CHANGELOG.md",
                summary="Documentar alterações solicitadas",
            )
        )

    risks = [
        Risk(
            title="Quebra de compatibilidade",
            impact="medium",
            mitigation="Solicitar validação das equipes consumidoras antes do rollout.",
        )
    ]

    return Plan(
        intent=AssistantIntent.EDIT_POLICIES.value,
        summary=f"Atualizar política {policy_id}",
        steps=steps,
        diffs=diffs,
        risks=risks,
        status=PlanExecutionStatus.PENDING,
    )


def _plan_edit_finops(payload: Mapping[str, Any]) -> Plan:
    report_id = str(payload["report_id"])
    thresholds = payload.get("thresholds")

    steps = [
        PlanStep(
            id="sync-data",
            title="Sincronizar dados de custo",
            description="Importar dados mais recentes para garantir projeções atualizadas.",
        ),
        PlanStep(
            id="ajustar-metricas",
            title="Ajustar métricas",
            description="Recalibrar métricas e alertas FinOps conforme thresholds.",
            depends_on=["sync-data"],
        ),
        PlanStep(
            id="comunicar",
            title="Comunicar stakeholders",
            description="Enviar resumo para equipes afetadas com próximos passos.",
            depends_on=["ajustar-metricas"],
        ),
    ]

    diffs = [
        create_diff(
            path=f"finops/reports/{report_id}.json",
            summary="Atualizar relatório com novas métricas",
        ),
        create_diff(
            path="finops/dashboards/overview.json",
            summary="Regerar dashboards com os dados mais recentes",
        ),
    ]

    if thresholds:
        diffs.append(
            create_diff(
                path="finops/guardrails.yml",
                summary="Ajustar limites de alerta conforme thresholds enviados",
            )
        )

    risks = [
        Risk(
            title="Alertas falsos positivos",
            impact="low",
            mitigation="Monitorar dashboards por uma sprint após atualização.",
        ),
        Risk(
            title="Atraso na sincronização",
            impact="medium",
            mitigation="Automatizar coleta com jobs agendados.",
        ),
    ]

    return Plan(
        intent=AssistantIntent.EDIT_FINOPS.value,
        summary=f"Atualizar relatórios FinOps {report_id}",
        steps=steps,
        diffs=diffs,
        risks=risks,
        status=PlanExecutionStatus.PENDING,
    )


def _plan_generate_artifact(payload: Mapping[str, Any]) -> Plan:
    artifact_type = str(payload["artifact_type"])
    target_path = str(payload["target_path"])
    parameters = payload.get("parameters")
    if parameters is not None and not isinstance(parameters, Mapping):
        raise ValueError("parameters deve ser um mapeamento de chaves para valores")

    result = generate_artifact(
        artifact_type,
        target_path,
        parameters=parameters or {},
    )

    owner = str(result.context.get("owner") or "platform-team")

    steps = [
        PlanStep(
            id="collect-inputs",
            title="Coletar insumos",
            description=(
                f"Confirmar parâmetros obrigatórios para o template {result.template.title.lower()}."
            ),
        ),
        PlanStep(
            id="write-artifact",
            title=result.template.step_title,
            description=result.template.step_description,
            depends_on=["collect-inputs"],
            actions=[
                PlanAction(
                    type="write_file",
                    path=result.target_path,
                    contents=result.content,
                )
            ],
        ),
        PlanStep(
            id="validar-artifact",
            title="Validar resultado",
            description=(
                f"Revisar entrega com {owner} e registrar evidências do checklist de riscos."
            ),
            depends_on=["write-artifact"],
        ),
    ]

    diffs = [
        create_diff(
            path=result.target_path,
            summary=result.template.diff_summary,
            change_type="create",
        )
    ]

    risks = [
        Risk(
            title=result.template.risk.title,
            impact=result.template.risk.impact,
            mitigation=result.template.risk.mitigation,
        )
    ]

    summary = f"Gerar {result.template.title} em {result.target_path}"

    return Plan(
        intent=AssistantIntent.GENERATE_ARTIFACT.value,
        summary=summary,
        steps=steps,
        diffs=diffs,
        risks=risks,
        status=PlanExecutionStatus.PENDING,
    )


def _preview_diff(previous: str | None, current: str) -> str | None:
    if not previous:
        return None
    diff_lines = list(
        difflib.unified_diff(
            previous.splitlines(),
            current.splitlines(),
            fromfile="baseline",
            tofile="proposed",
            n=3,
        )
    )
    if not diff_lines:
        return None
    return "\n".join(diff_lines[:20])


def _plan_create_flow(payload: Mapping[str, Any]) -> Plan:
    flow_id = str(payload["flow_id"])
    target_path = str(payload["target_path"])
    raw_graph = payload.get("graph")
    if isinstance(raw_graph, FlowGraph):
        graph_payload = raw_graph.model_dump(mode="python")
    elif isinstance(raw_graph, Mapping):
        graph_payload = dict(raw_graph)
    else:
        raise ValueError("graph deve ser um mapeamento com nós e arestas")

    base_metadata = dict(graph_payload.get("metadata") or {})
    agent_class = str(payload.get("agent_class") or base_metadata.get("agent_class") or "FlowAgent")
    base_metadata.setdefault("agent_class", agent_class)
    base_metadata.setdefault("target_path", target_path)

    graph = FlowGraph.model_validate({**graph_payload, "metadata": base_metadata})
    agent_module = graph_to_agent(graph)

    baseline_code = payload.get("baseline_agent_code")
    diff_preview = _preview_diff(str(baseline_code) if baseline_code else None, agent_module)
    checkpoint_count = len(graph.hitl_nodes())

    steps = [
        PlanStep(
            id="design-flow",
            title=f"Modelar fluxo {flow_id}",
            description=(
                f"Confirmar nós ({len(graph.nodes)}) e arestas ({len(graph.edges)}) necessários para o LangGraph."
            ),
        ),
        PlanStep(
            id="compile-agent",
            title="Gerar agent.py",
            description=(
                "Converter o grafo em módulo LangGraph com wiring de HITL e registrar arquivo no repositório."
            ),
            depends_on=["design-flow"],
            actions=[
                PlanAction(
                    type="write_file",
                    path=target_path,
                    contents=agent_module,
                )
            ],
        ),
        PlanStep(
            id="checkpoint-review",
            title="Orquestrar checkpoints",
            description=(
                "Catalogar checkpoints HITL e definir responsáveis por aprovação." if checkpoint_count
                else "Validar ausência de checkpoints HITL obrigatórios."
            ),
            depends_on=["compile-agent"],
        ),
        PlanStep(
            id="versionar-flow",
            title="Versionar fluxo",
            description=(
                "Registrar nova versão na tabela flow_versions com diff consolidado." if diff_preview
                else "Persistir primeira versão do fluxo no catálogo."),
            depends_on=["compile-agent"],
        ),
    ]

    diffs = [
        create_diff(
            path=target_path,
            summary=(
                f"Atualizar LangGraph de {flow_id} com {len(graph.nodes)} nós e {len(graph.edges)} arestas"
            ),
            change_type="update",
        )
    ]

    risks = [
        Risk(
            title="Checkpoints sem responsáveis",
            impact="high" if checkpoint_count else "medium",
            mitigation="Mapear aprovadores HITL antes da execução automatizada.",
        ),
        Risk(
            title="Diferenças não validadas",
            impact="medium",
            mitigation="Revisar diff do módulo LangGraph e executar testes de regressão.",
        ),
    ]

    summary = f"Versionar fluxo LangGraph {flow_id}"

    if diff_preview:
        summary += " (diff disponível)"

    if checkpoint_count:
        summary += f" com {checkpoint_count} checkpoint(s) HITL"

    return Plan(
        intent=AssistantIntent.CREATE_FLOW.value,
        summary=summary,
        steps=steps,
        diffs=diffs,
        risks=risks,
        status=PlanExecutionStatus.PENDING,
    )


_BUILDERS: Mapping[AssistantIntent, PlanBuilder] = {
    AssistantIntent.ADD_AGENT: _plan_add_agent,
    AssistantIntent.EDIT_POLICIES: _plan_edit_policies,
    AssistantIntent.EDIT_FINOPS: _plan_edit_finops,
    AssistantIntent.GENERATE_ARTIFACT: _plan_generate_artifact,
    AssistantIntent.CREATE_FLOW: _plan_create_flow,
    AssistantIntent.VALIDATE: _plan_validate_agent,
}
