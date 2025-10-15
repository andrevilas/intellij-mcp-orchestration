"""Services responsible for validating stored provider secrets."""

from __future__ import annotations

import hashlib
import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from time import perf_counter
from typing import Literal

from .registry import provider_registry
from .secrets import secret_store

logger = logging.getLogger("console_mcp_server.secrets")

SecretTestStatus = Literal["healthy", "degraded", "error"]


class SecretValidationError(RuntimeError):
    """Base exception raised when a secret cannot be validated."""


class ProviderNotRegisteredError(SecretValidationError):
    """Raised when attempting to validate a secret for an unknown provider."""

    def __init__(self, provider_id: str) -> None:
        super().__init__(f"Provider '{provider_id}' not found")
        self.provider_id = provider_id


class SecretNotConfiguredError(SecretValidationError):
    """Raised when no secret is stored for the requested provider."""

    def __init__(self, provider_id: str) -> None:
        super().__init__(f"Secret for provider '{provider_id}' not found")
        self.provider_id = provider_id


@dataclass(frozen=True)
class SecretTestResult:
    """Outcome for a provider secret connectivity test."""

    provider_id: str
    status: SecretTestStatus
    latency_ms: int
    tested_at: datetime
    message: str


@dataclass(frozen=True)
class _HandshakeOutcome:
    status: SecretTestStatus
    latency_ms: int
    message: str


def test_secret(provider_id: str) -> SecretTestResult:
    """Validate the stored secret for the given provider using a deterministic mock."""

    try:
        provider = provider_registry.get(provider_id)
    except KeyError as exc:
        logger.error("Secret validation aborted: provider unavailable", exc_info=exc, extra={"provider_id": provider_id})
        raise ProviderNotRegisteredError(provider_id) from exc

    try:
        record = secret_store.get(provider_id)
    except KeyError as exc:
        logger.info(
            "Secret validation aborted: credential missing", extra={"provider_id": provider_id}
        )
        raise SecretNotConfiguredError(provider_id) from exc

    start = perf_counter()
    outcome = _simulate_handshake(provider_id=provider_id, provider_name=provider.name, secret_value=record.value)
    elapsed_ms = max(int((perf_counter() - start) * 1000), 0)
    latency_ms = max(outcome.latency_ms, elapsed_ms)
    tested_at = datetime.now(tz=timezone.utc)

    log_context = {
        "provider_id": provider_id,
        "status": outcome.status,
        "latency_ms": latency_ms,
    }
    if outcome.status == "healthy":
        logger.info("Secret validation succeeded", extra=log_context)
    elif outcome.status == "degraded":
        logger.warning("Secret validation degraded", extra=log_context)
    else:
        logger.error("Secret validation failed", extra=log_context)

    return SecretTestResult(
        provider_id=provider_id,
        status=outcome.status,
        latency_ms=latency_ms,
        tested_at=tested_at,
        message=outcome.message,
    )


def _simulate_handshake(
    *, provider_id: str, provider_name: str, secret_value: str
) -> _HandshakeOutcome:
    """Derive a deterministic handshake outcome from the stored secret."""

    digest = hashlib.sha256(f"{provider_id}:{secret_value}".encode("utf-8")).digest()
    score = int.from_bytes(digest[:2], byteorder="big") % 100
    latency_seed = int.from_bytes(digest[2:4], byteorder="big") % 600
    latency_ms = 120 + latency_seed

    if score < 65:
        status: SecretTestStatus = "healthy"
        message = f"{provider_name} respondeu ao handshake em {latency_ms} ms."
    elif score < 88:
        status = "degraded"
        message = (
            f"{provider_name} respondeu com latência elevada ({latency_ms} ms). "
            "Avalie limites de uso."
        )
    else:
        status = "error"
        message = (
            f"Falha ao validar credencial em {provider_name}. "
            "Revise permissões ou limites do provedor."
        )

    return _HandshakeOutcome(status=status, latency_ms=latency_ms, message=message)


__all__ = [
    "ProviderNotRegisteredError",
    "SecretNotConfiguredError",
    "SecretTestResult",
    "SecretValidationError",
    "SecretTestStatus",
    "test_secret",
]
