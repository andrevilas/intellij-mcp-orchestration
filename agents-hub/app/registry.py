"""Agent registry for loading and invoking agents shipped with the hub."""

from __future__ import annotations

import importlib
import inspect
import threading
from dataclasses import dataclass
from logging import Logger, LoggerAdapter
from pathlib import Path
from types import ModuleType
from typing import Any, Callable, Iterable, Mapping

from .errors import (
    AgentExecutionError,
    AgentManifestError,
    AgentNotFoundError,
    ValidationError,
)
from .schemas.manifest import AgentManifest, load_manifest


BuilderCallable = Callable[[dict[str, Any]], Any]
ToolsCallable = Callable[[], Iterable[Any]] | None


@dataclass(slots=True)
class AgentRecord:
    """Bookkeeping information stored for each registered agent."""

    manifest: AgentManifest
    builder: BuilderCallable
    tools: ToolsCallable
    module: ModuleType
    instance: Any | None
    path: Path


class AgentRegistry:
    """Discovery and invocation interface for locally defined agents."""

    def __init__(self, *, root: Path, logger: Logger | LoggerAdapter) -> None:
        self._root = root
        if isinstance(logger, LoggerAdapter):
            self._logger = logger
        else:
            self._logger = LoggerAdapter(logger, {"component": "AgentRegistry"})
        self._lock = threading.RLock()
        self._records: dict[str, AgentRecord] = {}
        self.reload()

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------
    def list_agents(self) -> list[AgentManifest]:
        """Return manifests for all registered agents."""

        with self._lock:
            return [self._records[name].manifest for name in sorted(self._records.keys())]

    def get_metadata(self, name: str) -> AgentManifest:
        """Return manifest metadata for ``name``."""

        record = self._get_record(name)
        return record.manifest

    async def invoke(
        self,
        name: str,
        payload: Mapping[str, Any] | None = None,
        config: Mapping[str, Any] | None = None,
    ) -> Any:
        """Invoke the named agent with the provided payload."""

        if payload is not None and not isinstance(payload, Mapping):
            raise ValidationError("Payload must be an object")
        if config is not None and not isinstance(config, Mapping):
            raise ValidationError("Config must be an object")

        record = self._get_record(name)
        instance = self._ensure_instance(record)

        payload_dict = dict(payload or {})
        config_dict = dict(config or {})

        self._logger.info("agent.invoke.start", extra={"agent": name})
        try:
            result = await self._execute(instance, payload_dict, config_dict)
        except ValidationError:
            raise
        except Exception as exc:  # pragma: no cover - defensive
            self._logger.exception("agent.invoke.error", extra={"agent": name})
            raise AgentExecutionError(f"Invocation of agent '{name}' failed") from exc
        self._logger.info("agent.invoke.complete", extra={"agent": name})
        return result

    def reload(self) -> None:
        """Reload available agents from disk."""

        with self._lock:
            self._logger.info("agent.reload.start", extra={"root": str(self._root)})
            self._records.clear()
            if not self._root.exists():
                self._logger.warning(
                    "agent.reload.missing_root", extra={"root": str(self._root)}
                )
                return

            for manifest_path in sorted(self._root.glob("*/agent.yaml")):
                directory = manifest_path.parent
                try:
                    manifest = load_manifest(manifest_path)
                except Exception as exc:  # pragma: no cover - defensive
                    self._logger.exception(
                        "agent.reload.manifest_error", extra={"path": str(manifest_path)}
                    )
                    raise AgentManifestError(f"Failed to load manifest from {manifest_path}") from exc

                module_name = self._resolve_module_name(directory)
                try:
                    module = importlib.import_module(module_name)
                    module = importlib.reload(module)
                except Exception as exc:  # pragma: no cover - defensive
                    self._logger.exception(
                        "agent.reload.import_error", extra={"module": module_name}
                    )
                    raise AgentManifestError(
                        f"Failed to import agent module '{module_name}'"
                    ) from exc

                builder = getattr(module, "build_agent", None)
                if builder is None:
                    raise AgentManifestError(
                        f"Agent module '{module_name}' must expose a 'build_agent' callable"
                    )

                tools = getattr(module, "get_tools", None)

                record = AgentRecord(
                    manifest=manifest,
                    builder=builder,
                    tools=tools,
                    module=module,
                    instance=None,
                    path=directory,
                )
                self._records[manifest.name] = record

            self._logger.info(
                "agent.reload.complete", extra={"count": len(self._records)}
            )

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------
    def _get_record(self, name: str) -> AgentRecord:
        with self._lock:
            try:
                return self._records[name]
            except KeyError as exc:
                raise AgentNotFoundError(f"Agent '{name}' not found") from exc

    def _ensure_instance(self, record: AgentRecord) -> Any:
        with self._lock:
            if record.instance is None:
                manifest_payload = record.manifest.model_dump(mode="json", by_alias=True)
                record.instance = record.builder(manifest_payload)
            return record.instance

    async def _execute(self, instance: Any, payload: dict[str, Any], config: dict[str, Any]) -> Any:
        if hasattr(instance, "ainvoke"):
            response = instance.ainvoke(payload, config)
            if inspect.isawaitable(response):
                return await response
            return response

        if not hasattr(instance, "invoke"):
            raise AgentExecutionError("Agent is missing an 'invoke' method")

        response = instance.invoke(payload, config)
        if inspect.isawaitable(response):
            return await response
        return response

    def _resolve_module_name(self, directory: Path) -> str:
        package_parts = list(directory.relative_to(self._root).parts)
        return "app.agents." + ".".join(package_parts + ["agent"])


__all__ = ["AgentRegistry", "AgentRecord"]
