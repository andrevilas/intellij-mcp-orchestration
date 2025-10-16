"""Render helper functions for configuration assistant responses and scaffolds."""

from __future__ import annotations

from textwrap import dedent
import re
from typing import Mapping, Sequence

from ..schemas_plan import Plan

_DEFAULT_CAPABILITIES: tuple[str, ...] = ("structured-output",)


def render_plan_overview(plan: Plan) -> str:
    """Create a human readable summary of the provided plan."""

    step_titles = ", ".join(step.title for step in plan.steps) or "no concrete steps"
    return f"Planned intent '{plan.intent}' covering: {step_titles}."


def render_chat_reply(message: str, plan: Plan | None = None) -> str:
    """Generate a conversational reply for the chat endpoint."""

    if plan is None:
        return (
            "Olá! Posso ajudá-lo a planejar alterações de configuração. "
            "Peça um plano informando uma intent suportada."
        )

    overview = render_plan_overview(plan)
    return f"Recebi sua mensagem '{message}'. {overview}"


def render_mcp_registry_entry(
    agent_name: str,
    *,
    server_id: str,
    repository: str = "agents-hub",
    capabilities: Sequence[str] | None = None,
    tags: Sequence[str] | None = None,
    description: str | None = None,
) -> str:
    """Render a YAML fragment registering the agent in ``mcp-registry.yaml``."""

    slug = _slugify(agent_name)
    module = _module_name(slug)
    class_name = _class_name(slug)
    title = _title_case(agent_name)
    description_text = description or f"Agente MCP '{title}' exposto pelo Agents Hub."
    manifest_path = f"{repository}/app/agents/{slug}/agent.yaml"
    capabilities_values = tuple(dict.fromkeys(capabilities or _DEFAULT_CAPABILITIES)) or _DEFAULT_CAPABILITIES
    tag_values = tuple(dict.fromkeys(tags or ()))

    description_block = _format_block(description_text, indent=6)
    capabilities_block = _format_sequence(capabilities_values, indent=6)
    tags_block = _format_sequence(tag_values, indent=6)

    template = f"""\
agents:
  - id: {slug}
    title: {title}
    description: >
{description_block}
    manifest: {manifest_path}
    entrypoint: app.agents.{module}.agent:build_agent
    server: {server_id}
    runtime:
      package: {repository}
      module: app.agents.{module}.agent
      class: {class_name}Agent
    capabilities:
{capabilities_block}
    tags:
{tags_block}
"""
    return template if template.endswith("\n") else template + "\n"


def render_agent_manifest(
    agent_name: str,
    *,
    title: str | None = None,
    description: str | None = None,
    capabilities: Sequence[str] | None = None,
    tool_name: str | None = None,
) -> str:
    """Render a scaffold ``agent.yaml`` manifest respecting the shared schema."""

    slug = _slugify(agent_name)
    module = _module_name(slug)
    resolved_title = title or _title_case(agent_name)
    resolved_description = description or (
        f"Agente determinístico {resolved_title} com stub inicial para evolução incremental."
    )
    resolved_capabilities = tuple(dict.fromkeys(capabilities or _DEFAULT_CAPABILITIES)) or _DEFAULT_CAPABILITIES
    resolved_tool = tool_name or f"{module}_tool"

    capabilities_block = _format_sequence(resolved_capabilities, indent=4)

    template = f"""\
name: {slug}
title: {resolved_title}
version: 0.1.0
description: {resolved_description}
capabilities:
{capabilities_block}
tools:
  - name: {resolved_tool}
    description: Gera resposta determinística baseada em parâmetros estruturados.
    slo:
      latency_p95_ms: 400
      success_rate: 0.99
      max_error_rate: 0.01
    schema:
      type: object
      additionalProperties: false
      properties:
        topic:
          type: string
          description: Assunto principal para geração de resposta.
        context:
          type: string
          description: Contexto opcional complementando a solicitação.
      required:
        - topic
model:
  provider: openai
  name: o3-mini
  parameters:
    temperature: 0
policies:
  rate_limits:
    requests_per_minute: 120
    burst: 60
    concurrent_requests: 4
  safety:
    mode: balanced
    blocked_categories:
      - pii
  budget:
    currency: USD
    limit: 150.0
    period: monthly
routing:
  default_tier: balanced
  allowed_tiers:
    - economy
    - balanced
  fallback_tier: economy
  max_attempts: 2
  max_iters: 4
  max_parallel_requests: 1
  request_timeout_seconds: 30
finops:
  cost_center: {slug}-operations
  budgets:
    economy:
      amount: 40
      currency: USD
      period: monthly
    balanced:
      amount: 90
      currency: USD
      period: monthly
  alerts:
    - threshold: 0.75
      channel: slack
hitl:
  checkpoints:
    - name: Revisão inicial
      description: Confirmação humana antes de promover mudanças significativas.
      required: false
      escalation_channel: email
observability:
  logging:
    level: info
    destination: stdout
  metrics:
    enabled: true
    exporters:
      - prometheus
    interval_seconds: 60
  tracing:
    enabled: false
"""
    return template if template.endswith("\n") else template + "\n"


def render_agent_module(agent_name: str, *, tool_name: str | None = None) -> str:
    """Render a LangGraph-inspired Python stub for ``agent.py``."""

    slug = _slugify(agent_name)
    module = _module_name(slug)
    class_name = _class_name(slug)
    resolved_tool = tool_name or f"{module}_tool"

    template = f'''\
"""LangGraph-style stub that wires a single tool node declared in the manifest."""

from __future__ import annotations

from pathlib import Path
from typing import Any, Mapping

from app.schemas.manifest import AgentManifest
from app.schemas.manifest import load_manifest as _load_manifest

from ..orchestration import ExecutionState, GraphBackedAgent


class {class_name}Agent(GraphBackedAgent):
    """Deterministic scaffold ready to be customised with business logic."""

    def __init__(self, manifest: AgentManifest | Mapping[str, Any]) -> None:
        if not isinstance(manifest, AgentManifest):
            manifest = AgentManifest.model_validate(manifest)
        super().__init__(manifest)

    def _execute_tool(self, state: ExecutionState) -> Mapping[str, Any]:
        payload = dict(state.payload)
        topic = str(payload.get("topic") or "").strip()
        context = str(payload.get("context") or "").strip()

        if not topic:
            return {{
                "status": "error",
                "reason": "Campo 'topic' obrigatório para a ferramenta '{resolved_tool}'.",
            }}

        summary = "TODO: substitua este stub por lógica específica do agente."
        if context:
            summary = f"{{summary}} Contexto: {{context}}."

        return {{
            "status": "ok",
            "topic": topic,
            "context": context,
            "summary": summary,
        }}

    def _post_process(self, state: ExecutionState) -> Mapping[str, Any]:
        return dict(state.result)


def build_agent(manifest: Mapping[str, Any]) -> {class_name}Agent:
    """Factory used by the registry to construct the agent instance."""

    return {class_name}Agent(manifest=manifest)


def get_tools() -> list[Any]:
    """Expose tool metadata derived from the manifest for discovery APIs."""

    manifest = _load_manifest(Path(__file__).resolve().parent)
    return [tool.model_dump(mode="json") for tool in manifest.tools]


__all__ = ["{class_name}Agent", "build_agent", "get_tools"]
'''
    return dedent(template).lstrip() + "\n"


def _slugify(value: str) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9]+", "-", value).strip("-")
    return cleaned.casefold() or "agent"


def _module_name(slug: str) -> str:
    return slug.replace("-", "_")


def _class_name(slug: str) -> str:
    parts = re.split(r"[^a-zA-Z0-9]+", slug)
    assembled = "".join(part.capitalize() for part in parts if part)
    return assembled or "Agent"


def _title_case(value: str) -> str:
    words = re.split(r"[^a-zA-Z0-9]+", value)
    return " ".join(word.capitalize() for word in words if word) or value.title()


def _format_block(text: str, *, indent: int) -> str:
    normalized = dedent(text).strip()
    if not normalized:
        normalized = "TODO: descreva o agente e seus SLAs."  # pragma: no cover - defensive fallback
    lines = normalized.splitlines()
    padding = " " * indent
    return "\n".join(f"{padding}{line}" if line else padding for line in lines)


def _format_sequence(values: Sequence[str], *, indent: int) -> str:
    if not values:
        return " " * indent + "[]"
    padding = " " * indent
    return "\n".join(f"{padding}- {value}" for value in values)


__all__ = [
    "render_plan_overview",
    "render_chat_reply",
    "render_mcp_registry_entry",
    "render_agent_manifest",
    "render_agent_module",
]
