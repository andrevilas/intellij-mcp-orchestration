"""Regression tests covering artifact generation helpers."""

from __future__ import annotations

from console_mcp_server.config_assistant.artifacts import generate_artifact


def test_generate_manifest_idempotent() -> None:
    result_one = generate_artifact(
        "agent.manifest",
        "agents-hub/app/agents/sentinel-watcher/agent.yaml",
    )
    result_two = generate_artifact(
        "agent.manifest",
        "agents-hub/app/agents/sentinel-watcher/agent.yaml",
    )

    assert result_one.content == result_two.content
    assert result_one.template.title == "Manifesto MCP"


def test_generate_readme_idempotent_with_owner_override() -> None:
    result_one = generate_artifact(
        "agent.readme",
        "agents-hub/app/agents/sentinel-watcher/README.md",
        parameters={"owner": "#agents"},
    )
    result_two = generate_artifact(
        "agent.readme",
        "agents-hub/app/agents/sentinel-watcher/README.md",
        parameters={"owner": "#agents"},
    )

    assert result_one.content == result_two.content
    assert "# Sentinel Watcher" in result_one.content
    assert "#agents" in result_one.content


def test_generate_finops_checklist_idempotent() -> None:
    result_one = generate_artifact(
        "finops.checklist",
        "agents-hub/docs/finops/sentinel-watcher-checklist.md",
    )
    result_two = generate_artifact(
        "finops.checklist",
        "agents-hub/docs/finops/sentinel-watcher-checklist.md",
    )

    assert result_one.content == result_two.content
    assert "Checklist FinOps" in result_one.content
    assert "sentinel-watcher" in result_one.content
