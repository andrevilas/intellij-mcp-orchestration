"""Unit tests covering the PlanExecutor service."""

from __future__ import annotations

from pathlib import Path

from git import Repo

from console_mcp_server.change_plans import ChangePlanStore
from console_mcp_server.config_assistant.plan_executor import PlanExecutor
from console_mcp_server.schemas_plan import (
    Plan,
    PlanExecutionMode,
    PlanExecutionStatus,
    Risk,
)


def _bootstrap_repository(path: Path) -> tuple[Repo, str]:
    repo = Repo.init(path)
    readme = path / "README.md"
    readme.write_text("Hello\n", encoding="utf-8")
    repo.index.add(["README.md"])
    repo.index.commit("initial commit")
    readme.write_text("Hello World\n", encoding="utf-8")
    patch = repo.git.diff() + "\n"
    repo.git.checkout("--", "README.md")
    return repo, patch


def _sample_plan() -> Plan:
    return Plan(
        intent="demo",
        summary="Atualizar documentação",
        steps=[],
        diffs=[],
        risks=[Risk(title="Validação manual", impact="low", mitigation="Revisar com par.")],
    )


def test_dry_run_records_plan_execution(tmp_path: Path, database) -> None:
    database.bootstrap_database()
    repo_dir = tmp_path / "workspace"
    repo_dir.mkdir()
    _, patch = _bootstrap_repository(repo_dir)

    store = ChangePlanStore()
    executor = PlanExecutor(repo_dir, change_plan_store=store)
    plan = _sample_plan()

    result = executor.dry_run(plan=plan, plan_id="PLAN-1", patch=patch, actor="Tester")

    assert result.status is PlanExecutionStatus.PENDING
    assert "file changed" in result.diff_stat
    assert result.branch is None

    repo_state = Repo(repo_dir)
    assert repo_state.git.status("--short") == ""

    records = store.list_for_plan("PLAN-1")
    assert len(records) == 1
    record = records[0]
    assert record.status is PlanExecutionStatus.PENDING
    assert record.diff_stat == result.diff_stat


def test_apply_creates_branch_and_signed_commit(tmp_path: Path, database) -> None:
    database.bootstrap_database()
    repo_dir = tmp_path / "workspace"
    repo_dir.mkdir()
    _, patch = _bootstrap_repository(repo_dir)

    store = ChangePlanStore()
    executor = PlanExecutor(repo_dir, change_plan_store=store)
    plan = _sample_plan()

    result = executor.apply(
        plan=plan,
        plan_id="PLAN APPLY",
        patch=patch,
        actor="Jane Doe",
        actor_email="jane@example.com",
        commit_message="chore: update readme",
        mode=PlanExecutionMode.BRANCH_PR,
    )

    assert result.status is PlanExecutionStatus.COMPLETED
    assert result.branch is not None
    repo_state = Repo(repo_dir)
    assert repo_state.active_branch.name == result.branch
    assert "Signed-off-by: Jane Doe <jane@example.com>" in repo_state.head.commit.message

    records = store.list_for_plan("PLAN APPLY")
    assert len(records) == 1
    record = records[0]
    assert record.commit_sha == result.commit_sha
    assert record.branch == result.branch


def test_rollback_removes_branch_and_logs_history(tmp_path: Path, database) -> None:
    database.bootstrap_database()
    repo_dir = tmp_path / "workspace"
    repo_dir.mkdir()
    _, patch = _bootstrap_repository(repo_dir)

    store = ChangePlanStore()
    executor = PlanExecutor(repo_dir, change_plan_store=store)
    plan = _sample_plan()

    applied = executor.apply(
        plan=plan,
        plan_id="PLAN-ROLLBACK",
        patch=patch,
        actor="Alex Doe",
        actor_email="alex@example.com",
        commit_message="chore: update readme",
        mode=PlanExecutionMode.BRANCH_PR,
    )

    rollback = executor.rollback(
        plan_id="PLAN-ROLLBACK",
        branch=applied.branch or "",
        actor="Alex Doe",
        base_branch=applied.base_branch,
        reason="manual cancel",
    )

    assert rollback.status is PlanExecutionStatus.FAILED
    repo_state = Repo(repo_dir)
    branch_names = {head.name for head in repo_state.heads}
    assert applied.branch not in branch_names

    records = store.list_for_plan("PLAN-ROLLBACK")
    assert len(records) == 2
    assert records[-1].status is PlanExecutionStatus.FAILED
