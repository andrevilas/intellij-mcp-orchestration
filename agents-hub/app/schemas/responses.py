"""Response schemas exposed by the Agents Hub API."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field

from .manifest import AgentManifest, ModelConfig, PoliciesConfig, ToolConfig


class AgentMetadata(BaseModel):
    """Summary information describing an agent."""

    name: str = Field(..., description="Internal identifier for the agent")
    title: str = Field(..., description="Human friendly display name")
    version: str = Field(..., description="Semantic version of the agent")
    description: str | None = Field(default=None, description="Detailed description of the agent")
    capabilities: list[str] = Field(default_factory=list, description="Capabilities supported by the agent")
    tools: list[ToolConfig] = Field(default_factory=list, description="Tools exposed by the agent")
    model: ModelConfig | None = Field(default=None, description="Model configuration applied to the agent")
    policies: PoliciesConfig | None = Field(default=None, description="Policy configuration applied to the agent")

    @classmethod
    def from_manifest(cls, manifest: AgentManifest) -> "AgentMetadata":
        """Build metadata representation from a manifest instance."""

        return cls(
            name=manifest.name,
            title=manifest.title,
            version=manifest.version,
            description=manifest.description,
            capabilities=list(manifest.capabilities),
            tools=list(manifest.tools),
            model=manifest.model,
            policies=manifest.policies,
        )


class AgentListResponse(BaseModel):
    """Envelope returned when listing available agents."""

    agents: list[AgentMetadata] = Field(default_factory=list)


class AgentDetailResponse(BaseModel):
    """Detailed representation for a single agent."""

    agent: AgentMetadata


class InvokeSuccessResponse(BaseModel):
    """Response returned when a tool invocation succeeds."""

    status: str = Field(default="success", description="Status flag indicating the invocation outcome")
    output: Any = Field(default=None, description="Structured payload produced by the invocation")


class ErrorResponse(BaseModel):
    """Standard error response envelope."""

    status: str = Field(default="error", description="Status flag indicating the invocation failed")
    error: str = Field(..., description="Human readable error message")
    details: dict[str, Any] | None = Field(default=None, description="Optional structured error details")
