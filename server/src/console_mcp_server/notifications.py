"""Notification generation helpers for the Console MCP Server."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Iterable, Sequence

from .registry import provider_registry, session_registry
from .schemas import ProviderSummary, Session

NotificationSeverity = str
NotificationCategory = str


@dataclass(frozen=True)
class Notification:
    """Normalized notification item returned by the API."""

    id: str
    severity: NotificationSeverity
    title: str
    message: str
    timestamp: datetime
    category: NotificationCategory
    tags: tuple[str, ...]


def list_notifications(now: datetime | None = None) -> list[Notification]:
    """Generate contextual notifications from providers and sessions."""

    reference = now or datetime.now(timezone.utc)
    providers = provider_registry.providers
    sessions = session_registry.list()

    seeds: list[Notification] = []

    for provider in providers:
        seeds.extend(
            _build_provider_notifications(
                provider=provider,
                sessions=sessions,
                reference=reference,
            )
        )

    if providers:
        seeds.extend(_build_finops_notifications(providers, reference))

    if len(providers) > 1:
        seeds.append(_build_policy_notification(providers, reference))

    seeds.append(_build_platform_notification(reference))

    if not seeds:
        seeds.append(
            Notification(
                id="platform-placeholder",
                severity="info",
                title="Nenhum evento recente",
                message="As integrações MCP permanecem estáveis. Novas notificações aparecerão aqui automaticamente.",
                timestamp=reference,
                category="platform",
                tags=("Status",),
            )
        )

    seeds.sort(key=lambda item: item.timestamp, reverse=True)
    return seeds


def _build_provider_notifications(
    provider: ProviderSummary,
    sessions: Sequence[Session],
    reference: datetime,
) -> list[Notification]:
    base_seed = _seeded_mod(f"{provider.id}-status", 100)
    latency = 700 + _seeded_mod(f"{provider.id}-latency", 420)

    if provider.is_available is False or base_seed < 15:
        severity = "critical"
        title = f"Failover ativo para {provider.name}"
        message = (
            f"Tráfego de {provider.name} foi movido para rotas secundárias após instabilidade "
            "detectada pelo orquestrador."
        )
    elif base_seed < 45:
        severity = "warning"
        title = f"Latência elevada em {provider.name}"
        message = (
            "A média das últimas 2h alcançou "
            f"{latency} ms. Considere rebalancear o mix ou executar um warmup adicional."
        )
    elif base_seed < 70:
        severity = "success"
        title = f"Failover revertido para {provider.name}"
        message = (
            f"{provider.name} voltou ao plano primário após verificação completa dos health-checks."
        )
    else:
        severity = "info"
        title = f"Provisionamento estável em {provider.name}"
        message = f"As rotas de {provider.name} seguem atendendo requisições com SLA nominal."

    notifications: list[Notification] = [
        Notification(
            id=f"{provider.id}-status",
            severity=severity,
            title=title,
            message=message,
            timestamp=_minutes_ago(reference, 20 + _seeded_mod(f"{provider.id}-minutes", 120)),
            category="operations",
            tags=(provider.name, provider.transport.upper()),
        )
    ]

    latest_session = _find_latest_session(provider.id, sessions)
    if latest_session:
        session_severity = _resolve_session_severity(latest_session.status)
        created_at = latest_session.created_at
        formatted_time = created_at.astimezone(reference.tzinfo).strftime("%H:%M")

        if session_severity == "success":
            session_message = (
                f"Provisionamento finalizado às {formatted_time}. O tráfego já está sendo roteado."
            )
        elif session_severity == "critical":
            session_message = (
                "Falha relatada no provisioning às "
                f"{formatted_time}. Execute diagnóstico antes de liberar novas sessões."
            )
        elif session_severity == "warning":
            session_message = (
                "Sessão reportou degradação às "
                f"{formatted_time}. Monitore métricas de tokens e latência."
            )
        else:
            session_message = (
                "Sessão criada às "
                f"{formatted_time}. Guardando readiness check para liberar operações."
            )

        notifications.append(
            Notification(
                id=f"{provider.id}-{latest_session.id}",
                severity=session_severity,
                title=f"Sessão {latest_session.id} — {_to_title_case(latest_session.status)}",
                message=session_message,
                timestamp=latest_session.created_at,
                category="operations",
                tags=(provider.name, "Provisioning"),
            )
        )

    return notifications


def _build_finops_notifications(
    providers: Sequence[ProviderSummary],
    reference: datetime,
) -> list[Notification]:
    target = providers[_seeded_mod("finops-target", len(providers))]
    delta = 6 + _seeded_mod("finops-delta", 9)
    savings = 4 + _seeded_mod("finops-savings", 8)

    return [
        Notification(
            id="finops-anomaly",
            severity="warning",
            title=f"Custo ↑ {delta}% no lane Balanced",
            message=(
                f"O lane Balanced para {target.name} aumentou {delta}% versus a semana anterior. "
                "Revise o mix de modelos antes do fechamento."
            ),
            timestamp=_minutes_ago(reference, 90 + _seeded_mod("finops-minutes", 120)),
            category="finops",
            tags=("FinOps", target.name),
        ),
        Notification(
            id="finops-savings",
            severity="success",
            title=f"Economia estimada de {savings}% este mês",
            message=(
                "Os ajustes de roteamento economizaram "
                f"{savings}% em spend acumulado. Exporte o relatório para compartilhar com o time."
            ),
            timestamp=_minutes_ago(reference, 240 + _seeded_mod("finops-savings-minutes", 200)),
            category="finops",
            tags=("FinOps", "Relatórios"),
        ),
    ]


def _build_policy_notification(
    providers: Sequence[ProviderSummary],
    reference: datetime,
) -> Notification:
    focus_provider = providers[_seeded_mod("policy-provider", len(providers))]
    return Notification(
        id="policy-rollout",
        severity="success",
        title="Rollout Balanced concluído",
        message=(
            f"O template Balanced foi aplicado em {focus_provider.name} e rotas dependentes sem incidentes."
        ),
        timestamp=_minutes_ago(reference, 180 + _seeded_mod("policy-minutes", 160)),
        category="policies",
        tags=("Policies", focus_provider.name),
    )


def _build_platform_notification(reference: datetime) -> Notification:
    return Notification(
        id="platform-release",
        severity="info",
        title="Release 2024.09.1 publicado",
        message=(
            "Novos alertas em tempo real e central de notificações disponíveis na console MCP."
        ),
        timestamp=_minutes_ago(reference, 360 + _seeded_mod("platform-minutes", 240)),
        category="platform",
        tags=("Release", "DX"),
    )


def _find_latest_session(
    provider_id: str, sessions: Sequence[Session]
) -> Session | None:
    latest: Session | None = None
    for session in sessions:
        if session.provider_id != provider_id:
            continue
        if latest is None or session.created_at > latest.created_at:
            latest = session
    return latest


def _resolve_session_severity(status: str) -> NotificationSeverity:
    normalized = status.lower()
    if "error" in normalized or "fail" in normalized:
        return "critical"
    if "warn" in normalized or "degraded" in normalized:
        return "warning"
    if any(token in normalized for token in ("ready", "active", "success")):
        return "success"
    return "info"


def _minutes_ago(reference: datetime, minutes: int) -> datetime:
    return reference - timedelta(minutes=minutes)


def _to_title_case(value: str) -> str:
    if not value:
        return ""
    return " ".join(segment.capitalize() for segment in value.replace("_", " ").split())


def _seeded_mod(seed: str, modulus: int) -> int:
    if modulus <= 0:
        raise ValueError("modulus must be greater than zero")
    return _hash_string(seed) % modulus


def _hash_string(seed: str) -> int:
    hash_value = 0
    for char in seed:
        hash_value = (hash_value << 5) - hash_value + ord(char)
    return abs(hash_value)


__all__ = ["Notification", "list_notifications"]
