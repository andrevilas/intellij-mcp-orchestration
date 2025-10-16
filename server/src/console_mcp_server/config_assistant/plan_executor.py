"""Service responsible for executing configuration plans via Git."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Mapping, Sequence

import structlog

from ..approvals import ApprovalStatus, ApprovalStore
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
    approval_id: str | None = None


@dataclass(frozen=True)
class HitlEvent:
    """Notification emitted when approvals change state."""

    type: str
    approval_id: str
    plan_id: str
    record_id: str
    status: str
    payload: Mapping[str, object]


class HitlEventBroker:
    """Best-effort fan-out of HITL events to interested subscribers."""

    def __init__(self) -> None:
        self._subscribers: list[Callable[[HitlEvent], None]] = []

    def subscribe(self, callback: Callable[[HitlEvent], None]) -> None:
        self._subscribers.append(callback)

    def publish(self, event: HitlEvent) -> None:
        for subscriber in list(self._subscribers):
            try:
                subscriber(event)
            except Exception as exc:  # pragma: no cover - defensive logging
                logger.warning(
                    "plan.hitl_event_failed",
                    approval_id=event.approval_id,
                    subscriber=getattr(subscriber, "__name__", repr(subscriber)),
                    error=str(exc),
                )


class PlanExecutor:
    """Coordinates Git operations and persistence for plan executions."""

    def __init__(
        self,
        repo_path: str | Path,
        *,
        change_plan_store: ChangePlanStore | None = None,
        approval_store: ApprovalStore | None = None,
        event_broker: HitlEventBroker | None = None,
        allow_direct_commits: bool = False,
    ) -> None:
        self._repo_path = Path(repo_path)
        self._store = change_plan_store or ChangePlanStore()
        self._approvals = approval_store or ApprovalStore()
        self._events = event_broker or HitlEventBroker()
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
            approval_id=None,
        )

    def submit_for_approval(
        self,
        *,
        plan: Plan,
        plan_id: str,
        patch: str,
        actor: str,
        actor_email: str,
        commit_message: str,
        mode: PlanExecutionMode,
    ) -> PlanExecutionResult:
        if mode is PlanExecutionMode.DIRECT and not self._allow_direct_commits:
            raise PlanExecutorError("Commits diretos não estão habilitados para este ambiente.")

        repo = self._repository()
        try:
            diff_stat = repo.preview_patch(patch)
        except GitWorkflowError as exc:
            logger.warning("plan.approval_preview_failed", plan_id=plan_id, error=str(exc))
            raise PlanExecutorError("Falha ao validar patch durante submissão para aprovação") from exc

        record = self._store.create(
            plan_id=plan_id,
            actor=actor,
            mode=mode,
            status=PlanExecutionStatus.PENDING,
            diff_stat=diff_stat,
            diff_patch=patch,
            risks=self._risks(plan),
            metadata={
                "base_branch": repo.active_branch(),
                "commit_message": commit_message,
                "actor_email": actor_email,
            },
        )

        approval = self._approvals.create(
            plan_id=plan_id,
            change_record_id=record.id,
            requester_id=actor,
            payload={"mode": mode.value},
        )

        event = HitlEvent(
            type="approval_requested",
            approval_id=approval.id,
            plan_id=plan_id,
            record_id=record.id,
            status=approval.status.value,
            payload={"actor": actor, "mode": mode.value},
        )
        self._events.publish(event)

        logger.info("plan.approval_requested", plan_id=plan_id, approval_id=approval.id)

        return PlanExecutionResult(
            record_id=record.id,
            plan_id=plan_id,
            mode=mode,
            status=PlanExecutionStatus.PENDING,
            branch=None,
            base_branch=repo.active_branch(),
            commit_sha=None,
            diff_stat=diff_stat,
            diff_patch=patch,
            hitl_required=True,
            message="Plano enviado para aprovação HITL.",
            approval_id=approval.id,
        )

    def approve_request(
        self,
        approval_id: str,
        *,
        approver_id: str,
        reason: str | None = None,
    ) -> None:
        approval = self._approvals.update_status(
            approval_id,
            status=ApprovalStatus.APPROVED,
            approver_id=approver_id,
            reason=reason,
        )
        self._events.publish(
            HitlEvent(
                type="approval_resolved",
                approval_id=approval.id,
                plan_id=approval.plan_id,
                record_id=approval.change_record_id,
                status=approval.status.value,
                payload={"approver": approver_id, "reason": reason or ""},
            )
        )
        logger.info("plan.approval_granted", approval_id=approval.id, plan_id=approval.plan_id)

    def reject_request(
        self,
        approval_id: str,
        *,
        approver_id: str,
        reason: str | None = None,
    ) -> PlanExecutionResult:
        approval = self._approvals.update_status(
            approval_id,
            status=ApprovalStatus.REJECTED,
            approver_id=approver_id,
            reason=reason,
        )
        record = self._store.get(approval.change_record_id)
        if record is None:
            raise PlanExecutorError("Registro associado ao plano não encontrado para rejeição.")

        self._store.update(
            record.id,
            status=PlanExecutionStatus.FAILED,
            metadata={"rejected_reason": reason or ""},
        )

        self._events.publish(
            HitlEvent(
                type="approval_resolved",
                approval_id=approval.id,
                plan_id=approval.plan_id,
                record_id=approval.change_record_id,
                status=approval.status.value,
                payload={"approver": approver_id, "reason": reason or ""},
            )
        )

        logger.info("plan.approval_rejected", approval_id=approval.id, plan_id=approval.plan_id)

        return PlanExecutionResult(
            record_id=record.id,
            plan_id=record.plan_id,
            mode=record.mode,
            status=PlanExecutionStatus.FAILED,
            branch=None,
            base_branch=record.metadata.get("base_branch"),
            commit_sha=None,
            diff_stat=record.diff_stat,
            diff_patch=record.diff_patch,
            hitl_required=True,
            message="Plano rejeitado pelo aprovador.",
            approval_id=approval.id,
        )

    def finalize_approval(
        self,
        approval_id: str,
        *,
        hitl_callback: Callable[[PlanExecutionResult], None] | None = None,
    ) -> PlanExecutionResult:
        approval = self._approvals.get(approval_id)
        if approval is None:
            raise PlanExecutorError("Solicitação de aprovação inexistente.")
        if approval.status is not ApprovalStatus.APPROVED:
            raise PlanExecutorError("A solicitação ainda não foi aprovada.")

        record = self._store.get(approval.change_record_id)
        if record is None:
            raise PlanExecutorError("Registro associado ao plano não encontrado.")

        mode = record.mode
        if mode is PlanExecutionMode.DIRECT and not self._allow_direct_commits:
            raise PlanExecutorError("Commits diretos não estão habilitados para este ambiente.")

        repo = self._repository()
        commit_message = record.metadata.get("commit_message", "chore: aplicar plano de configuração")
        actor_email = record.metadata.get("actor_email")
        base_branch = record.metadata.get("base_branch", repo.active_branch())
        if actor_email is None:
            raise PlanExecutorError("Registro não possui e-mail do autor original.")

        try:
            if mode is PlanExecutionMode.BRANCH_PR and repo.active_branch() != base_branch:
                repo.checkout(base_branch)
            branch_info = self._prepare_branch(repo, record.plan_id, mode)
            repo.apply_patch(record.diff_patch)
            repo.stage_all()
            commit_sha = repo.commit_signed_off(
                commit_message,
                author_name=record.actor,
                author_email=actor_email,
            )
        except GitWorkflowError as exc:
            logger.error("plan.apply_failed", plan_id=record.plan_id, error=str(exc))
            raise PlanExecutorError("Não foi possível aplicar o patch no repositório.") from exc

        diff_stat = repo.diff_stat(branch_info.base, branch_info.name)
        diff_patch = repo.diff_patch(branch_info.base, branch_info.name)

        updated_record = self._store.update(
            record.id,
            status=PlanExecutionStatus.COMPLETED,
            branch=branch_info.name,
            commit_sha=commit_sha,
            diff_stat=diff_stat,
            diff_patch=diff_patch,
            metadata={"base_branch": branch_info.base, "approved_by": approval.approver_id},
        )

        result = PlanExecutionResult(
            record_id=updated_record.id,
            plan_id=updated_record.plan_id,
            mode=updated_record.mode,
            status=PlanExecutionStatus.COMPLETED,
            branch=updated_record.branch,
            base_branch=branch_info.base,
            commit_sha=commit_sha,
            diff_stat=diff_stat,
            diff_patch=diff_patch,
            hitl_required=updated_record.mode is PlanExecutionMode.BRANCH_PR,
            message="Plano aplicado após aprovação.",
            approval_id=approval.id,
        )

        logger.info(
            "plan.apply",
            plan_id=updated_record.plan_id,
            branch=updated_record.branch,
            commit=commit_sha,
            approval_id=approval.id,
        )

        self._events.publish(
            HitlEvent(
                type="approval_executed",
                approval_id=approval.id,
                plan_id=approval.plan_id,
                record_id=approval.change_record_id,
                status=approval.status.value,
                payload={"branch": updated_record.branch or "", "commit": commit_sha},
            )
        )

        if result.hitl_required and hitl_callback is not None:
            try:
                hitl_callback(result)
            except Exception as exc:  # pragma: no cover - defensive logging
                logger.warning("plan.hitl_callback_failed", plan_id=updated_record.plan_id, error=str(exc))

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
            approval_id=None,
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


    @property
    def events(self) -> HitlEventBroker:
        return self._events


__all__ = [
    "HitlEvent",
    "HitlEventBroker",
    "PlanExecutor",
    "PlanExecutorError",
    "PlanExecutionResult",
]

