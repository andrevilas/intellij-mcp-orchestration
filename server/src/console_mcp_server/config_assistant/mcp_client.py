"""Minimal MCP client used by the configuration assistant for discovery."""

from __future__ import annotations

import json
import os
import select
import shlex
import subprocess
import time
from dataclasses import dataclass
from typing import Any, Iterable, Mapping, MutableMapping, Sequence

import httpx


class MCPClientError(RuntimeError):
    """Base error raised when the discovery client fails."""


class MCPConnectionError(MCPClientError):
    """Raised when the underlying transport cannot be established."""


class MCPProtocolError(MCPClientError):
    """Raised when the server returns an error response."""

    def __init__(self, message: str, *, code: int | None = None, data: Any | None = None) -> None:
        super().__init__(message)
        self.code = code
        self.data = data


@dataclass(frozen=True)
class MCPTool:
    """Description of a tool exposed by an MCP server."""

    name: str
    description: str | None
    schema: Mapping[str, Any] | None


@dataclass(frozen=True)
class MCPSchema:
    """Named schema returned by ``schemas/list``."""

    name: str
    schema: Mapping[str, Any]


@dataclass(frozen=True)
class MCPDiscoveryResult:
    """Structured payload describing the MCP server."""

    server_info: Mapping[str, Any]
    capabilities: Mapping[str, Any]
    tools: tuple[MCPTool, ...]
    schemas: tuple[MCPSchema, ...]
    transport: str


class _JsonRpcSession:
    """Base helper implementing id tracking for JSON-RPC sessions."""

    def __init__(self) -> None:
        self._next_id = 0

    def _allocate_id(self) -> int:
        self._next_id += 1
        return self._next_id

    def request(
        self,
        method: str,
        params: Mapping[str, Any] | None = None,
        *,
        timeout: float,
    ) -> Mapping[str, Any]:  # pragma: no cover - provided by subclasses
        raise NotImplementedError

    def close(self) -> None:  # pragma: no cover - provided by subclasses
        raise NotImplementedError


class _StdioSession(_JsonRpcSession):
    """JSON-RPC session speaking the MCP stdio transport."""

    def __init__(
        self,
        command: Sequence[str],
        *,
        env: Mapping[str, Any] | None = None,
        cwd: str | None = None,
    ) -> None:
        super().__init__()
        environment: MutableMapping[str, str] = dict(os.environ)
        if env:
            for key, value in env.items():
                environment[str(key)] = str(value)
        try:
            self._process = subprocess.Popen(
                list(command),
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                cwd=cwd,
                env=environment,
                text=False,
            )
        except FileNotFoundError as exc:  # pragma: no cover - defensive guard
            raise MCPConnectionError(f"Executable '{command[0]}' not found") from exc

        if self._process.stdin is None or self._process.stdout is None:
            raise MCPConnectionError("Failed to establish pipes for MCP stdio session")

        self._stdin = self._process.stdin
        self._stdout = self._process.stdout

    def _write_message(self, payload: Mapping[str, Any]) -> None:
        message = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        header = f"Content-Length: {len(message)}\r\n\r\n".encode("ascii")
        try:
            self._stdin.write(header)
            self._stdin.write(message)
            self._stdin.flush()
        except BrokenPipeError as exc:  # pragma: no cover - defensive guard
            raise MCPConnectionError("Broken pipe while writing to MCP server") from exc

    def _readline(self, timeout: float) -> str:
        deadline = time.monotonic() + timeout
        fd = self._stdout.fileno()
        buffer = bytearray()
        while True:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise MCPConnectionError("Timeout waiting for MCP response")
            ready, _, _ = select.select([fd], [], [], remaining)
            if not ready:
                continue
            chunk = os.read(fd, 1)
            if not chunk:
                raise MCPConnectionError("Unexpected EOF from MCP server")
            buffer.extend(chunk)
            if chunk == b"\n":
                return buffer.decode("utf-8", errors="replace")

    def _read_headers(self, timeout: float) -> dict[str, str]:
        headers: dict[str, str] = {}
        while True:
            line = self._readline(timeout)
            stripped = line.strip()
            if not stripped:
                break
            if ":" not in line:
                continue
            key, value = line.split(":", 1)
            headers[key.strip().lower()] = value.strip()
        return headers

    def _read_exact(self, length: int, timeout: float) -> bytes:
        deadline = time.monotonic() + timeout
        fd = self._stdout.fileno()
        buffer = bytearray()
        while len(buffer) < length:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise MCPConnectionError("Timeout waiting for MCP payload")
            ready, _, _ = select.select([fd], [], [], remaining)
            if not ready:
                continue
            chunk = os.read(fd, length - len(buffer))
            if not chunk:
                raise MCPConnectionError("Unexpected EOF from MCP server")
            buffer.extend(chunk)
        return bytes(buffer)

    def _read_message(self, timeout: float) -> Mapping[str, Any]:
        headers = self._read_headers(timeout)
        try:
            content_length = int(headers.get("content-length", "0"))
        except ValueError as exc:  # pragma: no cover - defensive guard
            raise MCPProtocolError("Invalid Content-Length header") from exc

        if content_length <= 0:
            return {}
        payload = self._read_exact(content_length, timeout)
        try:
            return json.loads(payload.decode("utf-8"))
        except json.JSONDecodeError as exc:
            raise MCPProtocolError("Invalid JSON payload received from MCP server") from exc

    def request(
        self,
        method: str,
        params: Mapping[str, Any] | None = None,
        *,
        timeout: float,
    ) -> Mapping[str, Any]:
        message_id = self._allocate_id()
        message: dict[str, Any] = {"jsonrpc": "2.0", "id": message_id, "method": method}
        if params:
            message["params"] = dict(params)
        self._write_message(message)

        deadline = time.monotonic() + max(timeout, 0.1)
        while True:
            remaining = max(0.0, deadline - time.monotonic())
            response = self._read_message(remaining or 0.1)
            if not response or "id" not in response:
                continue
            if response.get("id") != message_id:
                continue
            if "error" in response:
                error = response["error"] or {}
                raise MCPProtocolError(
                    str(error.get("message", "Unknown MCP error")),
                    code=error.get("code"),
                    data=error.get("data"),
                )
            return dict(response.get("result") or {})

    def close(self) -> None:
        try:
            self.request("shutdown", timeout=1.0)
        except MCPClientError:
            pass
        finally:
            if self._stdin:
                try:
                    self._stdin.close()
                except Exception:  # pragma: no cover - best effort
                    pass
            if self._stdout:
                try:
                    self._stdout.close()
                except Exception:  # pragma: no cover - best effort
                    pass
            if self._process.poll() is None:
                try:
                    self._process.terminate()
                    self._process.wait(timeout=1.0)
                except subprocess.TimeoutExpired:  # pragma: no cover - defensive
                    self._process.kill()


class _WebSocketSession(_JsonRpcSession):
    """JSON-RPC session speaking the MCP WebSocket transport."""

    def __init__(
        self,
        url: str,
        *,
        headers: Mapping[str, Any] | None = None,
        timeout: float = 10.0,
    ) -> None:
        super().__init__()
        try:
            self._client = httpx.Client(timeout=timeout)
            self._ws_manager = self._client.websocket_connect(
                url,
                headers={str(key): str(value) for key, value in (headers or {}).items()},
            )
            self._websocket = self._ws_manager.__enter__()
        except httpx.HTTPError as exc:
            raise MCPConnectionError(f"Unable to connect to MCP WebSocket at {url}") from exc
        self._timeout = timeout

    def request(
        self,
        method: str,
        params: Mapping[str, Any] | None = None,
        *,
        timeout: float,
    ) -> Mapping[str, Any]:
        message_id = self._allocate_id()
        payload: dict[str, Any] = {"jsonrpc": "2.0", "id": message_id, "method": method}
        if params:
            payload["params"] = dict(params)
        self._websocket.send_json(payload)

        deadline = time.monotonic() + max(timeout, 0.1)
        while True:
            remaining = max(0.0, deadline - time.monotonic())
            try:
                response = self._websocket.receive_json(timeout=remaining or 0.1)
            except httpx.ReadTimeout as exc:
                raise MCPConnectionError("Timeout waiting for MCP response over WebSocket") from exc
            if not isinstance(response, Mapping) or "id" not in response:
                continue
            if response.get("id") != message_id:
                continue
            if "error" in response:
                error = response["error"] or {}
                raise MCPProtocolError(
                    str(error.get("message", "Unknown MCP error")),
                    code=error.get("code"),
                    data=error.get("data"),
                )
            return dict(response.get("result") or {})

    def close(self) -> None:
        try:
            self.request("shutdown", timeout=self._timeout)
        except MCPClientError:
            pass
        finally:
            try:
                self._websocket.close()
            finally:
                self._ws_manager.__exit__(None, None, None)
                self._client.close()


def _resolve_command(command: str | Sequence[str]) -> tuple[str, ...]:
    if isinstance(command, str):
        return tuple(shlex.split(command))
    if isinstance(command, Sequence):
        return tuple(str(part) for part in command)
    raise TypeError("command must be a string or sequence of strings")


def _collect_paged(
    session: _JsonRpcSession,
    method: str,
    *,
    result_key: str,
    timeout: float,
    allow_missing: bool = False,
) -> list[Mapping[str, Any]]:
    items: list[Mapping[str, Any]] = []
    cursor: Any | None = None
    while True:
        params = {"cursor": cursor} if cursor else None
        try:
            payload = session.request(method, params, timeout=timeout)
        except MCPProtocolError as exc:
            if allow_missing and (exc.code == -32601 or "unknown" in str(exc).lower()):
                break
            raise
        entries = payload.get(result_key) or []
        if isinstance(entries, Iterable):
            items.extend(entry for entry in entries if isinstance(entry, Mapping))
        cursor = payload.get("nextCursor") or payload.get("next_cursor")
        if not cursor:
            break
    return items


def _normalise_tool(payload: Mapping[str, Any]) -> MCPTool:
    schema = None
    for key in ("schema", "inputSchema", "input_schema", "parameters", "arguments_schema"):
        candidate = payload.get(key)
        if isinstance(candidate, Mapping):
            schema = dict(candidate)
            break
    return MCPTool(
        name=str(payload.get("name") or ""),
        description=str(payload.get("description")) if payload.get("description") is not None else None,
        schema=schema,
    )


def _normalise_schema(payload: Mapping[str, Any]) -> MCPSchema:
    schema_payload = payload.get("schema")
    if not isinstance(schema_payload, Mapping):
        schema_payload = {}
    name = payload.get("name") or payload.get("id") or ""
    return MCPSchema(name=str(name), schema=dict(schema_payload))


def discover(
    server: Mapping[str, Any],
    *,
    timeout: float = 10.0,
) -> MCPDiscoveryResult:
    """Discover tools and schemas exposed by an MCP server description."""

    transport = str(server.get("transport", "stdio")).lower()
    session: _JsonRpcSession
    if transport in {"stdio", "command"}:
        command = server.get("command")
        if not command:
            raise MCPConnectionError("Missing command for stdio MCP server")
        env = server.get("env") if isinstance(server.get("env"), Mapping) else None
        cwd = server.get("cwd")
        session = _StdioSession(
            _resolve_command(command),
            env=env,
            cwd=str(cwd) if cwd is not None else None,
        )
    elif transport in {"ws", "wss", "websocket"}:
        url = server.get("url") or server.get("endpoint")
        if not url:
            raise MCPConnectionError("Missing WebSocket URL for MCP server discovery")
        headers = server.get("headers") if isinstance(server.get("headers"), Mapping) else None
        session = _WebSocketSession(str(url), headers=headers, timeout=timeout)
    else:
        raise MCPConnectionError(f"Unsupported MCP transport '{transport}'")

    try:
        init_payload = session.request(
            "initialize",
            {
                "clientInfo": {"name": "console-config-assistant", "version": "0.1.0"},
                "capabilities": {},
            },
            timeout=timeout,
        )
        server_info = dict(init_payload.get("serverInfo") or {})
        capabilities = dict(init_payload.get("capabilities") or {})

        tools_raw = _collect_paged(session, "tools/list", result_key="tools", timeout=timeout)
        schemas_raw = _collect_paged(
            session,
            "schemas/list",
            result_key="schemas",
            timeout=timeout,
            allow_missing=True,
        )
    finally:
        session.close()

    tools = tuple(_normalise_tool(tool) for tool in tools_raw)
    schemas = tuple(_normalise_schema(schema) for schema in schemas_raw)

    return MCPDiscoveryResult(
        server_info=server_info,
        capabilities=capabilities,
        tools=tools,
        schemas=schemas,
        transport=transport,
    )


__all__ = [
    "MCPClientError",
    "MCPConnectionError",
    "MCPProtocolError",
    "MCPTool",
    "MCPSchema",
    "MCPDiscoveryResult",
    "discover",
]
