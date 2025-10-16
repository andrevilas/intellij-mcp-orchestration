"""Artifact templates used by the configuration assistant."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from string import Template
from typing import Mapping

import yaml

try:  # pragma: no cover - optional dependency resolution
    from app.schemas.manifest import AgentManifest
except ModuleNotFoundError:  # pragma: no cover - fallback when app package is unavailable
    import types

    _ROOT = Path(__file__).resolve().parents[5]
    _MANIFEST_PATH = _ROOT / "agents-hub" / "app" / "schemas" / "manifest.py"
    source = _MANIFEST_PATH.read_text(encoding="utf-8")
    filtered_lines = [line for line in source.splitlines() if not line.strip().startswith("MANIFEST_JSON_SCHEMA =")]
    module = types.ModuleType("agents_hub_manifest")
    exec(compile("\n".join(filtered_lines), str(_MANIFEST_PATH), "exec"), module.__dict__)
    AgentManifest = module.AgentManifest
    AgentManifest.model_rebuild(_types_namespace=module.__dict__)


@dataclass(frozen=True)
class RiskInfo:
    """Metadata describing the primary risk communicated to the operator."""

    title: str
    impact: str
    mitigation: str


@dataclass(frozen=True)
class ArtifactTemplate:
    """Static template metadata and helpers for artifact generation."""

    type: str
    filename: str
    title: str
    description: str
    step_title: str
    step_description: str
    diff_summary: str
    lint_kind: str
    risk: RiskInfo
    requires_agent_context: bool = False
    owner_hint: str | None = None

    def render(self, context: Mapping[str, object]) -> str:
        template_path = _TEMPLATES_DIR / self.filename
        raw_template = template_path.read_text(encoding="utf-8")
        return Template(raw_template).substitute(context)

    def validate(self, content: str) -> None:
        if self.type == "agent.manifest":
            _validate_manifest(content)


def _validate_manifest(content: str) -> None:
    try:
        payload = yaml.safe_load(content)
    except yaml.YAMLError as exc:  # pragma: no cover - defensive parsing guard
        raise ValueError("Manifesto YAML inválido") from exc

    if not isinstance(payload, dict):  # pragma: no cover - defensive guard
        raise ValueError("Manifesto YAML inválido: estrutura inesperada")

    AgentManifest.model_validate(payload)


_TEMPLATES_DIR = Path(__file__).resolve().parent

SUPPORTED_TEMPLATES: dict[str, ArtifactTemplate] = {
    "agent.manifest": ArtifactTemplate(
        type="agent.manifest",
        filename="agent_manifest.yaml.tmpl",
        title="Manifesto MCP",
        description="Estrutura base para novo agente MCP com defaults determinísticos.",
        step_title="Escrever manifesto do agente",
        step_description="Aplicar lint YAML e salvar manifesto validado no repositório.",
        diff_summary="Gerar manifesto MCP inicial com tool stub estruturado",
        lint_kind="yaml",
        risk=RiskInfo(
            title="Manifesto incompatível",
            impact="high",
            mitigation="Validar contra schema AgentManifest antes do merge.",
        ),
        requires_agent_context=True,
        owner_hint="platform-team",
    ),
    "agent.readme": ArtifactTemplate(
        type="agent.readme",
        filename="agent_readme.md.tmpl",
        title="README do agente",
        description="Documentação operacional cobrindo deploy, rollback e responsáveis.",
        step_title="Gerar README orientado a operações",
        step_description="Aplicar lint Markdown e publicar documentação do agente.",
        diff_summary="Criar README com procedimentos operacionais do agente",
        lint_kind="markdown",
        risk=RiskInfo(
            title="Documentação desatualizada",
            impact="medium",
            mitigation="Revisar checklist com time responsável antes da publicação.",
        ),
        requires_agent_context=True,
        owner_hint="platform-team",
    ),
    "agent.langgraph": ArtifactTemplate(
        type="agent.langgraph",
        filename="agent_module.py.tmpl",
        title="Stub LangGraph",
        description="Implementação Python base conectando manifesto a um tool determinístico.",
        step_title="Criar stub LangGraph",
        step_description="Escrever módulo Python validando entradas obrigatórias do tool.",
        diff_summary="Adicionar stub LangGraph com nó de tool determinístico",
        lint_kind="python",
        risk=RiskInfo(
            title="Tool inconsistente",
            impact="medium",
            mitigation="Executar testes de fumaça e validar retorno determinístico.",
        ),
        requires_agent_context=True,
        owner_hint="platform-team",
    ),
    "finops.checklist": ArtifactTemplate(
        type="finops.checklist",
        filename="finops_checklist.md.tmpl",
        title="Checklist FinOps",
        description="Checklist operacional para revisões de custo e risco antes do deploy.",
        step_title="Publicar checklist FinOps",
        step_description="Gerar Markdown padronizado com revisões e riscos monitorados.",
        diff_summary="Criar checklist FinOps orientando revisões de custo",
        lint_kind="markdown",
        risk=RiskInfo(
            title="Checklist incompleto",
            impact="medium",
            mitigation="Sincronizar revisão com FinOps antes de promover alterações.",
        ),
        requires_agent_context=False,
        owner_hint="finops-team",
    ),
}


def get_template(artifact_type: str) -> ArtifactTemplate:
    try:
        return SUPPORTED_TEMPLATES[artifact_type]
    except KeyError as exc:  # pragma: no cover - defensive guard
        raise ValueError(f"Unsupported artifact type: {artifact_type}") from exc


__all__ = ["ArtifactTemplate", "RiskInfo", "SUPPORTED_TEMPLATES", "get_template"]
