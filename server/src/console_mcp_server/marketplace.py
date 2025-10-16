"""Helpers for managing Marketplace catalog entries and secure imports."""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable, Sequence

from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .database import session_scope


class MarketplaceEntryNotFoundError(KeyError):
    """Raised when a marketplace entry could not be found."""


class MarketplaceEntryAlreadyExistsError(RuntimeError):
    """Raised when attempting to create a duplicated marketplace entry."""


class MarketplaceSignatureError(RuntimeError):
    """Raised when artifact signature verification fails."""


class MarketplaceArtifactError(RuntimeError):
    """Raised when marketplace artifacts are missing or invalid."""


@dataclass(frozen=True)
class MarketplaceEntryRecord:
    """Canonical representation of a stored marketplace entry."""

    id: str
    name: str
    slug: str
    summary: str
    description: str | None
    origin: str
    rating: float
    cost: float
    tags: list[str]
    capabilities: list[str]
    repository_url: str | None
    package_path: str
    manifest_filename: str
    entrypoint_filename: str | None
    target_repository: str
    signature: str
    created_at: datetime
    updated_at: datetime

    @classmethod
    def from_row(cls, row: dict[str, object]) -> "MarketplaceEntryRecord":
        def _to_float(value: object | None) -> float:
            return float(value) if value is not None else 0.0

        created_at = datetime.fromisoformat(str(row["created_at"]))
        updated_at = datetime.fromisoformat(str(row["updated_at"]))
        tags_raw = row.get("tags") or "[]"
        capabilities_raw = row.get("capabilities") or "[]"
        return cls(
            id=str(row["id"]),
            name=str(row["name"]),
            slug=str(row["slug"]),
            summary=str(row["summary"]),
            description=str(row["description"]) if row.get("description") is not None else None,
            origin=str(row["origin"]),
            rating=_to_float(row.get("rating")),
            cost=_to_float(row.get("cost")),
            tags=list(json.loads(tags_raw)),
            capabilities=list(json.loads(capabilities_raw)),
            repository_url=str(row["repository_url"]) if row.get("repository_url") is not None else None,
            package_path=str(row["package_path"]),
            manifest_filename=str(row["manifest_filename"]),
            entrypoint_filename=str(row["entrypoint_filename"]) if row.get("entrypoint_filename") is not None else None,
            target_repository=str(row["target_repository"]),
            signature=str(row["signature"]),
            created_at=created_at,
            updated_at=updated_at,
        )

    def to_dict(self) -> dict[str, object | None]:
        return {
            "id": self.id,
            "name": self.name,
            "slug": self.slug,
            "summary": self.summary,
            "description": self.description,
            "origin": self.origin,
            "rating": self.rating,
            "cost": self.cost,
            "tags": self.tags,
            "capabilities": self.capabilities,
            "repository_url": self.repository_url,
            "package_path": self.package_path,
            "manifest_filename": self.manifest_filename,
            "entrypoint_filename": self.entrypoint_filename,
            "target_repository": self.target_repository,
            "signature": self.signature,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        }


@dataclass(frozen=True)
class MarketplaceInstallBundle:
    """Resolved artifacts prepared inside an isolated sandbox."""

    entry: MarketplaceEntryRecord
    sandbox_path: Path
    manifest_path: Path
    agent_path: Path | None


def _serialize_list(values: Iterable[str]) -> str:
    return json.dumps(list(values), ensure_ascii=False, sort_keys=True)


def _now() -> datetime:
    return datetime.now(tz=timezone.utc)


def _fetch_one(session: Session, entry_id: str) -> MarketplaceEntryRecord:
    row = session.execute(
        text(
            """
            SELECT
                id,
                name,
                slug,
                summary,
                description,
                origin,
                rating,
                cost,
                tags,
                capabilities,
                repository_url,
                package_path,
                manifest_filename,
                entrypoint_filename,
                target_repository,
                signature,
                created_at,
                updated_at
            FROM marketplace_entries
            WHERE id = :entry_id
            """
        ),
        {"entry_id": entry_id},
    ).mappings().one_or_none()
    if row is None:
        raise MarketplaceEntryNotFoundError(entry_id)
    return MarketplaceEntryRecord.from_row(row)


def list_marketplace_entries() -> list[MarketplaceEntryRecord]:
    with session_scope() as session:
        rows = session.execute(
            text(
                """
                SELECT
                    id,
                    name,
                    slug,
                    summary,
                    description,
                    origin,
                    rating,
                    cost,
                    tags,
                    capabilities,
                    repository_url,
                    package_path,
                    manifest_filename,
                    entrypoint_filename,
                    target_repository,
                    signature,
                    created_at,
                    updated_at
                FROM marketplace_entries
                ORDER BY rating DESC, cost ASC, name ASC
                """
            )
        ).mappings()
        return [MarketplaceEntryRecord.from_row(row) for row in rows]


def create_marketplace_entry(
    *,
    entry_id: str,
    name: str,
    slug: str,
    summary: str,
    description: str | None = None,
    origin: str,
    rating: float,
    cost: float,
    tags: Sequence[str] | None = None,
    capabilities: Sequence[str] | None = None,
    repository_url: str | None = None,
    package_path: str,
    manifest_filename: str = "agent.yaml",
    entrypoint_filename: str | None = None,
    target_repository: str = "agents-hub",
    signature: str,
) -> MarketplaceEntryRecord:
    created_at = updated_at = _now().isoformat()
    try:
        with session_scope() as session:
            session.execute(
                text(
                    """
                    INSERT INTO marketplace_entries (
                        id,
                        name,
                        slug,
                        summary,
                        description,
                        origin,
                        rating,
                        cost,
                        tags,
                        capabilities,
                        repository_url,
                        package_path,
                        manifest_filename,
                        entrypoint_filename,
                        target_repository,
                        signature,
                        created_at,
                        updated_at
                    ) VALUES (
                        :id,
                        :name,
                        :slug,
                        :summary,
                        :description,
                        :origin,
                        :rating,
                        :cost,
                        :tags,
                        :capabilities,
                        :repository_url,
                        :package_path,
                        :manifest_filename,
                        :entrypoint_filename,
                        :target_repository,
                        :signature,
                        :created_at,
                        :updated_at
                    )
                    """
                ),
                {
                    "id": entry_id,
                    "name": name,
                    "slug": slug,
                    "summary": summary,
                    "description": description,
                    "origin": origin,
                    "rating": float(rating),
                    "cost": float(cost),
                    "tags": _serialize_list(tags or ()),
                    "capabilities": _serialize_list(capabilities or ()),
                    "repository_url": repository_url,
                    "package_path": package_path,
                    "manifest_filename": manifest_filename,
                    "entrypoint_filename": entrypoint_filename,
                    "target_repository": target_repository,
                    "signature": signature,
                    "created_at": created_at,
                    "updated_at": updated_at,
                },
            )
    except IntegrityError as exc:  # pragma: no cover - defensive
        raise MarketplaceEntryAlreadyExistsError(entry_id) from exc
    return get_marketplace_entry(entry_id)


def get_marketplace_entry(entry_id: str) -> MarketplaceEntryRecord:
    with session_scope() as session:
        return _fetch_one(session, entry_id)


def update_marketplace_entry(
    entry_id: str,
    *,
    name: str,
    slug: str,
    summary: str,
    description: str | None,
    origin: str,
    rating: float,
    cost: float,
    tags: Sequence[str] | None,
    capabilities: Sequence[str] | None,
    repository_url: str | None,
    package_path: str,
    manifest_filename: str,
    entrypoint_filename: str | None,
    target_repository: str,
    signature: str,
) -> MarketplaceEntryRecord:
    updated_at = _now().isoformat()
    with session_scope() as session:
        result = session.execute(
            text(
                """
                UPDATE marketplace_entries
                SET
                    name = :name,
                    slug = :slug,
                    summary = :summary,
                    description = :description,
                    origin = :origin,
                    rating = :rating,
                    cost = :cost,
                    tags = :tags,
                    capabilities = :capabilities,
                    repository_url = :repository_url,
                    package_path = :package_path,
                    manifest_filename = :manifest_filename,
                    entrypoint_filename = :entrypoint_filename,
                    target_repository = :target_repository,
                    signature = :signature,
                    updated_at = :updated_at
                WHERE id = :entry_id
                """
            ),
            {
                "entry_id": entry_id,
                "name": name,
                "slug": slug,
                "summary": summary,
                "description": description,
                "origin": origin,
                "rating": float(rating),
                "cost": float(cost),
                "tags": _serialize_list(tags or ()),
                "capabilities": _serialize_list(capabilities or ()),
                "repository_url": repository_url,
                "package_path": package_path,
                "manifest_filename": manifest_filename,
                "entrypoint_filename": entrypoint_filename,
                "target_repository": target_repository,
                "signature": signature,
                "updated_at": updated_at,
            },
        )
        if result.rowcount == 0:
            raise MarketplaceEntryNotFoundError(entry_id)
    return get_marketplace_entry(entry_id)


def delete_marketplace_entry(entry_id: str) -> None:
    with session_scope() as session:
        result = session.execute(
            text("DELETE FROM marketplace_entries WHERE id = :entry_id"),
            {"entry_id": entry_id},
        )
        if result.rowcount == 0:
            raise MarketplaceEntryNotFoundError(entry_id)


def prepare_marketplace_install(entry_id: str, destination: Path) -> MarketplaceInstallBundle:
    entry = get_marketplace_entry(entry_id)
    repo_root = Path(__file__).resolve().parents[3]
    package_dir = (repo_root / entry.package_path).resolve()
    if not package_dir.is_dir():
        raise MarketplaceArtifactError(f"Package directory '{entry.package_path}' not found")

    manifest_src = (package_dir / entry.manifest_filename).resolve()
    if package_dir not in manifest_src.parents:
        raise MarketplaceArtifactError("Manifest path escapes package directory")
    if not manifest_src.is_file():
        raise MarketplaceArtifactError(f"Manifest '{entry.manifest_filename}' not found")

    agent_src: Path | None = None
    if entry.entrypoint_filename:
        agent_candidate = (package_dir / entry.entrypoint_filename).resolve()
        if package_dir not in agent_candidate.parents:
            raise MarketplaceArtifactError("Agent source escapes package directory")
        if not agent_candidate.is_file():
            raise MarketplaceArtifactError(
                f"Agent entrypoint '{entry.entrypoint_filename}' not found"
            )
        agent_src = agent_candidate

    manifest_bytes = manifest_src.read_bytes()
    digest = hashlib.sha256(manifest_bytes)
    agent_bytes: bytes | None = None
    if agent_src is not None:
        agent_bytes = agent_src.read_bytes()
        digest.update(agent_bytes)

    computed_signature = digest.hexdigest()
    if computed_signature != entry.signature:
        raise MarketplaceSignatureError(
            "Assinatura inválida para os artefatos do marketplace."
        )

    destination = destination.resolve()
    destination.mkdir(parents=True, exist_ok=True)

    manifest_dest = destination / manifest_src.name
    manifest_dest.write_bytes(manifest_bytes)

    agent_dest: Path | None = None
    if agent_bytes is not None:
        agent_dest = destination / agent_src.name
        agent_dest.write_bytes(agent_bytes)

    return MarketplaceInstallBundle(
        entry=entry,
        sandbox_path=destination,
        manifest_path=manifest_dest,
        agent_path=agent_dest,
    )


__all__ = [
    "MarketplaceEntryRecord",
    "MarketplaceInstallBundle",
    "MarketplaceEntryNotFoundError",
    "MarketplaceEntryAlreadyExistsError",
    "MarketplaceSignatureError",
    "MarketplaceArtifactError",
    "list_marketplace_entries",
    "create_marketplace_entry",
    "get_marketplace_entry",
    "update_marketplace_entry",
    "delete_marketplace_entry",
    "prepare_marketplace_install",
]
