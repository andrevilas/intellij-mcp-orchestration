"""Services supporting observability configuration and insights."""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Mapping
from uuid import uuid4

from sqlalchemy import text

from .database import bootstrap_database, session_scope
from .registry import provider_registry
from .schemas import ObservabilityProviderSettings, ObservabilityProviderType
from .telemetry import TelemetryAggregates, aggregate_metrics

_PREFERENCE_KEYS: tuple[str, ...] = ("tracing", "metrics", "evals")


class ObservabilityError(ValueError):
    """Base class for observability preference errors."""


class ObservabilityProviderNotFoundError(KeyError):
    """Raised when a provider identifier cannot be resolved."""


@dataclass(frozen=True)
class ObservabilityPreferenceRecord:
    """Representation of a stored observability preference row."""

    key: str
    provider: ObservabilityProviderType
    config: dict[str, Any]
    created_at: datetime
    updated_at: datetime

    @classmethod
    def from_row(cls, row: Mapping[str, Any]) -> "ObservabilityPreferenceRecord":
        provider = ObservabilityProviderType(str(row["provider"]))
        config_raw = row.get("config") or "{}"
        try:
            config = json.loads(str(config_raw))
            if not isinstance(config, Mapping):  # pragma: no cover - defensive guard
                raise TypeError
        except (TypeError, json.JSONDecodeError):
            config = {}
        created_at = datetime.fromisoformat(str(row["created_at"]))
        updated_at = datetime.fromisoformat(str(row["updated_at"]))
        return cls(
            key=str(row["key"]),
            provider=provider,
            config=dict(config),
            created_at=created_at,
            updated_at=updated_at,
        )

    def to_settings(self) -> ObservabilityProviderSettings:
        payload = {"provider": self.provider.value, **self.config}
        return ObservabilityProviderSettings.model_validate(payload)


def _serialize_settings(settings: ObservabilityProviderSettings) -> tuple[str, str]:
    payload = settings.model_dump(exclude_none=True, mode="json")
    provider = ObservabilityProviderType(payload.pop("provider"))
    config_json = json.dumps(payload, ensure_ascii=False, sort_keys=True)
    return provider.value, config_json


def list_preferences() -> tuple[ObservabilityPreferenceRecord, ...]:
    """Return all persisted observability preferences ordered by key."""

    bootstrap_database()
    with session_scope() as session:
        rows = session.execute(
            text(
                """
                SELECT key, provider, config, created_at, updated_at
                FROM observability_preferences
                ORDER BY key
                """
            )
        ).mappings()
        return tuple(ObservabilityPreferenceRecord.from_row(row) for row in rows)


def load_preferences() -> tuple[dict[str, ObservabilityProviderSettings], datetime | None]:
    """Return a mapping of stored preferences keyed by logical area."""

    records = list_preferences()
    latest: datetime | None = None
    values: dict[str, ObservabilityProviderSettings] = {}
    for record in records:
        if latest is None or record.updated_at > latest:
            latest = record.updated_at
        values[record.key] = record.to_settings()
    return values, latest


def save_preferences(
    updates: Mapping[str, ObservabilityProviderSettings | None]
) -> tuple[dict[str, ObservabilityProviderSettings], datetime | None]:
    """Apply preference updates and return the refreshed snapshot."""

    filtered = {
        key: value
        for key, value in updates.items()
        if key in _PREFERENCE_KEYS
    }
    unknown = [key for key in updates if key not in _PREFERENCE_KEYS]
    if unknown:
        raise ObservabilityError(f"Preferências desconhecidas: {', '.join(sorted(unknown))}")

    bootstrap_database()
    now = datetime.now(tz=timezone.utc).isoformat()
    with session_scope() as session:
        for key, settings in filtered.items():
            if settings is None:
                session.execute(
                    text(
                        """
                        DELETE FROM observability_preferences
                        WHERE key = :key
                        """
                    ),
                    {"key": key},
                )
                continue

            provider_value, config_json = _serialize_settings(settings)
            session.execute(
                text(
                    """
                    INSERT INTO observability_preferences (
                        key, provider, config, created_at, updated_at
                    ) VALUES (
                        :key, :provider, :config, :created_at, :updated_at
                    )
                    ON CONFLICT(key) DO UPDATE SET
                        provider = excluded.provider,
                        config = excluded.config,
                        updated_at = excluded.updated_at
                    """
                ),
                {
                    "key": key,
                    "provider": provider_value,
                    "config": config_json,
                    "created_at": now,
                    "updated_at": now,
                },
            )

    return load_preferences()


def summarize_metrics(
    *,
    start: datetime | None = None,
    end: datetime | None = None,
    provider_id: str | None = None,
    route: str | None = None,
) -> TelemetryAggregates:
    """Aggregate telemetry metrics for observability dashboards."""

    return aggregate_metrics(
        start=start,
        end=end,
        provider_id=provider_id,
        route=route,
    )


@dataclass(frozen=True)
class EvalSuiteResult:
    """Outcome of a synthetic evaluation suite execution."""

    run_id: str
    preset_id: str
    provider_id: str | None
    status: str
    started_at: datetime
    completed_at: datetime
    evaluated_runs: int
    success_rate: float
    avg_latency_ms: float
    summary: str
    window_start: datetime | None
    window_end: datetime | None


def run_eval_suite(
    *,
    preset_id: str,
    provider_id: str | None = None,
    start: datetime | None = None,
    end: datetime | None = None,
) -> EvalSuiteResult:
    """Simulate the execution of an evaluation suite for a provider window."""

    normalized_provider: str | None
    if provider_id in (None, "", "auto"):
        normalized_provider = None
    else:
        normalized_provider = provider_id
        try:
            provider_registry.get(provider_id)
        except KeyError as exc:  # pragma: no cover - defensive pass-through
            raise ObservabilityProviderNotFoundError(provider_id) from exc

    aggregates = summarize_metrics(
        start=start,
        end=end,
        provider_id=normalized_provider,
    )

    run_identifier = f"eval-{uuid4().hex}"
    started_at = datetime.now(tz=timezone.utc)
    completed_at = started_at
    evaluated_runs = aggregates.total_runs
    success_rate = aggregates.success_rate
    avg_latency = aggregates.avg_latency_ms

    if evaluated_runs == 0:
        summary = f"Nenhuma execução encontrada para o preset “{preset_id}”."
    else:
        provider_label: str
        if normalized_provider is None:
            provider_label = "todos os providers"
        else:
            provider_label = provider_registry.get(normalized_provider).name
        success_pct = success_rate * 100.0
        summary = (
            "Preset “{preset}” avaliou {runs} execuções de {provider} "
            "com taxa de sucesso de {success:.1f}% e latência média de {latency:.0f} ms."
        ).format(
            preset=preset_id,
            runs=evaluated_runs,
            provider=provider_label,
            success=success_pct,
            latency=avg_latency,
        )

    return EvalSuiteResult(
        run_id=run_identifier,
        preset_id=preset_id,
        provider_id=normalized_provider,
        status="completed",
        started_at=started_at,
        completed_at=completed_at,
        evaluated_runs=evaluated_runs,
        success_rate=success_rate,
        avg_latency_ms=avg_latency,
        summary=summary,
        window_start=aggregates.start,
        window_end=aggregates.end,
    )


__all__ = [
    "EvalSuiteResult",
    "ObservabilityError",
    "ObservabilityPreferenceRecord",
    "ObservabilityProviderNotFoundError",
    "list_preferences",
    "load_preferences",
    "run_eval_suite",
    "save_preferences",
    "summarize_metrics",
]

