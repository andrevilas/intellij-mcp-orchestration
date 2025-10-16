"""Render helper functions for configuration assistant responses."""

from __future__ import annotations

from ..schemas_plan import Plan


def render_plan_overview(plan: Plan) -> str:
    """Create a human readable summary of the provided plan."""

    step_titles = ", ".join(step.title for step in plan.steps) or "no concrete steps"
    return f"Planned intent '{plan.intent}' covering: {step_titles}."


def render_chat_reply(message: str, plan: Plan | None = None) -> str:
    """Generate a conversational reply for the chat endpoint."""

    if plan is None:
        return (
            "Olá! Posso ajudá-lo a planejar alterações de configuração. "
            "Peça um plano informando uma intent suportada."
        )

    overview = render_plan_overview(plan)
    return f"Recebi sua mensagem '{message}'. {overview}"
