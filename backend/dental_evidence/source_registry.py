"""Persistent SQLite metadata and passage storage for governed evidence sources."""

import json
import sqlite3
from datetime import UTC, date, datetime
from enum import StrEnum
from pathlib import Path
from uuid import uuid4

from pydantic import BaseModel, Field

from .roles import StaffRole


class AccessType(StrEnum):
    """How a source is licensed or restricted independently of AI rights."""

    PUBLIC = "public"
    INTERNAL = "internal"
    LICENSED = "licensed"
    RESTRICTED = "restricted"
    USER_PROVIDED = "user_provided"


class AIUsageRights(StrEnum):
    """Whether source bytes may enter parsing, passage, or embedding pipelines."""

    APPROVED = "approved"
    UNKNOWN = "unknown"
    PROHIBITED = "prohibited"


class HostingPermission(StrEnum):
    """Whether the application may retain and serve the original file."""

    PERMITTED = "permitted"
    NOT_PERMITTED = "not_permitted"


class IngestionStatus(StrEnum):
    """Observable result of applying the source ingestion gate."""

    METADATA_ONLY = "metadata_only"
    PASSAGES_STORED = "passages_stored"
    ORIGINAL_AND_PASSAGES_STORED = "original_and_passages_stored"


class SourceRegistration(BaseModel):
    """Validated content-free source metadata accepted by the upload gate."""

    tenant_id: str
    title: str = Field(min_length=1, max_length=500)
    access_type: AccessType
    ai_usage_rights: AIUsageRights
    hosting_permission: HostingPermission
    passage_storage_permitted: bool = False
    required_entitlement: str | None = None
    allowed_roles: set[StaffRole]
    patient_context_id: str | None = None
    publisher: str | None = None
    document_identity: str
    edition: str | None = None
    publication_date: date | None = None
    effective_date: date | None = None
    applicability: str | None = None
    source_uri: str | None = None
    supersedes_source_id: str | None = None


class PassageRecord(BaseModel):
    """A locatable exact quotation retained only for an approved source."""

    id: str
    source_id: str
    page_number: int | None = None
    section: str | None = None
    exact_quote: str
    start_offset: int
    end_offset: int
    pdf_bbox: list[float] | None = None


class RegisteredSource(BaseModel):
    """Content-safe persisted metadata; storage paths and body text are excluded."""

    id: str
    tenant_id: str
    title: str
    media_type: str
    original_filename: str
    access_type: AccessType
    ai_usage_rights: AIUsageRights
    hosting_permission: HostingPermission
    passage_storage_permitted: bool
    required_entitlement: str | None
    allowed_roles: set[StaffRole]
    patient_context_id: str | None
    publisher: str | None
    document_identity: str
    edition: str | None
    publication_date: date | None
    effective_date: date | None
    applicability: str | None
    source_uri: str | None
    supersedes_source_id: str | None
    superseded_by_source_id: str | None
    status: IngestionStatus
    created_by: str
    created_at: datetime


class RegistrySourceCapabilities(BaseModel):
    """Per-request links exposed only after current authorization succeeds."""

    can_retrieve_passages: bool
    can_preview: bool
    can_open_original: bool
    can_open_publisher: bool
    requires_entitlement: bool
    reason: str
    preview_url: str | None
    original_url: str | None
    publisher_url: str | None


class RegistrySourceView(BaseModel):
    """Content-safe registry metadata paired with current request capabilities."""

    source: RegisteredSource
    capabilities: RegistrySourceCapabilities


class RegistryPreview(BaseModel):
    """A reauthorized preview response that never implies original-file access."""

    source_id: str
    state: str
    text: str | None = None


class SQLiteSourceRegistry:
    """Persist source metadata and approved passages in a local SQLite database."""

    def __init__(self, database_path: Path) -> None:
        self.database_path = database_path
        self.database_path.parent.mkdir(parents=True, exist_ok=True)
        self._initialize()

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.database_path)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        return connection

    def _initialize(self) -> None:
        with self._connect() as connection:
            connection.executescript(
                """
                CREATE TABLE IF NOT EXISTS sources (
                    id TEXT PRIMARY KEY,
                    tenant_id TEXT NOT NULL,
                    title TEXT NOT NULL,
                    media_type TEXT NOT NULL,
                    original_filename TEXT NOT NULL,
                    access_type TEXT NOT NULL,
                    ai_usage_rights TEXT NOT NULL,
                    hosting_permission TEXT NOT NULL,
                    passage_storage_permitted INTEGER NOT NULL,
                    required_entitlement TEXT,
                    allowed_roles_json TEXT NOT NULL,
                    patient_context_id TEXT,
                    publisher TEXT,
                    document_identity TEXT NOT NULL,
                    edition TEXT,
                    publication_date TEXT,
                    effective_date TEXT,
                    applicability TEXT,
                    source_uri TEXT,
                    supersedes_source_id TEXT,
                    superseded_by_source_id TEXT,
                    status TEXT NOT NULL,
                    original_path TEXT,
                    created_by TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_sources_tenant
                    ON sources(tenant_id);
                CREATE INDEX IF NOT EXISTS idx_sources_identity
                    ON sources(tenant_id, document_identity);
                CREATE TABLE IF NOT EXISTS passages (
                    id TEXT PRIMARY KEY,
                    source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
                    page_number INTEGER,
                    section TEXT,
                    exact_quote TEXT NOT NULL,
                    start_offset INTEGER NOT NULL,
                    end_offset INTEGER NOT NULL,
                    pdf_bbox_json TEXT
                );
                CREATE INDEX IF NOT EXISTS idx_passages_source
                    ON passages(source_id);
                """
            )

    def add_source(
        self,
        registration: SourceRegistration,
        *,
        media_type: str,
        original_filename: str,
        status: IngestionStatus,
        created_by: str,
        passages: list[PassageRecord],
        original_path: Path | None,
        source_id: str | None = None,
    ) -> RegisteredSource:
        """Atomically store metadata, approved passages, and supersession linkage."""

        source_id = source_id or f"source-{uuid4()}"
        created_at = datetime.now(UTC)
        roles_json = json.dumps(sorted(role.value for role in registration.allowed_roles))
        with self._connect() as connection:
            if registration.supersedes_source_id is not None:
                superseded = connection.execute(
                    "SELECT tenant_id FROM sources WHERE id = ?",
                    (registration.supersedes_source_id,),
                ).fetchone()
                if superseded is None:
                    raise ValueError("supersedes_source_id does not exist")
                if superseded["tenant_id"] != registration.tenant_id:
                    raise ValueError("cannot supersede a source in another tenant")

            connection.execute(
                """
                INSERT INTO sources (
                    id, tenant_id, title, media_type, original_filename,
                    access_type, ai_usage_rights, hosting_permission,
                    passage_storage_permitted, required_entitlement,
                    allowed_roles_json, patient_context_id, publisher,
                    document_identity, edition, publication_date, effective_date,
                    applicability, source_uri, supersedes_source_id,
                    superseded_by_source_id, status, original_path, created_by,
                    created_at
                ) VALUES (
                    ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                    ?, NULL, ?, ?, ?, ?
                )
                """,
                (
                    source_id,
                    registration.tenant_id,
                    registration.title,
                    media_type,
                    original_filename,
                    registration.access_type,
                    registration.ai_usage_rights,
                    registration.hosting_permission,
                    int(registration.passage_storage_permitted),
                    registration.required_entitlement,
                    roles_json,
                    registration.patient_context_id,
                    registration.publisher,
                    registration.document_identity,
                    registration.edition,
                    self._date_text(registration.publication_date),
                    self._date_text(registration.effective_date),
                    registration.applicability,
                    registration.source_uri,
                    registration.supersedes_source_id,
                    status,
                    str(original_path) if original_path is not None else None,
                    created_by,
                    created_at.isoformat(),
                ),
            )
            connection.executemany(
                """
                INSERT INTO passages (
                    id, source_id, page_number, section, exact_quote,
                    start_offset, end_offset, pdf_bbox_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                [
                    (
                        passage.id,
                        source_id,
                        passage.page_number,
                        passage.section,
                        passage.exact_quote,
                        passage.start_offset,
                        passage.end_offset,
                        json.dumps(passage.pdf_bbox)
                        if passage.pdf_bbox is not None
                        else None,
                    )
                    for passage in passages
                ],
            )
            if registration.supersedes_source_id is not None:
                connection.execute(
                    """
                    UPDATE sources
                    SET superseded_by_source_id = ?
                    WHERE id = ?
                    """,
                    (source_id, registration.supersedes_source_id),
                )
        source = self.get_source(source_id)
        if source is None:
            raise RuntimeError("source insert did not persist")
        return source

    def get_source(self, source_id: str) -> RegisteredSource | None:
        """Read content-safe source metadata by opaque source ID."""

        with self._connect() as connection:
            row = connection.execute(
                "SELECT * FROM sources WHERE id = ?", (source_id,)
            ).fetchone()
        return self._source_from_row(row) if row is not None else None

    def list_sources(self, tenant_id: str) -> list[RegisteredSource]:
        """List content-safe metadata for one tenant."""

        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT * FROM sources
                WHERE tenant_id = ?
                ORDER BY created_at DESC
                """,
                (tenant_id,),
            ).fetchall()
        return [self._source_from_row(row) for row in rows]

    def list_effective_sources(self, tenant_id: str) -> list[RegisteredSource]:
        """List current sources, excluding future-effective and superseded editions."""

        today = date.today().isoformat()
        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT * FROM sources
                WHERE tenant_id = ?
                  AND superseded_by_source_id IS NULL
                  AND (effective_date IS NULL OR effective_date <= ?)
                ORDER BY publication_date DESC, created_at DESC
                """,
                (tenant_id, today),
            ).fetchall()
        return [self._source_from_row(row) for row in rows]

    def list_passages(self, source_id: str) -> list[PassageRecord]:
        """Read approved passages for an already-authorized source."""

        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT * FROM passages
                WHERE source_id = ?
                ORDER BY page_number, start_offset
                """,
                (source_id,),
            ).fetchall()
        return [self._passage_from_row(row) for row in rows]

    def list_passage_ids(self, source_id: str) -> list[str]:
        """List passage identifiers without materializing protected quotation text."""

        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT id FROM passages
                WHERE source_id = ?
                ORDER BY page_number, start_offset
                """,
                (source_id,),
            ).fetchall()
        return [row["id"] for row in rows]

    def get_passage(self, passage_id: str) -> PassageRecord | None:
        """Read one passage only after the caller has reauthorized its source."""

        with self._connect() as connection:
            row = connection.execute(
                "SELECT * FROM passages WHERE id = ?", (passage_id,)
            ).fetchone()
        return self._passage_from_row(row) if row is not None else None

    def get_original_path(self, source_id: str) -> Path | None:
        """Return an internal file location after request authorization succeeds."""

        with self._connect() as connection:
            row = connection.execute(
                "SELECT original_path FROM sources WHERE id = ?", (source_id,)
            ).fetchone()
        if row is None or row["original_path"] is None:
            return None
        return Path(row["original_path"])

    def clear(self) -> None:
        """Remove registry rows for deterministic tests and explicit demo reset."""

        with self._connect() as connection:
            connection.execute("DELETE FROM passages")
            connection.execute("DELETE FROM sources")

    @staticmethod
    def _date_text(value: date | None) -> str | None:
        return value.isoformat() if value is not None else None

    @staticmethod
    def _source_from_row(row: sqlite3.Row) -> RegisteredSource:
        return RegisteredSource(
            id=row["id"],
            tenant_id=row["tenant_id"],
            title=row["title"],
            media_type=row["media_type"],
            original_filename=row["original_filename"],
            access_type=row["access_type"],
            ai_usage_rights=row["ai_usage_rights"],
            hosting_permission=row["hosting_permission"],
            passage_storage_permitted=bool(row["passage_storage_permitted"]),
            required_entitlement=row["required_entitlement"],
            allowed_roles=set(json.loads(row["allowed_roles_json"])),
            patient_context_id=row["patient_context_id"],
            publisher=row["publisher"],
            document_identity=row["document_identity"],
            edition=row["edition"],
            publication_date=row["publication_date"],
            effective_date=row["effective_date"],
            applicability=row["applicability"],
            source_uri=row["source_uri"],
            supersedes_source_id=row["supersedes_source_id"],
            superseded_by_source_id=row["superseded_by_source_id"],
            status=row["status"],
            created_by=row["created_by"],
            created_at=row["created_at"],
        )

    @staticmethod
    def _passage_from_row(row: sqlite3.Row) -> PassageRecord:
        return PassageRecord(
            id=row["id"],
            source_id=row["source_id"],
            page_number=row["page_number"],
            section=row["section"],
            exact_quote=row["exact_quote"],
            start_offset=row["start_offset"],
            end_offset=row["end_offset"],
            pdf_bbox=json.loads(row["pdf_bbox_json"])
            if row["pdf_bbox_json"] is not None
            else None,
        )
