"""Authorized lexical and persistent Qdrant search over registered passages."""

import re
from datetime import date
from enum import StrEnum
from pathlib import Path
from typing import Any
from uuid import NAMESPACE_URL, uuid5

from openai import OpenAI
from pydantic import BaseModel
from qdrant_client import QdrantClient, models

from .roles import authorize_source
from .schemas import User
from .source_registry import (
    AIUsageRights,
    HostingPermission,
    PassageRecord,
    RegisteredSource,
    SQLiteSourceRegistry,
)

_TOKEN_PATTERN = re.compile(r"[a-z0-9]+")
_COLLECTION_NAME = "dental_source_passages"


class PassageSearchMode(StrEnum):
    """Explicit passage search modes with no silent vector-to-lexical fallback."""

    LEXICAL = "lexical"
    VECTOR = "vector"


class PassageCitation(BaseModel):
    """Entitlement-aware source and location data attached to a passage hit."""

    source_id: str
    passage_id: str
    title: str
    publisher: str | None
    document_identity: str
    edition: str | None
    access_type: str
    publication_date: str | None
    effective_date: str | None
    page_number: int | None
    section: str | None
    exact_quote: str
    start_offset: int
    end_offset: int
    pdf_bbox: list[float] | None
    source_uri: str | None
    original_url: str | None
    source_access_action: str
    source_access_url: str | None
    media_type: str


class PassageSearchResult(BaseModel):
    """A scored authorized passage with a directly usable frontend citation."""

    score: float
    citation: PassageCitation


class PassageSearchTrace(BaseModel):
    """Content-free evidence showing authorization before passage ranking."""

    mode: PassageSearchMode
    candidate_source_ids: list[str]
    candidate_passage_ids: list[str]
    authorized_passage_ids: list[str]
    ranked_passage_ids: list[str]
    exclusion_reasons: dict[str, str]


class PassageSearchOutcome(BaseModel):
    """Passage results paired with an authorization and ranking trace."""

    results: list[PassageSearchResult]
    trace: PassageSearchTrace


class PassageIndex:
    """Search SQLite passages lexically and optionally index approved text in Qdrant."""

    def __init__(
        self,
        registry: SQLiteSourceRegistry,
        *,
        vector_enabled: bool,
        qdrant_path: Path,
        openai_api_key: str | None,
        embedding_model: str,
        embedding_client: Any | None = None,
        qdrant_client: Any | None = None,
    ) -> None:
        self.registry = registry
        self.vector_enabled = vector_enabled
        self.embedding_model = embedding_model
        self._openai: Any | None = None
        self._qdrant: Any | None = None
        if vector_enabled:
            if openai_api_key is None and embedding_client is None:
                raise ValueError("Vector passage indexing requires an OpenAI API key")
            qdrant_path.mkdir(parents=True, exist_ok=True)
            self._openai = embedding_client or OpenAI(api_key=openai_api_key)
            self._qdrant = qdrant_client or QdrantClient(path=str(qdrant_path))

    def search(
        self,
        user: User,
        query: str,
        *,
        mode: PassageSearchMode,
        patient_context_id: str | None,
        limit: int,
    ) -> PassageSearchOutcome:
        """Run the requested search mode after building an authorization allow-list."""

        if mode == PassageSearchMode.LEXICAL:
            return self._lexical_outcome(
                user,
                query,
                patient_context_id=patient_context_id,
                limit=limit,
            )
        return self._vector_outcome(
            user,
            query,
            patient_context_id=patient_context_id,
            limit=limit,
        )

    def lexical_search(
        self,
        user: User,
        query: str,
        *,
        patient_context_id: str | None,
        limit: int,
    ) -> list[PassageSearchResult]:
        """Preserve the original lexical-list API for internal compatibility."""

        return self._lexical_outcome(
            user,
            query,
            patient_context_id=patient_context_id,
            limit=limit,
        ).results

    def _lexical_outcome(
        self,
        user: User,
        query: str,
        *,
        patient_context_id: str | None,
        limit: int,
    ) -> PassageSearchOutcome:
        """Rank current authorized passages using deterministic token overlap."""

        query_terms = set(_TOKEN_PATTERN.findall(query.lower()))
        ranked: list[tuple[int, RegisteredSource, PassageRecord]] = []
        authorized_sources, trace = self._authorized_sources(
            user,
            PassageSearchMode.LEXICAL,
            patient_context_id,
        )
        for source in authorized_sources:
            for passage in self.registry.list_passages(source.id):
                passage_terms = set(
                    _TOKEN_PATTERN.findall(
                        f"{source.title} {passage.section or ''} {passage.exact_quote}".lower()
                    )
                )
                score = len(query_terms & passage_terms)
                if score > 0:
                    ranked.append((score, source, passage))

        ranked.sort(
            key=lambda item: (
                item[0],
                item[1].publication_date.isoformat()
                if item[1].publication_date is not None
                else "",
                item[2].id,
            ),
            reverse=True,
        )
        results = [
            PassageSearchResult(
                score=score,
                citation=self._citation(source, passage),
            )
            for score, source, passage in ranked[:limit]
        ]
        trace.ranked_passage_ids = [
            result.citation.passage_id for result in results
        ]
        return PassageSearchOutcome(results=results, trace=trace)

    def _vector_outcome(
        self,
        user: User,
        query: str,
        *,
        patient_context_id: str | None,
        limit: int,
    ) -> PassageSearchOutcome:
        """Query persistent Qdrant then reauthorize every returned passage."""

        if not self.vector_enabled or self._openai is None or self._qdrant is None:
            raise ValueError("vector passage search is not enabled")
        authorized_sources, trace = self._authorized_sources(
            user,
            PassageSearchMode.VECTOR,
            patient_context_id,
        )
        sources_by_id = {source.id: source for source in authorized_sources}
        collections = {
            collection.name for collection in self._qdrant.get_collections().collections
        }
        if _COLLECTION_NAME not in collections:
            return PassageSearchOutcome(results=[], trace=trace)

        response = self._openai.embeddings.create(
            model=self.embedding_model,
            input=[query],
        )
        points = self._qdrant.query_points(
            collection_name=_COLLECTION_NAME,
            query=response.data[0].embedding,
            query_filter=models.Filter(
                must=[
                    models.FieldCondition(
                        key="tenant_id",
                        match=models.MatchValue(value=user.tenant_id),
                    )
                ]
            ),
            limit=max(limit * 5, limit),
        ).points
        results: list[PassageSearchResult] = []
        for point in points:
            source_id = point.payload["source_id"]
            passage_id = point.payload["passage_id"]
            source = self.registry.get_source(source_id)
            if source is None:
                trace.exclusion_reasons[passage_id] = "source_not_found"
                continue
            post_hit_reason = self._source_exclusion_reason(
                user,
                source,
                patient_context_id,
                date.today(),
            )
            if (
                source_id not in sources_by_id
                or passage_id not in trace.authorized_passage_ids
                or post_hit_reason is not None
            ):
                trace.exclusion_reasons[passage_id] = (
                    post_hit_reason or "authorization_changed_after_indexing"
                )
                continue
            passage = self.registry.get_passage(passage_id)
            if passage is None or passage.source_id != source.id:
                trace.exclusion_reasons[passage_id] = "passage_not_found"
                continue
            results.append(
                PassageSearchResult(
                    score=float(point.score),
                    citation=self._citation(source, passage),
                )
            )
            if len(results) == limit:
                break
        trace.ranked_passage_ids = [
            result.citation.passage_id for result in results
        ]
        return PassageSearchOutcome(results=results, trace=trace)

    def _authorized_sources(
        self,
        user: User,
        mode: PassageSearchMode,
        patient_context_id: str | None,
    ) -> tuple[list[RegisteredSource], PassageSearchTrace]:
        sources = self.registry.list_sources(user.tenant_id)
        candidate_passages: list[str] = []
        authorized_passages: list[str] = []
        exclusion_reasons: dict[str, str] = {}
        authorized_sources: list[RegisteredSource] = []
        today = date.today()
        for source in sources:
            passage_ids = self.registry.list_passage_ids(source.id)
            candidate_passages.extend(passage_ids)
            reason = self._source_exclusion_reason(
                user,
                source,
                patient_context_id,
                today,
            )
            if reason is not None:
                exclusion_reasons[source.id] = reason
                for passage_id in passage_ids:
                    exclusion_reasons[passage_id] = reason
                continue
            authorized_sources.append(source)
            authorized_passages.extend(passage_ids)
        return authorized_sources, PassageSearchTrace(
            mode=mode,
            candidate_source_ids=[source.id for source in sources],
            candidate_passage_ids=candidate_passages,
            authorized_passage_ids=authorized_passages,
            ranked_passage_ids=[],
            exclusion_reasons=exclusion_reasons,
        )

    @staticmethod
    def _source_exclusion_reason(
        user: User,
        source: RegisteredSource,
        patient_context_id: str | None,
        today: date,
    ) -> str | None:
        if source.ai_usage_rights != AIUsageRights.APPROVED:
            return f"ai_usage_rights_{source.ai_usage_rights}"
        if source.superseded_by_source_id is not None:
            return "superseded"
        if source.effective_date is not None and source.effective_date > today:
            return "not_yet_effective"
        allowed, reason = authorize_source(user, source, patient_context_id)
        return None if allowed else reason

    def index_passages(
        self,
        source: RegisteredSource,
        passages: list[PassageRecord],
    ) -> None:
        """Embed approved passages into a persistent tenant-filterable Qdrant collection."""

        if not self.vector_enabled or not passages:
            return
        if self._openai is None or self._qdrant is None:
            raise RuntimeError("vector passage index was not initialized")

        response = self._openai.embeddings.create(
            model=self.embedding_model,
            input=[passage.exact_quote for passage in passages],
        )
        vectors = [item.embedding for item in response.data]
        collections = {
            collection.name for collection in self._qdrant.get_collections().collections
        }
        if _COLLECTION_NAME not in collections:
            self._qdrant.create_collection(
                collection_name=_COLLECTION_NAME,
                vectors_config=models.VectorParams(
                    size=len(vectors[0]),
                    distance=models.Distance.COSINE,
                ),
            )

        self._qdrant.upsert(
            collection_name=_COLLECTION_NAME,
            points=[
                models.PointStruct(
                    id=str(uuid5(NAMESPACE_URL, passage.id)),
                    vector=vector,
                    payload={
                        "passage_id": passage.id,
                        "source_id": source.id,
                        "tenant_id": source.tenant_id,
                    },
                )
                for passage, vector in zip(passages, vectors, strict=True)
            ],
        )

    @staticmethod
    def _citation(
        source: RegisteredSource,
        passage: PassageRecord,
    ) -> PassageCitation:
        can_open_original = source.hosting_permission == HostingPermission.PERMITTED
        if can_open_original:
            action = "open_original"
            action_url = f"/registry/sources/{source.id}/file"
        elif source.source_uri is not None:
            action = "open_publisher"
            action_url = source.source_uri
        else:
            action = "citation_only"
            action_url = None
        return PassageCitation(
            source_id=source.id,
            passage_id=passage.id,
            title=source.title,
            publisher=source.publisher,
            document_identity=source.document_identity,
            edition=source.edition,
            access_type=source.access_type,
            publication_date=source.publication_date.isoformat()
            if source.publication_date is not None
            else None,
            effective_date=source.effective_date.isoformat()
            if source.effective_date is not None
            else None,
            page_number=passage.page_number,
            section=passage.section,
            exact_quote=passage.exact_quote,
            start_offset=passage.start_offset,
            end_offset=passage.end_offset,
            pdf_bbox=passage.pdf_bbox,
            source_uri=source.source_uri,
            original_url=(
                f"/registry/sources/{source.id}/file" if can_open_original else None
            ),
            source_access_action=action,
            source_access_url=action_url,
            media_type=source.media_type,
        )
