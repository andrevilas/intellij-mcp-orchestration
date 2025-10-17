"""Diagnostics service that aggregates health and invoke signals for the console UI."""

from __future__ import annotations

import os
import time
from datetime import datetime, timezone
from typing import Any, Mapping

import httpx
from httpx import ASGITransport
import structlog
from fastapi import Request

from .schemas import (
    DiagnosticsComponent,
    DiagnosticsRequest,
    DiagnosticsResponse,
    DiagnosticsSummary,
)


logger = structlog.get_logger("console.diagnostics")


def _normalize_agents_base(request: Request, payload: DiagnosticsRequest) -> str:
    """Resolve the agents base URL used when invoking the MCP hub."""

    explicit = payload.agents_base_url
    if explicit:
        return str(explicit).rstrip("/")

    env_override = os.getenv("CONSOLE_MCP_AGENTS_BASE_URL")
    if env_override:
        return env_override.rstrip("/")

    base_url = str(request.base_url).rstrip("/")
    return f"{base_url}/agents".rstrip("/")


def _extract_error_message(data: Any, *, default: str) -> str:
    if isinstance(data, Mapping):
        detail = data.get("detail") or data.get("error")
        if isinstance(detail, str) and detail.strip():
            return detail
    if isinstance(data, str) and data.strip():
        return data.strip()
    return default


class DiagnosticsService:
    """High level orchestrator that gathers health, inventory and invoke checks."""

    def __init__(
        self,
        *,
        request_timeout: float = 10.0,
        agents_transport: httpx.BaseTransport | None = None,
    ) -> None:
        self._timeout = request_timeout
        self._agents_transport = agents_transport

    async def run(
        self, request: Request, payload: DiagnosticsRequest
    ) -> DiagnosticsResponse:
        """Execute the diagnostics workflow and aggregate the results."""

        timestamp = datetime.now(tz=timezone.utc)

        api_transport = ASGITransport(app=request.app)
        async with httpx.AsyncClient(
            transport=api_transport,
            base_url=str(request.base_url),
            timeout=self._timeout,
        ) as api_client:
            health = await self._call_endpoint(api_client, "GET", "/api/v1/healthz")
            providers = await self._call_endpoint(api_client, "GET", "/api/v1/providers")

        agents_base = _normalize_agents_base(request, payload)
        invoke_url = f"{agents_base}/{payload.invoke.agent}/invoke"

        async with httpx.AsyncClient(
            timeout=self._timeout,
            transport=self._agents_transport,
        ) as agents_client:
            invoke = await self._call_endpoint(
                agents_client,
                "POST",
                invoke_url,
                json={
                    "input": payload.invoke.input or {},
                    "config": payload.invoke.config or {},
                },
            )

        components = {
            "health": health,
            "providers": providers,
            "invoke": invoke,
        }

        summary = DiagnosticsSummary(
            total=len(components),
            successes=sum(1 for component in components.values() if component.ok),
            failures=sum(1 for component in components.values() if not component.ok),
            errors={
                name: component.error
                for name, component in components.items()
                if component.error
            },
        )

        return DiagnosticsResponse(
            timestamp=timestamp,
            summary=summary,
            health=health,
            providers=providers,
            invoke=invoke,
        )

    async def _call_endpoint(
        self,
        client: httpx.AsyncClient,
        method: str,
        url: str,
        *,
        json: Mapping[str, Any] | None = None,
    ) -> DiagnosticsComponent:
        start = time.perf_counter()
        try:
            response = await client.request(method, url, json=json)
        except httpx.HTTPError as exc:
            duration_ms = round((time.perf_counter() - start) * 1000, 2)
            logger.warning(
                "diagnostics.request_failed",
                method=method,
                url=url,
                error=str(exc),
            )
            return DiagnosticsComponent(
                ok=False,
                status_code=None,
                duration_ms=duration_ms,
                data=None,
                error=str(exc),
            )

        duration_ms = round((time.perf_counter() - start) * 1000, 2)
        data: Any | None = None
        if response.content:
            try:
                data = response.json()
            except ValueError:
                data = response.text

        if response.is_success:
            return DiagnosticsComponent(
                ok=True,
                status_code=response.status_code,
                duration_ms=duration_ms,
                data=data,
                error=None,
            )

        message = _extract_error_message(
            data,
            default=f"Request failed with status {response.status_code}",
        )
        logger.warning(
            "diagnostics.request_error",
            method=method,
            url=url,
            status=response.status_code,
            message=message,
        )

        normalized_data = data if isinstance(data, (Mapping, list)) else None
        return DiagnosticsComponent(
            ok=False,
            status_code=response.status_code,
            duration_ms=duration_ms,
            data=normalized_data,
            error=message,
        )


diagnostics_service = DiagnosticsService()


__all__ = ["DiagnosticsService", "diagnostics_service"]

