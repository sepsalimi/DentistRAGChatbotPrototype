"""LlamaIndex ingestion and Qdrant local vector retrieval over authorized evidence only."""

from uuid import uuid4

from llama_index.core import Document, StorageContext, VectorStoreIndex
from llama_index.core.base.embeddings.base import BaseEmbedding
from llama_index.core.vector_stores import FilterOperator, MetadataFilter, MetadataFilters
from llama_index.embeddings.openai import OpenAIEmbedding
from llama_index.vector_stores.qdrant import QdrantVectorStore
from qdrant_client import QdrantClient

from .permissions import POLICY_VERSION, PermissionService
from .repository import DemoRepository
from .retrieval import RetrievalResult
from .schemas import DocumentRecord, RetrievalMode, RetrievalTrace, User


class AuthorizationFirstVectorRetriever:
    """Build and query a local vector index only after policy approves every body."""

    mode = RetrievalMode.VECTOR

    def __init__(
        self,
        repository: DemoRepository,
        permissions: PermissionService,
        *,
        api_key: str | None,
        embedding_model: str,
        embed_model: BaseEmbedding | None = None,
    ) -> None:
        if not api_key and embed_model is None:
            raise ValueError("Vector retrieval requires an OpenAI API key")
        self.repository = repository
        self.permissions = permissions
        self.embed_model = embed_model or OpenAIEmbedding(
            api_key=api_key,
            model=embedding_model,
        )

    def retrieve(self, user: User, question: str, limit: int = 5) -> RetrievalResult:
        tenant_metadata = [
            metadata
            for metadata in self.repository.list_metadata()
            if metadata.tenant_id == user.tenant_id
        ]
        decisions = [self.permissions.decide(user, metadata) for metadata in tenant_metadata]
        authorized_ids = [
            decision.document_id
            for decision in decisions
            if decision.capabilities.can_retrieve
        ]

        # No content is read or embedded until policy has produced this allow-list.
        records = self.repository.read_authorized_documents(authorized_ids)
        ranked = self._ingest_and_rank(user, question, records, limit)
        return RetrievalResult(
            documents=ranked,
            trace=RetrievalTrace(
                candidate_metadata_ids=[metadata.id for metadata in tenant_metadata],
                authorized_document_ids=authorized_ids,
                ranked_document_ids=[record.metadata.id for record in ranked],
                mode=self.mode,
            ),
        )

    def _ingest_and_rank(
        self,
        user: User,
        question: str,
        records: list[DocumentRecord],
        limit: int,
    ) -> list[DocumentRecord]:
        if not records:
            return []

        documents = [
            Document(
                id_=record.metadata.id,
                text=record.text,
                metadata={
                    "document_id": record.metadata.id,
                    "tenant_id": user.tenant_id,
                    "authorized_user_id": user.id,
                    "policy_version": POLICY_VERSION,
                },
            )
            for record in records
        ]
        client = QdrantClient(location=":memory:")
        vector_store = QdrantVectorStore(
            client=client,
            collection_name=f"authorized_{uuid4().hex}",
        )
        storage_context = StorageContext.from_defaults(vector_store=vector_store)
        index = VectorStoreIndex.from_documents(
            documents,
            storage_context=storage_context,
            embed_model=self.embed_model,
        )
        filters = MetadataFilters(
            filters=[
                MetadataFilter(
                    key="tenant_id",
                    value=user.tenant_id,
                    operator=FilterOperator.EQ,
                ),
                MetadataFilter(
                    key="authorized_user_id",
                    value=user.id,
                    operator=FilterOperator.EQ,
                ),
                MetadataFilter(
                    key="policy_version",
                    value=POLICY_VERSION,
                    operator=FilterOperator.EQ,
                ),
            ]
        )
        nodes = index.as_retriever(
            similarity_top_k=limit,
            filters=filters,
        ).retrieve(question)
        records_by_id = {record.metadata.id: record for record in records}
        return [
            records_by_id[node.metadata["document_id"]]
            for node in nodes
        ]
