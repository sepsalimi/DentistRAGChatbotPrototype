"""Authorization-first in-memory retrieval with deterministic lexical ranking."""

import re
from dataclasses import dataclass
from typing import Protocol

from .permissions import PermissionService
from .repository import DemoRepository
from .schemas import DocumentRecord, RetrievalMode, RetrievalTrace, User

_TOKEN_PATTERN = re.compile(r"[a-z0-9]+")


@dataclass(frozen=True)
class RetrievalResult:
    """Authorized records and an inspectable filtering/ranking trace."""

    documents: list[DocumentRecord]
    trace: RetrievalTrace


class EvidenceRetriever(Protocol):
    """Common interface implemented by explicit offline and vector modes."""

    mode: RetrievalMode

    def retrieve(
        self,
        user: User,
        question: str,
        limit: int = 5,
        patient_context_id: str | None = None,
    ) -> RetrievalResult:
        """Return only policy-authorized evidence."""


class AuthorizationFirstRetriever:
    """Filter metadata through policy before reading or ranking document text."""

    mode = RetrievalMode.OFFLINE

    def __init__(self, repository: DemoRepository, permissions: PermissionService) -> None:
        self.repository = repository
        self.permissions = permissions

    def retrieve(
        self,
        user: User,
        question: str,
        limit: int = 5,
        patient_context_id: str | None = None,
    ) -> RetrievalResult:
        tenant_metadata = [
            metadata
            for metadata in self.repository.list_metadata()
            if metadata.tenant_id == user.tenant_id
            and (
                metadata.subject_id is None
                or patient_context_id is None
                or metadata.subject_id == patient_context_id
            )
        ]
        decisions = [self.permissions.decide(user, metadata) for metadata in tenant_metadata]
        authorized_ids = [
            decision.document_id
            for decision in decisions
            if decision.capabilities.can_retrieve
        ]

        # This is the first point where bodies are read. Every ID passed here has
        # already received a positive retrieve capability from the current policy.
        authorized_records = self.repository.read_authorized_documents(authorized_ids)
        ranked = sorted(
            authorized_records,
            key=lambda record: self._rank_key(question, record),
            reverse=True,
        )[:limit]

        return RetrievalResult(
            documents=ranked,
            trace=RetrievalTrace(
                candidate_metadata_ids=[metadata.id for metadata in tenant_metadata],
                authorized_document_ids=authorized_ids,
                ranked_document_ids=[record.metadata.id for record in ranked],
                mode=self.mode,
            ),
        )

    @staticmethod
    def _rank_key(question: str, record: DocumentRecord) -> tuple[int, int, str]:
        query_terms = set(_TOKEN_PATTERN.findall(question.lower()))
        document_terms = set(
            _TOKEN_PATTERN.findall(f"{record.metadata.title} {record.text}".lower())
        )
        overlap = len(query_terms & document_terms)
        recency = record.metadata.published_at.toordinal()
        return overlap, recency, record.metadata.id
