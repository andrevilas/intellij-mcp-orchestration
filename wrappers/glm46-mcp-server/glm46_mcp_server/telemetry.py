from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Optional


@dataclass
class TelemetryRecord:
    ts: str
    route: Optional[str]
    tool: str
    tokens_in: int
    tokens_out: int
    duration_ms: int
    status: str
    cost_estimated_usd: Optional[float]
    metadata: dict
    experiment_cohort: Optional[str] = None
    experiment_tag: Optional[str] = None

    def to_json(self) -> str:
        payload = asdict(self)
        payload["metadata"] = self.metadata or {}
        if payload.get("experiment_cohort") is None:
            payload.pop("experiment_cohort", None)
        if payload.get("experiment_tag") is None:
            payload.pop("experiment_tag", None)
        return json.dumps(payload, ensure_ascii=False)


class TelemetryLogger:
    def __init__(self, file_path: Path) -> None:
        self.file_path = file_path
        self.file_path.parent.mkdir(parents=True, exist_ok=True)

    def log(self, record: TelemetryRecord) -> None:
        line = record.to_json()
        with self.file_path.open("a", encoding="utf-8") as fh:
            fh.write(line + "\n")

    @staticmethod
    def create(
        tool: str,
        route: Optional[str],
        *,
        experiment_cohort: Optional[str] = None,
        experiment_tag: Optional[str] = None,
    ) -> TelemetryRecord:
        return TelemetryRecord(
            ts=datetime.utcnow().isoformat() + "Z",
            route=route,
            tool=tool,
            tokens_in=0,
            tokens_out=0,
            duration_ms=0,
            status="pending",
            cost_estimated_usd=None,
            metadata={},
            experiment_cohort=experiment_cohort,
            experiment_tag=experiment_tag,
        )
