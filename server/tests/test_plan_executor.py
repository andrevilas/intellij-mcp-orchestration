"""Unit tests covering the PlanExecutor service."""

from __future__ import annotations

from pathlib import Path

from git import Repo

from console_mcp_server.change_plans import ChangePlanStore
from console_mcp_server.config_assistant.plan_executor import PlanExecutor
from console_mcp_server.git_providers import (
    PullRequestCheck,
    PullRequestReviewer,
    PullRequestSnapshot,
    PullRequestStatus,
)
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


class DummyGitProvider:
    name = "dummy"

    def __init__(self) -> None:
        self.open_calls: list[dict[str, str]] = []
        self.status_calls: list[PullRequestSnapshot] = []
        self.status = PullRequestStatus(state="open", ci_status="pending", review_status="pending")

    def open_pull_request(
        self,
        *,
        source_branch: str,
        target_branch: str,
        title: str,
        body: str,
        head_sha: str,
    ) -> PullRequestSnapshot:
        self.open_calls.append(
            {
                "source": source_branch,
                "target": target_branch,
                "title": title,
                "body": body,
                "sha": head_sha,
            }
        )
        return PullRequestSnapshot(
            provider=self.name,
            identifier="pr-1",
            number="101",
            url="https://example.test/pr/101",
            title=title,
            state="open",
            head_sha=head_sha,
            branch=source_branch,
        )

    def fetch_pull_request_status(self, pr: PullRequestSnapshot) -> PullRequestStatus:
        self.status_calls.append(pr)
        return self.status


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
    assert result.approval_id is None

    repo_state = Repo(repo_dir)
    assert repo_state.git.status("--short") == ""

    records = store.list_for_plan("PLAN-1")
    assert len(records) == 1
    record = records[0]
    assert record.status is PlanExecutionStatus.PENDING
    assert record.diff_stat == result.diff_stat


def test_preview_execution_returns_branch_without_side_effects(tmp_path: Path, database) -> None:
    database.bootstrap_database()
    repo_dir = tmp_path / "workspace"
    repo_dir.mkdir()
    repo, _ = _bootstrap_repository(repo_dir)

    store = ChangePlanStore()
    executor = PlanExecutor(repo_dir, change_plan_store=store)
    plan = _sample_plan()

    preview = executor.preview_execution(
        "PLAN-PREVIEW",
        plan=plan,
        commit_message="chore: preview changes",
    )

    assert preview.branch.startswith("chore/config-assistant/plan-preview")
    assert preview.base_branch == repo.active_branch.name
    assert preview.commit_message == "chore: preview changes"
    assert repo.git.status("--short") == ""


def test_apply_creates_branch_and_signed_commit(tmp_path: Path, database) -> None:
    database.bootstrap_database()
    repo_dir = tmp_path / "workspace"
    repo_dir.mkdir()
    _, patch = _bootstrap_repository(repo_dir)

    store = ChangePlanStore()
    executor = PlanExecutor(repo_dir, change_plan_store=store)
    plan = _sample_plan()

    submission = executor.submit_for_approval(
        plan=plan,
        plan_id="PLAN APPLY",
        patch=patch,
        actor="Jane Doe",
        actor_email="jane@example.com",
        commit_message="chore: update readme",
        mode=PlanExecutionMode.BRANCH_PR,
    )

    assert submission.status is PlanExecutionStatus.PENDING
    assert submission.approval_id is not None

    executor.approve_request(submission.approval_id, approver_id="approver-1")
    result = executor.finalize_approval(submission.approval_id)

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

    submission = executor.submit_for_approval(
        plan=plan,
        plan_id="PLAN-ROLLBACK",
        patch=patch,
        actor="Alex Doe",
        actor_email="alex@example.com",
        commit_message="chore: update readme",
        mode=PlanExecutionMode.BRANCH_PR,
    )

    executor.approve_request(submission.approval_id or "", approver_id="approver-2")
    applied = executor.finalize_approval(submission.approval_id or "")

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


def test_finalize_opens_pull_request_with_provider(tmp_path: Path, database) -> None:
    database.bootstrap_database()
    repo_dir = tmp_path / "workspace"
    repo_dir.mkdir()
    _, patch = _bootstrap_repository(repo_dir)

    store = ChangePlanStore()
    provider = DummyGitProvider()
    executor = PlanExecutor(repo_dir, change_plan_store=store, git_provider=provider)
    plan = _sample_plan()

    submission = executor.submit_for_approval(
        plan=plan,
        plan_id="PLAN-PR",
        patch=patch,
        actor="Dana Doe",
        actor_email="dana@example.com",
        commit_message="feat: add integration",
        mode=PlanExecutionMode.BRANCH_PR,
    )

    executor.approve_request(submission.approval_id or "", approver_id="approver")
    result = executor.finalize_approval(submission.approval_id or "")

    assert provider.open_calls, "provider should be invoked to open a pull request"
    assert result.pull_request is not None
    assert result.pull_request.number == "101"
    assert result.status is PlanExecutionStatus.IN_PROGRESS
    assert result.pull_request is not None
    assert result.pull_request.branch == result.branch

    record = store.get(result.record_id)
    assert record is not None
    assert record.metadata.get("pull_request", {}).get("number") == "101"


def test_sync_plan_status_updates_metadata(tmp_path: Path, database) -> None:
    database.bootstrap_database()
    repo_dir = tmp_path / "workspace"
    repo_dir.mkdir()
    _, patch = _bootstrap_repository(repo_dir)

    store = ChangePlanStore()
    provider = DummyGitProvider()
    executor = PlanExecutor(repo_dir, change_plan_store=store, git_provider=provider)
    plan = _sample_plan()

    submission = executor.submit_for_approval(
        plan=plan,
        plan_id="PLAN-SYNC",
        patch=patch,
        actor="Eve Doe",
        actor_email="eve@example.com",
        commit_message="feat: sync status",
        mode=PlanExecutionMode.BRANCH_PR,
    )
    executor.approve_request(submission.approval_id or "", approver_id="approver")
    applied = executor.finalize_approval(submission.approval_id or "")

    provider.status = PullRequestStatus(
        state="open",
        ci_status="success",
        review_status="approved",
        reviewers=(PullRequestReviewer(id="rev-1", name="Reviewer Ana", status="approved"),),
        ci_results=(
            PullRequestCheck(
                name="ci/tests",
                status="success",
                details_url="https://ci.example.test/run/123",
            ),
        ),
    )
    synced = executor.sync_external_status(applied.record_id)

    assert provider.status_calls, "provider should be queried during sync"
    assert synced.status is PlanExecutionStatus.COMPLETED
    assert synced.pull_request is not None
    assert synced.pull_request.ci_status == "success"
    assert synced.pull_request.review_status == "approved"
    assert synced.pull_request.branch == applied.branch
    assert synced.pull_request.reviewers == (
        PullRequestReviewer(id="rev-1", name="Reviewer Ana", status="approved"),
    )
    assert synced.pull_request.ci_results == (
        PullRequestCheck(
            name="ci/tests",
            status="success",
            details_url="https://ci.example.test/run/123",
        ),
    )
