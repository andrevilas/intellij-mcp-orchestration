"""Utilities for validating MCP server connectivity and capabilities."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Mapping, Sequence

from .mcp_client import (
    MCPClientError,
    MCPDiscoveryResult,
    MCPTool,
    discover,
)


@dataclass(frozen=True)
class MCPValidationOutcome:
    """Represents the outcome of validating an MCP server."""

    endpoint: str
    transport: str
    discovery: MCPDiscoveryResult
    expected_tools: tuple[str, ...]
    missing_tools: tuple[str, ...]

    @property
    def tools(self) -> Sequence[MCPTool]:
        return self.discovery.tools


def _normalise_expected_tools(tools: Sequence[object] | None) -> tuple[str, ...]:
    if not tools:
        return ()
    return tuple(sorted({str(tool).strip() for tool in tools if str(tool).strip()}))


def _build_server_payload(config: Mapping[str, Any]) -> tuple[str, dict[str, Any]]:
    endpoint = str(config.get("endpoint") or config.get("url") or "").strip()
    if not endpoint:
        raise ValueError("endpoint é obrigatório para validar o servidor MCP")

    transport = str(config.get("transport") or "").strip().lower()
    if not transport:
        transport = "websocket" if endpoint.startswith(("ws://", "wss://")) else "stdio"

    server_payload: dict[str, Any] = {"transport": transport}
    auth_payload = config.get("auth") or config.get("headers") or {}
    if not isinstance(auth_payload, Mapping):
        raise ValueError("auth deve ser um mapeamento de chaves para valores")

    if transport in {"stdio", "command"}:
        command = config.get("command") or endpoint
        server_payload["command"] = command
        env_payload = config.get("env") or auth_payload
        if isinstance(env_payload, Mapping) and env_payload:
            server_payload["env"] = {str(key): str(value) for key, value in env_payload.items()}
        cwd = config.get("cwd")
        if cwd is not None:
            server_payload["cwd"] = str(cwd)
    elif transport in {"ws", "wss", "websocket"}:
        server_payload["url"] = endpoint
        if auth_payload:
            server_payload["headers"] = {
                str(key): str(value) for key, value in auth_payload.items()
            }
    else:
        raise ValueError(f"Transport '{transport}' não é suportado para validação")

    return endpoint, server_payload


def validate_server(config: Mapping[str, Any]) -> MCPValidationOutcome:
    """Validate connectivity to an MCP server and list its tools."""

    endpoint, server_payload = _build_server_payload(config)
    expected_tools = _normalise_expected_tools(config.get("tools"))

    discovery = discover(server_payload)

    discovered_names = {tool.name for tool in discovery.tools}
    missing_tools = tuple(tool for tool in expected_tools if tool not in discovered_names)

    return MCPValidationOutcome(
        endpoint=endpoint,
        transport=discovery.transport,
        discovery=discovery,
        expected_tools=expected_tools,
        missing_tools=missing_tools,
    )


__all__ = [
    "MCPClientError",
    "MCPValidationOutcome",
    "validate_server",
]
