"""Integrations with external Git providers used during plan execution."""

from __future__ import annotations

import os
from dataclasses import dataclass, replace
from typing import Any, Mapping
from urllib.parse import quote_plus

import httpx
import structlog


logger = structlog.get_logger("console.config.git_provider")


class GitProviderError(RuntimeError):
    """Raised when communication with the configured Git provider fails."""


@dataclass(frozen=True)
class PullRequestStatus:
    """Aggregated status information returned by the Git provider."""

    state: str
    ci_status: str | None = None
    review_status: str | None = None
    merged: bool = False


@dataclass(frozen=True)
class PullRequestSnapshot:
    """Snapshot of a pull request opened by the plan executor."""

    provider: str
    identifier: str
    number: str
    url: str
    title: str
    state: str
    head_sha: str
    ci_status: str | None = None
    review_status: str | None = None
    merged: bool = False
    last_synced_at: str | None = None

    def to_metadata(self) -> dict[str, Any]:
        return {
            "provider": self.provider,
            "id": self.identifier,
            "number": self.number,
            "url": self.url,
            "title": self.title,
            "state": self.state,
            "head_sha": self.head_sha,
            "ci_status": self.ci_status,
            "review_status": self.review_status,
            "merged": self.merged,
            "last_synced_at": self.last_synced_at,
        }

    @classmethod
    def from_metadata(cls, payload: Mapping[str, Any]) -> "PullRequestSnapshot":
        return cls(
            provider=str(payload.get("provider", "")),
            identifier=str(payload.get("id", "")),
            number=str(payload.get("number", "")),
            url=str(payload.get("url", "")),
            title=str(payload.get("title", "")),
            state=str(payload.get("state", "open")),
            head_sha=str(payload.get("head_sha", "")),
            ci_status=str(payload.get("ci_status")) if payload.get("ci_status") is not None else None,
            review_status=(
                str(payload.get("review_status")) if payload.get("review_status") is not None else None
            ),
            merged=bool(payload.get("merged", False)),
            last_synced_at=str(payload.get("last_synced_at")) if payload.get("last_synced_at") else None,
        )

    def with_status(self, status: PullRequestStatus, *, synced_at: str | None = None) -> "PullRequestSnapshot":
        return replace(
            self,
            state=status.state,
            ci_status=status.ci_status,
            review_status=status.review_status,
            merged=status.merged,
            last_synced_at=synced_at or self.last_synced_at,
        )


class GitProviderClient:
    """Protocol implemented by concrete Git provider clients."""

    name: str

    def open_pull_request(
        self,
        *,
        source_branch: str,
        target_branch: str,
        title: str,
        body: str,
        head_sha: str,
    ) -> PullRequestSnapshot:
        raise NotImplementedError

    def fetch_pull_request_status(self, pr: PullRequestSnapshot) -> PullRequestStatus:
        raise NotImplementedError


@dataclass(frozen=True)
class GitProviderSettings:
    """Configuration values required to build a Git provider client."""

    kind: str
    token: str
    repository: str | None = None
    project_id: str | None = None
    api_url: str | None = None

    @property
    def enabled(self) -> bool:
        return bool(self.kind and self.token)

    @classmethod
    def from_env(cls, environ: Mapping[str, str] | None = None) -> "GitProviderSettings":
        env = environ or os.environ
        raw_kind = env.get("CONFIG_GIT_PROVIDER", "").strip().lower()
        if not raw_kind:
            return cls(kind="", token="")

        token = env.get("CONFIG_GIT_TOKEN", "").strip()
        if not token:
            raise ValueError("CONFIG_GIT_TOKEN deve ser configurado quando CONFIG_GIT_PROVIDER está definido.")

        api_url = env.get("CONFIG_GIT_API_URL")
        repository = env.get("CONFIG_GIT_REPOSITORY")
        project_id = env.get("CONFIG_GIT_PROJECT_ID")

        if raw_kind == "github" and not repository:
            raise ValueError("CONFIG_GIT_REPOSITORY é obrigatório para integrações com GitHub.")
        if raw_kind == "gitlab" and not project_id:
            raise ValueError("CONFIG_GIT_PROJECT_ID é obrigatório para integrações com GitLab.")

        return cls(
            kind=raw_kind,
            token=token,
            repository=repository,
            project_id=project_id,
            api_url=api_url,
        )


class GitHubProviderClient(GitProviderClient):
    """Client encapsulating the subset of GitHub's REST API we rely on."""

    name = "github"

    def __init__(
        self,
        *,
        token: str,
        repository: str,
        api_url: str | None = None,
        client: httpx.Client | None = None,
    ) -> None:
        if "/" not in repository:
            raise ValueError("GitHub repository must be in the form 'owner/name'.")
        owner, repo = repository.split("/", 1)
        self._owner = owner
        self._repo = repo
        default_headers = {
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github+json",
            "User-Agent": "console-mcp-server/1.0",
        }
        self._client = client or httpx.Client(
            base_url=api_url or "https://api.github.com",
            headers=default_headers,
            timeout=30.0,
        )

    def open_pull_request(
        self,
        *,
        source_branch: str,
        target_branch: str,
        title: str,
        body: str,
        head_sha: str,
    ) -> PullRequestSnapshot:
        response = self._client.post(
            f"/repos/{self._owner}/{self._repo}/pulls",
            json={
                "title": title,
                "head": source_branch,
                "base": target_branch,
                "body": body,
                "draft": False,
            },
        )
        try:
            response.raise_for_status()
        except httpx.HTTPError as exc:  # pragma: no cover - defensive
            logger.warning("git_provider.github.open_failed", error=str(exc))
            raise GitProviderError("Falha ao criar Pull Request no GitHub") from exc

        payload = response.json()
        return PullRequestSnapshot(
            provider=self.name,
            identifier=str(payload.get("id", "")),
            number=str(payload.get("number", "")),
            url=str(payload.get("html_url", "")),
            title=str(payload.get("title", title)),
            state=str(payload.get("state", "open")),
            head_sha=head_sha,
        )

    def fetch_pull_request_status(self, pr: PullRequestSnapshot) -> PullRequestStatus:
        pull_response = self._client.get(f"/repos/{self._owner}/{self._repo}/pulls/{pr.number}")
        try:
            pull_response.raise_for_status()
        except httpx.HTTPError as exc:  # pragma: no cover - defensive
            logger.warning("git_provider.github.status_failed", error=str(exc))
            raise GitProviderError("Falha ao consultar Pull Request no GitHub") from exc

        pull_payload = pull_response.json()
        merged = bool(pull_payload.get("merged", False))
        state = "merged" if merged else str(pull_payload.get("state", pr.state))
        mergeable_state = str(pull_payload.get("mergeable_state", "unknown"))
        draft = bool(pull_payload.get("draft", False))

        status_response = self._client.get(
            f"/repos/{self._owner}/{self._repo}/commits/{pr.head_sha}/status"
        )
        ci_state: str | None
        try:
            status_response.raise_for_status()
        except httpx.HTTPError:  # pragma: no cover - fallback on partial data
            ci_state = None
        else:
            ci_state = str(status_response.json().get("state", "pending"))

        review_status = _map_github_review_state(mergeable_state, draft)

        return PullRequestStatus(
            state=state,
            ci_status=ci_state,
            review_status=review_status,
            merged=merged,
        )


class GitLabProviderClient(GitProviderClient):
    """Client encapsulating GitLab's merge request REST endpoints."""

    name = "gitlab"

    def __init__(
        self,
        *,
        token: str,
        project_id: str,
        api_url: str | None = None,
        client: httpx.Client | None = None,
    ) -> None:
        encoded_project = quote_plus(project_id)
        default_headers = {
            "PRIVATE-TOKEN": token,
            "User-Agent": "console-mcp-server/1.0",
        }
        self._project = encoded_project
        self._client = client or httpx.Client(
            base_url=api_url or "https://gitlab.com/api/v4",
            headers=default_headers,
            timeout=30.0,
        )

    def open_pull_request(
        self,
        *,
        source_branch: str,
        target_branch: str,
        title: str,
        body: str,
        head_sha: str,
    ) -> PullRequestSnapshot:
        response = self._client.post(
            f"/projects/{self._project}/merge_requests",
            json={
                "source_branch": source_branch,
                "target_branch": target_branch,
                "title": title,
                "description": body,
            },
        )
        try:
            response.raise_for_status()
        except httpx.HTTPError as exc:  # pragma: no cover - defensive
            logger.warning("git_provider.gitlab.open_failed", error=str(exc))
            raise GitProviderError("Falha ao criar Merge Request no GitLab") from exc

        payload = response.json()
        return PullRequestSnapshot(
            provider=self.name,
            identifier=str(payload.get("id", "")),
            number=str(payload.get("iid", "")),
            url=str(payload.get("web_url", "")),
            title=str(payload.get("title", title)),
            state=str(payload.get("state", "opened")),
            head_sha=head_sha,
        )

    def fetch_pull_request_status(self, pr: PullRequestSnapshot) -> PullRequestStatus:
        mr_response = self._client.get(f"/projects/{self._project}/merge_requests/{pr.number}")
        try:
            mr_response.raise_for_status()
        except httpx.HTTPError as exc:  # pragma: no cover - defensive
            logger.warning("git_provider.gitlab.status_failed", error=str(exc))
            raise GitProviderError("Falha ao consultar Merge Request no GitLab") from exc

        mr_payload = mr_response.json()
        merged = bool(mr_payload.get("merged_at")) or mr_payload.get("state") == "merged"
        state = "merged" if merged else str(mr_payload.get("state", pr.state))

        approvals_response = self._client.get(
            f"/projects/{self._project}/merge_requests/{pr.number}/approvals"
        )
        review_status: str | None
        try:
            approvals_response.raise_for_status()
        except httpx.HTTPError:  # pragma: no cover - treat as pending when unknown
            review_status = None
        else:
            approvals_payload = approvals_response.json()
            if approvals_payload.get("approved"):
                review_status = "approved"
            elif approvals_payload.get("approvers_left"):
                review_status = "pending"
            else:
                review_status = None

        pipelines_response = self._client.get(
            f"/projects/{self._project}/merge_requests/{pr.number}/pipelines"
        )
        ci_status: str | None
        try:
            pipelines_response.raise_for_status()
        except httpx.HTTPError:  # pragma: no cover - treat as unknown
            ci_status = None
        else:
            pipelines_payload = pipelines_response.json()
            ci_status = None
            if isinstance(pipelines_payload, list) and pipelines_payload:
                ci_status = str(pipelines_payload[0].get("status"))

        return PullRequestStatus(
            state=state,
            ci_status=ci_status,
            review_status=review_status,
            merged=merged,
        )


def create_git_provider(settings: GitProviderSettings) -> GitProviderClient | None:
    """Instantiate the concrete client for the provided settings."""

    if not settings.enabled:
        return None

    if settings.kind == "github":
        assert settings.repository is not None  # nosec - validated in from_env
        return GitHubProviderClient(
            token=settings.token,
            repository=settings.repository,
            api_url=settings.api_url,
        )
    if settings.kind == "gitlab":
        assert settings.project_id is not None  # nosec - validated in from_env
        return GitLabProviderClient(
            token=settings.token,
            project_id=settings.project_id,
            api_url=settings.api_url,
        )

    raise ValueError(f"Unsupported Git provider '{settings.kind}'")


def _map_github_review_state(mergeable_state: str, draft: bool) -> str:
    if draft:
        return "draft"
    if mergeable_state in {"blocked", "behind"}:
        return "pending"
    if mergeable_state in {"dirty", "unstable"}:
        return "changes_requested"
    return "approved"


__all__ = [
    "GitProviderClient",
    "GitProviderError",
    "GitProviderSettings",
    "GitHubProviderClient",
    "GitLabProviderClient",
    "PullRequestSnapshot",
    "PullRequestStatus",
    "create_git_provider",
]

