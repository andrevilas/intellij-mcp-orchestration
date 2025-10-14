from __future__ import annotations

import math
from typing import Iterable, Sequence

AVERAGE_CHARS_PER_TOKEN = 4


def count_tokens_from_text(text: str) -> int:
    if not text:
        return 0
    # Simple heuristic: assume ~4 characters per token.
    return max(1, math.ceil(len(text) / AVERAGE_CHARS_PER_TOKEN))


def count_tokens_from_messages(messages: Sequence[dict]) -> int:
    total = 0
    for message in messages:
        content = message.get("content", "") if isinstance(message, dict) else ""
        total += count_tokens_from_text(str(content))
    return total


def count_tokens_from_iterable(items: Iterable[str]) -> int:
    return sum(count_tokens_from_text(item) for item in items)
