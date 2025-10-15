"""Agent registry responsible for loading and invoking local agents."""

from __future__ import annotations

import inspect
import sys
import threading
import time
from dataclasses import dataclass
from importlib import util as importlib_util
from pathlib import Path
from types import ModuleType
from typing import Any, Callable, Iterable, Mapping

from jsonschema import ValidationError as JSONSchemaValidationError
from pydantic import ValidationError as PydanticValidationError
from structlog.stdlib import BoundLogger
from yaml import YAMLError

from agents_hub.schemas.manifest import AgentManifest, load_manifest

from .errors import (
    AgentExecutionError,
    AgentManifestError,
    AgentNotFoundError,
    ValidationError,
)


BuilderCallable = Callable[[dict[str, Any]], Any]
ToolsCallable = Callable[[], Iterable[Any]] | None


@dataclass(slots=True)
class AgentRecord:
    """Metadata captured for each registered agent."""

    manifest: AgentManifest
    builder: BuilderCallable
    tools: ToolsCallable
    instance: Any | None
    module: ModuleType
    path: Path


class AgentRegistry:
    """Discovery and lifecycle management for on-disk agents."""

    def __init__(self, settings: Any, logger: BoundLogger) -> None:
        self._settings = settings
        self._logger = logger.bind(component="AgentRegistry")
        self._lock = threading.RLock()
        self._records: dict[str, AgentRecord] = {}
        self._module_names: set[str] = set()
        self.reload()

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------
    def list_agents(self) -> list[str]:
        """Return the identifiers of the registered agents."""

        with self._lock:
            return sorted(self._records.keys())

    def get_agent(self, name: str) -> Any:
        """Return an instantiated agent, creating it lazily if required."""

        record = self._get_record(name)
        return self._ensure_instance(record)

    def get_metadata(self, name: str) -> AgentManifest:
        """Return the manifest metadata for an agent."""

        record = self._get_record(name)
        return record.manifest

    def get_tools(self, name: str) -> list[Any]:
        """Return the tools exposed by the agent."""

        record = self._get_record(name)

        if record.tools is None:
            return list(record.manifest.tools)

        try:
            tools = list(record.tools())
        except Exception as exc:  # pragma: no cover - defensive
            raise AgentExecutionError(
                f"Failed to retrieve tools for agent '{name}'"
            ) from exc

        return tools

    async def invoke(
        self,
        name: str,
        payload: Mapping[str, Any] | None = None,
        config: Mapping[str, Any] | None = None,
    ) -> Any:
        """Invoke the specified agent with validated inputs."""

        if payload is not None and not isinstance(payload, Mapping):
            raise ValidationError("Payload must be a mapping")
        if config is not None and not isinstance(config, Mapping):
            raise ValidationError("Config must be a mapping")

        payload_dict = dict(payload or {})
        config_dict = dict(config or {})

        record = self._get_record(name)
        manifest = record.manifest

        tool_name = self._resolve_tool_name(manifest, config_dict)

        if tool_name and manifest.tools:
            try:
                manifest.validate_payload(tool_name, payload_dict)
            except KeyError as exc:
                raise ValidationError(str(exc)) from exc
            except JSONSchemaValidationError as exc:
                raise ValidationError(str(exc)) from exc
        elif manifest.tools:
            default_tool = manifest.tools[0]
            try:
                manifest.validate_payload(default_tool.name, payload_dict)
                tool_name = default_tool.name
            except JSONSchemaValidationError as exc:
                raise ValidationError(str(exc)) from exc

        instance = self._ensure_instance(record)

        call_config = dict(config_dict)
        if tool_name and "tool_name" not in call_config:
            call_config["tool_name"] = tool_name

        start_time = time.perf_counter()
        self._logger.info(
            "agent.invoke.start",
            agent=name,
            tool=tool_name,
        )

        try:
            result = await self._execute_agent(instance, payload_dict, call_config)
        except ValidationError:
            raise
        except Exception as exc:
            duration_ms = (time.perf_counter() - start_time) * 1000
            self._logger.error(
                "agent.invoke.error",
                agent=name,
                tool=tool_name,
                duration_ms=duration_ms,
                error=str(exc),
            )
            raise AgentExecutionError(
                f"Agent '{name}' invocation failed"
            ) from exc

        duration_ms = (time.perf_counter() - start_time) * 1000
        self._logger.info(
            "agent.invoke.complete",
            agent=name,
            tool=tool_name,
            duration_ms=duration_ms,
        )
        return result

    def reload(self) -> None:
        """Reload manifests and code from disk, clearing cached instances."""

        with self._lock:
            self._cleanup_modules()
            self._records = self._load_agents()

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------
    async def _execute_agent(
        self, instance: Any, payload: dict[str, Any], config: dict[str, Any]
    ) -> Any:
        """Execute ``invoke``/``ainvoke`` on the agent instance."""

        if hasattr(instance, "ainvoke"):
            method = getattr(instance, "ainvoke")
            response = method(payload, config)
            if inspect.isawaitable(response):
                return await response
            return response

        if not hasattr(instance, "invoke"):
            raise AgentExecutionError("Agent instance is missing 'invoke' method")

        method = getattr(instance, "invoke")
        response = method(payload, config)
        if inspect.isawaitable(response):
            return await response
        return response

    def _resolve_tool_name(
        self, manifest: AgentManifest, config: Mapping[str, Any]
    ) -> str | None:
        """Resolve the tool name used for validation."""

        if not manifest.tools:
            return None

        tool_name = config.get("tool_name") if isinstance(config, Mapping) else None
        if tool_name:
            return str(tool_name)

        if len(manifest.tools) > 1:
            raise ValidationError(
                "Multiple tools defined – specify 'tool_name' in the invocation config"
            )

        return manifest.tools[0].name

    def _ensure_instance(self, record: AgentRecord) -> Any:
        """Return the cached instance, creating it if needed."""

        with self._lock:
            current = self._records.get(record.manifest.name)
            if current is not record:
                raise AgentNotFoundError(
                    f"Agent '{record.manifest.name}' is no longer registered"
                )

            if record.instance is not None:
                return record.instance

            manifest_payload = self._manifest_to_dict(record.manifest)
            try:
                instance = record.builder(manifest_payload)
            except Exception as exc:  # pragma: no cover - defensive
                raise AgentExecutionError(
                    f"Failed to build agent '{record.manifest.name}'"
                ) from exc

            record.instance = instance
            return instance

    def _get_record(self, name: str) -> AgentRecord:
        """Retrieve the agent record by name or raise an error."""

        with self._lock:
            record = self._records.get(name)
        if record is None:
            raise AgentNotFoundError(f"Agent '{name}' not found")
        return record

    def _cleanup_modules(self) -> None:
        """Remove dynamically imported agent modules from ``sys.modules``."""

        for module_name in list(self._module_names):
            sys.modules.pop(module_name, None)
        self._module_names.clear()

    def _load_agents(self) -> dict[str, AgentRecord]:
        """Scan the filesystem and load agent manifests and modules."""

        records: dict[str, AgentRecord] = {}
        root = self._settings.agents_root
        if not root.exists():
            self._logger.warning(
                "agent.registry.root_missing",
                root=str(root),
            )
            return records

        for agent_dir in sorted(root.glob("*/")):
            if not agent_dir.is_dir():
                continue

            manifest_path = agent_dir / "agent.yaml"
            module_path = agent_dir / "agent.py"

            if not manifest_path.exists():
                raise AgentManifestError(
                    f"Manifest file missing for agent at '{agent_dir}'"
                )
            if not module_path.exists():
                raise AgentManifestError(
                    f"Agent runtime missing for agent at '{agent_dir}'"
                )

            try:
                manifest = load_manifest(agent_dir)
            except (FileNotFoundError, PydanticValidationError, YAMLError, OSError) as exc:
                raise AgentManifestError(
                    f"Failed to load manifest at '{manifest_path}': {exc}"
                ) from exc

            module = self._import_agent_module(agent_dir)

            builder = getattr(module, "build_agent", None)
            if builder is None or not callable(builder):
                raise AgentManifestError(
                    f"Agent module '{module_path}' must define a callable 'build_agent'"
                )

            tools_callable = getattr(module, "get_tools", None)
            if tools_callable is not None and not callable(tools_callable):
                raise AgentManifestError(
                    f"Agent module '{module_path}' attribute 'get_tools' must be callable"
                )

            if manifest.name in records:
                raise AgentManifestError(
                    f"Duplicate agent name detected: '{manifest.name}'"
                )

            records[manifest.name] = AgentRecord(
                manifest=manifest,
                builder=builder,
                tools=tools_callable,
                instance=None,
                module=module,
                path=agent_dir,
            )

            self._logger.info(
                "agent.registry.loaded",
                agent=manifest.name,
                path=str(agent_dir),
            )

        return records

    def _import_agent_module(self, agent_dir: Path) -> ModuleType:
        """Import the ``agent.py`` module for the given agent."""

        module_path = agent_dir / "agent.py"
        module_name = self._build_module_name(agent_dir)
        spec = importlib_util.spec_from_file_location(module_name, module_path)
        if spec is None or spec.loader is None:
            raise AgentManifestError(
                f"Unable to import agent module at '{module_path}'"
            )

        module = importlib_util.module_from_spec(spec)
        sys.modules[module_name] = module
        try:
            spec.loader.exec_module(module)
        except Exception as exc:
            sys.modules.pop(module_name, None)
            raise AgentManifestError(
                f"Failed to import agent module '{module_path}': {exc}"
            ) from exc

        self._module_names.add(module_name)
        return module

    def _build_module_name(self, agent_dir: Path) -> str:
        """Generate a unique module name for a dynamically imported agent."""

        base = agent_dir.name
        sanitized = "".join(ch if ch.isalnum() else "_" for ch in base)
        return f"_mcp_agent_{sanitized}"

    def _manifest_to_dict(self, manifest: AgentManifest) -> dict[str, Any]:
        """Convert a manifest model into a plain dictionary for builders."""

        try:
            return manifest.model_dump(mode="json", by_alias=True)
        except AttributeError:  # pragma: no cover - compatibility shim
            return manifest.dict()


__all__ = ["AgentRegistry", "AgentRecord"]
