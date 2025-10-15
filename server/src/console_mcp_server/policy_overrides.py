"""Persistence helpers for managing policy overrides per route/project."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import List

from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .database import session_scope


class PolicyOverrideNotFoundError(KeyError):
    """Raised when a policy override could not be located."""


class PolicyOverrideAlreadyExistsError(RuntimeError):
    """Raised when attempting to create a duplicate policy override."""


@dataclass(frozen=True)
class PolicyOverrideRecord:
    """Canonical representation of a stored policy override."""

    id: str
    route: str
    project: str
    template_id: str
    max_latency_ms: int | None
    max_cost_usd: float | None
    require_manual_approval: bool
    notes: str | None
    created_at: datetime
    updated_at: datetime

    @classmethod
    def from_row(cls, row: dict[str, object]) -> "PolicyOverrideRecord":
        created_at = datetime.fromisoformat(str(row["created_at"]))
        updated_at = datetime.fromisoformat(str(row["updated_at"]))
        max_latency = row.get("max_latency_ms")
        max_cost = row.get("max_cost_usd")
        notes = row.get("notes")
        return cls(
            id=str(row["id"]),
            route=str(row["route"]),
            project=str(row["project"]),
            template_id=str(row["template_id"]),
            max_latency_ms=int(max_latency) if max_latency is not None else None,
            max_cost_usd=float(max_cost) if max_cost is not None else None,
            require_manual_approval=bool(row.get("require_manual_approval", 0)),
            notes=str(notes) if notes is not None else None,
            created_at=created_at,
            updated_at=updated_at,
        )

    def to_dict(self) -> dict[str, object]:
        return {
            "id": self.id,
            "route": self.route,
            "project": self.project,
            "template_id": self.template_id,
            "max_latency_ms": self.max_latency_ms,
            "max_cost_usd": self.max_cost_usd,
            "require_manual_approval": self.require_manual_approval,
            "notes": self.notes,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        }


def _now() -> datetime:
    return datetime.now(tz=timezone.utc)


def _fetch_one(session: Session, override_id: str) -> PolicyOverrideRecord:
    result = session.execute(
        text(
            """
            SELECT
                id,
                route,
                project,
                template_id,
                max_latency_ms,
                max_cost_usd,
                require_manual_approval,
                notes,
                created_at,
                updated_at
            FROM policy_overrides
            WHERE id = :override_id
            """
        ),
        {"override_id": override_id},
    ).mappings().one_or_none()
    if result is None:
        raise PolicyOverrideNotFoundError(override_id)
    return PolicyOverrideRecord.from_row(result)


def list_policy_overrides() -> List[PolicyOverrideRecord]:
    """Return all stored policy overrides ordered by route and project."""

    with session_scope() as session:
        rows = session.execute(
            text(
                """
                SELECT
                    id,
                    route,
                    project,
                    template_id,
                    max_latency_ms,
                    max_cost_usd,
                    require_manual_approval,
                    notes,
                    created_at,
                    updated_at
                FROM policy_overrides
                ORDER BY route, project, id
                """
            )
        ).mappings()
        return [PolicyOverrideRecord.from_row(row) for row in rows]


def create_policy_override(
    *,
    override_id: str,
    route: str,
    project: str,
    template_id: str,
    max_latency_ms: int | None,
    max_cost_usd: float | None,
    require_manual_approval: bool,
    notes: str | None,
) -> PolicyOverrideRecord:
    """Persist a new policy override definition."""

    created_at = updated_at = _now().isoformat()
    try:
        with session_scope() as session:
            session.execute(
                text(
                    """
                    INSERT INTO policy_overrides (
                        id,
                        route,
                        project,
                        template_id,
                        max_latency_ms,
                        max_cost_usd,
                        require_manual_approval,
                        notes,
                        created_at,
                        updated_at
                    ) VALUES (
                        :id,
                        :route,
                        :project,
                        :template_id,
                        :max_latency_ms,
                        :max_cost_usd,
                        :require_manual_approval,
                        :notes,
                        :created_at,
                        :updated_at
                    )
                    """
                ),
                {
                    "id": override_id,
                    "route": route,
                    "project": project,
                    "template_id": template_id,
                    "max_latency_ms": max_latency_ms,
                    "max_cost_usd": max_cost_usd,
                    "require_manual_approval": 1 if require_manual_approval else 0,
                    "notes": notes,
                    "created_at": created_at,
                    "updated_at": updated_at,
                },
            )
    except IntegrityError as exc:  # pragma: no cover - depends on SQLite internals
        raise PolicyOverrideAlreadyExistsError(override_id) from exc

    with session_scope() as session:
        return _fetch_one(session, override_id)


def get_policy_override(override_id: str) -> PolicyOverrideRecord:
    """Return a single policy override."""

    with session_scope() as session:
        return _fetch_one(session, override_id)


def update_policy_override(
    override_id: str,
    *,
    route: str,
    project: str,
    template_id: str,
    max_latency_ms: int | None,
    max_cost_usd: float | None,
    require_manual_approval: bool,
    notes: str | None,
) -> PolicyOverrideRecord:
    """Update an existing policy override."""

    updated_at = _now().isoformat()
    with session_scope() as session:
        result = session.execute(
            text(
                """
                UPDATE policy_overrides
                SET
                    route = :route,
                    project = :project,
                    template_id = :template_id,
                    max_latency_ms = :max_latency_ms,
                    max_cost_usd = :max_cost_usd,
                    require_manual_approval = :require_manual_approval,
                    notes = :notes,
                    updated_at = :updated_at
                WHERE id = :override_id
                """
            ),
            {
                "override_id": override_id,
                "route": route,
                "project": project,
                "template_id": template_id,
                "max_latency_ms": max_latency_ms,
                "max_cost_usd": max_cost_usd,
                "require_manual_approval": 1 if require_manual_approval else 0,
                "notes": notes,
                "updated_at": updated_at,
            },
        )
        if result.rowcount == 0:
            raise PolicyOverrideNotFoundError(override_id)

    with session_scope() as session:
        return _fetch_one(session, override_id)


def delete_policy_override(override_id: str) -> None:
    """Remove a policy override from the data store."""

    with session_scope() as session:
        result = session.execute(
            text("DELETE FROM policy_overrides WHERE id = :override_id"),
            {"override_id": override_id},
        )
        if result.rowcount == 0:
            raise PolicyOverrideNotFoundError(override_id)


__all__ = [
    "PolicyOverrideRecord",
    "PolicyOverrideNotFoundError",
    "PolicyOverrideAlreadyExistsError",
    "list_policy_overrides",
    "create_policy_override",
    "get_policy_override",
    "update_policy_override",
    "delete_policy_override",
]

