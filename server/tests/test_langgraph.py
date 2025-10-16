"""Tests for LangGraph serialization and version storage helpers."""

from __future__ import annotations

from datetime import datetime

import pytest

from console_mcp_server.config_assistant.langgraph import (
    FlowEdge,
    FlowGraph,
    FlowNode,
    agent_to_graph,
    create_flow_version,
    diff_flow_versions,
    graph_to_agent,
    list_flow_versions,
    rollback_flow_version,
)


@pytest.fixture()
def migrated_db(database):  # type: ignore[override]
    database.bootstrap_database()
    return database


def _sample_graph() -> FlowGraph:
    return FlowGraph(
        id="demo-flow",
        label="Demo Flow",
        entry="inicio",
        exit="fim",
        nodes=[
            FlowNode(id="inicio", type="state", label="Início"),
            FlowNode(id="checkpoint", type="checkpoint", label="Revisão"),
            FlowNode(id="fim", type="state", label="Fim"),
        ],
        edges=[
            FlowEdge(id="edge-1", source="inicio", target="checkpoint"),
            FlowEdge(id="edge-2", source="checkpoint", target="fim"),
        ],
        metadata={"agent_class": "DemoAgent", "description": "Fluxo de teste"},
    )


def test_graph_roundtrip_preserves_structure() -> None:
    graph = _sample_graph()
    module = graph_to_agent(graph)
    parsed = agent_to_graph(module)

    assert parsed.id == graph.id
    assert parsed.entry == graph.entry
    assert parsed.exit == graph.exit
    assert len(parsed.nodes) == len(graph.nodes)
    assert {node.id for node in parsed.nodes} == {node.id for node in graph.nodes}
    assert parsed.metadata["agent_class"] == "DemoAgent"


def test_flow_version_storage_supports_diff_and_rollback(migrated_db) -> None:  # type: ignore[override]
    graph = _sample_graph()
    first = create_flow_version(flow_id="demo", graph=graph, comment="primeira", author="tester")

    assert first.version == 1
    assert first.hitl_checkpoints == ("checkpoint",)
    assert "DemoAgent" in first.agent_code

    updated_graph = FlowGraph.model_validate(
        {
            **graph.model_dump(mode="python"),
            "edges": [
                {"id": "edge-1", "source": "inicio", "target": "checkpoint"},
                {"id": "edge-2", "source": "checkpoint", "target": "fim"},
                {"id": "edge-3", "source": "inicio", "target": "fim"},
            ],
        }
    )

    second = create_flow_version(flow_id="demo", graph=updated_graph, author="tester")

    assert second.version == 2
    assert second.hitl_checkpoints == ("checkpoint",)

    diff = diff_flow_versions("demo", 1, 2)
    assert diff.diff
    assert "edge-3" in diff.diff

    rollback = rollback_flow_version(flow_id="demo", version=1, author="tester")
    assert rollback.version == 3
    assert rollback.comment and "Rollback" in rollback.comment

    versions = list_flow_versions("demo")
    assert [record.version for record in versions] == [3, 2, 1]
    assert all(isinstance(record.created_at, datetime) for record in versions)
