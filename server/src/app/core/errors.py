"""Custom exception hierarchy for the orchestration backend."""

from __future__ import annotations

from typing import Any, Mapping

ErrorDetails = Mapping[str, Any] | None


class ApplicationError(Exception):
    """Base exception carrying optional structured details."""

    def __init__(self, message: str, *, details: ErrorDetails = None) -> None:
        super().__init__(message)
        self.message = message
        self.details = dict(details or {})

    def __str__(self) -> str:  # pragma: no cover - mirrors Exception.__str__
        return self.message


class AgentRegistryError(ApplicationError):
    """Errors raised by the agent registry subsystem."""


class AgentNotFoundError(AgentRegistryError):
    """Raised when the registry cannot resolve an agent by identifier."""


class AgentManifestError(AgentRegistryError):
    """Raised when an agent manifest is invalid or missing."""


class AgentExecutionError(ApplicationError):
    """Raised when an agent process or invocation fails."""


class ValidationError(ApplicationError):
    """Raised when request payloads fail validation rules."""


def error_response(error: Exception, *, details: ErrorDetails = None) -> dict[str, Any]:
    """Normalize errors into the public API response format."""

    payload: dict[str, Any]
    if isinstance(error, ApplicationError):
        payload = dict(error.details)
        if details:
            payload.update(details)
    else:
        payload = dict(details or {})

    return {
        "error": {
            "type": error.__class__.__name__,
            "message": str(error),
            "details": payload,
        }
    }


__all__ = [
    "ApplicationError",
    "AgentRegistryError",
    "AgentNotFoundError",
    "AgentManifestError",
    "AgentExecutionError",
    "ValidationError",
    "error_response",
]
