"""Schemas describing invoke operations for the Agents Hub."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field, model_validator


class ConfigMetadata(BaseModel):
    """Metadata supplied together with an invocation request."""

    model_config = ConfigDict(populate_by_name=True)

    request_id: str | None = Field(default=None, alias="requestId", description="Unique identifier for the request")
    caller: str | None = Field(default=None, description="Identifier of the component issuing the call")
    trace_id: str | None = Field(default=None, alias="traceId", description="Optional trace correlation id")


class InvokeConfig(BaseModel):
    """Optional configuration that augments an invocation."""

    model_config = ConfigDict(extra="allow")

    metadata: ConfigMetadata | None = Field(default=None, description="Request metadata information")
    parameters: dict[str, Any] | None = Field(default=None, description="Additional parameters forwarded to the agent")


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
        return self
