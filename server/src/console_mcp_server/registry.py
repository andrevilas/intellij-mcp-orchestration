"""In-memory registries for providers and sessions."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Dict, List, Optional
from uuid import uuid4

from .config import Settings, get_settings
from .schemas import ProviderSummary, Session


class ProviderRegistry:
    """Access layer for provider metadata loaded from the manifest."""

    def __init__(self, settings: Optional[Settings] = None) -> None:
        self._settings = settings or get_settings()

    @property
    def providers(self) -> List[ProviderSummary]:
        return [ProviderSummary(**provider.model_dump(), is_available=True) for provider in self._settings.providers]

    def get(self, provider_id: str) -> ProviderSummary:
        for provider in self.providers:
            if provider.id == provider_id:
                return provider
        raise KeyError(provider_id)


class SessionRegistry:
    """Stores lightweight session state for the prototype lifecycle."""

    def __init__(self) -> None:
        self._sessions: Dict[str, Session] = {}

    def create(self, provider_id: str, *, reason: Optional[str] = None, client: Optional[str] = None) -> Session:
        session_id = str(uuid4())
        session = Session(
            id=session_id,
            provider_id=provider_id,
            created_at=datetime.now(tz=timezone.utc),
            status="pending",
            reason=reason,
            client=client,
        )
        self._sessions[session_id] = session
        return session

    def list(self) -> List[Session]:
        return list(self._sessions.values())

    def get(self, session_id: str) -> Session:
        try:
            return self._sessions[session_id]
        except KeyError as exc:  # pragma: no cover - simple passthrough guard
            raise KeyError(session_id) from exc


provider_registry = ProviderRegistry()
session_registry = SessionRegistry()


__all__ = [
    "ProviderRegistry",
    "SessionRegistry",
    "provider_registry",
    "session_registry",
]
