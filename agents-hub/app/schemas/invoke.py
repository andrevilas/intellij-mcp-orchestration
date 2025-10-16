"""Schemas describing invoke operations for the Agents Hub."""

from __future__ import annotations

from typing import Any
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field, model_validator


class ConfigMetadata(BaseModel):
    """Metadata supplied together with an invocation request."""

    model_config = ConfigDict(populate_by_name=True)

    request_id: str | None = Field(default=None, alias="requestId", description="Unique identifier for the request")
    caller: str | None = Field(default=None, description="Identifier of the component issuing the call")
    trace_id: str | None = Field(default=None, alias="traceId", description="Optional trace correlation id")


def _expand_hierarchical_overrides(raw: dict[str, Any]) -> dict[str, Any]:
    """Expand dotted override keys into nested dictionaries.

    Example
    -------
    ``{"finops.model_tiers.preferred": "turbo"}`` becomes
    ``{"finops": {"model_tiers": {"preferred": "turbo"}}}``.
    """

    expanded: dict[str, Any] = {}

    for key, value in raw.items():
        if not isinstance(key, str) or "." not in key:
            expanded[key] = (
                _expand_hierarchical_overrides(value)
                if isinstance(value, dict)
                else value
            )
            continue

        head, *rest = key.split(".")
        target = expanded.get(head)
        if not isinstance(target, dict):
            target = {}
        expanded[head] = target

        current = target
        for part in rest[:-1]:
            next_node = current.get(part)
            if not isinstance(next_node, dict):
                next_node = {}
            current[part] = next_node
            current = next_node

        leaf_key = rest[-1]
        current[leaf_key] = (
            _expand_hierarchical_overrides(value)
            if isinstance(value, dict)
            else value
        )

    return expanded


class InvokeConfig(BaseModel):
    """Optional configuration that augments an invocation."""

    model_config = ConfigDict(extra="allow")

    metadata: ConfigMetadata | None = Field(default=None, description="Request metadata information")
    parameters: dict[str, Any] | None = Field(default=None, description="Additional parameters forwarded to the agent")
    overrides: dict[str, Any] | None = Field(
        default=None,
        description="Hierarchical overrides applied to manifest-driven configuration",
    )

    @model_validator(mode="after")
    def _normalise_overrides(self) -> "InvokeConfig":
        """Convert dotted override keys into nested dictionaries."""

        if self.overrides is None:
            self.overrides = {}
            return self

        self.overrides = _expand_hierarchical_overrides(dict(self.overrides))
        return self


class InvokeRequest(BaseModel):
    """Payload accepted by the invoke endpoint."""

    input: dict[str, Any] | None = Field(default=None, description="Optional structured payload passed to the tool")
    config: InvokeConfig | None = Field(default=None, description="Invocation configuration overrides")

    @model_validator(mode="after")
    def _ensure_defaults(self) -> "InvokeRequest":
        """Normalise optional fields so downstream handlers can rely on dictionaries."""

        if self.input is None:
            self.input = {}
        if self.config is None:
            self.config = InvokeConfig()
        if self.config.parameters is None:
            self.config.parameters = {}
        if self.config.overrides is None:
            self.config.overrides = {}
        if self.config.metadata is None:
            self.config.metadata = ConfigMetadata(request_id=str(uuid4()))
        elif not self.config.metadata.request_id:
            self.config.metadata.request_id = str(uuid4())
        return self
