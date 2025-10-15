"""Persistence helpers for managing policy deployment history."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import List
from uuid import uuid4

from sqlalchemy.orm import Session
from sqlalchemy import text

from .database import session_scope
from .policy_templates import iter_policy_templates


class PolicyDeploymentNotFoundError(KeyError):
    """Raised when a deployment could not be located."""


class InvalidPolicyTemplateError(ValueError):
    """Raised when attempting to reference an unknown policy template."""


@dataclass(frozen=True)
class PolicyDeploymentRecord:
    """Canonical representation of a policy deployment entry."""

    id: str
    template_id: str
    deployed_at: datetime
    author: str
    window: str | None
    note: str | None
    slo_p95_ms: int
    budget_usage_pct: int
    incidents_count: int
    guardrail_score: int
    created_at: datetime
    updated_at: datetime

    @classmethod
    def from_row(cls, row: dict[str, object]) -> "PolicyDeploymentRecord":
        return cls(
            id=str(row["id"]),
            template_id=str(row["template_id"]),
            deployed_at=datetime.fromisoformat(str(row["deployed_at"])),
            author=str(row["author"]),
            window=str(row["window"]) if row.get("window") is not None else None,
            note=str(row["note"]) if row.get("note") is not None else None,
            slo_p95_ms=int(row["slo_p95_ms"]),
            budget_usage_pct=int(row["budget_usage_pct"]),
            incidents_count=int(row["incidents_count"]),
            guardrail_score=int(row["guardrail_score"]),
            created_at=datetime.fromisoformat(str(row["created_at"])),
            updated_at=datetime.fromisoformat(str(row["updated_at"])),
        )

    def to_dict(self) -> dict[str, object]:
        return {
            "id": self.id,
            "template_id": self.template_id,
            "deployed_at": self.deployed_at,
            "author": self.author,
            "window": self.window,
            "note": self.note,
            "slo_p95_ms": self.slo_p95_ms,
            "budget_usage_pct": self.budget_usage_pct,
            "incidents_count": self.incidents_count,
            "guardrail_score": self.guardrail_score,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        }


def _hash_string(value: str) -> int:
    hash_value = 0
    for character in value:
        hash_value = ((hash_value << 5) - hash_value + ord(character)) & 0xFFFFFFFF
    if hash_value & 0x80000000:
        hash_value -= 0x100000000
    return abs(hash_value)


def _seeded_mod(value: str, modulo: int) -> int:
    if modulo <= 0:
        raise ValueError("Modulo must be greater than zero")
    return _hash_string(value) % modulo


def _compute_metrics(template_id: str) -> tuple[int, int, int, int]:
    slo_p95_ms = 480 + _seeded_mod(f"{template_id}-slo", 520)
    budget_usage_pct = 62 + _seeded_mod(f"{template_id}-budget", 24)
    incidents_count = _seeded_mod(f"{template_id}-incidents", 4)
    guardrail_score = 68 + _seeded_mod(f"{template_id}-guardrail", 18)
    return slo_p95_ms, budget_usage_pct, incidents_count, guardrail_score


def _validate_template(template_id: str) -> None:
    available = {template.id for template in iter_policy_templates()}
    if template_id not in available:
        raise InvalidPolicyTemplateError(template_id)


def _generate_identifier(template_id: str) -> str:
    return f"deploy-{template_id}-{uuid4().hex[:8]}"


def _now() -> datetime:
    return datetime.now(tz=timezone.utc)


def _fetch_one(session: Session, deployment_id: str) -> PolicyDeploymentRecord:
    result = session.execute(
        text(
            """
            SELECT
                id,
                template_id,
                deployed_at,
                author,
                window,
                note,
                slo_p95_ms,
                budget_usage_pct,
                incidents_count,
                guardrail_score,
                created_at,
                updated_at
            FROM policy_deployments
            WHERE id = :deployment_id
            """
        ),
        {"deployment_id": deployment_id},
    ).mappings().one_or_none()
    if result is None:
        raise PolicyDeploymentNotFoundError(deployment_id)
    return PolicyDeploymentRecord.from_row(result)


def list_policy_deployments() -> List[PolicyDeploymentRecord]:
    """Return stored policy deployments ordered by deployment timestamp."""

    with session_scope() as session:
        rows = session.execute(
            text(
                """
                SELECT
                    id,
                    template_id,
                    deployed_at,
                    author,
                    window,
                    note,
                    slo_p95_ms,
                    budget_usage_pct,
                    incidents_count,
                    guardrail_score,
                    created_at,
                    updated_at
                FROM policy_deployments
                ORDER BY deployed_at
                """
            )
        ).mappings()
        return [PolicyDeploymentRecord.from_row(row) for row in rows]


def create_policy_deployment(
    *,
    template_id: str,
    author: str,
    window: str | None = None,
    note: str | None = None,
) -> PolicyDeploymentRecord:
    """Persist a new deployment entry for the given policy template."""

    _validate_template(template_id)

    deployed_at = _now().isoformat()
    created_at = updated_at = deployed_at
    deployment_id = _generate_identifier(template_id)
    slo_p95_ms, budget_usage_pct, incidents_count, guardrail_score = _compute_metrics(template_id)

    with session_scope() as session:
        session.execute(
            text(
                """
                INSERT INTO policy_deployments (
                    id,
                    template_id,
                    deployed_at,
                    author,
                    window,
                    note,
                    slo_p95_ms,
                    budget_usage_pct,
                    incidents_count,
                    guardrail_score,
                    created_at,
                    updated_at
                ) VALUES (
                    :id,
                    :template_id,
                    :deployed_at,
                    :author,
                    :window,
                    :note,
                    :slo_p95_ms,
                    :budget_usage_pct,
                    :incidents_count,
                    :guardrail_score,
                    :created_at,
                    :updated_at
                )
                """
            ),
            {
                "id": deployment_id,
                "template_id": template_id,
                "deployed_at": deployed_at,
                "author": author,
                "window": window,
                "note": note,
                "slo_p95_ms": slo_p95_ms,
                "budget_usage_pct": budget_usage_pct,
                "incidents_count": incidents_count,
                "guardrail_score": guardrail_score,
                "created_at": created_at,
                "updated_at": updated_at,
            },
        )

    with session_scope() as session:
        return _fetch_one(session, deployment_id)


def get_policy_deployment(deployment_id: str) -> PolicyDeploymentRecord:
    """Return a single deployment entry."""

    with session_scope() as session:
        return _fetch_one(session, deployment_id)


def delete_policy_deployment(deployment_id: str) -> None:
    """Remove a deployment entry from the store."""

    with session_scope() as session:
        result = session.execute(
            text("DELETE FROM policy_deployments WHERE id = :deployment_id"),
            {"deployment_id": deployment_id},
        )
        if result.rowcount == 0:
            raise PolicyDeploymentNotFoundError(deployment_id)


__all__ = [
    "PolicyDeploymentRecord",
    "PolicyDeploymentNotFoundError",
    "InvalidPolicyTemplateError",
    "list_policy_deployments",
    "create_policy_deployment",
    "get_policy_deployment",
    "delete_policy_deployment",
]
