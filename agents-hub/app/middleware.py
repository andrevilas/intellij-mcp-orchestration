"""ASGI middleware components used by the FastAPI application."""

from __future__ import annotations

import time
import uuid
from typing import Callable, Awaitable

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

from .config import Settings
from .errors import error_response
from .logging_config import get_request_logger


class RequestIdMiddleware(BaseHTTPMiddleware):
    """Attach a request identifier to the state and response headers."""

    def __init__(self, app, header_name: str = "X-Request-ID") -> None:  # type: ignore[override]
        super().__init__(app)
        self._header_name = header_name

    async def dispatch(self, request: Request, call_next: Callable[[Request], Awaitable[Response]]) -> Response:
        request_id = request.headers.get(self._header_name) or str(uuid.uuid4())
        request.state.request_id = request_id
        response = await call_next(request)
        response.headers[self._header_name] = request_id
        return response


class LoggingMiddleware(BaseHTTPMiddleware):
    """Emit structured logs for incoming requests and responses."""

    def __init__(self, app, logger) -> None:  # type: ignore[override]
        super().__init__(app)
        self._logger = logger

    async def dispatch(self, request: Request, call_next: Callable[[Request], Awaitable[Response]]) -> Response:
        start_time = time.perf_counter()
        request_id = getattr(request.state, "request_id", None)
        request_logger = get_request_logger(
            self._logger,
            request_id=request_id,
            path=request.url.path,
            method=request.method,
        )
        request.state.logger = request_logger
        try:
            response = await call_next(request)
        except Exception:
            duration_ms = (time.perf_counter() - start_time) * 1000
            request_logger.exception(
                "request.error", extra={"duration_ms": duration_ms}
            )
            raise

        duration_ms = (time.perf_counter() - start_time) * 1000
        request_logger.info(
            "request.complete",
            extra={"status_code": response.status_code, "duration_ms": duration_ms},
        )
        return response


class APIKeyMiddleware(BaseHTTPMiddleware):
    """Optionally enforce API key authentication using a static header."""

    def __init__(self, app, settings: Settings) -> None:  # type: ignore[override]
        super().__init__(app)
        self._settings = settings

    async def dispatch(self, request: Request, call_next: Callable[[Request], Awaitable[Response]]) -> Response:
        api_key = self._settings.api_key
        if not api_key:
            return await call_next(request)

        provided = request.headers.get("X-API-Key")
        if provided != api_key:
            return JSONResponse(status_code=401, content=error_response(Exception("Unauthorized")))

        return await call_next(request)


__all__ = ["RequestIdMiddleware", "LoggingMiddleware", "APIKeyMiddleware"]
