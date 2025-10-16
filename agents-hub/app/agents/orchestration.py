"""Lightweight orchestration layer shared by the in-repo sample agents.

The orchestration primitives are intentionally self contained so that the
project does not depend on external workflow libraries while still providing a
LangGraph-inspired programming model.  Each agent wires a small directed graph
with the following responsibilities:

* intake / validation of requests
* routing and FinOps aware model selection
* guarded execution with retry support
* human-in-the-loop (HITL) checkpoints
* post-processing of the tool results

The helpers defined here are purposely conservative – they provide deterministic
behaviour that is easy to exercise in unit tests and make use of the manifest
policies without introducing network side effects.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Callable, Iterable, Mapping, MutableMapping
from uuid import uuid4
import json

from app.schemas.manifest import (
    AgentManifest,
    FinOpsAdaptiveBudget,
    FinOpsBudget,
    FinOpsConfig,
    HitlCheckpoint,
    ObservabilityConfig,
    RoutingConfig,
    RoutingTier,
)
from app.schemas.manifest import RoutingTier as RoutingTierEnum
from app.schemas.manifest import ModelConfig
from app.schemas.invoke import _expand_hierarchical_overrides


class OrchestrationError(RuntimeError):
    """Base error used by the orchestration helpers."""


class ContentPolicyViolation(OrchestrationError):
    """Raised when a payload conflicts with safety policies."""


class HitlApprovalMissing(OrchestrationError):
    """Raised when a required human-in-the-loop checkpoint blocks progress."""


class FinOpsBudgetExceeded(OrchestrationError):
    """Raised when a budget cannot accommodate additional spend."""


@dataclass(slots=True)
class NodeResult:
    """Result emitted by a graph node."""

    next_node: str | None


@dataclass(slots=True)
class ExecutionState:
    """Mutable state passed between orchestration nodes."""

    manifest: AgentManifest
    payload: dict[str, Any]
    config: dict[str, Any]
    overrides: dict[str, Any]
    parameters: dict[str, Any]
    metadata: dict[str, Any]
    reporter: "ObservabilityReporter"
    finops: "FinOpsController"
    tool_name: str | None = None
    tier: RoutingTier | str | None = None
    model_name: str | None = None
    request_id: str = ""
    timeout_seconds: int | None = None
    retries_remaining: int = 0
    max_iters: int = 1
    iteration: int = 0
    cached_result: bool = False
    result: Any = None
    should_stop: bool = False
    degrade_reason: str | None = None
    errors: list[str] = field(default_factory=list)
    runtime_decision: FinOpsDecision | None = None


@dataclass(slots=True)
class FinOpsDecision:
    """Outcome produced while preparing an execution with FinOps safeguards."""

    tier: RoutingTier | str | None
    cost: float
    cache_key: str | None = None
    cached_result: Any | None = None
    use_cache: bool = False
    degraded: bool = False
    degrade_reason: str | None = None


class ObservabilityReporter:
    """Captures trace, metric and evaluation events for assertions in tests."""

    def __init__(self, config: ObservabilityConfig | None) -> None:
        self._config = config
        self._request_id: str | None = None
        self._events: list[dict[str, Any]] = []

    def attach_request(self, request_id: str) -> None:
        self._request_id = request_id

    @property
    def events(self) -> list[dict[str, Any]]:
        return list(self._events)

    def _record(self, kind: str, name: str, payload: Mapping[str, Any] | None = None) -> None:
        entry = {
            "kind": kind,
            "name": name,
            "request_id": self._request_id,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "payload": dict(payload or {}),
        }
        self._events.append(entry)

    def emit_trace(self, name: str, payload: Mapping[str, Any] | None = None) -> None:
        tracing_enabled = bool(self._config and self._config.tracing and self._config.tracing.enabled)
        if tracing_enabled:
            self._record("trace", name, payload)

    def emit_metric(self, name: str, value: float, payload: Mapping[str, Any] | None = None) -> None:
        metrics_enabled = bool(self._config and self._config.metrics and getattr(self._config.metrics, "enabled", False))
        if metrics_enabled:
            metric_payload = {"value": value}
            metric_payload.update(dict(payload or {}))
            self._record("metric", name, metric_payload)

    def emit_eval(self, name: str, payload: Mapping[str, Any] | None = None) -> None:
        # Evaluation hooks piggy back on logging support; if observability is not
        # configured we still record the event so tests can assert on behaviour.
        self._record("eval", name, payload)


class FinOpsController:
    """Per-agent FinOps manager handling tiers, budgets and caching."""

    def __init__(self, finops: FinOpsConfig | None, routing: RoutingConfig | None) -> None:
        self._config = finops
        self._routing = routing
        self._session_usage: MutableMapping[tuple[str, str], float] = {}
        self._cache: MutableMapping[str, dict[str, Any]] = {}

    # ------------------------------------------------------------------
    # Cache helpers
    # ------------------------------------------------------------------
    @staticmethod
    def _build_cache_key(tool: str, payload: Mapping[str, Any], tier: RoutingTier | str | None) -> str:
        payload_key = json.dumps(payload, sort_keys=True, default=str)
        tier_value = tier.value if isinstance(tier, RoutingTierEnum) else tier
        return json.dumps({"tool": tool, "payload": payload_key, "tier": tier_value}, sort_keys=True)

    def get_cached(self, cache_key: str) -> dict[str, Any] | None:
        return self._cache.get(cache_key)

    def store_cached(self, cache_key: str, tier: RoutingTier | str | None, result: Any) -> None:
        self._cache[cache_key] = {"tier": tier, "result": result}

    # ------------------------------------------------------------------
    # Budget helpers
    # ------------------------------------------------------------------
    def _session_id(self, parameters: Mapping[str, Any], metadata: Mapping[str, Any]) -> str:
        return str(parameters.get("session_id") or metadata.get("session") or metadata.get("caller") or "default")

    def _determine_cost(self, tier: RoutingTier | str, parameters: Mapping[str, Any], overrides: Mapping[str, Any]) -> float:
        tier_key = tier.value if isinstance(tier, RoutingTierEnum) else str(tier)
        cost_overrides = overrides.get("finops", {}).get("cost", {}) if isinstance(overrides.get("finops"), Mapping) else {}
        if isinstance(cost_overrides, Mapping):
            override_value = cost_overrides.get(tier_key)
            if override_value is not None:
                try:
                    return float(override_value)
                except (TypeError, ValueError):  # pragma: no cover - defensive guard
                    pass

        for candidate_key in ("estimated_cost", "cost"):
            candidate = parameters.get(candidate_key)
            if candidate is not None:
                try:
                    return float(candidate)
                except (TypeError, ValueError):
                    continue

        return 1.0

    def _has_budget(self, session_id: str, tier: RoutingTier | str, cost: float) -> bool:
        if not self._config:
            return True

        tier_key = tier.value if isinstance(tier, RoutingTierEnum) else str(tier)
        budget = (
            self._config.budgets.get(tier_key)
            if isinstance(self._config.budgets, Mapping)
            else None
        )
        if budget is None:
            return True

        effective_amount = self._effective_budget_amount(session_id, tier_key, budget)
        current = self._session_usage.get((session_id, tier_key), 0.0)
        return current + cost <= effective_amount

    def _reserve(self, session_id: str, tier: RoutingTier | str, cost: float) -> None:
        tier_key = tier.value if isinstance(tier, RoutingTierEnum) else str(tier)
        current = self._session_usage.get((session_id, tier_key), 0.0)
        self._session_usage[(session_id, tier_key)] = current + cost

    def _effective_budget_amount(
        self, session_id: str, tier_key: str, budget: FinOpsBudget
    ) -> float:
        amount = max(float(budget.amount), 0.0)
        adaptive = getattr(budget, "adaptive", None)
        if not isinstance(adaptive, FinOpsAdaptiveBudget) or not adaptive.enabled:
            return amount

        current = self._session_usage.get((session_id, tier_key), 0.0)
        adjustment = 0.0
        target = adaptive.target_utilization

        if amount > 0 and adaptive.cost_weight > 0:
            utilisation = current / amount
            if utilisation > target:
                adjustment -= min(
                    adaptive.max_decrease_pct,
                    (utilisation - target) * adaptive.cost_weight,
                )
            elif utilisation < target:
                adjustment += min(
                    adaptive.max_increase_pct,
                    (target - utilisation) * adaptive.cost_weight,
                )

        cost_samples, latency_samples = self._ab_metrics(tier_key)
        if amount > 0 and cost_samples and adaptive.cost_weight > 0:
            avg_cost = sum(cost_samples) / len(cost_samples)
            cost_ratio = avg_cost / amount
            delta = cost_ratio - target
            if delta > 0:
                adjustment -= min(
                    adaptive.max_decrease_pct,
                    delta * adaptive.cost_weight,
                )
            elif delta < 0:
                adjustment += min(
                    adaptive.max_increase_pct,
                    abs(delta) * adaptive.cost_weight,
                )

        if (
            adaptive.latency_weight > 0
            and adaptive.latency_threshold_ms
            and latency_samples
        ):
            threshold = max(adaptive.latency_threshold_ms, 1.0)
            avg_latency = sum(latency_samples) / len(latency_samples)
            latency_delta = (avg_latency - threshold) / threshold
            if latency_delta > 0:
                adjustment -= min(
                    adaptive.max_decrease_pct,
                    latency_delta * adaptive.latency_weight,
                )
            elif latency_delta < 0:
                adjustment += min(
                    adaptive.max_increase_pct,
                    abs(latency_delta) * adaptive.latency_weight,
                )

        adjustment = max(-adaptive.max_decrease_pct, min(adjustment, adaptive.max_increase_pct))
        effective = amount * (1.0 + adjustment)

        if adaptive.min_amount is not None:
            effective = max(adaptive.min_amount, effective)
        if adaptive.max_amount is not None:
            effective = min(adaptive.max_amount, effective)

        return max(effective, 0.0)

    def _ab_metrics(self, tier_key: str) -> tuple[list[float], list[float]]:
        if not self._config or not isinstance(self._config.ab_history, Iterable):
            return [], []

        cost_samples: list[float] = []
        latency_samples: list[float] = []
        for experiment in self._config.ab_history:
            lane = getattr(experiment, "lane", None)
            lane_key = None
            if isinstance(lane, RoutingTierEnum):
                lane_key = lane.value
            elif isinstance(lane, str):
                lane_key = lane
            if lane_key and lane_key != tier_key:
                continue
            for variant in getattr(experiment, "variants", []) or []:
                cost = getattr(variant, "cost_per_request", None)
                latency = getattr(variant, "latency_p95_ms", None)
                if cost is not None:
                    try:
                        cost_samples.append(float(cost))
                    except (TypeError, ValueError):  # pragma: no cover - defensive
                        continue
                if latency is not None:
                    try:
                        latency_samples.append(float(latency))
                    except (TypeError, ValueError):  # pragma: no cover - defensive
                        continue
        return cost_samples, latency_samples

    # ------------------------------------------------------------------
    # Tier selection
    # ------------------------------------------------------------------
    def prepare_execution(
        self,
        *,
        tool_name: str,
        payload: Mapping[str, Any],
        candidate_tiers: Iterable[RoutingTier | str],
        overrides: Mapping[str, Any],
        parameters: Mapping[str, Any],
        metadata: Mapping[str, Any],
        reporter: ObservabilityReporter,
    ) -> FinOpsDecision:
        cache_cfg = overrides.get("finops", {}).get("cache") if isinstance(overrides.get("finops"), Mapping) else None
        cache_enabled = bool(isinstance(cache_cfg, Mapping) and cache_cfg.get("enabled"))

        candidate_order: list[RoutingTier | str] = []
        seen: set[str] = set()
        for tier in candidate_tiers:
            if tier is None:
                continue
            tier_key = tier.value if isinstance(tier, RoutingTierEnum) else str(tier)
            if tier_key in seen:
                continue
            candidate_order.append(tier)
            seen.add(tier_key)

        if not candidate_order:
            return FinOpsDecision(tier=None, cost=0.0, degraded=True, degrade_reason="no_available_tiers")

        session_id = self._session_id(parameters, metadata)
        for tier in candidate_order:
            cost = self._determine_cost(tier, parameters, overrides)
            tier_key = tier.value if isinstance(tier, RoutingTierEnum) else str(tier)
            cache_key = None
            if cache_enabled:
                cache_key = self._build_cache_key(tool_name, payload, tier)
                cached = self.get_cached(cache_key)
                if cached is not None:
                    reporter.emit_metric("finops.cache.hit", 1.0, {"tier": tier_key})
                    return FinOpsDecision(
                        tier=cached.get("tier"),
                        cost=0.0,
                        cache_key=cache_key,
                        cached_result=cached.get("result"),
                        use_cache=True,
                    )

            if self._has_budget(session_id, tier, cost):
                self._reserve(session_id, tier, cost)
                reporter.emit_metric("finops.budget.reserve", cost, {"tier": tier_key, "session": session_id})
                return FinOpsDecision(tier=tier, cost=cost, cache_key=cache_key)

        degrade_cfg = overrides.get("finops", {}).get("graceful_degradation") if isinstance(overrides.get("finops"), Mapping) else None
        strategy = "fallback" if not isinstance(degrade_cfg, Mapping) else str(degrade_cfg.get("strategy", "fallback"))

        if strategy == "fallback" and self._routing and self._routing.fallback_tier:
            fallback = self._routing.fallback_tier
            if fallback not in candidate_order:
                fallback_cost = self._determine_cost(fallback, parameters, overrides)
                cache_key = None
                if cache_enabled:
                    cache_key = self._build_cache_key(tool_name, payload, fallback)
                    cached = self.get_cached(cache_key)
                    if cached is not None:
                        reporter.emit_metric("finops.cache.hit", 1.0, {"tier": fallback.value})
                        return FinOpsDecision(
                            tier=cached.get("tier"),
                            cost=0.0,
                            cache_key=cache_key,
                            cached_result=cached.get("result"),
                            use_cache=True,
                        )
                session_id = self._session_id(parameters, metadata)
                if self._has_budget(session_id, fallback, fallback_cost):
                    self._reserve(session_id, fallback, fallback_cost)
                    reporter.emit_metric("finops.degrade.fallback", 1.0, {"tier": fallback.value})
                    return FinOpsDecision(tier=fallback, cost=fallback_cost, cache_key=cache_key)

        reporter.emit_metric("finops.degrade.triggered", 1.0, {})
        return FinOpsDecision(tier=None, cost=0.0, degraded=True, degrade_reason="budget_exhausted")

    def snapshot(self) -> dict[str, Any]:
        """Provide an immutable snapshot for tests."""

        usage = {
            f"{session}:{tier}": value
            for (session, tier), value in self._session_usage.items()
        }
        budgets: dict[str, dict[str, Any]] = {}
        if self._config and isinstance(self._config.budgets, Mapping):
            for tier_key, budget in self._config.budgets.items():
                if not isinstance(budget, FinOpsBudget):
                    continue
                resolved_tier = (
                    tier_key.value if isinstance(tier_key, RoutingTierEnum) else str(tier_key)
                )
                budgets[resolved_tier] = {
                    "configured": float(budget.amount),
                    "effective": self._effective_budget_amount(
                        "__snapshot__", resolved_tier, budget
                    ),
                    "adaptive_enabled": bool(
                        isinstance(budget.adaptive, FinOpsAdaptiveBudget)
                        and budget.adaptive.enabled
                    ),
                }

        return {"usage": usage, "cache_size": len(self._cache), "budgets": budgets}


class OrchestrationGraph:
    """Minimal graph executor that wires together strongly typed nodes."""

    def __init__(self, nodes: Mapping[str, Callable[[ExecutionState], NodeResult]], start: str) -> None:
        self._nodes = dict(nodes)
        self._start = start

    def run(self, state: ExecutionState) -> ExecutionState:
        current = self._start
        while current:
            node = self._nodes[current]
            result = node(state)
            if state.should_stop:
                break
            current = result.next_node
        return state


class GraphBackedAgent:
    """Base class implementing the orchestration boilerplate for agents."""

    def __init__(self, manifest: AgentManifest) -> None:
        self.manifest = manifest
        self._reporter = ObservabilityReporter(manifest.observability)
        self._finops = FinOpsController(manifest.finops, manifest.routing)
        self._graph = OrchestrationGraph(
            {
                "intake": self._intake_node,
                "validate": self._validation_node,
                "route": self._routing_node,
                "execute": self._execution_node,
                "hitl": self._hitl_node,
                "post": self._post_process_node,
            },
            start="intake",
        )

    # ------------------------------------------------------------------
    # Public surface
    # ------------------------------------------------------------------
    def invoke(self, payload: Mapping[str, Any] | None = None, config: Mapping[str, Any] | None = None) -> Any:
        payload_dict = dict(payload or {})
        config_dict = self._normalise_config(config)
        overrides = dict(config_dict.get("overrides", {}))
        parameters = dict(config_dict.get("parameters", {}))
        metadata = dict(config_dict.get("metadata", {}))
        request_id = str(metadata.get("requestId") or metadata.get("request_id") or uuid4())
        metadata.setdefault("requestId", request_id)
        metadata.setdefault("request_id", request_id)
        self._reporter.attach_request(request_id)

        state = ExecutionState(
            manifest=self.manifest,
            payload=payload_dict,
            config=config_dict,
            overrides=overrides,
            parameters=parameters,
            metadata=metadata,
            reporter=self._reporter,
            finops=self._finops,
            request_id=request_id,
        )

        final_state = self._graph.run(state)
        return final_state.result

    @property
    def telemetry(self) -> list[dict[str, Any]]:
        return self._reporter.events

    @property
    def finops_snapshot(self) -> dict[str, Any]:
        return self._finops.snapshot()

    # ------------------------------------------------------------------
    # Hooks expected to be overridden by subclasses
    # ------------------------------------------------------------------
    def _default_tool_name(self) -> str:
        if self.manifest.tools:
            return self.manifest.tools[0].name
        return "default"

    def _execute_tool(self, state: ExecutionState) -> Any:  # pragma: no cover - to be implemented
        raise NotImplementedError

    def _post_process(self, state: ExecutionState) -> Any:
        return state.result

    def _degraded_payload(self, reason: str) -> Any:
        return {"status": "degraded", "reason": reason}

    def _hitl_blocked_payload(self, checkpoint: HitlCheckpoint) -> Any:
        return {
            "status": "hitl_blocked",
            "checkpoint": checkpoint.name,
            "reason": checkpoint.description or "Manual approval required",
        }

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------
    def _normalise_config(self, config: Mapping[str, Any] | None) -> dict[str, Any]:
        if config is None:
            return {"metadata": {}, "parameters": {}, "overrides": {}}
        if hasattr(config, "model_dump"):
            return config.model_dump(mode="json", by_alias=True)  # type: ignore[no-any-return]
        data = dict(config)
        overrides = data.get("overrides")
        if isinstance(overrides, Mapping):
            data["overrides"] = _expand_hierarchical_overrides(dict(overrides))
        else:
            data["overrides"] = {}
        data.setdefault("metadata", {})
        data.setdefault("parameters", {})
        return data

    # ------------------------------------------------------------------
    # Graph node implementations
    # ------------------------------------------------------------------
    def _intake_node(self, state: ExecutionState) -> NodeResult:
        state.reporter.emit_metric("node.intake", 1.0, {"request_id": state.request_id})
        return NodeResult(next_node="validate")

    def _validation_node(self, state: ExecutionState) -> NodeResult:
        tool_name = state.overrides.get("tool") or state.overrides.get("tool_name")
        if not isinstance(tool_name, str):
            tool_name = self._default_tool_name()
        state.tool_name = tool_name

        try:
            self.manifest.validate_payload(tool_name, dict(state.payload))
        except Exception as exc:  # pragma: no cover - delegated to schema validation
            state.should_stop = True
            state.result = self._degraded_payload(f"validation_failed: {exc}")
            return NodeResult(next_node=None)

        if self.manifest.policies and self.manifest.policies.safety:
            blocked = set(self.manifest.policies.safety.blocked_categories or [])
            query_blob = json.dumps(state.payload, default=str).casefold()
            for term in blocked:
                if term and term.casefold() in query_blob:
                    state.should_stop = True
                    state.result = self._degraded_payload("content_policy_violation")
                    return NodeResult(next_node=None)

        routing = self.manifest.routing or RoutingConfig()
        routing_overrides = state.overrides.get("routing") if isinstance(state.overrides.get("routing"), Mapping) else None
        if isinstance(routing_overrides, Mapping):
            attempts = int(routing_overrides.get("retries", routing.max_attempts))
            state.max_iters = int(routing_overrides.get("max_iters", routing.max_iters))
            state.timeout_seconds = int(routing_overrides.get("timeout_seconds", routing.request_timeout_seconds))
        else:
            attempts = routing.max_attempts
            state.max_iters = routing.max_iters
            state.timeout_seconds = routing.request_timeout_seconds

        state.retries_remaining = max(0, attempts - 1)

        state.reporter.emit_metric("node.validation", 1.0, {"tool": tool_name})
        return NodeResult(next_node="route")

    def _routing_node(self, state: ExecutionState) -> NodeResult:
        routing = self.manifest.routing or RoutingConfig()
        allowed = routing.allowed_tiers or [routing.default_tier]
        tier_override = None
        routing_overrides = state.overrides.get("routing")
        if isinstance(routing_overrides, Mapping):
            tier_override = routing_overrides.get("tier") or routing_overrides.get("preferred_tier")

        finops_overrides = state.overrides.get("finops") if isinstance(state.overrides.get("finops"), Mapping) else {}
        preferred_tier = None
        finops_fallbacks: Iterable[Any] = []
        if isinstance(finops_overrides, Mapping):
            model_tier_cfg = finops_overrides.get("model_tiers") if isinstance(finops_overrides.get("model_tiers"), Mapping) else {}
            preferred_tier = model_tier_cfg.get("preferred") if isinstance(model_tier_cfg, Mapping) else None
            finops_fallbacks = model_tier_cfg.get("fallbacks", []) if isinstance(model_tier_cfg, Mapping) else []
        candidates: list[RoutingTier | str] = []
        allowed_values = {
            tier.value if isinstance(tier, RoutingTierEnum) else str(tier)
            for tier in (allowed or [])
        }

        def _coerce(candidate: Any) -> RoutingTier | str | None:
            if candidate is None:
                return None
            if isinstance(candidate, RoutingTierEnum):
                return candidate
            if isinstance(candidate, str):
                try:
                    return RoutingTierEnum(candidate)
                except ValueError:
                    return candidate
            return None

        ordered_candidates = list(finops_fallbacks)
        ordered_candidates.insert(0, tier_override)
        ordered_candidates.insert(0, preferred_tier)
        ordered_candidates.extend([routing.default_tier, routing.fallback_tier])

        for candidate in ordered_candidates:
            coerced = _coerce(candidate)
            if coerced is None:
                continue
            tier_key = coerced.value if isinstance(coerced, RoutingTierEnum) else str(coerced)
            if allowed_values and tier_key not in allowed_values:
                continue
            candidates.append(coerced)

        decision = state.finops.prepare_execution(
            tool_name=state.tool_name or self._default_tool_name(),
            payload=state.payload,
            candidate_tiers=candidates,
            overrides=state.overrides,
            parameters=state.parameters,
            metadata=state.metadata,
            reporter=state.reporter,
        )

        if decision.degraded:
            state.result = self._degraded_payload(decision.degrade_reason or "finops")
            state.should_stop = True
            return NodeResult(next_node=None)

        state.tier = decision.tier
        model_mapping = None
        if isinstance(finops_overrides, Mapping):
            model_mapping = finops_overrides.get("model_tiers", {}).get("mapping") if isinstance(finops_overrides.get("model_tiers"), Mapping) else None
        model_config: ModelConfig | None = self.manifest.model
        tier_key = None
        if isinstance(state.tier, RoutingTierEnum):
            tier_key = state.tier.value
        elif isinstance(state.tier, str):
            tier_key = state.tier

        if isinstance(model_mapping, Mapping) and tier_key:
            state.model_name = model_mapping.get(tier_key, None)
        elif model_config is not None and tier_key:
            state.model_name = f"{model_config.name}:{tier_key}"
        elif model_config is not None:
            state.model_name = model_config.name

        state.reporter.emit_metric(
            "node.routing",
            1.0,
            {
                "tier": tier_key or "unknown",
                "model": state.model_name or "unknown",
            },
        )

        state.runtime_decision = decision
        return NodeResult(next_node="execute")

    def _execution_node(self, state: ExecutionState) -> NodeResult:
        state.reporter.emit_metric("node.execute", 1.0, {"tier": getattr(state.tier, "value", state.tier)})
        if state.iteration >= state.max_iters:
            state.result = self._degraded_payload("max_iters_exceeded")
            state.should_stop = True
            return NodeResult(next_node=None)

        state.iteration += 1
        decision: FinOpsDecision = state.runtime_decision or FinOpsDecision(tier=state.tier, cost=0.0)

        if decision.use_cache and decision.cached_result is not None:
            state.cached_result = True
            state.result = decision.cached_result
            return NodeResult(next_node="hitl")

        attempts = state.retries_remaining + 1
        while attempts:
            try:
                state.result = self._execute_tool(state)
                if decision.cache_key:
                    state.finops.store_cached(decision.cache_key, state.tier, state.result)
                break
            except Exception as exc:  # pragma: no cover - defensive guard for subclasses
                state.errors.append(str(exc))
                attempts -= 1
                if attempts <= 0:
                    state.result = self._degraded_payload("execution_failed")
                    state.should_stop = True
                    break
                state.reporter.emit_metric("node.execute.retry", 1.0, {"remaining": attempts})

        return NodeResult(next_node=None if state.should_stop else "hitl")

    def _hitl_node(self, state: ExecutionState) -> NodeResult:
        checkpoints = list(self.manifest.hitl.checkpoints) if self.manifest.hitl else []
        if not checkpoints:
            return NodeResult(next_node="post")

        decisions = {}
        hitl_overrides = state.overrides.get("hitl")
        if isinstance(hitl_overrides, Mapping):
            decisions = hitl_overrides.get("decisions", {}) if isinstance(hitl_overrides.get("decisions"), Mapping) else {}

        for checkpoint in checkpoints:
            approved = bool(decisions.get(checkpoint.name))
            if checkpoint.required and not approved:
                state.result = self._hitl_blocked_payload(checkpoint)
                state.should_stop = True
                state.reporter.emit_metric("hitl.blocked", 1.0, {"checkpoint": checkpoint.name})
                return NodeResult(next_node=None)

        state.reporter.emit_metric("hitl.passed", 1.0, {"count": len(checkpoints)})
        return NodeResult(next_node="post")

    def _post_process_node(self, state: ExecutionState) -> NodeResult:
        state.reporter.emit_metric("node.post_process", 1.0, {})
        state.result = self._post_process(state)
        state.should_stop = True
        return NodeResult(next_node=None)


__all__ = [
    "ContentPolicyViolation",
    "ExecutionState",
    "FinOpsBudgetExceeded",
    "FinOpsController",
    "FinOpsDecision",
    "GraphBackedAgent",
    "HitlApprovalMissing",
    "NodeResult",
    "ObservabilityReporter",
    "OrchestrationError",
    "OrchestrationGraph",
]

