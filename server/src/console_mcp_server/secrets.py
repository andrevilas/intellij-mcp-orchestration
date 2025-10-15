"""Simple secrets store backing the Console MCP Server prototype."""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Iterable, Optional

from pydantic import BaseModel, Field

DEFAULT_SECRETS_PATH = Path("~/.mcp/console-secrets.json")
SECRETS_ENV_VAR = "CONSOLE_MCP_SECRETS_PATH"


@dataclass
class SecretRecord:
    """Internal representation of a stored secret."""

    provider_id: str
    value: str
    created_at: datetime
    updated_at: datetime

    @classmethod
    def new(cls, provider_id: str, value: str) -> "SecretRecord":
        now = datetime.now(tz=timezone.utc)
        return cls(provider_id=provider_id, value=value, created_at=now, updated_at=now)

    def replace_value(self, value: str) -> None:
        self.value = value
        self.updated_at = datetime.now(tz=timezone.utc)


class SecretMetadata(BaseModel):
    """Metadata exposed externally for each stored secret."""

    provider_id: str
    has_secret: bool = Field(default=True)
    updated_at: Optional[datetime] = Field(default=None)


class SecretValue(BaseModel):
    """Concrete secret payload returned by the API."""

    provider_id: str
    value: str
    updated_at: datetime


class SecretStore:
    """Filesystem-backed key store with JSON serialization."""

    def __init__(self, path: Optional[Path] = None) -> None:
        env_override = os.getenv(SECRETS_ENV_VAR)
        resolved_path = path or Path(env_override) if env_override else DEFAULT_SECRETS_PATH
        resolved_path = resolved_path.expanduser()
        if not resolved_path.is_absolute():
            resolved_path = Path(__file__).resolve().parents[3] / resolved_path
        self._path = resolved_path

    @property
    def path(self) -> Path:
        return self._path

    def list(self) -> Iterable[SecretMetadata]:
        secrets = self._load_all()
        return [
            SecretMetadata(
                provider_id=provider_id,
                has_secret=True,
                updated_at=record.updated_at,
            )
            for provider_id, record in secrets.items()
        ]

    def get(self, provider_id: str) -> SecretValue:
        secrets = self._load_all()
        try:
            record = secrets[provider_id]
        except KeyError as exc:
            raise KeyError(provider_id) from exc
        return SecretValue(provider_id=record.provider_id, value=record.value, updated_at=record.updated_at)

    def upsert(self, provider_id: str, value: str) -> SecretValue:
        secrets = self._load_all()
        record = secrets.get(provider_id)
        if record:
            record.replace_value(value)
        else:
            record = SecretRecord.new(provider_id, value)
            secrets[provider_id] = record
        self._write_all(secrets)
        return SecretValue(provider_id=record.provider_id, value=record.value, updated_at=record.updated_at)

    def delete(self, provider_id: str) -> None:
        secrets = self._load_all()
        if provider_id not in secrets:
            raise KeyError(provider_id)
        del secrets[provider_id]
        self._write_all(secrets)

    def _load_all(self) -> Dict[str, SecretRecord]:
        if not hasattr(self, "_cache"):
            setattr(self, "_cache", None)
        cache: Optional[Dict[str, SecretRecord]] = getattr(self, "_cache")  # type: ignore[attr-defined]
        if cache is not None:
            return cache

        if not self._path.exists():
            secrets: Dict[str, SecretRecord] = {}
            setattr(self, "_cache", secrets)
            return secrets

        raw = json.loads(self._path.read_text(encoding="utf-8"))
        secrets = {
            provider_id: SecretRecord(
                provider_id=provider_id,
                value=payload["value"],
                created_at=_parse_datetime(payload.get("created_at")),
                updated_at=_parse_datetime(payload.get("updated_at")),
            )
            for provider_id, payload in raw.get("secrets", {}).items()
        }
        setattr(self, "_cache", secrets)
        return secrets

    def _write_all(self, secrets: Dict[str, SecretRecord]) -> None:
        payload = {
            "version": 1,
            "secrets": {
                provider_id: {
                    "value": record.value,
                    "created_at": record.created_at.isoformat(),
                    "updated_at": record.updated_at.isoformat(),
                }
                for provider_id, record in secrets.items()
            },
        }
        self._path.parent.mkdir(parents=True, exist_ok=True)
        self._path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
        setattr(self, "_cache", secrets)

    def clear_cache(self) -> None:
        setattr(self, "_cache", None)


def _parse_datetime(value: Optional[str]) -> datetime:
    if not value:
        return datetime.now(tz=timezone.utc)
    parsed = datetime.fromisoformat(value)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


secret_store = SecretStore()


__all__ = [
    "SecretMetadata",
    "SecretStore",
    "SecretValue",
    "secret_store",
    "SECRETS_ENV_VAR",
]
