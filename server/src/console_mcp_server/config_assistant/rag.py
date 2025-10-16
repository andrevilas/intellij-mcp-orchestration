"""Lightweight retrieval augmented generation helpers for the config assistant."""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass
import math
import os
from pathlib import Path
import re
from typing import Iterable, Mapping, Sequence

from .intents import AssistantIntent

_TOKEN_PATTERN = re.compile(r"[\w\-]+", flags=re.UNICODE)


def _tokenize(text: str) -> list[str]:
    return [match.group(0).casefold() for match in _TOKEN_PATTERN.finditer(text)]


def _chunk_text(text: str, *, max_words: int = 160) -> Iterable[str]:
    paragraphs = [paragraph.strip() for paragraph in text.split("\n\n") if paragraph.strip()]
    if not paragraphs:
        stripped = text.strip()
        if stripped:
            yield stripped
        return

    current: list[str] = []
    word_count = 0
    for paragraph in paragraphs:
        words = paragraph.split()
        if word_count + len(words) > max_words and current:
            yield "\n\n".join(current)
            current = [paragraph]
            word_count = len(words)
        else:
            current.append(paragraph)
            word_count += len(words)

    if current:
        yield "\n\n".join(current)


def _extract_title(text: str) -> str | None:
    for line in text.splitlines():
        stripped = line.strip()
        if stripped.startswith("#"):
            return stripped.lstrip("# ") or None
    return None


@dataclass(frozen=True)
class IndexedDocument:
    """Internal representation of an indexed document chunk."""

    doc_id: str
    content: str
    tokens: Counter[str]
    metadata: Mapping[str, object]


@dataclass(frozen=True)
class RagSearchResult:
    """Result returned by ``RagService`` queries."""

    path: str
    snippet: str
    score: float
    chunk: int
    title: str | None = None


class SimpleVectorStore:
    """In-memory TF-IDF store supporting cosine similarity queries."""

    def __init__(self) -> None:
        self._documents: list[IndexedDocument] = []
        self._doc_freq: Counter[str] = Counter()

    # ------------------------------------------------------------------
    # Indexing helpers
    # ------------------------------------------------------------------
    def add_document(self, doc_id: str, text: str, *, metadata: Mapping[str, object]) -> None:
        tokens = _tokenize(text)
        if not tokens:
            return
        counts = Counter(tokens)
        self._documents.append(IndexedDocument(doc_id, text, counts, dict(metadata)))
        for term in counts:
            self._doc_freq[term] += 1

    # ------------------------------------------------------------------
    # Vector math helpers
    # ------------------------------------------------------------------
    def _idf(self, term: str) -> float:
        doc_total = len(self._documents)
        frequency = self._doc_freq.get(term, 0)
        return math.log((1 + doc_total) / (1 + frequency)) + 1.0

    def _vector_norm(self, counts: Mapping[str, int]) -> float:
        total = 0.0
        for term, occurrences in counts.items():
            weight = occurrences * self._idf(term)
            total += weight * weight
        return math.sqrt(total)

    def _similarity(
        self,
        document: IndexedDocument,
        query_counts: Mapping[str, int],
        query_norm: float,
    ) -> float:
        idf_cache: dict[str, float] = {}

        def _idf_cached(term: str) -> float:
            value = idf_cache.get(term)
            if value is None:
                value = self._idf(term)
                idf_cache[term] = value
            return value

        numerator = 0.0
        for term in set(document.tokens) & set(query_counts):
            idf = _idf_cached(term)
            numerator += (document.tokens[term] * idf) * (query_counts[term] * idf)

        if numerator <= 0.0:
            return 0.0

        document_norm = math.sqrt(
            sum((occurrences * _idf_cached(term)) ** 2 for term, occurrences in document.tokens.items())
        )
        denominator = document_norm * query_norm
        if denominator == 0.0:
            return 0.0
        return numerator / denominator

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------
    def query(self, text: str, *, top_k: int = 5) -> list[tuple[IndexedDocument, float]]:
        counts = Counter(_tokenize(text))
        if not counts:
            return []

        query_norm = self._vector_norm(counts)
        if query_norm == 0.0:
            return []

        scored: list[tuple[IndexedDocument, float]] = []
        for document in self._documents:
            score = self._similarity(document, counts, query_norm)
            if score > 0.0:
                scored.append((document, score))

        scored.sort(key=lambda entry: entry[1], reverse=True)
        return scored[:top_k]

    @property
    def document_count(self) -> int:
        return len(self._documents)


class RagService:
    """High-level helper that indexes repository documentation for RAG queries."""

    def __init__(self, *, docs_path: Path | None = None) -> None:
        env_override = os.environ.get("CONSOLE_MCP_RAG_DOCS_PATH")
        if env_override:
            docs_path = Path(env_override)
        if docs_path is None:
            docs_path = Path(__file__).resolve().parents[4] / "docs"
        self._docs_path = docs_path
        self._repo_root = docs_path.resolve().parent
        self._store = SimpleVectorStore()
        self._indexed = False

    # ------------------------------------------------------------------
    # Index management
    # ------------------------------------------------------------------
    def reset(self) -> None:
        self._store = SimpleVectorStore()
        self._indexed = False

    def ensure_index(self) -> None:
        if self._indexed:
            return
        self._build_index()
        self._indexed = True

    def _iter_source_files(self) -> Iterable[Path]:
        if not self._docs_path.exists():
            return []
        patterns = ("*.md", "*.mdx", "*.txt")
        files: set[Path] = set()
        for pattern in patterns:
            files.update(self._docs_path.rglob(pattern))
        return sorted(path for path in files if path.is_file())

    def _build_index(self) -> None:
        for path in self._iter_source_files():
            try:
                text = path.read_text(encoding="utf-8")
            except UnicodeDecodeError:
                text = path.read_text(encoding="utf-8", errors="ignore")

            title = _extract_title(text)
            for chunk_index, chunk in enumerate(_chunk_text(text)):
                doc_id = f"{path}:{chunk_index}"
                metadata = {
                    "path": str(path.resolve().relative_to(self._repo_root)),
                    "chunk": chunk_index,
                    "title": title,
                }
                self._store.add_document(doc_id, chunk, metadata=metadata)

    # ------------------------------------------------------------------
    # Query helpers
    # ------------------------------------------------------------------
    @staticmethod
    def _format_snippet(text: str, *, limit: int = 320) -> str:
        snippet = " ".join(text.split())
        if len(snippet) <= limit:
            return snippet
        truncated = snippet[: limit - 1].rstrip()
        return f"{truncated}…"

    def query(
        self,
        query: str,
        *,
        top_k: int = 5,
        intent: str | None = None,
    ) -> list[RagSearchResult]:
        self.ensure_index()
        results = self._store.query(query, top_k=top_k)

        formatted: list[RagSearchResult] = []
        for document, score in results:
            path = str(document.metadata.get("path", document.doc_id))
            chunk_index = int(document.metadata.get("chunk", 0))
            title = document.metadata.get("title")
            formatted.append(
                RagSearchResult(
                    path=path,
                    snippet=self._format_snippet(document.content),
                    score=round(float(score), 6),
                    chunk=chunk_index,
                    title=str(title) if isinstance(title, str) else None,
                )
            )
        return formatted

    def suggest_context(
        self,
        intent: AssistantIntent | str,
        payload: Mapping[str, object] | None = None,
        *,
        limit: int = 3,
    ) -> list[RagSearchResult]:
        payload = payload or {}

        resolved_intent: AssistantIntent | None
        if isinstance(intent, AssistantIntent):
            resolved_intent = intent
        else:
            try:
                resolved_intent = AssistantIntent(intent)
            except ValueError:
                resolved_intent = None

        if resolved_intent is None:
            return []

        query_terms: list[str] = []
        if resolved_intent is AssistantIntent.ADD_AGENT:
            query_terms.append(str(payload.get("agent_name", "")))
            capabilities = payload.get("capabilities", ())
            if isinstance(capabilities, Sequence):
                query_terms.extend(str(item) for item in capabilities)
            query_terms.append("LangGraph checkpoints")
        elif resolved_intent is AssistantIntent.EDIT_POLICIES:
            query_terms.append(str(payload.get("policy_id", "")))
            query_terms.append("policy guardrails")
        elif resolved_intent is AssistantIntent.EDIT_FINOPS:
            query_terms.append(str(payload.get("report_id", "")))
            query_terms.append("FinOps guardrails")
        elif resolved_intent is AssistantIntent.CREATE_FLOW:
            graph = payload.get("graph")
            if isinstance(graph, Mapping):
                query_terms.append(str(graph.get("label", "")))
            query_terms.append("LangGraph HITL checkpoints")
        else:
            return []

        query = " ".join(term for term in query_terms if term).strip()
        if not query:
            return []

        return self.query(query, top_k=limit, intent=resolved_intent.value)


rag_service = RagService()


__all__ = ["RagService", "RagSearchResult", "rag_service"]
