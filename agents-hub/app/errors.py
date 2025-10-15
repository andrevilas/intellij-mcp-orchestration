"""Custom exception types and helpers for API error responses."""

from __future__ import annotations

from typing import Any, Mapping


ErrorDetails = Mapping[str, Any] | None


class ApplicationError(Exception):
    """Base exception carrying optional structured details."""

    def __init__(self, message: str, *, details: ErrorDetails = None) -> None:
        super().__init__(message)
        self.message = message
        self.details = dict(details or {})

    def __str__(self) -> str:  # pragma: no cover - mirrors ``Exception.__str__``
        return self.message


class AgentRegistryError(ApplicationError):
    """Base class for registry related failures."""


class AgentNotFoundError(AgentRegistryError):
    """Raised when an agent cannot be resolved by name."""


class AgentManifestError(AgentRegistryError):
    """Raised when an agent manifest cannot be loaded or parsed."""


class AgentExecutionError(ApplicationError):
    """Raised when invoking an agent fails."""


class ValidationError(ApplicationError):
    """Raised when a payload does not match expectations."""


def error_response(error: Exception, *, details: ErrorDetails = None) -> dict[str, Any]:
    """Normalise errors into the public API response format."""

    payload: dict[str, Any] = {}
    if isinstance(error, ApplicationError):
        payload.update(error.details)
    if details:
        payload.update(details)

    response: dict[str, Any] = {
        "status": "error",
        "error": str(error),
    }
    if payload:
        response["details"] = payload
    return response


__all__ = [
    "ApplicationError",
    "AgentRegistryError",
    "AgentNotFoundError",
    "AgentManifestError",
    "AgentExecutionError",
    "ValidationError",
    "error_response",
]
