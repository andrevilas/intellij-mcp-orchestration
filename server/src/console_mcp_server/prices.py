"""Persistence helpers for managing provider price tables."""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Iterable, List

from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .database import session_scope


class PriceEntryNotFoundError(KeyError):
    """Raised when a price entry could not be located."""


class PriceEntryAlreadyExistsError(RuntimeError):
    """Raised when attempting to create a duplicate price entry."""


@dataclass(frozen=True)
class PriceEntryRecord:
    """Canonical representation of a stored price entry."""

    id: str
    provider_id: str
    model: str
    currency: str
    unit: str
    input_cost_per_1k: float | None
    output_cost_per_1k: float | None
    embedding_cost_per_1k: float | None
    tags: List[str]
    notes: str | None
    effective_at: datetime | None
    created_at: datetime
    updated_at: datetime

    @classmethod
    def from_row(cls, row: dict[str, object]) -> "PriceEntryRecord":
        def _to_float(value: object | None) -> float | None:
            return float(value) if value is not None else None

        tags_raw = row.get("tags") or "[]"
        effective_raw = row.get("effective_at")
        effective_at = (
            datetime.fromisoformat(str(effective_raw)) if effective_raw else None
        )
        created_at = datetime.fromisoformat(str(row["created_at"]))
        updated_at = datetime.fromisoformat(str(row["updated_at"]))
        return cls(
            id=str(row["id"]),
            provider_id=str(row["provider_id"]),
            model=str(row["model"]),
            currency=str(row["currency"]),
            unit=str(row["unit"]),
            input_cost_per_1k=_to_float(row.get("input_cost_per_1k")),
            output_cost_per_1k=_to_float(row.get("output_cost_per_1k")),
            embedding_cost_per_1k=_to_float(row.get("embedding_cost_per_1k")),
            tags=list(json.loads(tags_raw)),
            notes=str(row["notes"]) if row.get("notes") is not None else None,
            effective_at=effective_at,
            created_at=created_at,
            updated_at=updated_at,
        )

    def to_dict(self) -> dict[str, object | None]:
        return {
            "id": self.id,
            "provider_id": self.provider_id,
            "model": self.model,
            "currency": self.currency,
            "unit": self.unit,
            "input_cost_per_1k": self.input_cost_per_1k,
            "output_cost_per_1k": self.output_cost_per_1k,
            "embedding_cost_per_1k": self.embedding_cost_per_1k,
            "tags": self.tags,
            "notes": self.notes,
            "effective_at": self.effective_at,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        }


def _serialize_list(values: Iterable[str]) -> str:
    return json.dumps(list(values))


def _normalize_cost(value: float | int | None) -> float | None:
    if value is None:
        return None
    return float(value)


def _serialize_datetime(value: datetime | None) -> str | None:
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).isoformat()


def _now() -> datetime:
    return datetime.now(tz=timezone.utc)


def _fetch_one(session: Session, entry_id: str) -> PriceEntryRecord:
    result = session.execute(
        text(
            """
            SELECT
                id,
                provider_id,
                model,
                currency,
                unit,
                input_cost_per_1k,
                output_cost_per_1k,
                embedding_cost_per_1k,
                tags,
                notes,
                effective_at,
                created_at,
                updated_at
            FROM price_entries
            WHERE id = :entry_id
            """
        ),
        {"entry_id": entry_id},
    ).mappings().one_or_none()
    if result is None:
        raise PriceEntryNotFoundError(entry_id)
    return PriceEntryRecord.from_row(result)


def list_price_entries() -> List[PriceEntryRecord]:
    """Return all stored price entries ordered by provider/model."""

    with session_scope() as session:
        rows = session.execute(
            text(
                """
                SELECT
                    id,
                    provider_id,
                    model,
                    currency,
                    unit,
                    input_cost_per_1k,
                    output_cost_per_1k,
                    embedding_cost_per_1k,
                    tags,
                    notes,
                    effective_at,
                    created_at,
                    updated_at
                FROM price_entries
                ORDER BY provider_id, model, id
                """
            )
        ).mappings()
        return [PriceEntryRecord.from_row(row) for row in rows]


def create_price_entry(
    *,
    entry_id: str,
    provider_id: str,
    model: str,
    currency: str = "USD",
    unit: str = "tokens",
    input_cost_per_1k: float | int | None = None,
    output_cost_per_1k: float | int | None = None,
    embedding_cost_per_1k: float | int | None = None,
    tags: Iterable[str] | None = None,
    notes: str | None = None,
    effective_at: datetime | None = None,
) -> PriceEntryRecord:
    """Persist a new price table entry."""

    created_at = updated_at = _now().isoformat()
    try:
        with session_scope() as session:
            session.execute(
                text(
                    """
                    INSERT INTO price_entries (
                        id,
                        provider_id,
                        model,
                        currency,
                        unit,
                        input_cost_per_1k,
                        output_cost_per_1k,
                        embedding_cost_per_1k,
                        tags,
                        notes,
                        effective_at,
                        created_at,
                        updated_at
                    ) VALUES (
                        :id,
                        :provider_id,
                        :model,
                        :currency,
                        :unit,
                        :input_cost_per_1k,
                        :output_cost_per_1k,
                        :embedding_cost_per_1k,
                        :tags,
                        :notes,
                        :effective_at,
                        :created_at,
                        :updated_at
                    )
                    """
                ),
                {
                    "id": entry_id,
                    "provider_id": provider_id,
                    "model": model,
                    "currency": currency,
                    "unit": unit,
                    "input_cost_per_1k": _normalize_cost(input_cost_per_1k),
                    "output_cost_per_1k": _normalize_cost(output_cost_per_1k),
                    "embedding_cost_per_1k": _normalize_cost(embedding_cost_per_1k),
                    "tags": _serialize_list(tags or []),
                    "notes": notes,
                    "effective_at": _serialize_datetime(effective_at),
                    "created_at": created_at,
                    "updated_at": updated_at,
                },
            )
    except IntegrityError as exc:  # pragma: no cover - depends on SQLite internals
        raise PriceEntryAlreadyExistsError(entry_id) from exc

    with session_scope() as session:
        return _fetch_one(session, entry_id)


def get_price_entry(entry_id: str) -> PriceEntryRecord:
    """Return a single price entry."""

    with session_scope() as session:
        return _fetch_one(session, entry_id)


def update_price_entry(
    entry_id: str,
    *,
    provider_id: str,
    model: str,
    currency: str = "USD",
    unit: str = "tokens",
    input_cost_per_1k: float | int | None = None,
    output_cost_per_1k: float | int | None = None,
    embedding_cost_per_1k: float | int | None = None,
    tags: Iterable[str] | None = None,
    notes: str | None = None,
    effective_at: datetime | None = None,
) -> PriceEntryRecord:
    """Update an existing price entry."""

    updated_at = _now().isoformat()
    with session_scope() as session:
        result = session.execute(
            text(
                """
                UPDATE price_entries
                SET
                    provider_id = :provider_id,
                    model = :model,
                    currency = :currency,
                    unit = :unit,
                    input_cost_per_1k = :input_cost_per_1k,
                    output_cost_per_1k = :output_cost_per_1k,
                    embedding_cost_per_1k = :embedding_cost_per_1k,
                    tags = :tags,
                    notes = :notes,
                    effective_at = :effective_at,
                    updated_at = :updated_at
                WHERE id = :entry_id
                """
            ),
            {
                "entry_id": entry_id,
                "provider_id": provider_id,
                "model": model,
                "currency": currency,
                "unit": unit,
                "input_cost_per_1k": _normalize_cost(input_cost_per_1k),
                "output_cost_per_1k": _normalize_cost(output_cost_per_1k),
                "embedding_cost_per_1k": _normalize_cost(embedding_cost_per_1k),
                "tags": _serialize_list(tags or []),
                "notes": notes,
                "effective_at": _serialize_datetime(effective_at),
                "updated_at": updated_at,
            },
        )
        if result.rowcount == 0:
            raise PriceEntryNotFoundError(entry_id)

    with session_scope() as session:
        return _fetch_one(session, entry_id)


def delete_price_entry(entry_id: str) -> None:
    """Remove a price entry from the data store."""

    with session_scope() as session:
        result = session.execute(
            text("DELETE FROM price_entries WHERE id = :entry_id"), {"entry_id": entry_id}
        )
        if result.rowcount == 0:
            raise PriceEntryNotFoundError(entry_id)


__all__ = [
    "PriceEntryRecord",
    "PriceEntryNotFoundError",
    "PriceEntryAlreadyExistsError",
    "list_price_entries",
    "create_price_entry",
    "get_price_entry",
    "update_price_entry",
    "delete_price_entry",
]
