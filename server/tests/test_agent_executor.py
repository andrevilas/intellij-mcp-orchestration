import asyncio
import importlib.util
import sys
import types
from copy import deepcopy
from pathlib import Path

import pytest
import structlog

PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

agents_hub_root = PROJECT_ROOT / "agents-hub"
if "agents_hub" not in sys.modules:
    pkg = types.ModuleType("agents_hub")
    pkg.__path__ = [str(agents_hub_root)]
    sys.modules["agents_hub"] = pkg

app_root = PROJECT_ROOT / "server" / "src" / "app"
sys.modules.setdefault("app", types.ModuleType("app"))
sys.modules["app"].__path__ = [str(app_root)]
sys.modules.setdefault("app.core", types.ModuleType("app.core"))
sys.modules["app.core"].__path__ = [str(app_root / "core")]


def _load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


errors_module = _load_module("app.core.errors", app_root / "core" / "errors.py")
executor_module = _load_module("app.core.executor", app_root / "core" / "executor.py")

AgentExecutionOutcome = executor_module.AgentExecutionOutcome
AgentExecutor = executor_module.AgentExecutor
AgentApprovalRequiredError = errors_module.AgentApprovalRequiredError
AgentExecutionError = errors_module.AgentExecutionError
AgentRejectionError = errors_module.AgentRejectionError
ValidationError = errors_module.ValidationError


class _DummyManifest:
    def __init__(self, data: dict[str, object]) -> None:
        self.name = str(data.get("name", "unknown"))
        self._data = deepcopy(data)

    def model_dump(self, *, mode: str, by_alias: bool, exclude_none: bool) -> dict[str, object]:
        del mode, by_alias, exclude_none
        return deepcopy(self._data)


def _build_manifest() -> _DummyManifest:
    manifest_data: dict[str, object] = {
        "name": "demo",
        "title": "Demo Agent",
        "version": "1.0.0",
        "tools": [],
        "routing": {
            "default_tier": "balanced",
            "allowed_tiers": ["balanced"],
            "max_iters": 3,
            "max_attempts": 2,
            "request_timeout_seconds": 0.05,
        },
        "policies": {},
        "finops": {"cost_center": "core"},
    }
    return _DummyManifest(manifest_data)


def test_executor_merges_overrides_and_returns_metadata() -> None:
    manifest = _build_manifest()
    overrides = {
        "routing": {"max_iters": 5},
        "finops": {"cost_center": "override"},
        "policies": {"confidence_thresholds": {"approval": 0.9, "rejection": 0.4}},
    }

    captured_configs: list[dict[str, object]] = []

    async def fake_agent(payload: dict[str, object], config: dict[str, object]) -> dict[str, object]:
        captured_configs.append(config)
        return {"output": payload, "confidence": 0.95}

    executor = AgentExecutor(
        manifest=manifest,
        base_config={"metadata": {"requestId": "abc"}, "overrides": overrides},
        logger=structlog.get_logger("test.executor"),
    )

    outcome = asyncio.run(executor.execute({"value": 1}, fake_agent))
    assert isinstance(outcome, AgentExecutionOutcome)

    assert outcome.metadata["routing"]["max_iters"] == 5
    assert outcome.metadata["finops"]["cost_center"] == "override"
    assert pytest.approx(outcome.metadata["confidence_thresholds"]["approval"], rel=1e-6) == 0.9
    assert outcome.metadata["confidence"] == pytest.approx(0.95)
    assert outcome.metadata["overrides"]["routing"]["max_iters"] == 5

    assert captured_configs
    forwarded = captured_configs[0]
    assert forwarded["routing"]["max_iters"] == 5


def test_executor_requires_manual_approval_when_confidence_low() -> None:
    manifest = _build_manifest()

    async def fake_agent(_: dict[str, object], __: dict[str, object]) -> dict[str, object]:
        return {"output": {}, "confidence": 0.6}

    executor = AgentExecutor(
        manifest=manifest,
        base_config={"metadata": {"requestId": "abc"}},
        logger=structlog.get_logger("test.executor"),
    )

    with pytest.raises(AgentApprovalRequiredError):
        asyncio.run(executor.execute({}, fake_agent))


def test_executor_rejects_when_confidence_below_threshold() -> None:
    manifest = _build_manifest()

    async def fake_agent(_: dict[str, object], __: dict[str, object]) -> dict[str, object]:
        return {"output": {}, "confidence": 0.2}

    executor = AgentExecutor(
        manifest=manifest,
        base_config={"metadata": {"requestId": "abc"}},
        logger=structlog.get_logger("test.executor"),
    )

    with pytest.raises(AgentRejectionError):
        asyncio.run(executor.execute({}, fake_agent))


def test_executor_validates_response_schema() -> None:
    manifest = _build_manifest()

    async def fake_agent(_: dict[str, object], __: dict[str, object]) -> dict[str, object]:
        return {"confidence": 0.95}

    executor = AgentExecutor(
        manifest=manifest,
        base_config={
            "metadata": {"requestId": "abc"},
            "parameters": {"response_schema": {"type": "object", "required": ["output"]}},
        },
        logger=structlog.get_logger("test.executor"),
    )

    with pytest.raises(ValidationError):
        asyncio.run(executor.execute({}, fake_agent))


def test_executor_honours_iteration_timeout() -> None:
    manifest = _build_manifest()

    async def slow_agent(_: dict[str, object], __: dict[str, object]) -> dict[str, object]:
        await asyncio.sleep(0.1)
        return {"output": {}, "confidence": 0.9}

    executor = AgentExecutor(
        manifest=manifest,
        base_config={
            "metadata": {"requestId": "abc"},
            "overrides": {"routing": {"max_attempts": 1}},
        },
        logger=structlog.get_logger("test.executor"),
    )

    with pytest.raises(AgentExecutionError):
        asyncio.run(executor.execute({}, slow_agent))
