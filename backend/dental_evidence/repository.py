"""In-memory stores that expose document metadata separately from protected text."""

from collections.abc import Iterable

from .fixtures import build_connectors, build_documents, build_patients, build_personas, build_users
from .schemas import Connector, DocumentMetadata, DocumentRecord, Patient, Persona, User


class DemoRepository:
    """Deterministic process-local storage for startup, demos, and tests."""

    def __init__(self) -> None:
        self.content_read_ids: list[str] = []
        self.reset()

    def reset(self) -> None:
        """Restore all synthetic fixture state and clear access instrumentation."""

        self._users = {user.id: user for user in build_users()}
        self._personas = build_personas()
        self._patients = build_patients()
        self._connectors = build_connectors()
        self._documents = {document.metadata.id: document for document in build_documents()}
        self.content_read_ids.clear()

    def get_user(self, user_id: str) -> User | None:
        return self._users.get(user_id)

    def list_users(self) -> list[User]:
        return list(self._users.values())

    def list_personas(self) -> list[Persona]:
        return list(self._personas)

    def list_patients(self) -> list[Patient]:
        return list(self._patients)

    def list_connectors(self, tenant_id: str) -> list[Connector]:
        return [
            connector
            for connector in self._connectors
            if connector.tenant_id in {None, tenant_id}
        ]

    def get_metadata(self, document_id: str) -> DocumentMetadata | None:
        record = self._documents.get(document_id)
        return record.metadata if record else None

    def list_metadata(self) -> list[DocumentMetadata]:
        """Return attributes only; no protected body is materialized for callers."""

        return [record.metadata for record in self._documents.values()]

    def read_authorized_documents(self, document_ids: Iterable[str]) -> list[DocumentRecord]:
        """Read bodies only after callers provide policy-approved document IDs."""

        records: list[DocumentRecord] = []
        for document_id in document_ids:
            record = self._documents[document_id]
            self.content_read_ids.append(document_id)
            records.append(record)
        return records
