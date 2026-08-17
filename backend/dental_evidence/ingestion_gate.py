"""Rights-first multipart upload gate for PDF/TXT validation, storage, and indexing."""

from pathlib import Path
from uuid import uuid4

from fastapi import UploadFile
from pydantic import BaseModel

from .document_parser import parse_document
from .passage_index import PassageIndex
from .source_registry import (
    AIUsageRights,
    HostingPermission,
    IngestionStatus,
    RegisteredSource,
    SQLiteSourceRegistry,
    SourceRegistration,
)

MAX_UPLOAD_BYTES = 10 * 1024 * 1024
_ALLOWED_MEDIA_TYPES = {
    "application/pdf": ".pdf",
    "text/plain": ".txt",
}


class UploadValidationError(ValueError):
    """Raised when an upload fails type, size, or readability validation."""


class IngestionResult(BaseModel):
    """Content-free ingestion outcome returned to upload clients."""

    source: RegisteredSource
    passage_count: int
    original_stored: bool


class IngestionGate:
    """Enforce AI and hosting rights before bytes reach any content pipeline."""

    def __init__(
        self,
        registry: SQLiteSourceRegistry,
        passage_index: PassageIndex,
        original_storage: Path,
    ) -> None:
        self.registry = registry
        self.passage_index = passage_index
        self.original_storage = original_storage
        self.original_storage.mkdir(parents=True, exist_ok=True)

    async def ingest(
        self,
        upload: UploadFile,
        registration: SourceRegistration,
        *,
        created_by: str,
    ) -> IngestionResult:
        """Register metadata and process bytes only when AI usage is approved."""

        media_type = self._validate_type(upload)
        filename = upload.filename or "upload"

        if registration.ai_usage_rights != AIUsageRights.APPROVED:
            await self._discard_limited(upload)
            source = self.registry.add_source(
                registration,
                media_type=media_type,
                original_filename=filename,
                status=IngestionStatus.METADATA_ONLY,
                created_by=created_by,
                passages=[],
                original_path=None,
            )
            return IngestionResult(
                source=source,
                passage_count=0,
                original_stored=False,
            )

        content = await self._read_limited(upload)
        parsed = parse_document(content, media_type)

        store_passages = (
            registration.hosting_permission == HostingPermission.PERMITTED
            or registration.passage_storage_permitted
        )
        passages = parsed.passages if store_passages else []
        source_id = f"source-{uuid4()}"
        original_path = None
        if registration.hosting_permission == HostingPermission.PERMITTED:
            suffix = _ALLOWED_MEDIA_TYPES[media_type]
            original_path = self.original_storage / f"{source_id}{suffix}"
            original_path.write_bytes(content)

        if original_path is not None:
            status = IngestionStatus.ORIGINAL_AND_PASSAGES_STORED
        elif passages:
            status = IngestionStatus.PASSAGES_STORED
        else:
            status = IngestionStatus.METADATA_ONLY

        source = self.registry.add_source(
            registration,
            media_type=media_type,
            original_filename=filename,
            status=status,
            created_by=created_by,
            passages=passages,
            original_path=original_path,
            source_id=source_id,
        )
        self.passage_index.index_passages(source, passages)
        return IngestionResult(
            source=source,
            passage_count=len(passages),
            original_stored=original_path is not None,
        )

    @staticmethod
    def _validate_type(upload: UploadFile) -> str:
        media_type = upload.content_type or ""
        if media_type not in _ALLOWED_MEDIA_TYPES:
            raise UploadValidationError("only application/pdf and text/plain are accepted")
        filename = upload.filename or ""
        expected_suffix = _ALLOWED_MEDIA_TYPES[media_type]
        if Path(filename).suffix.lower() != expected_suffix:
            raise UploadValidationError(
                f"filename extension must be {expected_suffix} for {media_type}"
            )
        return media_type

    @staticmethod
    async def _read_limited(upload: UploadFile) -> bytes:
        content = bytearray()
        while chunk := await upload.read(64 * 1024):
            content.extend(chunk)
            if len(content) > MAX_UPLOAD_BYTES:
                await upload.close()
                raise UploadValidationError(
                    f"upload exceeds the {MAX_UPLOAD_BYTES}-byte limit"
                )
        await upload.close()
        if not content:
            raise UploadValidationError("upload is empty")
        return bytes(content)

    @staticmethod
    async def _discard_limited(upload: UploadFile) -> None:
        """Validate size while immediately discarding rights-blocked upload chunks."""

        size = 0
        while chunk := await upload.read(64 * 1024):
            size += len(chunk)
            if size > MAX_UPLOAD_BYTES:
                await upload.close()
                raise UploadValidationError(
                    f"upload exceeds the {MAX_UPLOAD_BYTES}-byte limit"
                )
        await upload.close()
        if size == 0:
            raise UploadValidationError("upload is empty")
