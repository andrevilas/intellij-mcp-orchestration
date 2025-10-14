"""Configuration helpers for the Console MCP Server prototype."""

from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path
from typing import List

from pydantic import BaseModel, Field


class ProviderConfig(BaseModel):
    """Static metadata describing an MCP provider that the console can orchestrate."""

    id: str = Field(..., description="Stable identifier used by the console UI")
    name: str = Field(..., description="Human friendly display name")
    command: str = Field(..., description="Command or executable used to start the MCP server")
    description: str = Field("", description="Short summary of capabilities")
    tags: List[str] = Field(default_factory=list, description="Optional tags for filtering")
    capabilities: List[str] = Field(
        default_factory=list,
        description="Capabilities exposed by the provider (ex.: chat, tools, embeddings)",
    )
    transport: str = Field(
        "stdio",
        description="Default transport type supported by the command (stdio/http/etc)",
    )


class Settings(BaseModel):
    """Application level settings loaded from the example manifest."""

    providers: List[ProviderConfig] = Field(default_factory=list)
    data_path: Path = Field(..., description="Location of the manifest used to bootstrap providers")

    @classmethod
    def load_from_path(cls, manifest_path: Path) -> "Settings":
        data = manifest_path.read_text(encoding="utf-8")
        payload = ProviderManifest.model_validate_json(data)
        return cls(providers=payload.providers, data_path=manifest_path)


class ProviderManifest(BaseModel):
    """Serialized representation of the provider manifest file."""

    providers: List[ProviderConfig]


DEFAULT_MANIFEST_PATH = Path("config/console-mcp/servers.example.json")
MANIFEST_ENV_VAR = "CONSOLE_MCP_SERVERS_PATH"


@lru_cache
def get_settings(manifest_path: Path | None = None) -> Settings:
    """Return cached settings loaded from the configured manifest path."""

    env_override = os.getenv(MANIFEST_ENV_VAR)
    resolved_path = manifest_path or Path(env_override) if env_override else DEFAULT_MANIFEST_PATH
    if not resolved_path.is_absolute():
        resolved_path = Path(__file__).resolve().parents[3] / resolved_path

    if not resolved_path.exists():
        raise FileNotFoundError(
            f"Console MCP provider manifest not found at {resolved_path}. "
            "Create the file or override the path via `get_settings(Path(...))`."
        )

    return Settings.load_from_path(resolved_path)


def reload_settings(manifest_path: Path | None = None) -> Settings:
    """Forcefully reload settings, useful for tests."""

    get_settings.cache_clear()  # type: ignore[attr-defined]
    return get_settings(manifest_path)


__all__ = [
    "ProviderConfig",
    "ProviderManifest",
    "Settings",
    "get_settings",
    "reload_settings",
    "MANIFEST_ENV_VAR",
]
