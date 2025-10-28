"""Snapshot-style tests for scaffold renderers."""

from __future__ import annotations

from console_mcp_server.config_assistant.renderers import (
    render_agent_manifest,
    render_agent_module,
    render_mcp_registry_entry,
)


def test_render_mcp_registry_entry_snapshot() -> None:
    output = render_mcp_registry_entry(
        "Sentinel Watcher",
        server_id="glm46",
        capabilities=("structured-output", "alerts"),
        tags=("observability", "watcher"),
        description="Monitoramento determinístico de rotas MCP.",
    )

    expected = (
        "agents:\n"
        "  - id: sentinel-watcher\n"
        "    title: Sentinel Watcher\n"
        "    description: >\n"
        "      Monitoramento determinístico de rotas MCP.\n"
        "    manifest: agents-hub/app/agents/sentinel-watcher/agent.yaml\n"
        "    entrypoint: app.agents.sentinel_watcher.agent:build_agent\n"
        "    server: glm46\n"
        "    runtime:\n"
        "      package: agents-hub\n"
        "      module: app.agents.sentinel_watcher.agent\n"
        "      class: SentinelWatcherAgent\n"
        "    capabilities:\n"
        "      - structured-output\n"
        "      - alerts\n"
        "    tags:\n"
        "      - observability\n"
        "      - watcher\n"
    )

    assert output == expected


def test_render_agent_manifest_snapshot() -> None:
    output = render_agent_manifest(
        "Sentinel Watcher",
        title="Sentinel Watcher",
        description="Agente de monitoramento determinístico.",
        capabilities=("structured-output", "alerts"),
        tool_name="watcher_tool",
    )

    expected = (
        "name: sentinel-watcher\n"
        "title: Sentinel Watcher\n"
        "version: 0.1.0\n"
        "description: Agente de monitoramento determinístico.\n"
        "capabilities:\n"
        "    - structured-output\n"
        "    - alerts\n"
        "tools:\n"
        "  - name: watcher_tool\n"
        "    description: Gera resposta determinística baseada em parâmetros estruturados.\n"
        "    slo:\n"
        "      latency_p95_ms: 400\n"
        "      success_rate: 0.99\n"
        "      max_error_rate: 0.01\n"
        "    schema:\n"
        "      type: object\n"
        "      additionalProperties: false\n"
        "      properties:\n"
        "        topic:\n"
        "          type: string\n"
        "          description: Assunto principal para geração de resposta.\n"
        "        context:\n"
        "          type: string\n"
        "          description: Contexto opcional complementando a solicitação.\n"
        "      required:\n"
        "        - topic\n"
        "model:\n"
        "  provider: openai\n"
        "  name: o3-mini\n"
        "  parameters:\n"
        "    temperature: 0\n"
        "policies:\n"
        "  rate_limits:\n"
        "    requests_per_minute: 120\n"
        "    burst: 60\n"
        "    concurrent_requests: 4\n"
        "  safety:\n"
        "    mode: balanced\n"
        "    blocked_categories:\n"
        "      - pii\n"
        "  budget:\n"
        "    currency: USD\n"
        "    limit: 150.0\n"
        "    period: monthly\n"
        "routing:\n"
        "  default_tier: balanced\n"
        "  allowed_tiers:\n"
        "    - economy\n"
        "    - balanced\n"
        "  fallback_tier: economy\n"
        "  max_attempts: 2\n"
        "  max_iters: 4\n"
        "  max_parallel_requests: 1\n"
        "  request_timeout_seconds: 30\n"
        "finops:\n"
        "  cost_center: sentinel-watcher-operations\n"
        "  budgets:\n"
        "    economy:\n"
        "      amount: 40\n"
        "      currency: USD\n"
        "      period: monthly\n"
        "    balanced:\n"
        "      amount: 90\n"
        "      currency: USD\n"
        "      period: monthly\n"
        "  alerts:\n"
        "    - threshold: 0.75\n"
        "      channel: slack\n"
        "  cache:\n"
        "    ttl_seconds: 600\n"
        "  rate_limit:\n"
        "    requests_per_minute: 180\n"
        "  graceful_degradation:\n"
        "    strategy: fallback\n"
        "    message: Servindo rotas alternativas\n"
        "hitl:\n"
        "  checkpoints:\n"
        "    - name: Revisão inicial\n"
        "      description: Confirmação humana antes de promover mudanças significativas.\n"
        "      required: false\n"
        "      escalation_channel: email\n"
        "observability:\n"
        "  logging:\n"
        "    level: info\n"
        "    destination: stdout\n"
        "  metrics:\n"
        "    enabled: true\n"
        "    exporters:\n"
        "      - prometheus\n"
        "    interval_seconds: 60\n"
        "  tracing:\n"
        "    enabled: false\n"
    )

    assert output == expected


def test_render_agent_module_snapshot() -> None:
    output = render_agent_module("Sentinel Watcher", tool_name="watcher_tool")

    expected = (
        '"""LangGraph-style stub that wires a single tool node declared in the manifest."""\n\n'
        "from __future__ import annotations\n\n"
        "from pathlib import Path\n"
        "from typing import Any, Mapping\n\n"
        "from app.schemas.manifest import AgentManifest\n"
        "from app.schemas.manifest import load_manifest as _load_manifest\n\n"
        "from ..orchestration import ExecutionState, GraphBackedAgent\n\n\n"
        "class SentinelWatcherAgent(GraphBackedAgent):\n"
        "    \"\"\"Deterministic scaffold ready to be customised with business logic.\"\"\"\n\n"
        "    def __init__(self, manifest: AgentManifest | Mapping[str, Any]) -> None:\n"
        "        if not isinstance(manifest, AgentManifest):\n"
        "            manifest = AgentManifest.model_validate(manifest)\n"
        "        super().__init__(manifest)\n"
        "        self._hitl_checkpoints = tuple(self.manifest.hitl.checkpoints) if self.manifest.hitl else ()\n\n"
        "    def _execute_tool(self, state: ExecutionState) -> Mapping[str, Any]:\n"
        "        payload = dict(state.payload)\n"
        "        topic = str(payload.get(\"topic\") or \"\").strip()\n"
        "        context = str(payload.get(\"context\") or \"\").strip()\n\n"
        "        if not topic:\n"
        "            return {\n"
        "                \"status\": \"error\",\n"
        "                \"reason\": \"Campo 'topic' obrigatório para a ferramenta 'watcher_tool'.\",\n"
        "            }\n\n"
        "        summary = \"TODO: substitua este stub por lógica específica do agente.\"\n"
        "        if context:\n"
        "            summary = f\"{summary} Contexto: {context}.\"\n\n"
        "        result = {\n"
        "            \"status\": \"ok\",\n"
        "            \"topic\": topic,\n"
        "            \"context\": context,\n"
        "            \"summary\": summary,\n"
        "        }\n"
        "        if self._hitl_checkpoints:\n"
        "            result[\"pending_checkpoints\"] = [checkpoint.name for checkpoint in self._hitl_checkpoints]\n"
        "        return result\n\n"
        "    def _post_process(self, state: ExecutionState) -> Mapping[str, Any]:\n"
        "        processed = dict(state.result)\n"
        "        if self._hitl_checkpoints and \"hitl_checkpoints\" not in processed:\n"
        "            processed[\"hitl_checkpoints\"] = [\n"
        "                {\n"
        "                    \"name\": checkpoint.name,\n"
        "                    \"description\": checkpoint.description,\n"
        "                    \"required\": checkpoint.required,\n"
        "                    \"escalation_channel\": getattr(checkpoint, \"escalation_channel\", None),\n"
        "                }\n"
        "                for checkpoint in self._hitl_checkpoints\n"
        "            ]\n"
        "        return processed\n\n"
        "    def _hitl_blocked_payload(self, checkpoint: Any) -> Mapping[str, Any]:\n"
        "        metadata = {\n"
        "            \"name\": getattr(checkpoint, \"name\", str(checkpoint)),\n"
        "            \"description\": getattr(checkpoint, \"description\", None),\n"
        "            \"required\": bool(getattr(checkpoint, \"required\", False)),\n"
        "            \"escalation_channel\": getattr(checkpoint, \"escalation_channel\", None),\n"
        "        }\n"
        "        filtered = {\n"
        "            key: value\n"
        "            for key, value in metadata.items()\n"
        "            if key == \"name\" or value not in (None, \"\")\n"
        "        }\n"
        "        return {\n"
        "            \"status\": \"hitl_blocked\",\n"
        "            \"checkpoint\": filtered[\"name\"],\n"
        "            \"metadata\": filtered,\n"
        "        }\n\n\n"
        "def build_agent(manifest: Mapping[str, Any]) -> SentinelWatcherAgent:\n"
        "    \"\"\"Factory used by the registry to construct the agent instance.\"\"\"\n\n"
        "    return SentinelWatcherAgent(manifest=manifest)\n\n\n"
        "def get_tools() -> list[Any]:\n"
        "    \"\"\"Expose tool metadata derived from the manifest for discovery APIs.\"\"\"\n\n"
        "    manifest = _load_manifest(Path(__file__).resolve().parent)\n"
        "    return [tool.model_dump(mode=\"json\") for tool in manifest.tools]\n\n\n"
        "__all__ = [\"SentinelWatcherAgent\", \"build_agent\", \"get_tools\"]\n\n"
    )

    assert output == expected
