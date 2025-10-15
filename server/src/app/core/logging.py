"""Structured logging utilities built on top of :mod:`structlog`."""

from __future__ import annotations

import logging
import sys
from typing import Any

import structlog
from structlog.contextvars import clear_contextvars, merge_contextvars

from .settings import get_settings

_DEFAULT_OPTIONAL_FIELDS: tuple[str, ...] = (
    "request_id",
    "path",
    "method",
    "status_code",
    "duration_ms",
    "agent",
)

_LOGGING_CONFIGURED = False


def _resolve_level(level: str | int) -> int:
    if isinstance(level, int):
        return level
    normalized = level.upper()
    value = logging.getLevelName(normalized)
    if isinstance(value, int):
        return value
    raise ValueError(f"Invalid log level: {level!r}")


def _add_optional_fields(_: Any, __: str, event_dict: dict[str, Any]) -> dict[str, Any]:
    for field in _DEFAULT_OPTIONAL_FIELDS:
        event_dict.setdefault(field, None)
    return event_dict


def configure_logging(level: str | int | None = None) -> None:
    """Configure structlog with JSON output and shared context."""

    global _LOGGING_CONFIGURED
    if _LOGGING_CONFIGURED:
        return

    level_value = _resolve_level(level or get_settings().log_level)

    logging.basicConfig(format="%(message)s", level=level_value, stream=sys.stdout)

    structlog.configure(
        cache_logger_on_first_use=True,
        wrapper_class=structlog.make_filtering_bound_logger(level_value),
        logger_factory=structlog.PrintLoggerFactory(file=sys.stdout),
        processors=[
            merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso", key="timestamp"),
            structlog.processors.EventRenamer("message"),
            _add_optional_fields,
            structlog.processors.dict_tracebacks,
            structlog.processors.JSONRenderer(),
        ],
    )

    _LOGGING_CONFIGURED = True


configure_logging()


def get_logger(name: str) -> structlog.stdlib.BoundLogger:
    """Return a structured logger bound to ``name``."""

    configure_logging()
    return structlog.get_logger(name)


request_logger = get_logger("app.request")

__all__ = [
    "configure_logging",
    "get_logger",
    "request_logger",
]
