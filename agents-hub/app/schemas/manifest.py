"""Pydantic models describing the Agents Hub manifest format."""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import Any, Iterable

import yaml
from jsonschema import validate as jsonschema_validate
from jsonschema.exceptions import ValidationError as JSONSchemaValidationError
from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator


class ToolSchema(BaseModel):
    """Representation of a tool invocation JSON schema."""

    model_config = ConfigDict(extra="allow", populate_by_name=True)

    type: str | None = Field(default="object", description="JSON schema type of the payload")
    title: str | None = None
    description: str | None = None
    properties: dict[str, Any] = Field(default_factory=dict)
    required: list[str] = Field(default_factory=list)


class ToolSLO(BaseModel):
    """Service level objectives associated with a tool."""

    model_config = ConfigDict(extra="forbid")

    latency_p95_ms: int = Field(
        ..., ge=1, description="Maximum p95 latency expected when invoking the tool, in milliseconds"
    )
    success_rate: float = Field(
        ..., ge=0.0, le=1.0, description="Expected success rate expressed as a decimal between 0 and 1"
    )
    max_error_rate: float = Field(
        0.01,
        ge=0.0,
        le=1.0,
        description="Maximum tolerated error rate (1 - success rate) expressed as a decimal",
    )


class ToolConfig(BaseModel):
    """Configuration for a tool exposed by an agent."""

    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    name: str
    description: str | None = None
    schema_: ToolSchema | None = Field(
        default=None,
        alias="schema",
        serialization_alias="schema",
        description="JSON schema describing the tool input",
    )
    slo: ToolSLO | None = Field(default=None, description="Service level objectives for the tool")

    @model_validator(mode="before")
    @classmethod
    def _normalise_schema_aliases(cls, values: Any) -> Any:
        """Accept alternative field names used in manifests."""

        if isinstance(values, dict):
            if "schema" not in values and "schema_" not in values:
                for candidate in ("input_schema", "inputSchema", "parameters", "arguments_schema"):
                    if candidate in values:
                        values["schema"] = values.pop(candidate)
                        break
        return values

    @property
    def schema(self) -> ToolSchema | None:
        """Return the JSON schema associated with the tool."""

        return self.schema_


class ModelConfig(BaseModel):
    """Model configuration for the agent runtime."""

    model_config = ConfigDict(extra="allow")

    provider: str | None = Field(default=None, description="Provider of the model (e.g. openai)")
    name: str | None = Field(default=None, description="Model identifier")
    parameters: dict[str, Any] = Field(default_factory=dict, description="Additional model parameters")


class RateLimitConfig(BaseModel):
    """Rate limit policies applied to the agent."""

    model_config = ConfigDict(extra="forbid")

    requests_per_minute: int | None = Field(
        default=None,
        ge=1,
        description="Maximum number of invocations allowed per minute",
    )
    burst: int | None = Field(
        default=None,
        ge=1,
        description="Allowed burst size above the sustained rate limit",
    )
    concurrent_requests: int | None = Field(
        default=None,
        ge=1,
        description="Maximum number of concurrent invocations allowed",
    )


class SafetyMode(str, Enum):
    """Supported safety policy modes."""

    STRICT = "strict"
    BALANCED = "balanced"
    PERMISSIVE = "permissive"


class SafetyConfig(BaseModel):
    """Safety policy configuration."""

    model_config = ConfigDict(extra="forbid")

    mode: SafetyMode = Field(default=SafetyMode.BALANCED, description="Safety enforcement mode")
    blocked_categories: list[str] = Field(
        default_factory=list,
        description="List of categories that must always be blocked",
    )
    allow_list: list[str] = Field(
        default_factory=list,
        description="List of identifiers explicitly allowed by policy",
    )


class BudgetPeriod(str, Enum):
    """Valid periods for financial budget calculations."""

    DAILY = "daily"
    WEEKLY = "weekly"
    MONTHLY = "monthly"


class BudgetConfig(BaseModel):
    """Budget policy configuration."""

    model_config = ConfigDict(extra="forbid")

    currency: str = Field(default="USD", description="Currency code used for the budget")
    limit: float = Field(
        default=0.0,
        ge=0.0,
        description="Maximum spend allowed within the specified period",
    )
    period: BudgetPeriod = Field(
        default=BudgetPeriod.MONTHLY,
        description="Period over which the budget limit applies",
    )


class PoliciesConfig(BaseModel):
    """Policy configuration applied to an agent."""

    model_config = ConfigDict(extra="forbid")

    rate_limits: RateLimitConfig | None = Field(
        default=None, description="Optional rate limit policies applied to the agent"
    )
    safety: SafetyConfig | None = Field(default=None, description="Optional safety policies")
    budget: BudgetConfig | None = Field(default=None, description="Optional budget policies")


class RoutingTier(str, Enum):
    """Available routing tiers."""

    ECONOMY = "economy"
    BALANCED = "balanced"
    TURBO = "turbo"


class RoutingConfig(BaseModel):
    """Routing behaviour tuning for the agent."""

    model_config = ConfigDict(extra="forbid")

    default_tier: RoutingTier = Field(
        default=RoutingTier.BALANCED, description="Tier used when the caller does not specify overrides"
    )
    allowed_tiers: list[RoutingTier] = Field(
        default_factory=lambda: [RoutingTier.BALANCED],
        min_length=1,
        description="Tiers that can be targeted when invoking the agent",
    )
    fallback_tier: RoutingTier | None = Field(
        default=None,
        description="Tier to fall back to when the preferred tier is unavailable",
    )
    max_attempts: int = Field(
        default=1,
        ge=1,
        description="Maximum number of retries allowed when routing fails",
    )
    max_iters: int = Field(
        default=6,
        ge=1,
        description="Maximum number of tool iteration loops allowed during execution",
    )
    max_parallel_requests: int = Field(
        default=1,
        ge=1,
        description="Maximum number of concurrent tool calls per invocation",
    )
    request_timeout_seconds: int = Field(
        default=30,
        ge=1,
        description="Timeout applied to each routed tool invocation in seconds",
    )

    @model_validator(mode="after")
    def _validate_tiers(self) -> "RoutingConfig":
        if self.fallback_tier and self.fallback_tier not in self.allowed_tiers:
            raise ValueError("fallback_tier must be present in allowed_tiers when provided")
        if self.default_tier not in self.allowed_tiers:
            raise ValueError("default_tier must be present in allowed_tiers")
        return self


class FinOpsAlertChannel(str, Enum):
    """Supported alerting channels for FinOps notifications."""

    EMAIL = "email"
    SLACK = "slack"
    PAGERDUTY = "pagerduty"


class FinOpsAlert(BaseModel):
    """Alert threshold used by FinOps monitoring."""

    model_config = ConfigDict(extra="forbid")

    threshold: float = Field(
        ..., ge=0.0, le=1.0, description="Utilisation threshold expressed as a decimal between 0 and 1"
    )
    channel: FinOpsAlertChannel = Field(
        default=FinOpsAlertChannel.SLACK,
        description="Channel used when the threshold is breached",
    )


class FinOpsAdaptiveBudget(BaseModel):
    """Adaptive settings that can automatically resize a budget allocation."""

    model_config = ConfigDict(extra="forbid")

    enabled: bool = Field(default=False, description="Whether adaptive tuning is enabled")
    target_utilization: float = Field(
        default=0.7,
        ge=0.0,
        le=1.0,
        description="Desired utilisation ratio used as the steady state target",
    )
    lookback_days: int = Field(
        default=7,
        ge=1,
        le=90,
        description="Window, in days, used when analysing telemetry to adjust the budget",
    )
    max_increase_pct: float = Field(
        default=0.25,
        ge=0.0,
        le=1.0,
        description="Maximum percentage increase applied in a single adjustment",
    )
    max_decrease_pct: float = Field(
        default=0.4,
        ge=0.0,
        le=1.0,
        description="Maximum percentage decrease applied in a single adjustment",
    )
    cost_weight: float = Field(
        default=1.0,
        ge=0.0,
        le=1.0,
        description="Relative influence of cost signals when adapting the budget",
    )
    latency_weight: float = Field(
        default=0.0,
        ge=0.0,
        le=1.0,
        description="Relative influence of latency signals when adapting the budget",
    )
    latency_threshold_ms: float | None = Field(
        default=None,
        ge=0.0,
        description="Reference latency used to classify regressions when latency_weight > 0",
    )
    min_amount: float | None = Field(
        default=None,
        ge=0.0,
        description="Lower bound applied to the dynamically calculated budget",
    )
    max_amount: float | None = Field(
        default=None,
        ge=0.0,
        description="Upper bound applied to the dynamically calculated budget",
    )


class FinOpsABVariant(BaseModel):
    """Performance snapshot captured for a single A/B testing variant."""

    model_config = ConfigDict(extra="forbid")

    name: str = Field(..., description="Identifier of the tested variant")
    traffic_percentage: float = Field(
        default=0.0,
        ge=0.0,
        le=1.0,
        description="Share of traffic directed to the variant during the experiment",
    )
    cost_per_request: float | None = Field(
        default=None,
        ge=0.0,
        description="Average cost per invocation recorded for the variant",
    )
    latency_p95_ms: float | None = Field(
        default=None,
        ge=0.0,
        description="p95 latency observed for the variant in milliseconds",
    )
    is_winner: bool | None = Field(
        default=None,
        description="Flag indicating whether the variant was deemed successful",
    )


class FinOpsABExperiment(BaseModel):
    """Historical record of an A/B experiment influencing FinOps decisions."""

    model_config = ConfigDict(extra="forbid")

    id: str = Field(..., description="Identifier of the experiment")
    lane: RoutingTier | None = Field(
        default=None,
        description="Routing lane affected by the experiment, if applicable",
    )
    started_at: datetime | None = Field(
        default=None, description="Timestamp when the experiment started"
    )
    completed_at: datetime | None = Field(
        default=None, description="Timestamp when the experiment concluded"
    )
    summary: str | None = Field(
        default=None, description="Optional textual summary of the experiment"
    )
    variants: list[FinOpsABVariant] = Field(
        default_factory=list,
        description="Recorded metrics for each tested variant",
    )


class FinOpsCachePolicy(BaseModel):
    """Caching strategy applied to FinOps calculations."""

    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    ttl_seconds: int | None = Field(
        default=None,
        ge=0,
        alias="ttl_seconds",
        serialization_alias="ttl_seconds",
        description="Tempo em segundos que um resultado deve permanecer em cache",
    )

    @model_validator(mode="before")
    @classmethod
    def _coerce_aliases(cls, values: Any) -> Any:
        if isinstance(values, dict):
            if "ttl_seconds" not in values and "ttlSeconds" in values:
                values["ttl_seconds"] = values.pop("ttlSeconds")
            if "ttl_seconds" not in values and "cache_ttl" in values:
                values["ttl_seconds"] = values.pop("cache_ttl")
        elif isinstance(values, (int, float)):
            return {"ttl_seconds": values}
        return values


class FinOpsRateLimitPolicy(BaseModel):
    """Rate limit applied when executing FinOps sensitive workloads."""

    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    requests_per_minute: int | None = Field(
        default=None,
        ge=1,
        alias="requests_per_minute",
        serialization_alias="requests_per_minute",
        description="Número máximo de execuções permitidas por minuto",
    )

    @model_validator(mode="before")
    @classmethod
    def _coerce_aliases(cls, values: Any) -> Any:
        if isinstance(values, dict):
            if "requests_per_minute" not in values and "requestsPerMinute" in values:
                values["requests_per_minute"] = values.pop("requestsPerMinute")
            if "requests_per_minute" not in values and "rate_limit" in values and not isinstance(
                values.get("rate_limit"), dict
            ):
                values["requests_per_minute"] = values.pop("rate_limit")
        elif isinstance(values, (int, float)):
            return {"requests_per_minute": values}
        return values


class FinOpsGracefulDegradation(BaseModel):
    """Behaviour when FinOps policies need to degrade service quality."""

    model_config = ConfigDict(extra="forbid")

    strategy: str | None = Field(default=None, description="Estratégia aplicada ao degradar o serviço")
    message: str | None = Field(default=None, description="Mensagem informativa exibida para clientes")

    @model_validator(mode="before")
    @classmethod
    def _coerce_aliases(cls, values: Any) -> Any:
        if isinstance(values, str):
            return {"strategy": values}
        return values


class FinOpsBudget(BaseModel):
    """Budget allocation for a routing tier."""

    model_config = ConfigDict(extra="forbid")

    amount: float = Field(..., ge=0.0, description="Amount allocated to the tier")
    currency: str = Field(default="USD", description="Currency associated with the allocation")
    period: BudgetPeriod = Field(
        default=BudgetPeriod.MONTHLY,
        description="Period over which the allocation applies",
    )
    adaptive: FinOpsAdaptiveBudget | None = Field(
        default=None,
        description="Optional adaptive configuration applied to the budget",
    )


class FinOpsConfig(BaseModel):
    """Financial operations configuration for the agent."""

    model_config = ConfigDict(extra="forbid")

    cost_center: str = Field(default="default", description="Identifier of the cost centre funding the agent")
    budgets: dict[RoutingTier, FinOpsBudget] = Field(
        default_factory=dict,
        description="Budget allocations per routing tier",
    )
    alerts: list[FinOpsAlert] = Field(
        default_factory=list,
        description="Thresholds that trigger FinOps notifications",
    )
    ab_history: list[FinOpsABExperiment] = Field(
        default_factory=list,
        description="Historical A/B experiments used to inform FinOps decisions",
    )
    cache: FinOpsCachePolicy | None = Field(
        default=None,
        description="Política de cache aplicada às decisões FinOps",
    )
    rate_limit: FinOpsRateLimitPolicy | None = Field(
        default=None,
        description="Limite de requisições aplicado ao executar rotas controladas por FinOps",
    )
    graceful_degradation: FinOpsGracefulDegradation | None = Field(
        default=None,
        description="Estratégia utilizada ao degradar o serviço sob restrições de FinOps",
    )


class HitlCheckpoint(BaseModel):
    """Human-in-the-loop checkpoint definition."""

    model_config = ConfigDict(extra="forbid")

    name: str = Field(..., description="Identifier of the checkpoint")
    description: str | None = Field(default=None, description="Detailed description of the checkpoint")
    required: bool = Field(default=False, description="Whether the checkpoint must be approved to continue")
    escalation_channel: FinOpsAlertChannel | None = Field(
        default=None,
        description="Preferred channel to escalate when the checkpoint blocks execution",
    )


class HitlConfig(BaseModel):
    """Human-in-the-loop configuration for the agent."""

    model_config = ConfigDict(extra="forbid")

    checkpoints: list[HitlCheckpoint] = Field(
        default_factory=list,
        description="Ordered checkpoints that require human review",
    )


class LoggingDestination(str, Enum):
    """Supported logging destinations."""

    STDOUT = "stdout"
    STDERR = "stderr"
    FILE = "file"
    OTLP = "otlp"


class LoggingLevel(str, Enum):
    """Supported logging levels."""

    DEBUG = "debug"
    INFO = "info"
    WARNING = "warning"
    ERROR = "error"


class LoggingConfig(BaseModel):
    """Logging configuration."""

    model_config = ConfigDict(extra="forbid")

    level: LoggingLevel = Field(default=LoggingLevel.INFO, description="Minimum logging level")
    destination: LoggingDestination = Field(
        default=LoggingDestination.STDOUT,
        description="Output destination for structured logs",
    )


class MetricsExporter(str, Enum):
    """Supported metrics exporters."""

    PROMETHEUS = "prometheus"
    OTLP = "otlp"


class MetricsConfig(BaseModel):
    """Metrics emission configuration."""

    model_config = ConfigDict(extra="forbid")

    enabled: bool = Field(default=True, description="Whether metrics emission is enabled")
    exporters: list[MetricsExporter] = Field(
        default_factory=lambda: [MetricsExporter.PROMETHEUS],
        min_length=1,
        description="Metrics backends that should receive telemetry",
    )
    interval_seconds: int = Field(
        default=60,
        ge=10,
        description="Scrape or push interval in seconds",
    )


class TracingExporter(str, Enum):
    """Supported tracing exporters."""

    OTLP = "otlp"
    ZIPKIN = "zipkin"
    JAEGER = "jaeger"


class TracingConfig(BaseModel):
    """Tracing configuration."""

    model_config = ConfigDict(extra="forbid")

    enabled: bool = Field(default=False, description="Whether tracing is active")
    exporter: TracingExporter | None = Field(
        default=None, description="Tracing backend that should receive spans"
    )
    sample_rate: float = Field(
        default=0.1,
        ge=0.0,
        le=1.0,
        description="Sampling rate applied to captured spans",
    )


class ObservabilityConfig(BaseModel):
    """Observability configuration covering logging, metrics and tracing."""

    model_config = ConfigDict(extra="forbid")

    logging: LoggingConfig | None = Field(
        default=None, description="Structured logging configuration"
    )
    metrics: MetricsConfig | None = Field(default=None, description="Metrics emission configuration")
    tracing: TracingConfig | None = Field(default=None, description="Tracing configuration")


class AgentManifest(BaseModel):
    """Top level manifest definition for an agent."""

    model_config = ConfigDict(extra="forbid")

    name: str
    title: str
    version: str
    description: str | None = None
    capabilities: list[str] = Field(default_factory=list)
    tools: list[ToolConfig] = Field(default_factory=list)
    model: ModelConfig | None = None
    policies: PoliciesConfig | None = None
    routing: RoutingConfig | None = None
    finops: FinOpsConfig | None = None
    hitl: HitlConfig | None = None
    observability: ObservabilityConfig | None = None

    def _iter_tools(self) -> Iterable[ToolConfig]:
        for tool in self.tools:
            yield tool

    def get_tool(self, tool_name: str) -> ToolConfig | None:
        """Return the tool configuration matching ``tool_name`` if present."""

        return next((tool for tool in self._iter_tools() if tool.name == tool_name), None)

    def validate_payload(self, tool_name: str, payload: dict[str, Any]) -> None:
        """Validate a payload against the tool's JSON schema.

        Parameters
        ----------
        tool_name:
            Identifier of the tool as described in the manifest.
        payload:
            The JSON payload that will be sent to the tool invocation.

        Raises
        ------
        KeyError
            If the tool could not be found in the manifest.
        jsonschema.ValidationError
            If the payload does not conform to the tool schema.
        """

        tool = self.get_tool(tool_name)
        if tool is None:
            raise KeyError(f"Tool '{tool_name}' not found in manifest")

        if tool.schema is None:
            # If no schema is defined, assume any payload is acceptable.
            return

        schema_dict = tool.schema.model_dump(mode="json", by_alias=True, exclude_none=True)
        jsonschema_validate(payload, schema_dict)


MANIFEST_JSON_SCHEMA = AgentManifest.model_json_schema(mode="validation")


def load_manifest(path: Path) -> AgentManifest:
    """Load and validate an agent manifest from disk.

    Parameters
    ----------
    path:
        Directory containing ``agent.yaml`` or the manifest file itself.

    Returns
    -------
    AgentManifest
        The validated manifest instance.

    Raises
    ------
    FileNotFoundError
        If the manifest file cannot be located.
    yaml.YAMLError
        If the YAML file cannot be parsed.
    pydantic.ValidationError
        If the parsed data does not comply with :class:`AgentManifest`.
    """

    manifest_path = path / "agent.yaml" if path.is_dir() else path
    if not manifest_path.exists():
        raise FileNotFoundError(f"Manifest not found at: {manifest_path}")

    raw_content = manifest_path.read_text(encoding="utf-8")
    data = yaml.safe_load(raw_content) or {}

    if not isinstance(data, dict):
        raise ValidationError.from_exception_data(
            AgentManifest.__name__,
            [
                {
                    "type": "dict_type",
                    "loc": (),
                    "msg": "Input should be a valid dictionary",
                    "input": data,
                }
            ],
        )

    try:
        jsonschema_validate(data, MANIFEST_JSON_SCHEMA)
    except JSONSchemaValidationError as exc:
        location = tuple(exc.absolute_path) if exc.absolute_path else ()
        schema_path = " / ".join(str(part) for part in exc.absolute_schema_path)
        message = exc.message
        if schema_path:
            message = f"{message} (schema path: {schema_path})"
        raise ValidationError.from_exception_data(
            AgentManifest.__name__,
            [
                {
                    "type": "manifest_schema",
                    "loc": location,
                    "msg": message,
                    "input": exc.instance,
                }
            ],
        ) from exc

    return AgentManifest.model_validate(data)
