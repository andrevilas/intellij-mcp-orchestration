"""Helpers for rendering and linting configuration assistant artifacts."""

from __future__ import annotations

from dataclasses import dataclass
import re
from pathlib import Path
from typing import Any, Mapping

from .templates import ArtifactTemplate, get_template


@dataclass(frozen=True)
class ArtifactGenerationResult:
    """Rendered artifact along with the originating template metadata."""

    template: ArtifactTemplate
    target_path: str
    content: str
    context: Mapping[str, Any]


_DEFAULT_CAPABILITIES = ("structured-output",)


def generate_artifact(
    artifact_type: str,
    target_path: str,
    *,
    parameters: Mapping[str, Any] | None = None,
) -> ArtifactGenerationResult:
    """Render the requested artifact applying linting and validation rules."""

    template = get_template(artifact_type)
    context = _build_context(template, target_path, parameters or {})
    raw_content = template.render(context)
    linted_content = _lint_content(template, raw_content)
    template.validate(linted_content)
    return ArtifactGenerationResult(
        template=template,
        target_path=str(Path(target_path).as_posix()),
        content=linted_content,
        context=context,
    )


def _build_context(
    template: ArtifactTemplate,
    target_path: str,
    parameters: Mapping[str, Any],
) -> dict[str, Any]:
    base: dict[str, Any] = {"target_path": str(Path(target_path).as_posix())}
    if template.requires_agent_context:
        base.update(_derive_agent_identifiers(template, target_path, parameters))

    if template.type == "agent.manifest":
        base.update(_manifest_context(base, parameters))
    elif template.type == "agent.readme":
        base.update(_readme_context(base, parameters))
    elif template.type == "agent.langgraph":
        base.update(_module_context(base, parameters))
    elif template.type == "finops.checklist":
        base.update(_finops_context(base, parameters))

    return base


def _derive_agent_identifiers(
    template: ArtifactTemplate, target_path: str, parameters: Mapping[str, Any]
) -> dict[str, str]:
    path = Path(target_path)
    parts = path.parts
    if "agents" not in parts:
        raise ValueError("target_path precisa apontar para app/agents/<slug> para este template")

    slug_index = parts.index("agents") + 1
    try:
        raw_slug = parts[slug_index]
    except IndexError as exc:  # pragma: no cover - defensive guard
        raise ValueError("Caminho não contém slug do agente") from exc

    slug = str(parameters.get("agent_slug") or raw_slug).strip().lower().replace("_", "-")
    if not slug:
        raise ValueError("Slug do agente não pode ser vazio")

    module = slug.replace("-", "_")
    class_name = _to_pascal_case(slug) + "Agent"
    title = parameters.get("agent_title") or _to_title(slug)
    tool_name = parameters.get("tool_name") or f"{module}_tool"

    return {
        "agent_slug": slug,
        "agent_module": module,
        "agent_class": class_name,
        "agent_title": title,
        "tool_name": tool_name,
        "manifest_path": f"{path.parent.as_posix()}/agent.yaml",
        "module_path": f"{path.parent.as_posix()}/agent.py",
        "owner": parameters.get("owner") or template.owner_hint or "platform-team",
    }


def _manifest_context(base: Mapping[str, Any], parameters: Mapping[str, Any]) -> dict[str, Any]:
    capabilities = tuple(dict.fromkeys(parameters.get("capabilities", _DEFAULT_CAPABILITIES))) or _DEFAULT_CAPABILITIES
    capabilities_block = "\n".join(f"    - {cap}" for cap in capabilities)
    description = parameters.get(
        "description",
        f"Agente determinístico {base['agent_title']} com stub inicial para evolução incremental.",
    )
    cost_center = parameters.get("cost_center") or f"{base['agent_slug']}-operations"

    return {
        "capabilities_block": capabilities_block,
        "description": description,
        "cost_center": cost_center,
    }


def _readme_context(base: Mapping[str, Any], parameters: Mapping[str, Any]) -> dict[str, Any]:
    owner = parameters.get("owner") or base.get("owner") or "platform-team"
    return {
        "owner": owner,
    }


def _module_context(base: Mapping[str, Any], parameters: Mapping[str, Any]) -> dict[str, Any]:
    return {
        "tool_name": parameters.get("tool_name") or base["tool_name"],
        "agent_class": base["agent_class"],
    }


def _finops_context(base: Mapping[str, Any], parameters: Mapping[str, Any]) -> dict[str, Any]:
    owner = parameters.get("owner") or base.get("owner") or "finops-team"
    filename = Path(str(base["target_path"])).name
    checklist_title = parameters.get("checklist_title") or _to_title(Path(filename).stem)
    alert_channel = parameters.get("alert_channel") or "slack"

    return {
        "agent_slug": base.get("agent_slug", Path(filename).stem),
        "owner": owner,
        "checklist_title": checklist_title,
        "alert_channel": alert_channel,
    }


def _lint_content(template: ArtifactTemplate, content: str) -> str:
    normalized = _normalize_newlines(content)
    trimmed_lines = [line.rstrip() for line in normalized.splitlines()]

    if template.lint_kind == "markdown":
        trimmed_lines = _ensure_heading_spacing(trimmed_lines)
    elif template.lint_kind == "python":
        trimmed_lines = _ensure_python_newlines(trimmed_lines)

    final = "\n".join(trimmed_lines).strip("\n") + "\n"
    return final


def _normalize_newlines(content: str) -> str:
    return content.replace("\r\n", "\n").replace("\r", "\n")


def _ensure_heading_spacing(lines: list[str]) -> list[str]:
    result: list[str] = []
    for index, line in enumerate(lines):
        result.append(line)
        if line.startswith("#"):
            next_line = lines[index + 1] if index + 1 < len(lines) else ""
            if next_line and next_line.strip():
                result.append("")
    return result


def _ensure_python_newlines(lines: list[str]) -> list[str]:
    result = list(lines)
    if result and result[-1].strip():
        result.append("")
    return result


def _to_pascal_case(value: str) -> str:
    parts = re.split(r"[^a-zA-Z0-9]+", value)
    return "".join(part.capitalize() for part in parts if part)


def _to_title(value: str) -> str:
    parts = re.split(r"[^a-zA-Z0-9]+", value)
    return " ".join(part.capitalize() for part in parts if part) or value.title()


__all__ = ["ArtifactGenerationResult", "generate_artifact"]
