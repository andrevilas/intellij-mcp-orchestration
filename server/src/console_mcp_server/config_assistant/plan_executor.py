"""Service responsible for executing configuration plans via Git."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Sequence

import structlog

from ..change_plans import ChangePlanStore
from ..schemas_plan import Plan, PlanExecutionMode, PlanExecutionStatus, Risk
from .git import CreatedBranch, GitRepository, GitWorkflowError

logger = structlog.get_logger("console.config.plan_executor")


class PlanExecutorError(RuntimeError):
    """Raised when the executor fails to apply a configuration plan."""


@dataclass(frozen=True)
class PlanExecutionResult:
    """Outcome produced after running a plan operation."""

    record_id: str
    plan_id: str
    mode: PlanExecutionMode
    status: PlanExecutionStatus
    branch: str | None
    base_branch: str | None
    commit_sha: str | None
    diff_stat: str
    diff_patch: str
    hitl_required: bool
    message: str


class PlanExecutor:
    """Coordinates Git operations and persistence for plan executions."""

    def __init__(
        self,
        repo_path: str | Path,
        *,
        change_plan_store: ChangePlanStore | None = None,
        allow_direct_commits: bool = False,
    ) -> None:
        self._repo_path = Path(repo_path)
        self._store = change_plan_store or ChangePlanStore()
        self._allow_direct_commits = allow_direct_commits

    def dry_run(
        self,
        *,
        plan: Plan,
        plan_id: str,
        patch: str,
        actor: str,
    ) -> PlanExecutionResult:
        repo = self._repository()
        try:
            diff_stat = repo.preview_patch(patch)
        except GitWorkflowError as exc:
            logger.warning("plan.dry_run_failed", plan_id=plan_id, error=str(exc))
            raise PlanExecutorError("Falha ao validar patch durante o dry-run") from exc

        record = self._store.create(
            plan_id=plan_id,
            actor=actor,
            mode=PlanExecutionMode.DRY_RUN,
            status=PlanExecutionStatus.PENDING,
            diff_stat=diff_stat,
            diff_patch=patch,
            risks=self._risks(plan),
            metadata={"base_branch": repo.active_branch()},
        )

        logger.info("plan.dry_run", plan_id=plan_id, diff_stat=diff_stat)
        return PlanExecutionResult(
            record_id=record.id,
            plan_id=plan_id,
            mode=PlanExecutionMode.DRY_RUN,
            status=PlanExecutionStatus.PENDING,
            branch=None,
            base_branch=repo.active_branch(),
            commit_sha=None,
            diff_stat=diff_stat,
            diff_patch=patch,
            hitl_required=False,
            message="Dry-run executado com sucesso.",
        )

    def apply(
        self,
        *,
        plan: Plan,
        plan_id: str,
        patch: str,
        actor: str,
        actor_email: str,
        commit_message: str,
        mode: PlanExecutionMode,
        hitl_callback: Callable[[PlanExecutionResult], None] | None = None,
    ) -> PlanExecutionResult:
        if mode is PlanExecutionMode.DIRECT and not self._allow_direct_commits:
            raise PlanExecutorError("Commits diretos não estão habilitados para este ambiente.")

        repo = self._repository()

        try:
            branch_info = self._prepare_branch(repo, plan_id, mode)
            repo.apply_patch(patch)
            repo.stage_all()
            commit_sha = repo.commit_signed_off(
                commit_message,
                author_name=actor,
                author_email=actor_email,
            )
        except GitWorkflowError as exc:
            logger.error("plan.apply_failed", plan_id=plan_id, error=str(exc))
            raise PlanExecutorError("Não foi possível aplicar o patch no repositório.") from exc

        diff_stat = repo.diff_stat(branch_info.base, branch_info.name)
        diff_patch = repo.diff_patch(branch_info.base, branch_info.name)

        record = self._store.create(
            plan_id=plan_id,
            actor=actor,
            mode=mode,
            status=PlanExecutionStatus.COMPLETED,
            diff_stat=diff_stat,
            diff_patch=diff_patch,
            branch=branch_info.name,
            commit_sha=commit_sha,
            risks=self._risks(plan),
            metadata={"base_branch": branch_info.base},
        )

        hitl_required = mode is PlanExecutionMode.BRANCH_PR
        result = PlanExecutionResult(
            record_id=record.id,
            plan_id=plan_id,
            mode=mode,
            status=PlanExecutionStatus.COMPLETED,
            branch=branch_info.name,
            base_branch=branch_info.base,
            commit_sha=commit_sha,
            diff_stat=diff_stat,
            diff_patch=diff_patch,
            hitl_required=hitl_required,
            message="Plano aplicado em branch dedicada.",
        )

        logger.info(
            "plan.apply", plan_id=plan_id, branch=branch_info.name, commit=commit_sha, hitl_required=hitl_required
        )

        if hitl_required and hitl_callback is not None:
            try:
                hitl_callback(result)
            except Exception as exc:  # pragma: no cover - defensive logging
                logger.warning("plan.hitl_callback_failed", plan_id=plan_id, error=str(exc))

        return result

    def rollback(
        self,
        *,
        plan_id: str,
        branch: str,
        actor: str,
        base_branch: str | None = None,
        reason: str | None = None,
    ) -> PlanExecutionResult:
        repo = self._repository()
        base = base_branch or repo.active_branch()

        try:
            if repo.active_branch() == branch:
                repo.checkout(base)
            repo.delete_branch(branch, force=True)
            repo.delete_remote_branch(branch)
        except GitWorkflowError as exc:
            logger.error("plan.rollback_failed", plan_id=plan_id, branch=branch, error=str(exc))
            raise PlanExecutorError("Rollback do branch falhou.") from exc

        record = self._store.create(
            plan_id=plan_id,
            actor=actor,
            mode=PlanExecutionMode.BRANCH_PR,
            status=PlanExecutionStatus.FAILED,
            diff_stat="",
            diff_patch="",
            branch=branch,
            commit_sha=None,
            risks=(),
            metadata={"base_branch": base, "reason": reason or ""},
        )

        logger.info("plan.rollback", plan_id=plan_id, branch=branch)
        return PlanExecutionResult(
            record_id=record.id,
            plan_id=plan_id,
            mode=PlanExecutionMode.BRANCH_PR,
            status=PlanExecutionStatus.FAILED,
            branch=None,
            base_branch=base,
            commit_sha=None,
            diff_stat="",
            diff_patch="",
            hitl_required=False,
            message="Rollback do branch concluído.",
        )

    def _repository(self) -> GitRepository:
        return GitRepository(self._repo_path)

    @staticmethod
    def _risks(plan: Plan) -> Sequence[Risk]:
        return tuple(plan.risks)

    def _prepare_branch(self, repo: GitRepository, plan_id: str, mode: PlanExecutionMode) -> CreatedBranch:
        if mode is PlanExecutionMode.BRANCH_PR:
            return repo.create_working_branch(plan_id)
        # Direct mode reuses the active branch without creating a new one.
        base = repo.active_branch()
        return CreatedBranch(name=base, base=base)


__all__ = ["PlanExecutor", "PlanExecutorError", "PlanExecutionResult"]

