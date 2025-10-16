"""Tests covering the lightweight RAG helper used by the configuration assistant."""

from __future__ import annotations

import time
from pathlib import Path

from console_mcp_server.config_assistant.intents import AssistantIntent
from console_mcp_server.config_assistant.rag import RagService


def _docs_path() -> Path:
    return Path(__file__).resolve().parents[2] / "docs"


def test_rag_service_indexes_and_returns_results() -> None:
    service = RagService(docs_path=_docs_path())

    results = service.query("LangGraph checkpoints", top_k=3)

    assert results, "expected at least one document hit for LangGraph query"
    assert all(result.path.startswith("docs/") for result in results)
    assert all(result.snippet for result in results)


def test_rag_service_suggests_context_for_add_agent_intent() -> None:
    service = RagService(docs_path=_docs_path())

    references = service.suggest_context(
        AssistantIntent.ADD_AGENT,
        {"agent_name": "Sentinel", "capabilities": ["LangGraph", "HITL"]},
    )

    assert references, "rag suggestions should include documentation for add_agent"
    assert all(ref.score >= 0.0 for ref in references)


def test_rag_query_latency_below_threshold() -> None:
    service = RagService(docs_path=_docs_path())

    start = time.perf_counter()
    service.query("FinOps guardrails", top_k=2)
    latency_ms = (time.perf_counter() - start) * 1000.0

    assert latency_ms < 500, f"RAG query latency too high: {latency_ms:.2f}ms"
