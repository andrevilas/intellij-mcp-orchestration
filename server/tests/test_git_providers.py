import json

import httpx

from console_mcp_server.git_providers import (
    GitHubProviderClient,
    GitLabProviderClient,
    GitProviderSettings,
    create_git_provider,
)


def test_github_provider_creates_and_checks_pull_request() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.method == "POST" and request.url.path == "/repos/org/repo/pulls":
            payload = json.loads(request.content.decode())
            assert payload["head"] == "feature"
            return httpx.Response(
                201,
                json={
                    "id": 10,
                    "number": 42,
                    "html_url": "https://github.test/org/repo/pull/42",
                    "title": payload["title"],
                    "state": "open",
                },
            )
        if request.method == "GET" and request.url.path == "/repos/org/repo/pulls/42":
            return httpx.Response(
                200,
                json={
                    "id": 10,
                    "number": 42,
                    "state": "open",
                    "merged": False,
                    "mergeable_state": "clean",
                    "draft": False,
                },
            )
        if request.method == "GET" and request.url.path == "/repos/org/repo/commits/abc123/status":
            return httpx.Response(200, json={"state": "success"})
        raise AssertionError(f"Unhandled request: {request.method} {request.url}")

    transport = httpx.MockTransport(handler)
    client = httpx.Client(transport=transport, base_url="https://github.test")
    provider = GitHubProviderClient(token="token", repository="org/repo", client=client)

    snapshot = provider.open_pull_request(
        source_branch="feature",
        target_branch="main",
        title="feat: add thing",
        body="summary",
        head_sha="abc123",
    )

    status = provider.fetch_pull_request_status(snapshot)

    assert snapshot.number == "42"
    assert status.ci_status == "success"
    assert status.review_status == "approved"


def test_gitlab_provider_creates_and_checks_merge_request() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.method == "POST" and request.url.path.endswith("/merge_requests"):
            payload = json.loads(request.content.decode())
            assert payload["source_branch"] == "feature"
            return httpx.Response(
                201,
                json={
                    "id": 99,
                    "iid": 7,
                    "web_url": "https://gitlab.test/demo/proj/-/merge_requests/7",
                    "title": payload["title"],
                    "state": "opened",
                },
            )
        if request.method == "GET" and request.url.path.endswith("/merge_requests/7"):
            return httpx.Response(
                200,
                json={"id": 99, "iid": 7, "state": "opened", "merged_at": None},
            )
        if request.method == "GET" and request.url.path.endswith("/merge_requests/7/approvals"):
            return httpx.Response(200, json={"approved": True, "approvers_left": []})
        if request.method == "GET" and request.url.path.endswith("/merge_requests/7/pipelines"):
            return httpx.Response(200, json=[{"status": "running"}])
        raise AssertionError(f"Unhandled request: {request.method} {request.url}")

    transport = httpx.MockTransport(handler)
    client = httpx.Client(transport=transport, base_url="https://gitlab.test/api/v4")
    provider = GitLabProviderClient(token="token", project_id="demo/proj", client=client)

    snapshot = provider.open_pull_request(
        source_branch="feature",
        target_branch="main",
        title="feat: add feature",
        body="summary",
        head_sha="def456",
    )

    status = provider.fetch_pull_request_status(snapshot)

    assert snapshot.number == "7"
    assert status.review_status == "approved"
    assert status.ci_status == "running"


def test_create_git_provider_handles_disabled_configuration(monkeypatch) -> None:
    monkeypatch.setenv("CONFIG_GIT_PROVIDER", "")
    settings = GitProviderSettings.from_env()
    client = create_git_provider(settings)
    assert client is None
