from __future__ import annotations

import time
from typing import Any, Dict, Iterable, Optional

import httpx

from .config import Settings


class GLMClient:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self._client = httpx.Client()

    def _headers(self) -> Dict[str, str]:
        return {
            "Authorization": f"Bearer {self.settings.api_key}",
            "Content-Type": "application/json",
        }

    def chat(self, payload: Dict[str, Any], timeout: int) -> Dict[str, Any]:
        request_body = {
            "model": self.settings.chat_model,
            **payload,
        }
        return self._call_with_retries(self.settings.chat_url, request_body, timeout)

    def embedding(self, texts: Iterable[str], timeout: int) -> Dict[str, Any]:
        if not self.settings.embedding_model:
            raise RuntimeError("Modelo de embedding não configurado para GLM-4.6.")
        request_body = {
            "model": self.settings.embedding_model,
            "input": list(texts),
        }
        return self._call_with_retries(self.settings.embedding_url, request_body, timeout)

    def _call_with_retries(self, url: str, payload: Dict[str, Any], timeout: int) -> Dict[str, Any]:
        last_error: Optional[Exception] = None
        for attempt in range(self.settings.retry_max + 1):
            try:
                response = self._client.post(url, headers=self._headers(), json=payload, timeout=timeout)
                response.raise_for_status()
                return response.json()
            except Exception as exc:  # pylint: disable=broad-except
                last_error = exc
                if attempt >= self.settings.retry_max:
                    break
                time.sleep(0.5 * (attempt + 1))
        if isinstance(last_error, httpx.HTTPStatusError):
            raise RuntimeError(
                f"Erro HTTP {last_error.response.status_code}: {last_error.response.text}"
            ) from last_error
        if last_error:
            raise RuntimeError(str(last_error))
        raise RuntimeError("Falha desconhecida ao chamar GLM-4.6")

    def close(self) -> None:
        self._client.close()

    def __del__(self) -> None:
        try:
            self.close()
        except Exception:  # pragma: no cover - best effort
            pass
