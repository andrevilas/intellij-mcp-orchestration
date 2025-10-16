"""High level planner responsible for building configuration plans."""

from __future__ import annotations

from typing import Any, Callable, Mapping, Sequence

import structlog

from ..schemas_plan import Plan, PlanExecutionStatus, PlanStep, Risk
from .git import create_diff
from .intents import AssistantIntent, validate_intent_payload

logger = structlog.get_logger("console.config.planner")


PlanBuilder = Callable[[Mapping[str, Any]], Plan]


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
    capabilities: Sequence[str] = tuple(payload.get("capabilities", ()))

    capability_summary = ", ".join(capabilities) if capabilities else "default capabilities"

    steps = [
        PlanStep(
            id="scaffold-agent",
            title=f"Scaffold agent '{agent_name}'",
            description=(
                "Create agent manifest and default configuration inside the repository."
            ),
        ),
        PlanStep(
            id="register-agent",
            title="Register agent with console",
            description="Update the registry to make the agent discoverable in the UI.",
            depends_on=["scaffold-agent"],
        ),
        PlanStep(
            id="document-agent",
            title="Document onboarding steps",
            description="Add README section describing capabilities and rollout steps.",
            depends_on=["register-agent"],
        ),
    ]

    diffs = [
        create_diff(
            path=f"{repository}/{agent_name}/manifest.json",
            summary="Add new agent manifest with metadata",
            change_type="create",
        ),
        create_diff(
            path="config/console-mcp/registry.json",
            summary=f"Register agent {agent_name} exposing {capability_summary}",
        ),
        create_diff(
            path=f"{repository}/{agent_name}/README.md",
            summary="Document configuration and operational steps",
        ),
    ]

    risks = [
        Risk(
            title="Missing secrets",
            impact="high",
            mitigation="Provision required provider credentials before rollout.",
        ),
        Risk(
            title="Capability mismatch",
            impact="medium",
            mitigation="Validate capabilities against QA workspace before production rollout.",
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
    artifact_path = str(payload["artifact_path"])
    owner = payload.get("owner", "platform-team")

    steps = [
        PlanStep(
            id="collect-inputs",
            title="Coletar insumos",
            description="Validar fontes de dados e templates necessários.",
        ),
        PlanStep(
            id="generate-artifact",
            title="Gerar artefato",
            description="Executar pipeline de geração e armazenar saída.",
            depends_on=["collect-inputs"],
        ),
        PlanStep(
            id="validar-artifact",
            title="Validar resultado",
            description="Revisar artefato com responsável e aprovar publicação.",
            depends_on=["generate-artifact"],
        ),
    ]

    diffs = [
        create_diff(
            path=artifact_path,
            summary=f"Gerar artefato de configuração mantido por {owner}",
            change_type="create",
        ),
    ]

    risks = [
        Risk(
            title="Dados desatualizados",
            impact="medium",
            mitigation="Agendar revisões periódicas do artefato gerado.",
        )
    ]

    return Plan(
        intent=AssistantIntent.GENERATE_ARTIFACT.value,
        summary=f"Gerar artefato em {artifact_path}",
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
