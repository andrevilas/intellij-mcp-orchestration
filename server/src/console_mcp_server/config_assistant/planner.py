"""High level planner responsible for building configuration plans."""

from __future__ import annotations

from typing import Any, Callable, Mapping, Sequence
import re

import structlog

from ..schemas_plan import Plan, PlanAction, PlanExecutionStatus, PlanStep, Risk
from .artifacts import generate_artifact
from .git import create_diff
from .intents import AssistantIntent, validate_intent_payload

logger = structlog.get_logger("console.config.planner")


PlanBuilder = Callable[[Mapping[str, Any]], Plan]


def _slugify_agent(value: str) -> str:
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", value).strip("-")
    return slug.casefold() or "agent"


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
    logger.info(
        "plan.generated",
        intent=resolved.value,
        steps=len(plan.steps),
        diffs=len(plan.diffs),
        risks=len(plan.risks),
    )
    return plan


def _plan_add_agent(payload: Mapping[str, Any]) -> Plan:
    agent_name = str(payload["agent_name"])
    repository = str(payload.get("repository", "agents-hub"))
    agent_slug = _slugify_agent(agent_name)
    capabilities: Sequence[str] = tuple(payload.get("capabilities", ()))

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

    return Plan(
        intent=AssistantIntent.ADD_AGENT.value,
        summary=f"Adicionar agente {agent_name} ao repositório {repository}",
        steps=steps,
        diffs=diffs,
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


_BUILDERS: Mapping[AssistantIntent, PlanBuilder] = {
    AssistantIntent.ADD_AGENT: _plan_add_agent,
    AssistantIntent.EDIT_POLICIES: _plan_edit_policies,
    AssistantIntent.EDIT_FINOPS: _plan_edit_finops,
    AssistantIntent.GENERATE_ARTIFACT: _plan_generate_artifact,
}
