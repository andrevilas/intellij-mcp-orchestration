"""Intent definitions understood by the configuration assistant."""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Mapping


class AssistantIntent(str, Enum):
    """Supported high-level tasks that can be planned by the assistant."""

    ADD_AGENT = "add_agent"
    EDIT_POLICIES = "edit_policies"
    EDIT_FINOPS = "edit_finops"
    GENERATE_ARTIFACT = "generate_artifact"


@dataclass(frozen=True)
class IntentMetadata:
    """Describes input expectations for a supported intent."""

    description: str
    required_fields: tuple[str, ...] = ()
    optional_fields: tuple[str, ...] = ()


INTENT_METADATA: Mapping[AssistantIntent, IntentMetadata] = {
    AssistantIntent.ADD_AGENT: IntentMetadata(
        description="Register a new MCP agent in the workspace.",
        required_fields=("agent_name",),
        optional_fields=("repository", "capabilities"),
    ),
    AssistantIntent.EDIT_POLICIES: IntentMetadata(
        description="Modify policy definitions stored in the repository.",
        required_fields=("policy_id",),
        optional_fields=("changes",),
    ),
    AssistantIntent.EDIT_FINOPS: IntentMetadata(
        description="Update FinOps dashboards and guardrails.",
        required_fields=("report_id",),
        optional_fields=("thresholds", "notes"),
    ),
    AssistantIntent.GENERATE_ARTIFACT: IntentMetadata(
        description="Produce or refresh generated configuration artifacts.",
        required_fields=("artifact_type", "target_path"),
        optional_fields=("parameters",),
    ),
}


def validate_intent_payload(intent: AssistantIntent, payload: Mapping[str, object]) -> None:
    """Ensure that the payload contains the required fields for the given intent."""

    metadata = INTENT_METADATA[intent]
    missing = [field for field in metadata.required_fields if field not in payload or payload[field] in (None, "")]
    if missing:
        missing_str = ", ".join(sorted(missing))
        raise ValueError(f"Missing required field(s) for intent '{intent.value}': {missing_str}")
