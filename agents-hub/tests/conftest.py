"""Pytest fixtures for the agents hub test suite."""

from __future__ import annotations

import sys
from importlib import import_module, reload
from pathlib import Path
from textwrap import dedent
from typing import Any

import pytest
import yaml
from fastapi.testclient import TestClient

PROJECT_ROOT = Path(__file__).resolve().parents[2]
AGENTS_HUB_ROOT = PROJECT_ROOT / "agents-hub"
if str(AGENTS_HUB_ROOT) not in sys.path:
    sys.path.insert(0, str(AGENTS_HUB_ROOT))

SAMPLE_MANIFEST = Path(__file__).with_name("fixtures").joinpath("sample_manifest.yaml")


def _deep_update(target: dict[str, Any], overrides: dict[str, Any]) -> dict[str, Any]:
    for key, value in overrides.items():
        if (
            isinstance(value, dict)
            and key in target
            and isinstance(target[key], dict)
        ):
            target[key] = _deep_update(dict(target[key]), value)
        else:
            target[key] = value
    return target


DEFAULT_AGENT_CODE = dedent(
    """
    from __future__ import annotations

    from typing import Any, Mapping

    class TestAgent:
        def __init__(self, manifest: dict[str, Any]):
            self.manifest = manifest
            self.invocations = 0

        async def ainvoke(
            self,
            payload: Mapping[str, Any] | None = None,
            config: Mapping[str, Any] | None = None,
        ) -> dict[str, Any]:
            self.invocations += 1
            payload_dict = dict(payload or {})
            if payload_dict.get("mode") == "error":
                raise RuntimeError("forced error")
            return {"echo": payload_dict, "config": dict(config or {})}

    def build_agent(manifest: dict[str, Any]) -> TestAgent:
        return TestAgent(manifest)

    def get_tools() -> list[dict[str, Any]]:
        return []
    """
)


@pytest.fixture
def settings(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    import app  # noqa: F401 - ensures package is importable
    from app import config as config_module

    app_module = import_module("app")
    agents_module = import_module("app.agents")

    tmp_app_dir = tmp_path / "app"
    agents_root = tmp_app_dir / "agents"
    agents_root.mkdir(parents=True)

    appended_paths: list[tuple[list[str], str]] = []

    if str(tmp_app_dir) not in app_module.__path__:
        app_module.__path__.append(str(tmp_app_dir))
        appended_paths.append((app_module.__path__, str(tmp_app_dir)))

    if str(agents_root) not in agents_module.__path__:
        agents_module.__path__.append(str(agents_root))
        appended_paths.append((agents_module.__path__, str(agents_root)))

    monkeypatch.setenv("AGENTS_ROOT", str(agents_root))
    config_module.get_settings.cache_clear()
    settings = config_module.get_settings()

    try:
        yield settings
    finally:
        config_module.get_settings.cache_clear()
        for path_list, value in appended_paths:
            if value in path_list:
                path_list.remove(value)


@pytest.fixture
def create_agent(settings):
    import sys

    def factory(
        name: str,
        *,
        code: str | None = None,
        manifest_overrides: dict[str, Any] | None = None,
    ) -> Path:
        manifest_data = yaml.safe_load(SAMPLE_MANIFEST.read_text(encoding="utf-8"))
        manifest_data["name"] = name
        manifest_data["title"] = f"{name.title()} Agent"
        if manifest_overrides:
            manifest_data = _deep_update(manifest_data, manifest_overrides)

        agent_dir = settings.agents_root / name
        agent_dir.mkdir(parents=True, exist_ok=True)
        (agent_dir / "__init__.py").write_text("", encoding="utf-8")
        (agent_dir / "agent.yaml").write_text(
            yaml.safe_dump(manifest_data), encoding="utf-8"
        )
        module_name = f"app.agents.{name}"
        full_module_name = f"{module_name}.agent"
        sys.modules.pop(full_module_name, None)
        sys.modules.pop(module_name, None)
        (agent_dir / "agent.py").write_text(
            dedent(code) if code is not None else DEFAULT_AGENT_CODE,
            encoding="utf-8",
        )
        return agent_dir

    return factory


@pytest.fixture
def app(settings):
    import app.main as main_module
    from app.registry import AgentRegistry

    reloaded = reload(main_module)
    fastapi_app = reloaded.app
    fastapi_app.state.settings = settings
    fastapi_app.dependency_overrides[reloaded.provide_settings] = lambda: settings
    fastapi_app.state.registry = AgentRegistry(
        root=settings.agents_root, logger=fastapi_app.state.logger
    )
    reloaded.settings = settings
    reloaded.registry = fastapi_app.state.registry

    try:
        yield fastapi_app
    finally:
        fastapi_app.dependency_overrides.pop(reloaded.provide_settings, None)


@pytest.fixture
def test_client(app):
    with TestClient(app) as client:
        yield client

