"""Policy rollout planning utilities backed by deployment telemetry."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Iterable, Sequence

from .policy_deployments import PolicyDeploymentRecord, list_policy_deployments
from .registry import provider_registry
from .schemas import ProviderSummary


@dataclass(frozen=True)
class RolloutSegmentDefinition:
    """Static metadata describing one rollout stage."""

    id: str
    name: str
    description: str


@dataclass(frozen=True)
class RolloutAllocation:
    """Assignment of providers and coverage for a specific segment."""

    segment: RolloutSegmentDefinition
    coverage_pct: int
    providers: tuple[ProviderSummary, ...]


@dataclass(frozen=True)
class RolloutPlan:
    """Aggregated rollout plan for a policy template."""

    template_id: str
    generated_at: datetime
    allocations: tuple[RolloutAllocation, ...]


_SEGMENTS: tuple[RolloutSegmentDefinition, ...] = (
    RolloutSegmentDefinition(
        id="canary",
        name="Canário",
        description="Rotas críticas monitoradas em tempo real com dashboards dedicados.",
    ),
    RolloutSegmentDefinition(
        id="general",
        name="GA",
        description="Workloads padrão com fallback automático e monitoramento de custos.",
    ),
    RolloutSegmentDefinition(
        id="fallback",
        name="Fallback",
        description="Rotas sensíveis com janela de rollback dedicada e dupla validação.",
    ),
)


def _latest_deployments_by_template(
    deployments: Iterable[PolicyDeploymentRecord],
) -> dict[str, PolicyDeploymentRecord]:
    """Return the most recent deployment for each template identifier."""

    latest: dict[str, PolicyDeploymentRecord] = {}
    for record in deployments:
        latest[record.template_id] = record
    return latest


def _compute_segment_weights(record: PolicyDeploymentRecord) -> tuple[int, int, int]:
    """Derive relative weights for rollout segments using deployment metrics."""

    latency_pressure = max(0, record.slo_p95_ms - 900)
    canary_weight = 10 + record.incidents_count * 8 + latency_pressure // 30
    general_weight = 60 + max(0, record.guardrail_score - 70)
    fallback_weight = 20 + max(0, record.budget_usage_pct - 75)
    return canary_weight, general_weight, fallback_weight


def _normalise(weights: Sequence[int], total: int) -> list[int]:
    """Return integer allocations proportional to ``weights`` that sum to ``total``."""

    count = len(weights)
    if count == 0:
        return []
    if total <= 0:
        return [0 for _ in weights]

    total_weight = sum(weights)
    if total_weight <= 0:
        base = total // count
        result = [base for _ in weights]
        remainder = total - base * count
        for index in range(remainder):
            result[index % count] += 1
        return result

    fractions = [weight / total_weight * total for weight in weights]
    allocations = [int(value) for value in fractions]
    remainder = total - sum(allocations)
    if remainder > 0:
        ranked = sorted(
            enumerate(fractions),
            key=lambda item: item[1] - int(item[1]),
            reverse=True,
        )
        for index, _ in ranked[:remainder]:
            allocations[index] += 1
    return allocations


def _build_allocations(
    record: PolicyDeploymentRecord,
    providers: Sequence[ProviderSummary],
) -> list[RolloutAllocation]:
    """Compute rollout allocations for the provided deployment record."""

    weights = _compute_segment_weights(record)
    coverage = _normalise(weights, 100)
    provider_counts = _normalise(weights, len(providers))
    ordered_providers = sorted(providers, key=lambda provider: provider.id)

    allocations: list[RolloutAllocation] = []
    cursor = 0
    for segment, coverage_pct, count in zip(_SEGMENTS, coverage, provider_counts):
        segment_providers = tuple(ordered_providers[cursor : cursor + count]) if count > 0 else tuple()
        cursor += count
        allocations.append(
            RolloutAllocation(
                segment=segment,
                coverage_pct=coverage_pct,
                providers=segment_providers,
            )
        )
    return allocations


def build_rollout_plans() -> list[RolloutPlan]:
    """Generate rollout plans for all policy templates with recorded deployments."""

    deployments = list_policy_deployments()
    latest = _latest_deployments_by_template(deployments)
    providers = provider_registry.providers

    plans: list[RolloutPlan] = []
    for template_id, record in latest.items():
        allocations = _build_allocations(record, providers)
        plans.append(
            RolloutPlan(
                template_id=template_id,
                generated_at=record.updated_at,
                allocations=tuple(allocations),
            )
        )

    plans.sort(key=lambda plan: plan.template_id)
    return plans


__all__ = ["RolloutPlan", "RolloutAllocation", "RolloutSegmentDefinition", "build_rollout_plans"]
