from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, Field, validator

VALID_ROLES = {"system", "user", "assistant"}


class ExperimentContext(BaseModel):
    cohort: Optional[str] = Field(None, description="Cohort identifier for experimentation")
    tag: Optional[str] = Field(None, description="Tag for experiment rollout variations")


class ChatMessage(BaseModel):
    role: str = Field(..., description="Role da mensagem (system/user/assistant)")
    content: str = Field(..., description="Conteúdo da mensagem")

    @validator("role")
    def validate_role(cls, value: str) -> str:
        if value not in VALID_ROLES:
            raise ValueError(f"Role inválida: {value}")
        return value


class ChatArguments(BaseModel):
    messages: List[ChatMessage]
    max_tokens: Optional[int] = Field(None, description="Limite de tokens de saída")
    temperature: Optional[float] = Field(None, ge=0.0, le=2.0)
    route: Optional[str] = Field(None, description="Rota declarada para aplicar políticas")
    experiment: Optional[ExperimentContext] = Field(
        None,
        description="Contexto de experimento para etiquetar telemetria",
    )


class EmbeddingArguments(BaseModel):
    texts: List[str]
    route: Optional[str] = None
    experiment: Optional[ExperimentContext] = Field(
        None,
        description="Contexto de experimento para etiquetar telemetria",
    )


class TokenCountArguments(BaseModel):
    texts: List[str]
    route: Optional[str] = None
    experiment: Optional[ExperimentContext] = Field(
        None,
        description="Contexto de experimento para etiquetar telemetria",
    )
