"""Helpers that integrate with Git to execute configuration plans."""

from __future__ import annotations

import os
import re
import tempfile
from dataclasses import dataclass
from pathlib import Path

from git import Actor, GitCommandError, Repo
from git.exc import InvalidGitRepositoryError

from ..schemas_plan import DiffSummary


class GitWorkflowError(RuntimeError):
    """Raised when Git operations fail while executing plans."""


def normalize_repo_path(path: str | Path) -> str:
    """Return a normalized repository path string."""

    return str(Path(path).as_posix())


def create_diff(path: str | Path, summary: str, change_type: str = "update") -> DiffSummary:
    """Convenience helper to create :class:`DiffSummary` instances."""

    normalized = normalize_repo_path(path)
    return DiffSummary(path=normalized, summary=summary, change_type=change_type)


def _write_patch_to_disk(patch: str) -> str:
    descriptor, patch_path = tempfile.mkstemp(suffix=".patch", text=True)
    with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
        handle.write(patch)
    return patch_path


def _ensure_signed_off(message: str, actor: Actor) -> str:
    signature = f"Signed-off-by: {actor.name} <{actor.email}>"
    if signature in message:
        return message
    message = message.rstrip() + "\n\n" if message.strip() else ""
    return f"{message}{signature}\n"


def _slugify_branch_component(value: str) -> str:
    normalized = re.sub(r"[^a-zA-Z0-9-]+", "-", value).strip("-")
    normalized = normalized.lower()
    return normalized or "plan"


@dataclass(frozen=True)
class CreatedBranch:
    name: str
    base: str


class GitRepository:
    """Wrapper around :mod:`GitPython` exposing higher level helpers."""

    def __init__(self, root: str | Path):
        try:
            self._repo = Repo(Path(root))
        except InvalidGitRepositoryError as exc:  # pragma: no cover - defensive
            raise GitWorkflowError(f"Path {root} is not a Git repository") from exc

    @property
    def working_tree_dir(self) -> str:
        return self._repo.working_tree_dir or str(self._repo.git_dir)

    def active_branch(self) -> str:
        return self._repo.active_branch.name

    def checkout(self, branch: str) -> None:
        try:
            self._repo.git.checkout(branch)
        except GitCommandError as exc:
            raise GitWorkflowError(f"Failed to checkout branch {branch}") from exc

    def create_working_branch(self, plan_id: str, *, prefix: str = "chore/config-assistant") -> CreatedBranch:
        base_branch = self.active_branch()
        slug = _slugify_branch_component(plan_id)
        branch_name = f"{prefix}/{slug}"
        counter = 0
        while branch_name in {head.name for head in self._repo.heads}:
            counter += 1
            branch_name = f"{prefix}/{slug}-{counter}"

        try:
            self._repo.git.checkout("-b", branch_name, base_branch)
        except GitCommandError as exc:
            raise GitWorkflowError(f"Failed to create branch {branch_name}") from exc
        return CreatedBranch(name=branch_name, base=base_branch)

    def suggest_branch_name(self, plan_id: str, *, prefix: str = "chore/config-assistant") -> CreatedBranch:
        base_branch = self.active_branch()
        slug = _slugify_branch_component(plan_id)
        branch_name = f"{prefix}/{slug}"
        counter = 0
        existing = {head.name for head in self._repo.heads}
        while branch_name in existing:
            counter += 1
            branch_name = f"{prefix}/{slug}-{counter}"
        return CreatedBranch(name=branch_name, base=base_branch)

    def preview_patch(self, patch: str) -> str:
        patch_path = _write_patch_to_disk(patch)
        try:
            self._repo.git.apply("--check", patch_path)
            return self._repo.git.apply("--stat", patch_path)
        except GitCommandError as exc:
            raise GitWorkflowError("Patch preview failed") from exc
        finally:
            os.remove(patch_path)

    def apply_patch(self, patch: str) -> None:
        patch_path = _write_patch_to_disk(patch)
        try:
            self._repo.git.apply(patch_path)
        except GitCommandError as exc:
            raise GitWorkflowError("Failed to apply patch") from exc
        finally:
            os.remove(patch_path)

    def stage_all(self) -> None:
        try:
            self._repo.git.add(all=True)
        except GitCommandError as exc:
            raise GitWorkflowError("Unable to stage changes") from exc

    def commit_signed_off(self, message: str, *, author_name: str, author_email: str) -> str:
        actor = Actor(author_name, author_email)
        final_message = _ensure_signed_off(message, actor)
        try:
            commit = self._repo.index.commit(final_message, author=actor, committer=actor)
        except GitCommandError as exc:
            raise GitWorkflowError("Failed to create commit") from exc
        return commit.hexsha

    def diff_stat(self, base: str, head: str) -> str:
        try:
            return self._repo.git.diff(f"{base}..{head}", "--stat")
        except GitCommandError as exc:
            raise GitWorkflowError("Unable to compute diff stat") from exc

    def diff_patch(self, base: str, head: str) -> str:
        try:
            return self._repo.git.diff(f"{base}..{head}")
        except GitCommandError as exc:
            raise GitWorkflowError("Unable to compute diff content") from exc

    def checkout(self, branch: str) -> None:
        try:
            self._repo.git.checkout(branch)
        except GitCommandError as exc:
            raise GitWorkflowError(f"Failed to checkout branch {branch}") from exc

    def delete_branch(self, branch: str, *, force: bool = True) -> None:
        args = ["-D" if force else "-d", branch]
        try:
            self._repo.git.branch(*args)
        except GitCommandError:
            # Ignore missing branch to keep rollback idempotent
            return

    def delete_remote_branch(self, branch: str, remote: str = "origin") -> None:
        try:
            self._repo.git.push(remote, f":{branch}")
        except GitCommandError:
            # remote branch may not exist; ignore to keep rollback safe
            return


__all__ = [
    "GitWorkflowError",
    "GitRepository",
    "CreatedBranch",
    "normalize_repo_path",
    "create_diff",
]
