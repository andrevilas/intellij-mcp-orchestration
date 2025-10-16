"""Helpers for serializing LangGraph flows and managing persisted versions."""

from __future__ import annotations

import ast
import difflib
import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pprint import pformat
from typing import Any, Mapping
from uuid import uuid4

from pydantic import BaseModel, Field, ValidationError
from sqlalchemy import text

from ..database import session_scope


class FlowNode(BaseModel):
    """Representation of a single node in the LangGraph flow editor."""

    id: str = Field(..., min_length=1)
    type: str = Field(..., min_length=1)
    label: str = Field(..., min_length=1)
    config: dict[str, Any] = Field(default_factory=dict)

    def requires_hitl(self) -> bool:
        node_type = self.type.lower()
        if node_type == "checkpoint":
            return True
        requires = self.config.get("requires_hitl")
        if isinstance(requires, bool):
            return requires
        category = self.config.get("category")
        if isinstance(category, str) and category.lower() == "hitl":
            return True
        return False


class FlowEdge(BaseModel):
    """Connection between two nodes in the LangGraph flow."""

    id: str = Field(..., min_length=1)
    source: str = Field(..., min_length=1)
    target: str = Field(..., min_length=1)
    condition: str | None = None


class FlowGraph(BaseModel):
    """High-level description of a LangGraph flow."""

    id: str = Field(..., min_length=1)
    label: str = Field(..., min_length=1)
    entry: str = Field(..., min_length=1)
    exit: str = Field(..., min_length=1)
    nodes: list[FlowNode] = Field(default_factory=list)
    edges: list[FlowEdge] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)

    def ensure_valid(self) -> None:
        node_ids = {node.id for node in self.nodes}
        if self.entry not in node_ids:
            raise ValueError(f"entry node '{self.entry}' not present in graph")
        if self.exit not in node_ids:
            raise ValueError(f"exit node '{self.exit}' not present in graph")
        for edge in self.edges:
            if edge.source not in node_ids:
                raise ValueError(f"edge {edge.id} references unknown source '{edge.source}'")
            if edge.target not in node_ids:
                raise ValueError(f"edge {edge.id} references unknown target '{edge.target}'")

    def hitl_nodes(self) -> tuple[str, ...]:
        return tuple(node.id for node in self.nodes if node.requires_hitl())


class FlowVersionDiff(BaseModel):
    """Diff summary between two LangGraph versions."""

    flow_id: str
    from_version: int
    to_version: int
    diff: str


@dataclass(frozen=True)
class FlowVersionRecord:
    """Stored LangGraph version persisted in the database."""

    id: str
    flow_id: str
    version: int
    graph: FlowGraph
    agent_code: str
    hitl_checkpoints: tuple[str, ...]
    comment: str | None
    created_at: datetime
    created_by: str | None
    diff: str | None

    @classmethod
    def from_row(cls, row: Mapping[str, Any]) -> "FlowVersionRecord":
        graph_payload = str(row["graph"])
        try:
            graph = FlowGraph.model_validate_json(graph_payload)
        except ValidationError as exc:  # pragma: no cover - defensive guard
            raise ValueError("invalid graph payload stored in flow_versions") from exc
        created_at = datetime.fromisoformat(str(row["created_at"]))
        hitl_raw = json.loads(row["hitl_checkpoints"] or "[]")
        diff_value = row.get("diff")
        return cls(
            id=str(row["id"]),
            flow_id=str(row["flow_id"]),
            version=int(row["version"]),
            graph=graph,
            agent_code=str(row["agent_code"]),
            hitl_checkpoints=tuple(str(value) for value in hitl_raw),
            comment=str(row["comment"]) if row.get("comment") is not None else None,
            created_at=created_at,
            created_by=str(row["created_by"]) if row.get("created_by") is not None else None,
            diff=str(diff_value) if diff_value is not None else None,
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "flow_id": self.flow_id,
            "version": self.version,
            "graph": self.graph.model_dump(mode="json"),
            "agent_code": self.agent_code,
            "hitl_checkpoints": list(self.hitl_checkpoints),
            "comment": self.comment,
            "created_at": self.created_at,
            "created_by": self.created_by,
            "diff": self.diff,
        }


def _now() -> datetime:
    return datetime.now(tz=timezone.utc)


def _serialize_graph(graph: FlowGraph) -> str:
    payload = graph.model_dump(mode="json", by_alias=False, exclude_none=True)
    return json.dumps(payload, ensure_ascii=False, sort_keys=True)


def _compute_diff(previous: str | None, current: str, *, flow_id: str) -> str | None:
    if previous is None:
        return None
    diff_lines = difflib.unified_diff(
        previous.splitlines(),
        current.splitlines(),
        fromfile=f"{flow_id}@previous",
        tofile=f"{flow_id}@current",
        lineterm="",
    )
    diff = "\n".join(diff_lines)
    return diff or None


def _graph_literal(graph: FlowGraph) -> str:
    payload = graph.model_dump(mode="python")
    return pformat(payload, sort_dicts=True)


def graph_to_agent(graph: FlowGraph) -> str:
    """Render a LangGraph agent module from the provided flow graph."""

    graph.ensure_valid()
    agent_class = str(graph.metadata.get("agent_class") or "FlowAgent")
    module_doc = graph.metadata.get("description") or f"LangGraph flow for {graph.label}."
    literal = _graph_literal(graph)
    checkpoints = "\n".join(f"    '{node}'," for node in graph.hitl_nodes())
    hitl_block = f"\nHITL_CHECKPOINTS = (\n{checkpoints}\n)\n" if checkpoints else "\nHITL_CHECKPOINTS: tuple[str, ...] = ()\n"
    return (
        "\n".join(
            [
                f"\"\"\"{module_doc}\"\"\"",
                "from __future__ import annotations",
                "",
                "from langchain_core.runnables import RunnableLambda",
                "from langgraph.graph import END, START, Graph",
                "",
                f"GRAPH_DEFINITION = {literal}",
                hitl_block.strip("\n"),
                "",
                "def request_human_approval(node_id: str, state: dict | None = None) -> dict | None:",
                "    \"\"\"Hook invoked whenever a HITL checkpoint is reached.\"\"\"",
                "    raise NotImplementedError(f'HITL checkpoint {node_id} requires implementation')",
                "",
                "def _build_node(node: dict[str, object]) -> RunnableLambda:",
                "    def _passthrough(state: dict | None = None) -> dict | None:",
                "        return state or {}",
                "",
                "    if node.get('type') == 'checkpoint' or node.get('requires_hitl'):",
                "        def _checkpoint(state: dict | None = None) -> dict | None:",
                "            request_human_approval(str(node['id']), state)",
                "            return state or {}",
                "",
                "        return RunnableLambda(_checkpoint)",
                "",
                "    return RunnableLambda(_passthrough)",
                "",
                "def build_graph() -> Graph:",
                "    definition = GRAPH_DEFINITION",
                "    graph = Graph()",
                "    for node in definition['nodes']:",
                "        graph.add_node(str(node['id']), _build_node(node))",
                "    for edge in definition['edges']:",
                "        kwargs: dict[str, object] = {}",
                "        if edge.get('condition'):",
                "            kwargs['condition'] = edge['condition']",
                "        graph.add_edge(str(edge['source']), str(edge['target']), **kwargs)",
                "    graph.add_edge(START, str(definition['entry']))",
                "    graph.add_edge(str(definition['exit']), END)",
                "    return graph",
                "",
                f"class {agent_class}:",
                "    \"\"\"Agent wrapper exposing the compiled LangGraph.\"\"\"",
                "",
                "    graph = build_graph()",
                "",
                "__all__ = ['GRAPH_DEFINITION', 'HITL_CHECKPOINTS', 'build_graph', '{agent_class}']",
            ]
        )
        + "\n"
    )


def agent_to_graph(source: str) -> FlowGraph:
    """Recover the flow graph from a generated agent module."""

    module = ast.parse(source)
    definition_literal: dict[str, Any] | None = None
    for node in module.body:
        if isinstance(node, ast.Assign):
            for target in node.targets:
                if isinstance(target, ast.Name) and target.id == "GRAPH_DEFINITION":
                    definition_literal = ast.literal_eval(node.value)
                    break
        if definition_literal is not None:
            break
    if definition_literal is None:
        raise ValueError("agent module does not embed GRAPH_DEFINITION")
    return FlowGraph.model_validate(definition_literal)


def _fetch_latest(session, flow_id: str) -> FlowVersionRecord | None:
    row = (
        session.execute(
            text(
                """
                SELECT id, flow_id, version, graph, agent_code, hitl_checkpoints, comment, created_at, created_by, diff
                FROM flow_versions
                WHERE flow_id = :flow_id
                ORDER BY version DESC
                LIMIT 1
                """
            ),
            {"flow_id": flow_id},
        )
        .mappings()
        .one_or_none()
    )
    if row is None:
        return None
    return FlowVersionRecord.from_row(row)


def list_flow_versions(flow_id: str) -> list[FlowVersionRecord]:
    with session_scope() as session:
        rows = session.execute(
            text(
                """
                SELECT id, flow_id, version, graph, agent_code, hitl_checkpoints, comment, created_at, created_by, diff
                FROM flow_versions
                WHERE flow_id = :flow_id
                ORDER BY version DESC
                """
            ),
            {"flow_id": flow_id},
        ).mappings()
        return [FlowVersionRecord.from_row(row) for row in rows]


def get_flow_version(flow_id: str, version: int) -> FlowVersionRecord:
    with session_scope() as session:
        row = (
            session.execute(
                text(
                    """
                    SELECT id, flow_id, version, graph, agent_code, hitl_checkpoints, comment, created_at, created_by, diff
                    FROM flow_versions
                    WHERE flow_id = :flow_id AND version = :version
                    """
                ),
                {"flow_id": flow_id, "version": version},
            )
            .mappings()
            .one_or_none()
        )
        if row is None:
            raise KeyError(version)
        return FlowVersionRecord.from_row(row)


def create_flow_version(
    *,
    flow_id: str,
    graph: FlowGraph,
    comment: str | None = None,
    author: str | None = None,
) -> FlowVersionRecord:
    graph.ensure_valid()
    agent_code = graph_to_agent(graph)
    serialized = _serialize_graph(graph)
    checkpoints = json.dumps(list(graph.hitl_nodes()), ensure_ascii=False, sort_keys=True)
    created_at = _now().isoformat()
    with session_scope() as session:
        previous = _fetch_latest(session, flow_id)
        version = 1 if previous is None else previous.version + 1
        diff = _compute_diff(previous.agent_code if previous else None, agent_code, flow_id=flow_id)
        record_id = str(uuid4())
        session.execute(
            text(
                """
                INSERT INTO flow_versions (
                    id, flow_id, version, graph, agent_code, hitl_checkpoints, comment, created_at, created_by, diff
                ) VALUES (
                    :id, :flow_id, :version, :graph, :agent_code, :hitl_checkpoints, :comment, :created_at, :created_by, :diff
                )
                """
            ),
            {
                "id": record_id,
                "flow_id": flow_id,
                "version": version,
                "graph": serialized,
                "agent_code": agent_code,
                "hitl_checkpoints": checkpoints,
                "comment": comment,
                "created_at": created_at,
                "created_by": author,
                "diff": diff,
            },
        )
        session.flush()
        stored = session.execute(
            text(
                """
                SELECT id, flow_id, version, graph, agent_code, hitl_checkpoints, comment, created_at, created_by, diff
                FROM flow_versions
                WHERE id = :id
                """
            ),
            {"id": record_id},
        ).mappings().one()
        return FlowVersionRecord.from_row(stored)


def rollback_flow_version(
    *,
    flow_id: str,
    version: int,
    author: str | None = None,
    comment: str | None = None,
) -> FlowVersionRecord:
    target = get_flow_version(flow_id, version)
    return create_flow_version(
        flow_id=flow_id,
        graph=target.graph,
        comment=comment or f"Rollback to version {version}",
        author=author,
    )


def diff_flow_versions(flow_id: str, from_version: int, to_version: int) -> FlowVersionDiff:
    if from_version == to_version:
        raise ValueError("versions must be different when computing a diff")
    older, newer = sorted((from_version, to_version))
    previous = get_flow_version(flow_id, older)
    current = get_flow_version(flow_id, newer)
    diff = _compute_diff(previous.agent_code, current.agent_code, flow_id=flow_id) or ""
    return FlowVersionDiff(flow_id=flow_id, from_version=from_version, to_version=to_version, diff=diff)


__all__ = [
    "FlowNode",
    "FlowEdge",
    "FlowGraph",
    "FlowVersionRecord",
    "FlowVersionDiff",
    "agent_to_graph",
    "graph_to_agent",
    "list_flow_versions",
    "get_flow_version",
    "create_flow_version",
    "rollback_flow_version",
    "diff_flow_versions",
]
