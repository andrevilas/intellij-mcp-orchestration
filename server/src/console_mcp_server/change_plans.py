"""Persistence helpers for configuration change plan executions."""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Mapping, Sequence
from uuid import uuid4

from sqlalchemy import text
from sqlalchemy.orm import Session

from .database import session_scope
from .schemas_plan import PlanExecutionMode, PlanExecutionStatus, Risk


def _now() -> datetime:
    return datetime.now(tz=timezone.utc)


def _serialize_risks(risks: Sequence[Risk]) -> str:
    return json.dumps([risk.model_dump() for risk in risks], ensure_ascii=False, sort_keys=True)


def _deserialize_risks(payload: str | None) -> tuple[Risk, ...]:
    if not payload:
        return ()
    data = json.loads(payload)
    return tuple(Risk.model_validate(item) for item in data)


def _serialize_metadata(metadata: dict[str, Any]) -> str:
    return json.dumps(metadata, ensure_ascii=False, sort_keys=True)


def _deserialize_metadata(payload: str | None) -> dict[str, Any]:
    if not payload:
        return {}
    return json.loads(payload)


@dataclass(frozen=True)
class ChangePlanRecord:
    """Snapshot of a configuration plan execution attempt."""

    id: str
    plan_id: str
    actor: str
    mode: PlanExecutionMode
    status: PlanExecutionStatus
    branch: str | None
    commit_sha: str | None
    diff_stat: str
    diff_patch: str
    risks: tuple[Risk, ...]
    metadata: dict[str, Any]
    created_at: datetime
    updated_at: datetime

    @classmethod
    def from_row(cls, row: dict[str, Any]) -> "ChangePlanRecord":
        return cls(
            id=str(row["id"]),
            plan_id=str(row["plan_id"]),
            actor=str(row["actor"]),
            mode=PlanExecutionMode(str(row["mode"])),
            status=PlanExecutionStatus(str(row["status"])),
            branch=str(row["branch"]) if row.get("branch") is not None else None,
            commit_sha=str(row["commit_sha"]) if row.get("commit_sha") is not None else None,
            diff_stat=str(row["diff_stat"]),
            diff_patch=str(row["diff_patch"]),
            risks=_deserialize_risks(str(row.get("risks", "[]"))),
            metadata=_deserialize_metadata(str(row.get("metadata", "{}"))),
            created_at=datetime.fromisoformat(str(row["created_at"])),
            updated_at=datetime.fromisoformat(str(row["updated_at"])),
        )


class ChangePlanStore:
    """Thin abstraction for recording configuration plan executions."""

    def __init__(self, *, session_factory=session_scope):
        self._session_factory = session_factory

    def create(
        self,
        *,
        plan_id: str,
        actor: str,
        mode: PlanExecutionMode,
        status: PlanExecutionStatus,
        diff_stat: str,
        diff_patch: str,
        risks: Sequence[Risk],
        branch: str | None = None,
        commit_sha: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> ChangePlanRecord:
        metadata = metadata or {}
        record_id = uuid4().hex
        now = _now()

        payload = {
            "id": record_id,
            "plan_id": plan_id,
            "actor": actor,
            "mode": mode.value,
            "status": status.value,
            "branch": branch,
            "commit_sha": commit_sha,
            "diff_stat": diff_stat,
            "diff_patch": diff_patch,
            "risks": _serialize_risks(risks),
            "metadata": _serialize_metadata(metadata),
            "created_at": now.isoformat(),
            "updated_at": now.isoformat(),
        }

        with self._session_factory() as session:
            session.execute(
                text(
                    """
                    INSERT INTO change_plans (
                        id,
                        plan_id,
                        actor,
                        mode,
                        status,
                        branch,
                        commit_sha,
                        diff_stat,
                        diff_patch,
                        risks,
                        metadata,
                        created_at,
                        updated_at
                    ) VALUES (
                        :id,
                        :plan_id,
                        :actor,
                        :mode,
                        :status,
                        :branch,
                        :commit_sha,
                        :diff_stat,
                        :diff_patch,
                        :risks,
                        :metadata,
                        :created_at,
                        :updated_at
                    )
                    """
                ),
                payload,
            )

        return ChangePlanRecord(
            id=record_id,
            plan_id=plan_id,
            actor=actor,
            mode=mode,
            status=status,
            branch=branch,
            commit_sha=commit_sha,
            diff_stat=diff_stat,
            diff_patch=diff_patch,
            risks=tuple(risks),
            metadata=dict(metadata),
            created_at=now,
            updated_at=now,
        )

    def get(self, record_id: str) -> ChangePlanRecord | None:
        with self._session_factory() as session:
            return _fetch_one(session, record_id)

    def update(
        self,
        record_id: str,
        *,
        status: PlanExecutionStatus | None = None,
        branch: str | None = None,
        commit_sha: str | None = None,
        diff_stat: str | None = None,
        diff_patch: str | None = None,
        metadata: Mapping[str, Any] | None = None,
    ) -> ChangePlanRecord:
        record = self.get(record_id)
        if record is None:
            raise ValueError(f"Change plan record {record_id} not found")

        merged_metadata = dict(record.metadata)
        if metadata:
            merged_metadata.update(metadata)

        updated_at = _now()
        payload = {
            "id": record_id,
            "status": (status or record.status).value,
            "branch": branch if branch is not None else record.branch,
            "commit_sha": commit_sha if commit_sha is not None else record.commit_sha,
            "diff_stat": diff_stat if diff_stat is not None else record.diff_stat,
            "diff_patch": diff_patch if diff_patch is not None else record.diff_patch,
            "metadata": _serialize_metadata(merged_metadata),
            "updated_at": updated_at.isoformat(),
        }

        with self._session_factory() as session:
            session.execute(
                text(
                    """
                    UPDATE change_plans
                    SET
                        status = :status,
                        branch = :branch,
                        commit_sha = :commit_sha,
                        diff_stat = :diff_stat,
                        diff_patch = :diff_patch,
                        metadata = :metadata,
                        updated_at = :updated_at
                    WHERE id = :id
                    """
                ),
                payload,
            )

        return ChangePlanRecord(
            id=record_id,
            plan_id=record.plan_id,
            actor=record.actor,
            mode=record.mode,
            status=PlanExecutionStatus(payload["status"]),
            branch=payload["branch"],
            commit_sha=payload["commit_sha"],
            diff_stat=payload["diff_stat"],
            diff_patch=payload["diff_patch"],
            risks=record.risks,
            metadata=merged_metadata,
            created_at=record.created_at,
            updated_at=updated_at,
        )

    def list_for_plan(self, plan_id: str) -> list[ChangePlanRecord]:
        with self._session_factory() as session:
            rows = session.execute(
                text(
                    """
                    SELECT
                        id,
                        plan_id,
                        actor,
                        mode,
                        status,
                        branch,
                        commit_sha,
                        diff_stat,
                        diff_patch,
                        risks,
                        metadata,
                        created_at,
                        updated_at
                    FROM change_plans
                    WHERE plan_id = :plan_id
                    ORDER BY created_at
                    """
                ),
                {"plan_id": plan_id},
            ).mappings()
            return [ChangePlanRecord.from_row(row) for row in rows]

    def list_for_agent(
        self,
        agent_id: str,
        *,
        layer: str | None = None,
        limit: int = 50,
    ) -> list[ChangePlanRecord]:
        agent_literal = json.dumps(agent_id, ensure_ascii=False)
        agent_pattern = f'%"agent_id": {agent_literal}%' if agent_literal.startswith('"') else f'%"agent_id": "{agent_id}"%'
        conditions = ["metadata LIKE :agent_pattern"]
        params: dict[str, Any] = {"agent_pattern": agent_pattern, "limit": limit}
        if layer is not None:
            params["layer_pattern"] = f'%"layer": "{layer}"%'
            conditions.append("metadata LIKE :layer_pattern")

        where_clause = " AND ".join(conditions)
        query = text(
            f"""
            SELECT
                id,
                plan_id,
                actor,
                mode,
                status,
                branch,
                commit_sha,
                diff_stat,
                diff_patch,
                risks,
                metadata,
                created_at,
                updated_at
            FROM change_plans
            WHERE {where_clause}
            ORDER BY created_at DESC
            LIMIT :limit
            """
        )

        with self._session_factory() as session:
            rows = session.execute(query, params).mappings()
            return [ChangePlanRecord.from_row(row) for row in rows]


def _fetch_one(session: Session, record_id: str) -> ChangePlanRecord | None:
    row = (
        session.execute(
            text(
                """
                SELECT
                    id,
                    plan_id,
                    actor,
                    mode,
                    status,
                    branch,
                    commit_sha,
                    diff_stat,
                    diff_patch,
                    risks,
                    metadata,
                    created_at,
                    updated_at
                FROM change_plans
                WHERE id = :record_id
                """
            ),
            {"record_id": record_id},
        )
        .mappings()
        .one_or_none()
    )
    return ChangePlanRecord.from_row(row) if row else None


__all__ = ["ChangePlanRecord", "ChangePlanStore"]

