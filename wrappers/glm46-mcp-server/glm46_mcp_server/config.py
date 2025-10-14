from __future__ import annotations

import json
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Optional

DEFAULT_MAX_TOKENS = 16000
DEFAULT_MAX_COST = 0.50
DEFAULT_TIMEOUT = 60
DEFAULT_RETRY_MAX = 2

DEFAULT_CHAT_MODEL = "glm-4-0520"
DEFAULT_EMBEDDING_MODEL = None
DEFAULT_CHAT_URL = os.getenv("GLM46_CHAT_URL", "https://open.bigmodel.cn/api/paas/v4/chat/completions")
DEFAULT_EMBEDDING_URL = os.getenv("GLM46_EMBEDDING_URL", "https://open.bigmodel.cn/api/paas/v4/embeddings")


@dataclass
class LimitConfig:
    max_tokens: int
    max_cost_usd: float
    timeout_s: int


@dataclass
class PriceTable:
    input_per_1k: Optional[float]
    output_per_1k: Optional[float]
    embedding_per_1k: Optional[float]

    def has_prices(self) -> bool:
        return all(value is not None for value in (self.input_per_1k, self.output_per_1k))


class CostPolicy:
    def __init__(self, data: Dict[str, Any]) -> None:
        defaults = data.get("defaults", {}) if isinstance(data, dict) else {}
        self.defaults: Dict[str, Any] = defaults
        self.routes: Dict[str, Dict[str, Any]] = data.get("routes", {}) if isinstance(data, dict) else {}

    def limits_for(self, route: Optional[str]) -> LimitConfig:
        combined: Dict[str, Any] = {
            "MAX_TOKENS": DEFAULT_MAX_TOKENS,
            "MAX_COST_USD": DEFAULT_MAX_COST,
            "TIMEOUT_S": DEFAULT_TIMEOUT,
        }
        combined.update({k: v for k, v in self.defaults.items() if k in combined})
        if route and route in self.routes:
            for key, value in self.routes[route].items():
                if key in combined:
                    combined[key] = value
        env_overrides = {
            "MAX_TOKENS": os.getenv("MAX_TOKENS"),
            "MAX_COST_USD": os.getenv("MAX_COST_USD"),
            "TIMEOUT_S": os.getenv("TIMEOUT_S"),
        }
        for key, value in env_overrides.items():
            if value is None:
                continue
            if key == "MAX_COST_USD":
                combined[key] = float(value)
            else:
                combined[key] = int(value)
        return LimitConfig(
            max_tokens=int(combined["MAX_TOKENS"]),
            max_cost_usd=float(combined["MAX_COST_USD"]),
            timeout_s=int(combined["TIMEOUT_S"]),
        )


@dataclass
class Settings:
    api_key: str
    chat_url: str
    embedding_url: str
    chat_model: str
    embedding_model: Optional[str]
    retry_max: int
    price_table: PriceTable
    cost_policy: CostPolicy
    log_dir: Path

    @property
    def telemetry_file(self) -> Path:
        self.log_dir.mkdir(parents=True, exist_ok=True)
        return self.log_dir / f"{self.current_log_name()}"

    @staticmethod
    def current_log_name() -> str:
        from datetime import datetime

        return datetime.utcnow().strftime("%Y-%m-%d.jsonl")


def load_cost_policy() -> CostPolicy:
    default_path = Path(os.getenv("MCP_COST_POLICY_FILE", Path.home() / ".mcp" / "cost-policy.json"))
    if default_path.exists():
        try:
            with default_path.open("r", encoding="utf-8") as fh:
                data = json.load(fh)
                if isinstance(data, dict):
                    return CostPolicy(data)
        except Exception:
            pass
    repo_policy = Path(__file__).resolve().parents[2] / "config" / "cost-policy.json"
    if repo_policy.exists():
        with repo_policy.open("r", encoding="utf-8") as fh:
            data = json.load(fh)
            return CostPolicy(data if isinstance(data, dict) else {})
    return CostPolicy({})


def load_settings() -> Settings:
    api_key = os.getenv("ZHIPU_API_KEY")
    if not api_key:
        raise RuntimeError("ZHIPU_API_KEY não configurada. Execute scripts/get-keys.sh e defina a variável.")

    retry_max = int(os.getenv("RETRY_MAX", DEFAULT_RETRY_MAX))

    price_table = PriceTable(
        input_per_1k=_safe_float(os.getenv("GLM46_PRICE_INPUT_PER_1K")),
        output_per_1k=_safe_float(os.getenv("GLM46_PRICE_OUTPUT_PER_1K")),
        embedding_per_1k=_safe_float(os.getenv("GLM46_PRICE_EMBEDDING_PER_1K")),
    )

    log_dir = Path(os.getenv("GLM46_LOG_DIR", Path.home() / ".mcp" / "logs" / "glm46"))

    return Settings(
        api_key=api_key,
        chat_url=DEFAULT_CHAT_URL,
        embedding_url=DEFAULT_EMBEDDING_URL,
        chat_model=os.getenv("GLM46_MODEL", DEFAULT_CHAT_MODEL),
        embedding_model=os.getenv("GLM46_EMBEDDING_MODEL") or DEFAULT_EMBEDDING_MODEL,
        retry_max=retry_max,
        price_table=price_table,
        cost_policy=load_cost_policy(),
        log_dir=log_dir,
    )


def _safe_float(value: Optional[str]) -> Optional[float]:
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (ValueError, TypeError):
        return None
