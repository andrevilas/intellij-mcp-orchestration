"""Pydantic models describing the Agents Hub manifest format."""

from __future__ import annotations

from pathlib import Path
from typing import Any, Iterable

import yaml
from jsonschema import validate as jsonschema_validate
from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator


class ToolSchema(BaseModel):
    """Representation of a tool invocation JSON schema."""

    model_config = ConfigDict(extra="allow", populate_by_name=True)

    type: str | None = Field(default="object", description="JSON schema type of the payload")
    title: str | None = None
    description: str | None = None
    properties: dict[str, Any] = Field(default_factory=dict)
    required: list[str] = Field(default_factory=list)


class ToolConfig(BaseModel):
    """Configuration for a tool exposed by an agent."""

    model_config = ConfigDict(populate_by_name=True)

    name: str
    description: str | None = None
    schema: ToolSchema | None = Field(default=None, description="JSON schema describing the tool input")

    @model_validator(mode="before")
    @classmethod
    def _normalise_schema_aliases(cls, values: Any) -> Any:
        """Accept alternative field names used in manifests."""

        if isinstance(values, dict):
            if "schema" not in values:
                for candidate in ("input_schema", "inputSchema", "parameters", "arguments_schema"):
                    if candidate in values:
                        values["schema"] = values.pop(candidate)
                        break
        return values


class ModelConfig(BaseModel):
    """Model configuration for the agent runtime."""

    model_config = ConfigDict(extra="allow")

    provider: str | None = Field(default=None, description="Provider of the model (e.g. openai)")
    name: str | None = Field(default=None, description="Model identifier")
    parameters: dict[str, Any] = Field(default_factory=dict, description="Additional model parameters")


class PoliciesConfig(BaseModel):
    """Policy configuration applied to an agent."""

    model_config = ConfigDict(extra="allow")

    rate_limits: dict[str, Any] | None = Field(default=None, description="Optional rate limit policies")
    safety: dict[str, Any] | None = Field(default=None, description="Optional safety policies")
    budget: dict[str, Any] | None = Field(default=None, description="Optional budget policies")


class AgentManifest(BaseModel):
    """Top level manifest definition for an agent."""

    model_config = ConfigDict(extra="allow")

    name: str
    title: str
    version: str
    description: str | None = None
    capabilities: list[str] = Field(default_factory=list)
    tools: list[ToolConfig] = Field(default_factory=list)
    model: ModelConfig | None = None
    policies: PoliciesConfig | None = None

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

    return AgentManifest.model_validate(data)
