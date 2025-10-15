"""Static catalog of opinionated MCP policy templates."""

from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Iterable, List


@dataclass(frozen=True, slots=True)
class PolicyTemplate:
    """Immutable representation of a guardrail-focused policy template."""

    id: str
    name: str
    tagline: str
    description: str
    price_delta: str
    latency_target: str
    guardrail_level: str
    features: tuple[str, ...]

    def to_dict(self) -> dict[str, object]:
        """Return a JSON-serialisable mapping of the template fields."""

        payload = asdict(self)
        # ``asdict`` converts tuples to lists, which is ideal for JSON responses.
        return payload


_TEMPLATES: tuple[PolicyTemplate, ...] = (
    PolicyTemplate(
        id="economy",
        name="Economia",
        tagline="FinOps primeiro",
        description=(
            "Prioriza custo absoluto e direciona a maior parte do tráfego para modelos "
            "econômicos com fallback gradual."
        ),
        price_delta="-22% vs. baseline",
        latency_target="até 4.0 s P95",
        guardrail_level="Nível 2 · Moderado",
        features=(
            "Roteia 70% das requisições para modelos Economy e Lite",
            "Fallback manual para turbos em incidentes de SLA",
            "Throttling progressivo por projeto e custo acumulado",
        ),
    ),
    PolicyTemplate(
        id="balanced",
        name="Equilíbrio",
        tagline="Balanceamento inteligente",
        description=(
            "Combina custo/latência com seleção automática do melhor modelo por rota de "
            "negócio, incluindo failover automático."
        ),
        price_delta="-12% vs. baseline",
        latency_target="até 2.5 s P95",
        guardrail_level="Nível 3 · Avançado",
        features=(
            "Roteamento adaptativo por capacidade e disponibilidade",
            "Failover automático com circuito aberto em 30s",
            "Políticas de custo dinâmicas por equipe/projeto",
        ),
    ),
    PolicyTemplate(
        id="turbo",
        name="Turbo",
        tagline="Velocidade máxima",
        description=(
            "Entrega a menor latência possível e mantém modelos premium sempre quentes, "
            "com alertas agressivos de custo."
        ),
        price_delta="+18% vs. baseline",
        latency_target="até 900 ms P95",
        guardrail_level="Nível 4 · Crítico",
        features=(
            "Pré-aquecimento de modelos turbo em múltiplas regiões",
            "Orçamento observável com limites hora a hora",
            "Expansão automática de capacidade sob demanda",
        ),
    ),
)


def list_policy_templates() -> List[PolicyTemplate]:
    """Return the configured policy templates as a list copy."""

    return list(_TEMPLATES)


def iter_policy_templates() -> Iterable[PolicyTemplate]:
    """Yield the configured policy templates without copying."""

    return iter(_TEMPLATES)


__all__ = ["PolicyTemplate", "list_policy_templates", "iter_policy_templates"]

