"""Application settings powered by :mod:`pydantic_settings`."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import List

from pydantic import Field
from pydantic.functional_validators import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Centralized configuration for the orchestration backend."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    agents_root: Path = Field(
        default=Path("agents"),
        alias="AGENTS_ROOT",
        description="Directory that contains agent manifests and runtime artifacts.",
    )
    server_port: int = Field(
        default=8000,
        alias="SERVER_PORT",
        ge=1,
        le=65535,
        description="Port used by the public API server.",
    )
    log_level: str = Field(
        default="INFO",
        alias="LOG_LEVEL",
        description="Logging verbosity for the service.",
    )
    api_key: str | None = Field(
        default=None,
        alias="API_KEY",
        description="Optional API key required to authenticate requests.",
    )
    enable_rate_limit: bool = Field(
        default=False,
        alias="ENABLE_RATE_LIMIT",
        description="Toggle for the optional rate limiting middleware.",
    )
    allowed_origins: List[str] = Field(
        default_factory=list,
        alias="ALLOWED_ORIGINS",
        description="Allowed origins for CORS configuration.",
    )
    request_timeout: float = Field(
        default=30.0,
        alias="REQUEST_TIMEOUT",
        ge=0,
        description="Default timeout (in seconds) applied to outbound requests.",
    )

    @field_validator("allowed_origins", mode="before")
    @classmethod
    def _split_allowed_origins(cls, value: str | List[str]) -> List[str]:
        if isinstance(value, str):
            return [item.strip() for item in value.split(",") if item.strip()]
        return value

    @field_validator("log_level")
    @classmethod
    def _normalize_log_level(cls, value: str) -> str:
        return value.upper()

    @field_validator("agents_root", mode="before")
    @classmethod
    def _coerce_agents_root(cls, value: str | Path) -> Path:
        return Path(value)


@lru_cache
def get_settings() -> Settings:
    """Return a cached settings instance."""

    return Settings()


__all__ = ["Settings", "get_settings"]
