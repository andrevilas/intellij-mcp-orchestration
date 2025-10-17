from console_mcp_server.config_assistant.intents import AssistantIntent
from console_mcp_server.config_assistant.planner import plan_intent

def _find_manifest_diff(plan):
    return next((diff for diff in plan.diffs if diff.path == "policies/manifest.json"), None)


def test_finops_plan_includes_manifest_diff_for_policy_changes() -> None:
    plan = plan_intent(
        AssistantIntent.EDIT_FINOPS,
        {
            "report_id": "core-metrics",
            "changes": {
                "finops": {
                    "cache": {"ttl_seconds": 900},
                    "rate_limit": {"requests_per_minute": 240},
                    "graceful_degradation": {
                        "strategy": "fallback",
                        "message": "fallback turbo",
                    },
                }
            },
        },
    )

    diff = _find_manifest_diff(plan)
    assert diff is not None
    assert diff.summary.startswith("Atualizar manifesto FinOps")
    assert "cache TTL" in diff.summary
    assert "rate limit" in diff.summary
    assert "graceful degradation" in diff.summary


def test_finops_plan_supports_alias_keys() -> None:
    plan = plan_intent(
        AssistantIntent.EDIT_FINOPS,
        {
            "report_id": "core",
            "changes": {
                "finops": {
                    "cache_ttl": 450,
                    "rateLimit": 180,
                    "graceful_degradation": "throttle",
                }
            },
        },
    )

    diff = _find_manifest_diff(plan)
    assert diff is not None
    assert "cache TTL" in diff.summary
    assert "rate limit" in diff.summary
    assert "graceful degradation" in diff.summary
