"""Security middleware and helpers providing RBAC + audit logging."""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from datetime import datetime, timezone
from math import ceil
from enum import Enum
from hashlib import sha256
from pathlib import Path
from threading import Lock
from typing import Any, Iterable, Mapping, Sequence
from uuid import uuid4

import structlog
from fastapi import HTTPException, Request, status
from fastapi.responses import JSONResponse
from sqlalchemy import select, text
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp

from .database import User as UserModel
from .database import UserToken as UserTokenModel
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


def _normalize_datetime(value: datetime | None) -> str | None:
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    else:
        value = value.astimezone(timezone.utc)
    return value.isoformat()


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
        self._path_override = path
        self._session_factory = session_factory
        self._lock = Lock()

    @property
    def path(self) -> Path:
        return _resolve_audit_path(self._path_override)

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
            path = self.path
            with path.open("a", encoding="utf-8") as handle:
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

    @staticmethod
    def _parse_datetime(value: str) -> datetime:
        if value.endswith("Z"):
            value = value[:-1] + "+00:00"
        parsed = datetime.fromisoformat(value)
        if parsed.tzinfo is None:
            return parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc)

    @staticmethod
    def _deserialize_event(payload: Mapping[str, Any]) -> AuditEvent:
        actor_roles_raw = payload.get("actor_roles")
        metadata_raw = payload.get("metadata")
        try:
            actor_roles = json.loads(actor_roles_raw) if isinstance(actor_roles_raw, str) else list(actor_roles_raw)
        except json.JSONDecodeError:  # pragma: no cover - defensive against corrupt rows
            actor_roles = []
        try:
            metadata = json.loads(metadata_raw) if isinstance(metadata_raw, str) else dict(metadata_raw or {})
        except json.JSONDecodeError:  # pragma: no cover - defensive against corrupt rows
            metadata = {}

        created_at_raw = str(payload.get("created_at"))
        created_at = AuditLogger._parse_datetime(created_at_raw)

        return AuditEvent(
            id=str(payload.get("id")),
            actor_id=payload.get("actor_id"),
            actor_name=payload.get("actor_name"),
            actor_roles=tuple(str(role) for role in actor_roles),
            action=str(payload.get("action")),
            resource=str(payload.get("resource")),
            status=str(payload.get("status")),
            plan_id=payload.get("plan_id"),
            metadata=metadata,
            created_at=created_at,
        )

    def query(
        self,
        *,
        actor: str | None = None,
        action: str | None = None,
        start: datetime | None = None,
        end: datetime | None = None,
        page: int = 1,
        page_size: int = 50,
    ) -> tuple[list[AuditEvent], int, int]:
        """Return paginated audit events applying optional filters."""

        if page < 1:
            raise ValueError("page must be >= 1")
        if page_size < 1:
            raise ValueError("page_size must be >= 1")

        filters: list[str] = []
        params: dict[str, Any] = {}

        if actor:
            params["actor"] = f"%{actor}%"
            filters.append("(actor_id LIKE :actor OR actor_name LIKE :actor)")
        if action:
            params["action"] = f"%{action}%"
            filters.append("action LIKE :action")

        if start:
            start_iso = _normalize_datetime(start)
            if start_iso:
                params["start"] = start_iso
                filters.append("created_at >= :start")
        if end:
            end_iso = _normalize_datetime(end)
            if end_iso:
                params["end"] = end_iso
                filters.append("created_at <= :end")

        where_clause = f"WHERE {' AND '.join(filters)}" if filters else ""
        offset = (page - 1) * page_size

        with self._session_factory() as session:
            count_stmt = text(f"SELECT COUNT(*) FROM audit_events {where_clause}")
            total: int = int(session.execute(count_stmt, params).scalar() or 0)

            if total == 0:
                return [], 0, 0

            total_pages = ceil(total / page_size)
            query_stmt = text(
                """
                SELECT
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
                FROM audit_events
                {where}
                ORDER BY created_at DESC, id DESC
                LIMIT :limit OFFSET :offset
                """.format(where=where_clause)
            )

            rows = session.execute(
                query_stmt,
                {**params, "limit": page_size, "offset": offset},
            ).mappings()

        events = [self._deserialize_event(row) for row in rows]
        return events, total, total_pages


class SecurityContext:
    """Container storing the authenticated user and audit logger for a request."""

    def __init__(self, *, user: AuthenticatedUser, audit_logger: AuditLogger):
        self.user = user
        self.audit_logger = audit_logger


DEFAULT_AUDIT_LOGGER = AuditLogger()


class RBACMiddleware(BaseHTTPMiddleware):
    """FastAPI middleware enforcing authentication on protected routes."""

    def __init__(
        self,
        app: ASGIApp,
        *,
        session_factory=session_scope,
        audit_logger: AuditLogger | None = None,
        protected_prefixes: Sequence[str] = ("/api/v1/config", "/api/v1/security", "/api/v1/audit"),
    ) -> None:
        super().__init__(app)
        self._session_factory = session_factory
        self._audit_logger = audit_logger or DEFAULT_AUDIT_LOGGER
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

        return authenticate_bearer_token(token, session_factory=self._session_factory)


def authenticate_bearer_token(
    token: str,
    *,
    session_factory=session_scope,
) -> AuthenticatedUser:
    """Resolve an authenticated user from a bearer token."""

    token_hash = hash_token(token)
    now = datetime.now(tz=timezone.utc)
    now_iso = now.isoformat()
    with session_factory() as session:
        token_match = (
            session.execute(
                select(UserTokenModel, UserModel)
                .join(UserModel, UserTokenModel.user_id == UserModel.id)
                .where(UserTokenModel.token_hash == token_hash)
                .limit(1)
            )
            .first()
        )

        user_id: str
        email: str | None
        name: str

        if token_match is not None:
            token_row = token_match[0]
            user_row = token_match[1]
            if token_row.revoked_at is not None:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials"
                )
            expires_at = _parse_timestamp(token_row.expires_at)
            if expires_at is not None and expires_at <= now:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials"
                )
            token_row.last_used_at = now_iso
            token_row.updated_at = now_iso
            user_id = str(user_row.id)
            name = str(user_row.name)
            email = str(user_row.email) if user_row.email else None
        else:
            legacy_user = (
                session.execute(
                    select(UserModel)
                    .where(UserModel.api_token_hash == token_hash)
                    .limit(1)
                )
                .scalar_one_or_none()
            )
            if legacy_user is None:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials"
                )
            user_id = str(legacy_user.id)
            name = str(legacy_user.name)
            email = str(legacy_user.email) if legacy_user.email else None

        roles = session.execute(
            text(
                """
                SELECT r.name
                FROM roles AS r
                INNER JOIN user_roles AS ur ON ur.role_id = r.id
                WHERE ur.user_id = :user_id
                """
            ),
            {"user_id": user_id},
        ).scalars()
        assigned = frozenset(Role(role_name) for role_name in roles)

    if not assigned:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User lacks assigned roles")

    return AuthenticatedUser(
        id=user_id,
        name=name,
        email=email,
        roles=assigned,
    )


def ensure_security_context(
    request: Request,
    *,
    audit_logger: AuditLogger | None = None,
    session_factory=session_scope,
) -> SecurityContext:
    """Ensure the request has a populated security context.

    FastAPI dependencies (e.g. middleware) attach ``request.state.security`` when
    handling protected routes. Marketplace import endpoints bypass the middleware,
    so we hydrate the context here on demand, ensuring audit logging remains
    consistent.
    """

    context = getattr(request.state, "security", None)
    if context is not None:
        return context

    header = request.headers.get("Authorization")
    if not header:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing Authorization header")

    scheme, _, token = header.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid authentication scheme")

    user = authenticate_bearer_token(token, session_factory=session_factory)
    resolved_logger = audit_logger or getattr(request.app.state, "audit_logger", None) or DEFAULT_AUDIT_LOGGER
    context = SecurityContext(user=user, audit_logger=resolved_logger)
    request.state.security = context
    return context


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
    "DEFAULT_AUDIT_LOGGER",
    "RBACMiddleware",
    "Role",
    "audit_logger",
    "authenticate_bearer_token",
    "current_user",
    "ensure_security_context",
    "get_security_context",
    "hash_token",
    "require_roles",
]

def _parse_timestamp(value: str | None) -> datetime | None:
    if value is None:
        return None
    if value.endswith("Z"):
        value = value[:-1] + "+00:00"
    return datetime.fromisoformat(value)

