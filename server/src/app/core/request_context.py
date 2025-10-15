"""Request scoped context helpers and middleware."""

from __future__ import annotations

import time
import uuid
from contextvars import ContextVar
from typing import Awaitable, Callable

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response
from starlette.types import ASGIApp
from structlog.contextvars import bind_contextvars, clear_contextvars

from .logging import request_logger

RequestResponseEndpoint = Callable[[Request], Awaitable[Response]]


_request_id_ctx_var: ContextVar[str | None] = ContextVar("request_id", default=None)
_HEADER_NAME = "X-Request-Id"
_AGENT_HEADER = "X-Agent-Id"


def get_request_id() -> str | None:
    """Return the current request identifier, if any."""

    return _request_id_ctx_var.get()


def clear_request_context() -> None:
    """Remove bound contextvars, useful for background tasks."""

    clear_contextvars()
    _request_id_ctx_var.set(None)


class RequestIdMiddleware(BaseHTTPMiddleware):
    """Ensure every request has an ``X-Request-Id`` header bound to the log context."""

    def __init__(self, app: ASGIApp, header_name: str = _HEADER_NAME) -> None:
        super().__init__(app)
        self.header_name = header_name

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        request_id = request.headers.get(self.header_name) or str(uuid.uuid4())
        agent_id = request.headers.get(_AGENT_HEADER)

        token = _request_id_ctx_var.set(request_id)
        bind_contextvars(request_id=request_id, path=request.url.path, method=request.method, agent=agent_id)

        start_time = time.perf_counter()
        try:
            response = await call_next(request)
        except Exception:
            duration_ms = (time.perf_counter() - start_time) * 1000
            bind_contextvars(duration_ms=round(duration_ms, 2), status_code=None)
            request_logger.exception("request_failed")
            raise
        else:
            duration_ms = (time.perf_counter() - start_time) * 1000
            bind_contextvars(status_code=response.status_code, duration_ms=round(duration_ms, 2))
            request_logger.info("request_completed")
            response.headers.setdefault(self.header_name, request_id)
            return response
        finally:
            clear_contextvars()
            _request_id_ctx_var.reset(token)


__all__ = ["RequestIdMiddleware", "get_request_id", "clear_request_context"]
