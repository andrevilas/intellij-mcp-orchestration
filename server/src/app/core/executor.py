"""Execution helpers that enforce manifest-driven policies for agent invocations."""

from __future__ import annotations

import asyncio
import time
from copy import deepcopy
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any, Awaitable, Callable, Mapping

from jsonschema import ValidationError as JSONSchemaValidationError
from jsonschema import validate as jsonschema_validate
from structlog.stdlib import BoundLogger

if TYPE_CHECKING:  # pragma: no cover - imported for type checking only
    from agents_hub.app.schemas.manifest import AgentManifest

from .errors import (
    AgentApprovalRequiredError,
    AgentExecutionError,
    AgentRejectionError,
    ValidationError,
)


MappingLike = Mapping[str, Any]
AsyncAgentCallable = Callable[[MappingLike, MappingLike], Awaitable[Any]]


def _deep_merge(base: MappingLike, overrides: MappingLike | None) -> dict[str, Any]:
    """Recursively merge two mapping objects without mutating the inputs."""

    if overrides is None:
        return dict(base)

    merged = dict(base)
    for key, value in overrides.items():
        if (
            key in merged
            and isinstance(merged[key], Mapping)
            and isinstance(value, Mapping)
        ):
            merged[key] = _deep_merge(merged[key], value)
        else:
            merged[key] = value
    return merged


def _coerce_float(value: Any) -> float | None:
    try:
        if value is None:
            return None
        number = float(value)
        if number != number:  # NaN
            return None
        return number
    except (TypeError, ValueError):
        return None


def _coerce_percentage(value: Any, default: float) -> float:
    coerced = _coerce_float(value)
    if coerced is None:
        return default
    if coerced < 0.0:
        return 0.0
    if coerced > 1.0:
        return 1.0
    return coerced


@dataclass(slots=True)
class RetryPolicy:
    """Retry parameters used when invoking the agent."""

    max_attempts: int
    initial_delay: float
    backoff_factor: float
    max_delay: float

    def as_dict(self) -> dict[str, float | int]:
        return {
            "max_attempts": self.max_attempts,
            "initial_delay": self.initial_delay,
            "backoff_factor": self.backoff_factor,
            "max_delay": self.max_delay,
        }


@dataclass(slots=True)
class TimeoutPolicy:
    """Timeout configuration applied to agent invocations."""

    total: float | None
    per_iteration: float | None

    def as_dict(self) -> dict[str, float | None]:
        return {
            "total": self.total,
            "per_iteration": self.per_iteration,
        }


@dataclass(slots=True)
class ConfidenceThresholds:
    """Thresholds used for confidence gating and HITL escalation."""

    approval: float
    rejection: float

    def as_dict(self) -> dict[str, float]:
        return {
            "approval": self.approval,
            "rejection": self.rejection,
        }


@dataclass(slots=True)
class AgentExecutionOutcome:
    """Structured result combining agent output with execution metadata."""

    result: dict[str, Any]
    metadata: dict[str, Any]

    def as_dict(self) -> dict[str, Any]:
        return {"result": self.result, "metadata": self.metadata}


class AgentExecutor:
    """Apply manifest policies, retries, timeouts and gating to agent invocations."""

    DEFAULT_APPROVAL_THRESHOLD = 0.8
    DEFAULT_REJECTION_THRESHOLD = 0.5
    DEFAULT_INITIAL_DELAY = 0.5
    DEFAULT_BACKOFF_FACTOR = 2.0
    DEFAULT_MAX_DELAY = 8.0

    def __init__(
        self,
        *,
        manifest: AgentManifest,
        base_config: MappingLike,
        logger: BoundLogger,
    ) -> None:
        self._manifest = manifest
        self._manifest_dict = manifest.model_dump(
            mode="json", by_alias=True, exclude_none=True
        )
        self._logger = logger.bind(component="AgentExecutor", agent=manifest.name)

        self._base_config = dict(base_config)
        self._metadata = deepcopy(self._base_config.get("metadata") or {})
        self._parameters = deepcopy(self._base_config.get("parameters") or {})
        self._overrides = deepcopy(self._base_config.get("overrides") or {})

        self._effective_policies = _deep_merge(
            self._manifest_dict.get("policies", {}),
            self._overrides.get("policies"),
        )
        self._effective_finops = _deep_merge(
            self._manifest_dict.get("finops", {}),
            self._overrides.get("finops"),
        )
        self._effective_routing = _deep_merge(
            self._manifest_dict.get("routing", {}),
            self._overrides.get("routing"),
        )
        self._effective_hitl = _deep_merge(
            self._manifest_dict.get("hitl", {}),
            self._overrides.get("hitl"),
        )

        self._max_iters = int(self._effective_routing.get("max_iters", 1) or 1)
        if self._max_iters < 1:
            self._max_iters = 1

        self._retry_policy = self._build_retry_policy()
        self._timeout_policy = self._build_timeout_policy()
        self._confidence_thresholds = self._build_confidence_thresholds()
        self._response_schema = self._parameters.get("response_schema")
        if self._response_schema is not None and not isinstance(
            self._response_schema, Mapping
        ):
            raise ValidationError(
                "parameters.response_schema must be a JSON schema object"
            )

        self._logger.info(
            "agent.executor.configuration",
            policies=self._effective_policies,
            finops=self._effective_finops,
            routing=self._effective_routing,
            hitl=self._effective_hitl,
            overrides=self._overrides,
        )

    async def execute(
        self,
        payload: MappingLike,
        agent_callable: AsyncAgentCallable,
    ) -> AgentExecutionOutcome:
        """Execute an agent respecting retries, timeouts and gating rules."""

        agent_config = self._build_agent_config()
        attempts = 0
        delay = self._retry_policy.initial_delay
        start_time = time.perf_counter()

        async def _invoke_once() -> Any:
            config_copy = deepcopy(agent_config)
            if self._timeout_policy.per_iteration is None:
                return await agent_callable(payload, config_copy)
            async with asyncio.timeout(self._timeout_policy.per_iteration):
                return await agent_callable(payload, config_copy)

        async def _run_attempts() -> Any:
            nonlocal attempts, delay
            last_error: Exception | None = None
            while attempts < self._retry_policy.max_attempts:
                attempts += 1
                try:
                    return await _invoke_once()
                except AgentExecutionError:
                    raise
                except asyncio.TimeoutError as exc:
                    last_error = exc
                    self._logger.warning(
                        "agent.executor.timeout",
                        attempt=attempts,
                        per_iteration_timeout=self._timeout_policy.per_iteration,
                    )
                except Exception as exc:  # pragma: no cover - defensive
                    last_error = exc
                    self._logger.warning(
                        "agent.executor.retry",
                        attempt=attempts,
                        max_attempts=self._retry_policy.max_attempts,
                        error=str(exc),
                    )

                if attempts >= self._retry_policy.max_attempts:
                    assert last_error is not None
                    raise last_error

                await asyncio.sleep(delay)
                delay = min(delay * self._retry_policy.backoff_factor, self._retry_policy.max_delay)

            raise AgentExecutionError("Agent invocation exhausted retry attempts")

        try:
            if self._timeout_policy.total is not None:
                async with asyncio.timeout(self._timeout_policy.total):
                    raw_result = await _run_attempts()
            else:
                raw_result = await _run_attempts()
        except asyncio.TimeoutError as exc:
            raise AgentExecutionError(
                "Agent invocation exceeded configured timeout"
            ) from exc

        result_dict, confidence = self._validate_result(raw_result)

        if confidence is not None:
            gating_details = {
                "confidence": confidence,
                "thresholds": self._confidence_thresholds.as_dict(),
                "hitl": self._effective_hitl,
            }
            if confidence < self._confidence_thresholds.rejection:
                self._logger.error(
                    "agent.executor.confidence.rejected",
                    **gating_details,
                )
                raise AgentRejectionError(
                    "Agent confidence below rejection threshold",
                    details=gating_details,
                )
            if confidence < self._confidence_thresholds.approval:
                self._logger.warning(
                    "agent.executor.confidence.approval_required",
                    **gating_details,
                )
                raise AgentApprovalRequiredError(
                    "Agent output requires human approval",
                    details=gating_details,
                )

        duration_ms = (time.perf_counter() - start_time) * 1000

        iterations_value = attempts
        iterations_raw = result_dict.get("iterations")
        if isinstance(iterations_raw, (int, float)):
            try:
                iterations_value = max(1, int(iterations_raw))
            except (TypeError, ValueError):  # pragma: no cover - defensive
                iterations_value = attempts
        iterations_value = min(self._max_iters, iterations_value)

        metadata = {
            "policies": self._effective_policies,
            "finops": self._effective_finops,
            "routing": self._effective_routing,
            "hitl": self._effective_hitl,
            "overrides": self._overrides,
            "timeouts": self._timeout_policy.as_dict(),
            "retry": self._retry_policy.as_dict(),
            "confidence_thresholds": self._confidence_thresholds.as_dict(),
            "confidence": confidence,
            "iterations": iterations_value,
            "attempts": attempts,
            "duration_ms": duration_ms,
        }

        return AgentExecutionOutcome(result=result_dict, metadata=metadata)

    def _build_agent_config(self) -> dict[str, Any]:
        config = deepcopy(self._base_config)
        config["metadata"] = deepcopy(self._metadata)
        config["parameters"] = deepcopy(self._parameters)
        config["policies"] = deepcopy(self._effective_policies)
        config["finops"] = deepcopy(self._effective_finops)
        config["routing"] = deepcopy(self._effective_routing)
        config.setdefault("runtime", {})
        runtime = dict(config["runtime"])
        runtime.update(
            {
                "max_iters": self._max_iters,
                "timeouts": self._timeout_policy.as_dict(),
                "retry": self._retry_policy.as_dict(),
            }
        )
        config["runtime"] = runtime
        return config

    def _build_retry_policy(self) -> RetryPolicy:
        routing_attempts = int(self._effective_routing.get("max_attempts", 1) or 1)
        if routing_attempts < 1:
            routing_attempts = 1

        retry_overrides = (
            self._overrides.get("retry")
            if isinstance(self._overrides.get("retry"), Mapping)
            else {}
        )
        initial_delay = _coerce_float(retry_overrides.get("initial_delay")) or self.DEFAULT_INITIAL_DELAY
        backoff_factor = _coerce_float(retry_overrides.get("backoff_factor")) or self.DEFAULT_BACKOFF_FACTOR
        max_delay = _coerce_float(retry_overrides.get("max_delay")) or self.DEFAULT_MAX_DELAY

        if backoff_factor < 1.0:
            backoff_factor = 1.0

        return RetryPolicy(
            max_attempts=routing_attempts,
            initial_delay=max(0.0, initial_delay),
            backoff_factor=backoff_factor,
            max_delay=max(initial_delay, max_delay),
        )

    def _build_timeout_policy(self) -> TimeoutPolicy:
        per_iteration = _coerce_float(
            self._effective_routing.get("request_timeout_seconds")
        )

        timeout_overrides = (
            self._overrides.get("timeouts")
            if isinstance(self._overrides.get("timeouts"), Mapping)
            else {}
        )
        if timeout_overrides:
            per_iteration = _coerce_float(timeout_overrides.get("per_iteration")) or per_iteration
            total_override = _coerce_float(timeout_overrides.get("total"))
        else:
            total_override = None

        if per_iteration is not None and per_iteration <= 0:
            per_iteration = None

        total = _coerce_float(self._effective_routing.get("total_timeout_seconds"))
        if total_override is not None:
            total = total_override

        if total is None and per_iteration is not None:
            total = per_iteration * float(self._max_iters)

        if total is not None and total <= 0:
            total = None

        return TimeoutPolicy(total=total, per_iteration=per_iteration)

    def _build_confidence_thresholds(self) -> ConfidenceThresholds:
        policy_confidence = {}
        if isinstance(self._effective_policies, Mapping):
            confidence_section = self._effective_policies.get("confidence_thresholds")
            if not confidence_section:
                confidence_section = self._effective_policies.get("confidence")
            if isinstance(confidence_section, Mapping):
                policy_confidence = confidence_section

        approval = _coerce_percentage(
            policy_confidence.get("approval")
            or policy_confidence.get("auto")
            or policy_confidence.get("auto_approve"),
            self.DEFAULT_APPROVAL_THRESHOLD,
        )
        rejection = _coerce_percentage(
            policy_confidence.get("rejection")
            or policy_confidence.get("reject")
            or policy_confidence.get("manual")
            or policy_confidence.get("manual_review"),
            self.DEFAULT_REJECTION_THRESHOLD,
        )

        if rejection > approval:
            rejection = approval

        return ConfidenceThresholds(approval=approval, rejection=rejection)

    def _validate_result(self, result: Any) -> tuple[dict[str, Any], float | None]:
        if not isinstance(result, Mapping):
            raise ValidationError("Agent response must be a mapping")

        result_dict = dict(result)

        if self._response_schema is not None:
            try:
                jsonschema_validate(result_dict, self._response_schema)
            except JSONSchemaValidationError as exc:
                raise ValidationError(
                    f"Agent response failed validation against schema: {exc.message}"
                ) from exc

        confidence_raw = result_dict.get("confidence")
        if confidence_raw is None:
            return result_dict, None

        confidence = _coerce_float(confidence_raw)
        if confidence is None or not (0.0 <= confidence <= 1.0):
            raise ValidationError("Agent confidence must be a number between 0 and 1")

        result_dict["confidence"] = confidence
        return result_dict, confidence


__all__ = [
    "AgentExecutionOutcome",
    "AgentExecutor",
    "ConfidenceThresholds",
    "RetryPolicy",
    "TimeoutPolicy",
]
