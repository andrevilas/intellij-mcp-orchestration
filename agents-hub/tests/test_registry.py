"""Tests exercising the agent registry lifecycle."""

from __future__ import annotations

import logging
from pathlib import Path

import pytest

from app.errors import AgentManifestError, ValidationError
from app.registry import AgentRegistry
from app.schemas.manifest import load_manifest


@pytest.mark.asyncio
async def test_registry_loads_multiple_agents(settings, create_agent) -> None:
    create_agent("alpha")
    create_agent("beta")

    registry = AgentRegistry(root=settings.agents_root, logger=logging.getLogger("test.registry"))

    manifests = registry.list_agents()
    names = sorted(manifest.name for manifest in manifests)
    assert names == ["alpha", "beta"]
    assert registry.get_metadata("alpha").name == "alpha"


def test_load_manifest_missing_file(tmp_path: Path) -> None:
    agent_dir = tmp_path / "ghost"
    agent_dir.mkdir()

    with pytest.raises(FileNotFoundError):
        load_manifest(agent_dir)


def test_registry_raises_when_agent_module_missing(settings, create_agent) -> None:
    create_agent("valid")
    broken_dir = settings.agents_root / "broken"
    broken_dir.mkdir(parents=True, exist_ok=True)
    (broken_dir / "__init__.py").write_text("", encoding="utf-8")
    manifest_path = broken_dir / "agent.yaml"
    manifest_path.write_text((settings.agents_root / "valid" / "agent.yaml").read_text(), encoding="utf-8")

    with pytest.raises(AgentManifestError):
        AgentRegistry(root=settings.agents_root, logger=logging.getLogger("test.registry"))


@pytest.mark.asyncio
async def test_registry_lazy_instantiation(settings, create_agent) -> None:
    create_agent("delta")
    registry = AgentRegistry(root=settings.agents_root, logger=logging.getLogger("test.registry"))

    record = registry._records["delta"]
    assert record.instance is None

    await registry.invoke("delta", {"message": "hello"})

    assert record.instance is not None
    assert getattr(record.instance, "invocations") == 1


@pytest.mark.asyncio
async def test_registry_validates_payload_shape(settings, create_agent) -> None:
    create_agent("gamma")
    registry = AgentRegistry(root=settings.agents_root, logger=logging.getLogger("test.registry"))

    with pytest.raises(ValidationError):
        await registry.invoke("gamma", ["invalid", "payload"])  # type: ignore[arg-type]
