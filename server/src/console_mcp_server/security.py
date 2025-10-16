"""Security middleware and helpers providing RBAC + audit logging."""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from datetime import datetime, timezone
from enum import Enum
from hashlib import sha256
from pathlib import Path
from threading import Lock
from typing import Iterable, Mapping, Sequence
from uuid import uuid4

import structlog
from fastapi import HTTPException, Request, status
from fastapi.responses import JSONResponse
from sqlalchemy import text
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp

from .database import session_scope

logger = structlog.get_logger("console.security")

AUDIT_LOG_ENV_VAR = "CONSOLE_MCP_AUDIT_LOG_PATH"
DEFAULT_AUDIT_LOG_PATH = Path("~/.mcp/audit.log")


class Role(str, Enum):
    """Application level roles leveraged to enforce RBAC policies."""

    VIEWER = "viewer"
    PLANNER = "planner"
    APPROVER = "approver"


@dataclass(frozen=True)
class AuthenticatedUser:
    """Normalized representation of the principal extracted from the request."""

    id: str
    name: str
    email: str | None
    roles: frozenset[Role]

    def has_any_role(self, required: Iterable[Role]) -> bool:
        required_set = set(required)
        return bool(self.roles & required_set)


def hash_token(token: str) -> str:
    """Return the deterministic SHA-256 hash used to store API tokens."""

    digest = sha256()
    digest.update(token.encode("utf-8"))
    return digest.hexdigest()


def _resolve_audit_path(path: Path | None = None) -> Path:
    env_override = os.getenv(AUDIT_LOG_ENV_VAR)
    resolved = path or Path(env_override) if env_override else DEFAULT_AUDIT_LOG_PATH
    resolved = resolved.expanduser()
    if not resolved.is_absolute():
        resolved = Path(__file__).resolve().parents[3] / resolved
    resolved.parent.mkdir(parents=True, exist_ok=True)
    return resolved


@dataclass(frozen=True)
class AuditEvent:
    """Structured payload recorded for compliance/auditing."""

    id: str
    actor_id: str | None
    actor_name: str | None
    actor_roles: tuple[str, ...]
    action: str
    resource: str
    status: str
    plan_id: str | None
    metadata: Mapping[str, object]
    created_at: datetime

    def asdict(self) -> dict[str, object]:
        payload = {
            "id": self.id,
            "actor_id": self.actor_id,
            "actor_name": self.actor_name,
            "actor_roles": list(self.actor_roles),
            "action": self.action,
            "resource": self.resource,
            "status": self.status,
            "plan_id": self.plan_id,
            "metadata": dict(self.metadata),
            "created_at": self.created_at.isoformat(),
        }
        return payload


class AuditLogger:
    """Dual writer that persists audit events to JSONL and SQLite."""

    def __init__(self, *, path: Path | None = None, session_factory=session_scope):
        self._path = _resolve_audit_path(path)
        self._session_factory = session_factory
        self._lock = Lock()

    @property
    def path(self) -> Path:
        return self._path

    def log(
        self,
        *,
        actor: AuthenticatedUser | None,
        action: str,
        resource: str,
        status: str = "success",
        plan_id: str | None = None,
        metadata: Mapping[str, object] | None = None,
    ) -> AuditEvent:
        now = datetime.now(tz=timezone.utc)
        event = AuditEvent(
            id=uuid4().hex,
            actor_id=actor.id if actor else None,
            actor_name=actor.name if actor else None,
            actor_roles=tuple(sorted(role.value for role in actor.roles)) if actor else (),
            action=action,
            resource=resource,
            status=status,
            plan_id=plan_id,
            metadata=dict(metadata or {}),
            created_at=now,
        )

        payload = event.asdict()
        line = json.dumps(payload, ensure_ascii=False, sort_keys=True)
        with self._lock:
            with self._path.open("a", encoding="utf-8") as handle:
                handle.write(line + "\n")

        with self._session_factory() as session:
            session.execute(
                text(
                    """
                    INSERT INTO audit_events (
                        id,
                        actor_id,
                        actor_name,
                        actor_roles,
                        action,
                        resource,
                        status,
                        plan_id,
                        metadata,
                        created_at
                    ) VALUES (
                        :id,
                        :actor_id,
                        :actor_name,
                        :actor_roles,
                        :action,
                        :resource,
                        :status,
                        :plan_id,
                        :metadata,
                        :created_at
                    )
                    """
                ),
                {
                    "id": event.id,
                    "actor_id": event.actor_id,
                    "actor_name": event.actor_name,
                    "actor_roles": json.dumps(list(event.actor_roles), ensure_ascii=False, sort_keys=True),
                    "action": event.action,
                    "resource": event.resource,
                    "status": event.status,
                    "plan_id": event.plan_id,
                    "metadata": json.dumps(payload["metadata"], ensure_ascii=False, sort_keys=True),
                    "created_at": event.created_at.isoformat(),
                },
            )

        logger.info(
            "audit.event",
            action=event.action,
            resource=event.resource,
            plan_id=event.plan_id,
            status=event.status,
            actor_id=event.actor_id,
        )
        return event


class SecurityContext:
    """Container storing the authenticated user and audit logger for a request."""

    def __init__(self, *, user: AuthenticatedUser, audit_logger: AuditLogger):
        self.user = user
        self.audit_logger = audit_logger


class RBACMiddleware(BaseHTTPMiddleware):
    """FastAPI middleware enforcing authentication on protected routes."""

    def __init__(
        self,
        app: ASGIApp,
        *,
        session_factory=session_scope,
        audit_logger: AuditLogger | None = None,
        protected_prefixes: Sequence[str] = ("/api/v1/config",),
    ) -> None:
        super().__init__(app)
        self._session_factory = session_factory
        self._audit_logger = audit_logger or AuditLogger(session_factory=session_factory)
        self._protected_prefixes = tuple(protected_prefixes)

    async def dispatch(self, request: Request, call_next):  # type: ignore[override]
        if not self._requires_auth(request):
            return await call_next(request)

        if request.method.upper() == "OPTIONS":
            return await call_next(request)

        try:
            user = self._authenticate(request)
        except HTTPException as exc:
            return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})
        request.state.security = SecurityContext(user=user, audit_logger=self._audit_logger)
        return await call_next(request)

    def _requires_auth(self, request: Request) -> bool:
        return any(request.url.path.startswith(prefix) for prefix in self._protected_prefixes)

    def _authenticate(self, request: Request) -> AuthenticatedUser:
        header = request.headers.get("Authorization")
        if not header:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing Authorization header")

        scheme, _, token = header.partition(" ")
        if scheme.lower() != "bearer" or not token:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid authentication scheme")

        token_hash = hash_token(token)
        with self._session_factory() as session:
            row = (
                session.execute(
                    text(
                        """
                        SELECT id, name, email
                        FROM users
                        WHERE api_token_hash = :token_hash
                        LIMIT 1
                        """
                    ),
                    {"token_hash": token_hash},
                )
                .mappings()
                .first()
            )

            if row is None:
                raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

            roles = session.execute(
                text(
                    """
                    SELECT r.name
                    FROM roles AS r
                    INNER JOIN user_roles AS ur ON ur.role_id = r.id
                    WHERE ur.user_id = :user_id
                    """
                ),
                {"user_id": row["id"]},
            ).scalars()
            assigned = frozenset(Role(role_name) for role_name in roles)

        if not assigned:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User lacks assigned roles")

        return AuthenticatedUser(
            id=str(row["id"]),
            name=str(row["name"]),
            email=str(row.get("email")) if row.get("email") else None,
            roles=assigned,
        )


def get_security_context(request: Request) -> SecurityContext:
    context = getattr(request.state, "security", None)
    if context is None:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Security context unavailable")
    return context


def current_user(request: Request) -> AuthenticatedUser:
    return get_security_context(request).user


def audit_logger(request: Request) -> AuditLogger:
    return get_security_context(request).audit_logger


def require_roles(request: Request, *roles: Role) -> AuthenticatedUser:
    user = current_user(request)
    if not user.has_any_role(roles):
        required = ", ".join(sorted(role.value for role in roles))
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Permissão insuficiente. Requer: {required}",
        )
    return user


__all__ = [
    "AUDIT_LOG_ENV_VAR",
    "AuthenticatedUser",
    "AuditEvent",
    "AuditLogger",
    "RBACMiddleware",
    "Role",
    "audit_logger",
    "current_user",
    "get_security_context",
    "hash_token",
    "require_roles",
]

