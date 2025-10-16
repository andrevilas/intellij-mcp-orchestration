"""Pydantic models describing configuration plans."""

from __future__ import annotations

from enum import Enum
from typing import List

from pydantic import BaseModel, ConfigDict, Field


class PlanExecutionStatus(str, Enum):
    """Execution lifecycle states for a configuration plan."""

    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"


class PlanStep(BaseModel):
    """Represents a single step that should be performed during plan execution."""

    id: str = Field(..., min_length=1)
    title: str = Field(..., min_length=1)
    description: str = Field(..., min_length=1)
    depends_on: List[str] = Field(default_factory=list)


class DiffSummary(BaseModel):
    """High level description of repository modifications produced by the plan."""

    path: str = Field(..., min_length=1)
    summary: str = Field(..., min_length=1)
    change_type: str = Field(default="update")


class Risk(BaseModel):
    """Potential risk associated with the plan along with mitigation guidance."""

    title: str = Field(..., min_length=1)
    impact: str = Field(default="medium")
    mitigation: str = Field(default="")


class Plan(BaseModel):
    """Top level plan returned to clients of the configuration assistant."""

    intent: str = Field(..., min_length=1)
    summary: str = Field(..., min_length=1)
    steps: List[PlanStep] = Field(default_factory=list)
    diffs: List[DiffSummary] = Field(default_factory=list)
    risks: List[Risk] = Field(default_factory=list)
    status: PlanExecutionStatus = Field(default=PlanExecutionStatus.PENDING)

    model_config = ConfigDict(use_enum_values=True)
