"""Application configuration and settings utilities."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Iterable
import os

from pydantic import BaseModel, Field, field_validator


_APP_ROOT = Path(__file__).resolve().parent


class Settings(BaseModel):
    """Central configuration for the Agents Hub service."""

    app_title: str = Field(default="Promenade Agents Hub")
    app_version: str = Field(default="0.1.0")
    app_description: str = Field(
        default="Unified service exposing locally hosted Promenade agents."
    )

    environment: str = Field(default="development")
    log_level: str = Field(default="info")

    allowed_origins: list[str] = Field(default_factory=list)
    api_key: str | None = Field(default=None)

    agents_root: Path = Field(default=_APP_ROOT / "agents")
    request_timeout: float = Field(default=30.0)

    @field_validator("allowed_origins", mode="before")
    @classmethod
    def _parse_origins(cls, value: Iterable[str] | str | None) -> list[str]:
        if value is None:
            return []
        if isinstance(value, str):
            if not value.strip():
                return []
            return [item.strip() for item in value.split(",") if item.strip()]
        return list(value)

    @field_validator("agents_root", mode="before")
    @classmethod
    def _parse_agents_root(cls, value: str | Path) -> Path:
        if isinstance(value, Path):
            path = value
        else:
            path = Path(value)
        if not path.is_absolute():
            path = (_APP_ROOT).joinpath(path).resolve()
        return path

    @classmethod
    def from_environment(cls) -> "Settings":
        """Construct settings from environment variables."""

        env = os.environ
        data = {
            "app_title": env.get("API_TITLE", cls.model_fields["app_title"].default),
            "app_version": env.get("API_VERSION", cls.model_fields["app_version"].default),
            "app_description": env.get(
                "API_DESCRIPTION", cls.model_fields["app_description"].default
            ),
            "environment": env.get("ENVIRONMENT", cls.model_fields["environment"].default),
            "log_level": env.get("LOG_LEVEL", cls.model_fields["log_level"].default),
            "allowed_origins": env.get("CORS_ORIGINS"),
            "api_key": env.get("API_KEY"),
            "agents_root": env.get("AGENTS_ROOT", cls.model_fields["agents_root"].default),
            "request_timeout": env.get(
                "REQUEST_TIMEOUT", cls.model_fields["request_timeout"].default
            ),
        }
        return cls.model_validate(data)


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return a cached settings instance."""

    return Settings.from_environment()


__all__ = ["Settings", "get_settings"]
