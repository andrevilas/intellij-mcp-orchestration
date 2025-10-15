"""Persistence helpers for managing cost policies."""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Iterable, List

from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .database import session_scope


class CostPolicyNotFoundError(KeyError):
    """Raised when a cost policy could not be located."""


class CostPolicyAlreadyExistsError(RuntimeError):
    """Raised when attempting to create a duplicate cost policy."""


@dataclass(frozen=True)
class CostPolicyRecord:
    """Canonical representation of a stored cost policy."""

    id: str
    name: str
    description: str | None
    currency: str
    monthly_spend_limit: float
    tags: List[str]
    created_at: datetime
    updated_at: datetime

    @classmethod
    def from_row(cls, row: dict[str, object]) -> "CostPolicyRecord":
        tags_raw = row.get("tags") or "[]"
        created_at = datetime.fromisoformat(str(row["created_at"]))
        updated_at = datetime.fromisoformat(str(row["updated_at"]))
        return cls(
            id=str(row["id"]),
            name=str(row["name"]),
            description=str(row["description"]) if row.get("description") is not None else None,
            currency=str(row["currency"]),
            monthly_spend_limit=float(row["monthly_spend_limit"]),
            tags=list(json.loads(tags_raw)),
            created_at=created_at,
            updated_at=updated_at,
        )

    def to_dict(self) -> dict[str, object]:
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "currency": self.currency,
            "monthly_spend_limit": self.monthly_spend_limit,
            "tags": self.tags,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        }


def _serialize_list(values: Iterable[str]) -> str:
    return json.dumps(list(values))


def _now() -> datetime:
    return datetime.now(tz=timezone.utc)


def _fetch_one(session: Session, policy_id: str) -> CostPolicyRecord:
    result = session.execute(
        text(
            """
            SELECT id, name, description, currency, monthly_spend_limit, tags, created_at, updated_at
            FROM cost_policies
            WHERE id = :policy_id
            """
        ),
        {"policy_id": policy_id},
    ).mappings().one_or_none()
    if result is None:
        raise CostPolicyNotFoundError(policy_id)
    return CostPolicyRecord.from_row(result)


def list_policies() -> List[CostPolicyRecord]:
    """Return all stored cost policies ordered by identifier."""

    with session_scope() as session:
        rows = session.execute(
            text(
                """
                SELECT id, name, description, currency, monthly_spend_limit, tags, created_at, updated_at
                FROM cost_policies
                ORDER BY id
                """
            )
        ).mappings()
        return [CostPolicyRecord.from_row(row) for row in rows]


def create_policy(
    *,
    policy_id: str,
    name: str,
    description: str | None = None,
    monthly_spend_limit: float,
    currency: str = "USD",
    tags: Iterable[str] | None = None,
) -> CostPolicyRecord:
    """Persist a new cost policy definition."""

    created_at = updated_at = _now().isoformat()
    try:
        with session_scope() as session:
            session.execute(
                text(
                    """
                    INSERT INTO cost_policies (
                        id, name, description, currency, monthly_spend_limit, tags, created_at, updated_at
                    ) VALUES (
                        :id, :name, :description, :currency, :monthly_spend_limit, :tags, :created_at, :updated_at
                    )
                    """
                ),
                {
                    "id": policy_id,
                    "name": name,
                    "description": description,
                    "currency": currency,
                    "monthly_spend_limit": float(monthly_spend_limit),
                    "tags": _serialize_list(tags or []),
                    "created_at": created_at,
                    "updated_at": updated_at,
                },
            )
    except IntegrityError as exc:  # pragma: no cover - depends on SQLite internals
        raise CostPolicyAlreadyExistsError(policy_id) from exc

    with session_scope() as session:
        return _fetch_one(session, policy_id)


def get_policy(policy_id: str) -> CostPolicyRecord:
    """Return a single cost policy."""

    with session_scope() as session:
        return _fetch_one(session, policy_id)


def update_policy(
    policy_id: str,
    *,
    name: str,
    description: str | None = None,
    monthly_spend_limit: float,
    currency: str = "USD",
    tags: Iterable[str] | None = None,
) -> CostPolicyRecord:
    """Update an existing cost policy."""

    updated_at = _now().isoformat()
    with session_scope() as session:
        result = session.execute(
            text(
                """
                UPDATE cost_policies
                SET
                    name = :name,
                    description = :description,
                    currency = :currency,
                    monthly_spend_limit = :monthly_spend_limit,
                    tags = :tags,
                    updated_at = :updated_at
                WHERE id = :policy_id
                """
            ),
            {
                "policy_id": policy_id,
                "name": name,
                "description": description,
                "currency": currency,
                "monthly_spend_limit": float(monthly_spend_limit),
                "tags": _serialize_list(tags or []),
                "updated_at": updated_at,
            },
        )
        if result.rowcount == 0:
            raise CostPolicyNotFoundError(policy_id)

    with session_scope() as session:
        return _fetch_one(session, policy_id)


def delete_policy(policy_id: str) -> None:
    """Remove a cost policy from the data store."""

    with session_scope() as session:
        result = session.execute(
            text("DELETE FROM cost_policies WHERE id = :policy_id"), {"policy_id": policy_id}
        )
        if result.rowcount == 0:
            raise CostPolicyNotFoundError(policy_id)


__all__ = [
    "CostPolicyRecord",
    "CostPolicyNotFoundError",
    "CostPolicyAlreadyExistsError",
    "list_policies",
    "create_policy",
    "get_policy",
    "update_policy",
    "delete_policy",
]
