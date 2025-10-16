from __future__ import annotations

import json
import sys
import time
from dataclasses import asdict
from typing import Any, Dict, List, Optional, Tuple

from .client import GLMClient
from .config import LimitConfig, Settings
from .schemas import ChatArguments, EmbeddingArguments, TokenCountArguments
from .telemetry import TelemetryLogger, TelemetryRecord
from .tokenizer import (
    count_tokens_from_iterable,
    count_tokens_from_messages,
    count_tokens_from_text,
)

JSONRPC_VERSION = "2.0"


class MCPServer:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.client = GLMClient(settings)
        self.telemetry = TelemetryLogger(settings.telemetry_file)
        self.running = True

    # STDIO helpers -----------------------------------------------------
    def run_stdio(self) -> None:
        stdin = sys.stdin
        stdout = sys.stdout
        while self.running:
            message = self._read_message(stdin)
            if message is None:
                break
            if message.get("__invalid__"):
                continue
            response = self._handle_message(message)
            if response is not None:
                self._send_message(stdout, response)
        self.client.close()

    def _read_message(self, stdin: Any) -> Optional[Dict[str, Any]]:
        headers: Dict[str, str] = {}
        while True:
            line = stdin.readline()
            if line == "":
                return None
            line = line.strip()
            if not line:
                break
            if ":" not in line:
                continue
            key, value = line.split(":", 1)
            headers[key.strip().lower()] = value.strip()
        content_length = int(headers.get("content-length", "0"))
        if content_length <= 0:
            return None
        body = stdin.read(content_length)
        if not body:
            return None
        try:
            return json.loads(body)
        except json.JSONDecodeError:
            return {"__invalid__": True}

    def _send_message(self, stdout: Any, message: Dict[str, Any]) -> None:
        payload = json.dumps(message, ensure_ascii=False)
        stdout.write(f"Content-Length: {len(payload.encode('utf-8'))}\r\n\r\n{payload}")
        stdout.flush()

    # Message handling --------------------------------------------------
    def _handle_message(self, message: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        method = message.get("method")
        msg_id = message.get("id")
        if method == "initialize":
            result = {
                "serverInfo": {
                    "name": "glm46-mcp-server",
                    "version": "0.2.0",
                },
                "capabilities": {},
            }
            return self._response(msg_id, result)
        if method == "shutdown":
            self.running = False
            return self._response(msg_id, {})
        if method == "tools/list":
            return self._response(msg_id, {"tools": self._tools_list()})
        if method == "tools/call":
            params = message.get("params", {})
            return self._handle_tool_call(msg_id, params)
        # Notifications or unknown methods.
        if msg_id is None:
            return None
        return self._error(msg_id, code=-32601, message=f"Método desconhecido: {method}")

    def _tools_list(self) -> List[Dict[str, Any]]:
        return [
            {
                "name": "glm46.chat",
                "description": "Chat completions via GLM-4.6 com guardrails de custo/tokens.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "messages": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "role": {"type": "string"},
                                    "content": {"type": "string"},
                                },
                                "required": ["role", "content"],
                            },
                        },
                        "max_tokens": {"type": "integer", "minimum": 1},
                        "temperature": {"type": "number", "minimum": 0, "maximum": 2},
                        "route": {"type": "string"},
                    },
                    "required": ["messages"],
                },
            },
            {
                "name": "glm46.embedding",
                "description": "Geração de embeddings (quando suportado pela API GLM).",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "texts": {
                            "type": "array",
                            "items": {"type": "string"},
                        },
                        "route": {"type": "string"},
                    },
                    "required": ["texts"],
                },
            },
            {
                "name": "glm46.token_count",
                "description": "Contagem heurística de tokens (pré-validação de guardrails).",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "texts": {
                            "type": "array",
                            "items": {"type": "string"},
                        },
                        "route": {"type": "string"},
                    },
                    "required": ["texts"],
                },
            },
        ]

    def _extract_experiment(self, arguments: Dict[str, Any]) -> Tuple[Optional[str], Optional[str]]:
        experiment = arguments.get("experiment")
        if isinstance(experiment, dict):
            cohort = experiment.get("cohort")
            tag = experiment.get("tag")
            cohort_str = None
            if isinstance(cohort, str):
                cohort_str = cohort.strip() or None
            elif cohort is not None:
                cohort_str = str(cohort)
            tag_str = None
            if isinstance(tag, str):
                tag_str = tag.strip() or None
            elif tag is not None:
                tag_str = str(tag)
            return cohort_str, tag_str
        return None, None

    def _handle_tool_call(self, msg_id: Any, params: Dict[str, Any]) -> Dict[str, Any]:
        name = params.get("name")
        arguments = params.get("arguments") or {}
        experiment_cohort, experiment_tag = self._extract_experiment(arguments)
        try:
            if name == "glm46.chat":
                return self._chat_tool(
                    msg_id,
                    arguments,
                    experiment_cohort=experiment_cohort,
                    experiment_tag=experiment_tag,
                )
            if name == "glm46.embedding":
                return self._embedding_tool(
                    msg_id,
                    arguments,
                    experiment_cohort=experiment_cohort,
                    experiment_tag=experiment_tag,
                )
            if name == "glm46.token_count":
                return self._token_count_tool(
                    msg_id,
                    arguments,
                    experiment_cohort=experiment_cohort,
                    experiment_tag=experiment_tag,
                )
            raise ValueError(f"Tool desconhecida: {name}")
        except Exception as exc:  # pylint: disable=broad-except
            telemetry = TelemetryLogger.create(
                name or "unknown",
                arguments.get("route"),
                experiment_cohort=experiment_cohort,
                experiment_tag=experiment_tag,
            )
            telemetry.status = "error"
            telemetry.metadata = {"error": str(exc)}
            self.telemetry.log(telemetry)
            return self._error(msg_id, code=-32000, message=str(exc))

    def _chat_tool(
        self,
        msg_id: Any,
        arguments: Dict[str, Any],
        *,
        experiment_cohort: Optional[str],
        experiment_tag: Optional[str],
    ) -> Dict[str, Any]:
        data = ChatArguments(**arguments)
        route = data.route
        limits = self._limits_for_route(route)
        telemetry = TelemetryLogger.create(
            "glm46.chat",
            route,
            experiment_cohort=experiment_cohort
            or (data.experiment.cohort if data.experiment else None),
            experiment_tag=experiment_tag or (data.experiment.tag if data.experiment else None),
        )
        start_time = time.perf_counter()

        tokens_in = count_tokens_from_messages([msg.dict() for msg in data.messages])
        telemetry.tokens_in = tokens_in
        if tokens_in > limits.max_tokens:
            telemetry.status = "denied"
            telemetry.metadata = {"reason": "MAX_TOKENS_EXCEEDED", "limit": limits.max_tokens}
            self._finalize_telemetry(telemetry, start_time)
            return self._error(
                msg_id,
                code=400,
                message=f"MAX_TOKENS_EXCEEDED: entrada com {tokens_in} tokens (limite {limits.max_tokens})",
            )

        available_tokens = max(limits.max_tokens - tokens_in, 1)
        if data.max_tokens is not None:
            max_completion_tokens = max(1, min(data.max_tokens, available_tokens))
        else:
            max_completion_tokens = available_tokens

        estimated_cost = self._estimate_cost(tokens_in, max_completion_tokens)
        telemetry.cost_estimated_usd = estimated_cost
        if estimated_cost is not None and estimated_cost > limits.max_cost_usd:
            telemetry.status = "denied"
            telemetry.metadata = {
                "reason": "BUDGET_EXCEEDED",
                "estimated_cost": estimated_cost,
                "limit": limits.max_cost_usd,
            }
            self._finalize_telemetry(telemetry, start_time)
            return self._error(
                msg_id,
                code=402,
                message=f"BUDGET_EXCEEDED: custo estimado {estimated_cost:.4f} > limite {limits.max_cost_usd:.4f}",
            )

        payload = {
            "messages": [msg.dict() for msg in data.messages],
            "max_tokens": max_completion_tokens,
        }
        if data.temperature is not None:
            payload["temperature"] = data.temperature

        try:
            raw = self.client.chat(payload, limits.timeout_s)
            choices = raw.get("choices", [])
            if not choices:
                raise RuntimeError("Resposta sem choices da API GLM-4.6")
            content = choices[0].get("message", {}).get("content", "")
            usage = raw.get("usage", {})
            tokens_out = int(usage.get("completion_tokens", count_tokens_from_text(str(content))))
            prompt_tokens = int(usage.get("prompt_tokens", tokens_in))
            telemetry.tokens_out = tokens_out
            telemetry.metadata = {
                "usage": {
                    "prompt_tokens": prompt_tokens,
                    "completion_tokens": tokens_out,
                    "total_tokens": prompt_tokens + tokens_out,
                }
            }
            final_cost = self._estimate_cost(prompt_tokens, tokens_out)
            telemetry.cost_estimated_usd = final_cost
            telemetry.status = "success"
            self._finalize_telemetry(telemetry, start_time)
            return self._response(
                msg_id,
                {
                    "content": [
                        {
                            "type": "text",
                            "text": content,
                        }
                    ],
                    "metadata": telemetry.metadata,
                },
            )
        except Exception as exc:  # pylint: disable=broad-except
            telemetry.status = "error"
            telemetry.metadata = {"error": str(exc)}
            self._finalize_telemetry(telemetry, start_time)
            return self._error(msg_id, code=500, message=str(exc))

    def _embedding_tool(
        self,
        msg_id: Any,
        arguments: Dict[str, Any],
        *,
        experiment_cohort: Optional[str],
        experiment_tag: Optional[str],
    ) -> Dict[str, Any]:
        data = EmbeddingArguments(**arguments)
        route = data.route
        limits = self._limits_for_route(route)
        telemetry = TelemetryLogger.create(
            "glm46.embedding",
            route,
            experiment_cohort=experiment_cohort
            or (data.experiment.cohort if data.experiment else None),
            experiment_tag=experiment_tag or (data.experiment.tag if data.experiment else None),
        )
        start_time = time.perf_counter()

        tokens_in = count_tokens_from_iterable(data.texts)
        telemetry.tokens_in = tokens_in
        if tokens_in > limits.max_tokens:
            telemetry.status = "denied"
            telemetry.metadata = {"reason": "MAX_TOKENS_EXCEEDED", "limit": limits.max_tokens}
            self._finalize_telemetry(telemetry, start_time)
            return self._error(
                msg_id,
                code=400,
                message=f"MAX_TOKENS_EXCEEDED: entrada com {tokens_in} tokens (limite {limits.max_tokens})",
            )

        estimated_cost = None
        if self.settings.price_table.embedding_per_1k is not None:
            estimated_cost = (tokens_in / 1000.0) * self.settings.price_table.embedding_per_1k
        telemetry.cost_estimated_usd = estimated_cost
        if estimated_cost is not None and estimated_cost > limits.max_cost_usd:
            telemetry.status = "denied"
            telemetry.metadata = {
                "reason": "BUDGET_EXCEEDED",
                "estimated_cost": estimated_cost,
                "limit": limits.max_cost_usd,
            }
            self._finalize_telemetry(telemetry, start_time)
            return self._error(
                msg_id,
                code=402,
                message=f"BUDGET_EXCEEDED: custo estimado {estimated_cost:.4f} > limite {limits.max_cost_usd:.4f}",
            )

        try:
            raw = self.client.embedding(data.texts, limits.timeout_s)
            embeddings = raw.get("data") or raw.get("embeddings")
            if embeddings is None:
                raise RuntimeError("Resposta sem embeddings da API GLM-4.6")
            telemetry.tokens_out = 0
            telemetry.metadata = {"vector_count": len(embeddings)}
            telemetry.status = "success"
            self._finalize_telemetry(telemetry, start_time)
            return self._response(
                msg_id,
                {
                    "content": [
                        {
                            "type": "json",
                            "json": embeddings,
                        }
                    ],
                    "metadata": telemetry.metadata,
                },
            )
        except Exception as exc:  # pylint: disable=broad-except
            telemetry.status = "error"
            telemetry.metadata = {"error": str(exc)}
            self._finalize_telemetry(telemetry, start_time)
            return self._error(msg_id, code=500, message=str(exc))

    def _token_count_tool(
        self,
        msg_id: Any,
        arguments: Dict[str, Any],
        *,
        experiment_cohort: Optional[str],
        experiment_tag: Optional[str],
    ) -> Dict[str, Any]:
        data = TokenCountArguments(**arguments)
        route = data.route
        limits = self._limits_for_route(route)
        telemetry = TelemetryLogger.create(
            "glm46.token_count",
            route,
            experiment_cohort=experiment_cohort
            or (data.experiment.cohort if data.experiment else None),
            experiment_tag=experiment_tag or (data.experiment.tag if data.experiment else None),
        )
        start_time = time.perf_counter()

        tokens = count_tokens_from_iterable(data.texts)
        telemetry.tokens_in = tokens
        telemetry.tokens_out = 0
        telemetry.status = "success"
        telemetry.metadata = {"limit": asdict(limits)}
        telemetry.cost_estimated_usd = None
        self._finalize_telemetry(telemetry, start_time)
        return self._response(
            msg_id,
            {
                "content": [
                    {
                        "type": "json",
                        "json": {
                            "tokens": tokens,
                            "limit": asdict(limits),
                        },
                    }
                ],
            },
        )

    def _limits_for_route(self, route: Optional[str]) -> LimitConfig:
        return self.settings.cost_policy.limits_for(route)

    def _estimate_cost(self, prompt_tokens: int, completion_tokens: int) -> Optional[float]:
        table = self.settings.price_table
        if not table.has_prices():
            return None
        input_cost = (prompt_tokens / 1000.0) * (table.input_per_1k or 0.0)
        output_cost = (completion_tokens / 1000.0) * (table.output_per_1k or 0.0)
        return round(input_cost + output_cost, 6)

    def _finalize_telemetry(self, telemetry: TelemetryRecord, start_time: float) -> None:
        telemetry.duration_ms = int((time.perf_counter() - start_time) * 1000)
        self.telemetry.log(telemetry)

    @staticmethod
    def _response(msg_id: Any, result: Any) -> Dict[str, Any]:
        return {"jsonrpc": JSONRPC_VERSION, "id": msg_id, "result": result}

    @staticmethod
    def _error(msg_id: Any, code: int, message: str) -> Dict[str, Any]:
        return {"jsonrpc": JSONRPC_VERSION, "id": msg_id, "error": {"code": code, "message": message}}


def run_stdio(settings: Settings) -> None:
    server = MCPServer(settings)
    server.run_stdio()
