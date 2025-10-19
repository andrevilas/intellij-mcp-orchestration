"""Utility helpers for loading JSON fixtures used by the API prototype."""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Type, TypeVar

import structlog
from pydantic import BaseModel, ValidationError

LOGGER = structlog.get_logger(__name__)

T = TypeVar("T", bound=BaseModel)


@lru_cache
def _fixture_root() -> Path:
    base = Path(__file__).resolve().parents[2] / "routes" / "fixtures"
    return base


def load_fixture_payload(name: str) -> dict | list | None:
    """Return raw JSON data for the requested fixture if it exists."""

    path = _fixture_root() / f"{name}.json"
    if not path.exists():
        LOGGER.debug("fixture.missing", name=name, path=str(path))
        return None

    try:
        with path.open("r", encoding="utf-8") as handle:
            return json.load(handle)
    except json.JSONDecodeError as exc:
        LOGGER.warning("fixture.invalid", name=name, path=str(path), error=str(exc))
        return None


def load_response_fixture(model: Type[T], name: str) -> T | None:
    """Load a fixture and validate it against the provided Pydantic model."""

    payload = load_fixture_payload(name)
    if payload is None:
        return None

    try:
        return model.model_validate(payload)
    except ValidationError as exc:
        LOGGER.warning("fixture.validation_failed", name=name, errors=exc.errors())
        return None


__all__ = [
    "load_fixture_payload",
    "load_response_fixture",
]
