"""Lightweight process supervisor for managing MCP server commands."""
from __future__ import annotations

import os
import shlex
import subprocess
import threading
from dataclasses import dataclass
from datetime import datetime, timezone
from enum import Enum
from typing import Dict, List, Mapping, Optional


class ProcessSupervisorError(RuntimeError):
    """Base exception raised for supervisor errors."""


class ProcessAlreadyRunningError(ProcessSupervisorError):
    """Raised when attempting to start a process that is already running."""


class ProcessNotRunningError(ProcessSupervisorError):
    """Raised when attempting to stop a process that is not running."""


class ProcessStartError(ProcessSupervisorError):
    """Raised when the supervisor fails to spawn a new process."""


class ProcessStatus(str, Enum):
    """Normalized lifecycle states tracked for supervised processes."""

    RUNNING = "running"
    STOPPED = "stopped"
    ERROR = "error"


@dataclass(frozen=True)
class ProcessSnapshot:
    """Immutable view of a supervised process state."""

    server_id: str
    command: str
    status: ProcessStatus
    pid: Optional[int]
    started_at: Optional[datetime]
    stopped_at: Optional[datetime]
    return_code: Optional[int]
    last_error: Optional[str]

    def to_dict(self) -> dict[str, object]:
        return {
            "server_id": self.server_id,
            "command": self.command,
            "status": self.status.value,
            "pid": self.pid,
            "started_at": self.started_at,
            "stopped_at": self.stopped_at,
            "return_code": self.return_code,
            "last_error": self.last_error,
        }


class _ManagedProcess:
    """Internal helper that wraps ``subprocess.Popen`` with bookkeeping."""

    def __init__(self, server_id: str, command: str) -> None:
        self.server_id = server_id
        self.command = command
        self._popen: subprocess.Popen[bytes] | None = None
        self.status = ProcessStatus.STOPPED
        self.started_at: Optional[datetime] = None
        self.stopped_at: Optional[datetime] = None
        self.return_code: Optional[int] = None
        self.last_error: Optional[str] = None

    def update_command(self, command: str) -> None:
        self.command = command

    @property
    def is_running(self) -> bool:
        return self._popen is not None and self._popen.poll() is None

    def _expand_command(self) -> List[str]:
        expanded = os.path.expanduser(self.command)
        args = shlex.split(expanded)
        if not args:
            raise ProcessStartError(f"Command for server '{self.server_id}' is empty")
        return args

    def refresh(self) -> None:
        if self._popen is None:
            return
        result = self._popen.poll()
        if result is None:
            self.status = ProcessStatus.RUNNING
            return
        self.return_code = result
        self._popen = None
        self.stopped_at = datetime.now(tz=timezone.utc)
        self.status = ProcessStatus.STOPPED if result == 0 else ProcessStatus.ERROR

    def start(self, *, env: Optional[Mapping[str, str]] = None) -> None:
        if self.is_running:
            raise ProcessAlreadyRunningError(f"Server '{self.server_id}' is already running")
        self.last_error = None
        self.return_code = None
        self.stopped_at = None
        try:
            args = self._expand_command()
            self._popen = subprocess.Popen(
                args,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                env=dict(env) if env is not None else None,
                close_fds=os.name != "nt",
            )
        except OSError as exc:
            self.status = ProcessStatus.ERROR
            self.last_error = str(exc)
            self.started_at = None
            raise ProcessStartError(
                f"Failed to start server '{self.server_id}': {exc!s}"
            ) from exc

        self.status = ProcessStatus.RUNNING
        self.started_at = datetime.now(tz=timezone.utc)

    def stop(self, *, timeout: float = 5.0) -> None:
        self.refresh()
        if self._popen is None:
            raise ProcessNotRunningError(f"Server '{self.server_id}' is not running")

        self._popen.terminate()
        try:
            self._popen.wait(timeout=timeout)
        except subprocess.TimeoutExpired:
            self._popen.kill()
            self._popen.wait(timeout=timeout)
        finally:
            return_code = self._popen.returncode
            self.return_code = return_code
            self._popen = None
            self.stopped_at = datetime.now(tz=timezone.utc)
            self.status = ProcessStatus.STOPPED if return_code == 0 else ProcessStatus.ERROR

    def snapshot(self) -> ProcessSnapshot:
        self.refresh()
        pid = self._popen.pid if self._popen is not None and self.is_running else None
        return ProcessSnapshot(
            server_id=self.server_id,
            command=self.command,
            status=self.status,
            pid=pid,
            started_at=self.started_at,
            stopped_at=self.stopped_at,
            return_code=self.return_code,
            last_error=self.last_error,
        )


class ProcessSupervisor:
    """Coordinates starting/stopping MCP server commands."""

    def __init__(self) -> None:
        self._processes: Dict[str, _ManagedProcess] = {}
        self._lock = threading.Lock()

    def _get_or_create(self, server_id: str, command: str) -> _ManagedProcess:
        process = self._processes.get(server_id)
        if process is None:
            process = _ManagedProcess(server_id, command)
            self._processes[server_id] = process
        else:
            process.update_command(command)
        return process

    def start(self, server_id: str, command: str, *, env: Optional[Mapping[str, str]] = None) -> ProcessSnapshot:
        with self._lock:
            process = self._get_or_create(server_id, command)
            process.start(env=env)
            return process.snapshot()

    def stop(self, server_id: str) -> ProcessSnapshot:
        with self._lock:
            process = self._processes.get(server_id)
            if process is None:
                raise ProcessNotRunningError(f"Server '{server_id}' is not running")
            process.stop()
            return process.snapshot()

    def restart(self, server_id: str, command: str, *, env: Optional[Mapping[str, str]] = None) -> ProcessSnapshot:
        with self._lock:
            process = self._get_or_create(server_id, command)
            try:
                process.stop()
            except ProcessNotRunningError:
                # It is acceptable to restart a stopped server; ignore missing state.
                pass
            process.start(env=env)
            return process.snapshot()

    def status(self, server_id: str, command: Optional[str] = None) -> ProcessSnapshot:
        with self._lock:
            process = self._processes.get(server_id)
            if process is None:
                if command is None:
                    raise ProcessNotRunningError(f"Server '{server_id}' has no supervised process")
                process = self._get_or_create(server_id, command)
            return process.snapshot()

    def list(self) -> List[ProcessSnapshot]:
        with self._lock:
            return [process.snapshot() for process in self._processes.values()]

    def stop_all(self) -> List[ProcessSnapshot]:
        snapshots: List[ProcessSnapshot] = []
        with self._lock:
            for process in list(self._processes.values()):
                try:
                    process.stop()
                except ProcessNotRunningError:
                    pass
                snapshots.append(process.snapshot())
        return snapshots

    def prune(self, *, only_finished: bool = True) -> None:
        with self._lock:
            if only_finished:
                to_remove = [
                    server_id
                    for server_id, process in self._processes.items()
                    if process.status in {ProcessStatus.STOPPED, ProcessStatus.ERROR}
                ]
            else:
                to_remove = list(self._processes.keys())
            for server_id in to_remove:
                if self._processes[server_id].is_running:
                    continue
                self._processes.pop(server_id, None)


process_supervisor = ProcessSupervisor()

__all__ = [
    "ProcessSupervisor",
    "process_supervisor",
    "ProcessSnapshot",
    "ProcessStatus",
    "ProcessSupervisorError",
    "ProcessAlreadyRunningError",
    "ProcessNotRunningError",
    "ProcessStartError",
]
