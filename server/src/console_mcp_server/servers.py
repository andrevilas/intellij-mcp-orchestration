"""Persistence helpers for managing MCP server definitions."""
from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Iterable, List

from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .database import session_scope


class MCPServerNotFoundError(KeyError):
    """Raised when an MCP server could not be located."""


class MCPServerAlreadyExistsError(RuntimeError):
    """Raised when attempting to create an MCP server with a duplicate id."""


@dataclass(frozen=True)
class MCPServerRecord:
    """Canonical representation of a stored MCP server."""

    id: str
    name: str
    command: str
    description: str | None
    tags: List[str]
    capabilities: List[str]
    transport: str
    created_at: datetime
    updated_at: datetime

    @classmethod
    def from_row(cls, row: dict[str, object]) -> "MCPServerRecord":
        tags_raw = row.get("tags") or "[]"
        capabilities_raw = row.get("capabilities") or "[]"
        created_at = datetime.fromisoformat(str(row["created_at"]))
        updated_at = datetime.fromisoformat(str(row["updated_at"]))
        return cls(
            id=str(row["id"]),
            name=str(row["name"]),
            command=str(row["command"]),
            description=str(row["description"]) if row.get("description") is not None else None,
            tags=list(json.loads(tags_raw)),
            capabilities=list(json.loads(capabilities_raw)),
            transport=str(row["transport"]),
            created_at=created_at,
            updated_at=updated_at,
        )

    def to_dict(self) -> dict[str, object]:
        return {
            "id": self.id,
            "name": self.name,
            "command": self.command,
            "description": self.description,
            "tags": self.tags,
            "capabilities": self.capabilities,
            "transport": self.transport,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        }


def _serialize_list(values: Iterable[str]) -> str:
    return json.dumps(list(values))


def _now() -> datetime:
    return datetime.now(tz=timezone.utc)


def _fetch_one(session: Session, server_id: str) -> MCPServerRecord:
    result = session.execute(
        text(
            """
            SELECT id, name, command, description, tags, capabilities, transport, created_at, updated_at
            FROM mcp_servers
            WHERE id = :server_id
            """
        ),
        {"server_id": server_id},
    ).mappings().one_or_none()
    if result is None:
        raise MCPServerNotFoundError(server_id)
    return MCPServerRecord.from_row(result)


def list_servers() -> List[MCPServerRecord]:
    """Return all persisted MCP servers ordered by identifier."""

    with session_scope() as session:
        rows = session.execute(
            text(
                """
                SELECT id, name, command, description, tags, capabilities, transport, created_at, updated_at
                FROM mcp_servers
                ORDER BY id
                """
            )
        ).mappings()
        return [MCPServerRecord.from_row(row) for row in rows]


def create_server(
    *,
    server_id: str,
    name: str,
    command: str,
    description: str | None = None,
    tags: Iterable[str] | None = None,
    capabilities: Iterable[str] | None = None,
    transport: str = "stdio",
) -> MCPServerRecord:
    """Persist a new MCP server definition."""

    created_at = updated_at = _now().isoformat()
    try:
        with session_scope() as session:
            session.execute(
                text(
                    """
                    INSERT INTO mcp_servers (
                        id, name, command, description, tags, capabilities, transport, created_at, updated_at
                    ) VALUES (
                        :id, :name, :command, :description, :tags, :capabilities, :transport, :created_at, :updated_at
                    )
                    """
                ),
                {
                    "id": server_id,
                    "name": name,
                    "command": command,
                    "description": description,
                    "tags": _serialize_list(tags or []),
                    "capabilities": _serialize_list(capabilities or []),
                    "transport": transport,
                    "created_at": created_at,
                    "updated_at": updated_at,
                },
            )
    except IntegrityError as exc:  # pragma: no cover - depends on SQLite internals
        raise MCPServerAlreadyExistsError(server_id) from exc

    with session_scope() as session:
        return _fetch_one(session, server_id)


def get_server(server_id: str) -> MCPServerRecord:
    """Return a single MCP server."""

    with session_scope() as session:
        return _fetch_one(session, server_id)


def update_server(
    server_id: str,
    *,
    name: str,
    command: str,
    description: str | None = None,
    tags: Iterable[str] | None = None,
    capabilities: Iterable[str] | None = None,
    transport: str = "stdio",
) -> MCPServerRecord:
    """Update a stored MCP server."""

    updated_at = _now().isoformat()
    with session_scope() as session:
        result = session.execute(
            text(
                """
                UPDATE mcp_servers
                SET
                    name = :name,
                    command = :command,
                    description = :description,
                    tags = :tags,
                    capabilities = :capabilities,
                    transport = :transport,
                    updated_at = :updated_at
                WHERE id = :server_id
                """
            ),
            {
                "server_id": server_id,
                "name": name,
                "command": command,
                "description": description,
                "tags": _serialize_list(tags or []),
                "capabilities": _serialize_list(capabilities or []),
                "transport": transport,
                "updated_at": updated_at,
            },
        )
        if result.rowcount == 0:
            raise MCPServerNotFoundError(server_id)

    with session_scope() as session:
        return _fetch_one(session, server_id)


def delete_server(server_id: str) -> None:
    """Remove an MCP server from the data store."""

    with session_scope() as session:
        result = session.execute(
            text("DELETE FROM mcp_servers WHERE id = :server_id"), {"server_id": server_id}
        )
        if result.rowcount == 0:
            raise MCPServerNotFoundError(server_id)


__all__ = [
    "MCPServerRecord",
    "MCPServerNotFoundError",
    "MCPServerAlreadyExistsError",
    "list_servers",
    "create_server",
    "get_server",
    "update_server",
    "delete_server",
]
