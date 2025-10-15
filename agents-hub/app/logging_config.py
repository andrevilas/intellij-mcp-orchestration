"""Logging helpers for the Agents Hub service."""

from __future__ import annotations

import logging
from logging import Logger, LoggerAdapter
from typing import Any

from .config import Settings


def configure_logging(settings: Settings) -> Logger:
    """Initialise the root logger with reasonable defaults."""

    level = getattr(logging, settings.log_level.upper(), logging.INFO)
    logging.basicConfig(
        level=level,
        format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
    )

    logger = logging.getLogger("agents-hub")
    logger.setLevel(level)
    logger.debug("Logging configured", extra={"environment": settings.environment})
    return logger


def get_request_logger(default_logger: Logger, **extra: Any) -> LoggerAdapter:
    """Return a logger enriched with contextual information for the request."""

    return LoggerAdapter(default_logger, extra)


__all__ = ["configure_logging", "get_request_logger"]
