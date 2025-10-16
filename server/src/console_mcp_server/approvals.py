"""Persistence helpers for HITL approval workflow."""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Mapping
from uuid import uuid4

from sqlalchemy import text

from .database import session_scope


class ApprovalStatus(str, Enum):
    """Lifecycle states for HITL approvals."""

    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


@dataclass(frozen=True)
class ApprovalRecord:
    """Materialized approval request stored in SQLite."""

    id: str
    plan_id: str
    change_record_id: str
    requester_id: str
    status: ApprovalStatus
    approver_id: str | None
    reason: str | None
    payload: Mapping[str, Any]
    created_at: datetime
    updated_at: datetime
    decided_at: datetime | None

    @classmethod
    def from_row(cls, row: Mapping[str, Any]) -> "ApprovalRecord":
        decided_at = row.get("decided_at")
        return cls(
            id=str(row["id"]),
            plan_id=str(row["plan_id"]),
            change_record_id=str(row["change_record_id"]),
            requester_id=str(row["requester_id"]),
            status=ApprovalStatus(str(row["status"])),
            approver_id=str(row["approver_id"]) if row.get("approver_id") else None,
            reason=str(row["reason"]) if row.get("reason") else None,
            payload=json.loads(str(row.get("payload", "{}"))),
            created_at=datetime.fromisoformat(str(row["created_at"])),
            updated_at=datetime.fromisoformat(str(row["updated_at"])),
            decided_at=datetime.fromisoformat(str(decided_at)) if decided_at else None,
        )


class ApprovalStore:
    """Encapsulates CRUD helpers for approval requests."""

    def __init__(self, *, session_factory=session_scope):
        self._session_factory = session_factory

    def create(
        self,
        *,
        plan_id: str,
        change_record_id: str,
        requester_id: str,
        payload: Mapping[str, Any] | None = None,
    ) -> ApprovalRecord:
        approval_id = uuid4().hex
        now = datetime.now(tz=timezone.utc)
        serialized_payload = json.dumps(payload or {}, ensure_ascii=False, sort_keys=True)

        with self._session_factory() as session:
            session.execute(
                text(
                    """
                    INSERT INTO approvals (
                        id,
                        plan_id,
                        change_record_id,
                        requester_id,
                        status,
                        approver_id,
                        decided_at,
                        reason,
                        payload,
                        created_at,
                        updated_at
                    ) VALUES (
                        :id,
                        :plan_id,
                        :change_record_id,
                        :requester_id,
                        :status,
                        NULL,
                        NULL,
                        NULL,
                        :payload,
                        :created_at,
                        :updated_at
                    )
                    """
                ),
                {
                    "id": approval_id,
                    "plan_id": plan_id,
                    "change_record_id": change_record_id,
                    "requester_id": requester_id,
                    "status": ApprovalStatus.PENDING.value,
                    "payload": serialized_payload,
                    "created_at": now.isoformat(),
                    "updated_at": now.isoformat(),
                },
            )

        return ApprovalRecord(
            id=approval_id,
            plan_id=plan_id,
            change_record_id=change_record_id,
            requester_id=requester_id,
            status=ApprovalStatus.PENDING,
            approver_id=None,
            reason=None,
            payload=json.loads(serialized_payload),
            created_at=now,
            updated_at=now,
            decided_at=None,
        )

    def get(self, approval_id: str) -> ApprovalRecord | None:
        with self._session_factory() as session:
            row = (
                session.execute(
                    text(
                        """
                        SELECT
                            id,
                            plan_id,
                            change_record_id,
                            requester_id,
                            status,
                            approver_id,
                            decided_at,
                            reason,
                            payload,
                            created_at,
                            updated_at
                        FROM approvals
                        WHERE id = :approval_id
                        LIMIT 1
                        """
                    ),
                    {"approval_id": approval_id},
                )
                .mappings()
                .first()
            )

        if row is None:
            return None
        return ApprovalRecord.from_row(row)

    def update_status(
        self,
        approval_id: str,
        *,
        status: ApprovalStatus,
        approver_id: str,
        reason: str | None = None,
        payload_update: Mapping[str, Any] | None = None,
    ) -> ApprovalRecord:
        record = self.get(approval_id)
        if record is None:
            raise ValueError(f"Approval {approval_id} not found")

        now = datetime.now(tz=timezone.utc)
        merged_payload = {**record.payload, **(payload_update or {})}

        with self._session_factory() as session:
            session.execute(
                text(
                    """
                    UPDATE approvals
                    SET
                        status = :status,
                        approver_id = :approver_id,
                        reason = :reason,
                        decided_at = :decided_at,
                        payload = :payload,
                        updated_at = :updated_at
                    WHERE id = :approval_id
                    """
                ),
                {
                    "status": status.value,
                    "approver_id": approver_id,
                    "reason": reason,
                    "decided_at": now.isoformat(),
                    "payload": json.dumps(merged_payload, ensure_ascii=False, sort_keys=True),
                    "updated_at": now.isoformat(),
                    "approval_id": approval_id,
                },
            )

        return ApprovalRecord(
            id=record.id,
            plan_id=record.plan_id,
            change_record_id=record.change_record_id,
            requester_id=record.requester_id,
            status=status,
            approver_id=approver_id,
            reason=reason,
            payload=merged_payload,
            created_at=record.created_at,
            updated_at=now,
            decided_at=now,
        )


__all__ = ["ApprovalStatus", "ApprovalStore", "ApprovalRecord"]

