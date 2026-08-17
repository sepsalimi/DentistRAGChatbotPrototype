"""FastAPI application for governed dental chat, source ingestion, and retrieval."""

import asyncio
import json
from collections.abc import AsyncIterator
from datetime import date

from fastapi import FastAPI, File, Form, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import ValidationError

from .answers import AnswerService
from .audit import AuditLog
from .configuration import BackendSettings
from .document_parser import DocumentReadabilityError, parse_document
from .ingestion_gate import IngestionGate, IngestionResult, UploadValidationError
from .live_rag import LiveRagGenerator
from .passage_index import (
    PassageIndex,
    PassageSearchMode,
    PassageSearchResult,
)
from .permissions import PermissionService, preview_state_for
from .registry_answers import RegistryAnswerService
from .repository import DemoRepository
from .retrieval import AuthorizationFirstRetriever, EvidenceRetriever
from .roles import StaffRole, authorize_source, can_upload_sources
from .schemas import (
    AuditEvent,
    ChatRequest,
    ChatResult,
    Connector,
    Persona,
    PreviewResponse,
    PreviewState,
    RetrievalMode,
    SourceAccess,
    User,
)
from .source_registry import (
    AIUsageRights,
    AccessType,
    HostingPermission,
    PassageRecord,
    RegisteredSource,
    RegistryPreview,
    RegistrySourceCapabilities,
    RegistrySourceView,
    SQLiteSourceRegistry,
    SourceRegistration,
)
from .vector_retrieval import AuthorizationFirstVectorRetriever


class ApplicationServices:
    """Build services for one explicit offline or live-vector runtime mode."""

    def __init__(self, settings: BackendSettings) -> None:
        self.settings = settings
        self.repository = DemoRepository()
        self.permissions = PermissionService()
        self.retriever: EvidenceRetriever
        if settings.retrieval_mode == RetrievalMode.OFFLINE:
            self.retriever = AuthorizationFirstRetriever(
                self.repository, self.permissions
            )
            generator = LiveRagGenerator(api_key="", model=settings.openai_model)
        else:
            if settings.openai_api_key is None:
                raise ValueError("Vector mode requires an OpenAI API key")
            self.retriever = AuthorizationFirstVectorRetriever(
                self.repository,
                self.permissions,
                api_key=settings.openai_api_key,
                embedding_model=settings.openai_embedding_model,
                qdrant_path=settings.data_directory / "chat_qdrant",
            )
            generator = LiveRagGenerator(
                api_key=settings.openai_api_key,
                model=settings.openai_model,
            )
        self.answers = AnswerService(self.permissions, generator)
        self.registry_answers = RegistryAnswerService(generator)
        self.audit = AuditLog()
        settings.data_directory.mkdir(parents=True, exist_ok=True)
        self.source_registry = SQLiteSourceRegistry(
            settings.data_directory / "source_registry.sqlite3"
        )
        self.passage_index = PassageIndex(
            self.source_registry,
            vector_enabled=settings.retrieval_mode == RetrievalMode.VECTOR,
            qdrant_path=settings.data_directory / "qdrant",
            openai_api_key=settings.openai_api_key,
            embedding_model=settings.openai_embedding_model,
        )
        self.ingestion_gate = IngestionGate(
            self.source_registry,
            self.passage_index,
            settings.data_directory / "approved_originals",
        )


services = ApplicationServices(BackendSettings.from_environment())
app = FastAPI(
    title="Dental Evidence Chat API",
    version="0.1.0",
    description="Authorization-first evidence retrieval prototype with synthetic data.",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _require_user(user_id: str) -> User:
    user = services.repository.get_user(user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="Unknown demo user")
    return user


async def _chat(request: ChatRequest) -> ChatResult:
    user = _require_user(request.user_id)
    registry_mode = (
        PassageSearchMode.VECTOR
        if services.settings.retrieval_mode == RetrievalMode.VECTOR
        else PassageSearchMode.LEXICAL
    )
    registry_retrieval = await asyncio.to_thread(
        services.passage_index.search,
        user,
        request.question,
        mode=registry_mode,
        patient_context_id=request.patient_context_id,
        limit=5,
    )
    retrieval = await asyncio.to_thread(
        services.retriever.retrieve,
        user,
        request.question,
        5,
        request.patient_context_id,
    )
    if registry_retrieval.results:
        answer = await services.registry_answers.answer(
            request.question,
            registry_retrieval.results,
        )
    else:
        answer = await services.answers.answer(
            user,
            request.question,
            retrieval.documents,
        )
    registry_trace = registry_retrieval.trace
    trace = retrieval.trace.model_copy(
        update={
            "registry_candidate_source_ids": registry_trace.candidate_source_ids,
            "registry_candidate_passage_ids": registry_trace.candidate_passage_ids,
            "registry_authorized_passage_ids": registry_trace.authorized_passage_ids,
            "registry_ranked_passage_ids": registry_trace.ranked_passage_ids,
            "registry_exclusion_reasons": registry_trace.exclusion_reasons,
        }
    )
    services.audit.record(
        tenant_id=user.tenant_id,
        user_id=user.id,
        action="chat",
        outcome="answered",
        result_count=len(answer.citations),
    )
    return ChatResult(answer=answer, trace=trace)


@app.get("/health")
async def health() -> dict[str, str]:
    """Report process health without touching external services."""

    return {"status": "ok", "mode": services.settings.retrieval_mode}


@app.get("/personas", response_model=list[Persona])
async def list_personas() -> list[Persona]:
    """List the role profiles available to sample and live conversations."""

    return services.repository.list_personas()


@app.get("/roles", response_model=list[StaffRole])
async def list_roles() -> list[StaffRole]:
    """List the four supported source-authorization roles."""

    return list(StaffRole)


@app.get("/users", response_model=list[User])
async def list_users() -> list[User]:
    """List synthetic demo users for persona selection."""

    return services.repository.list_users()


@app.get("/connectors", response_model=list[Connector])
async def list_connectors(user_id: str = Query()) -> list[Connector]:
    """List connectors visible to the requesting user's tenant."""

    user = _require_user(user_id)
    return services.repository.list_connectors(user.tenant_id)


@app.get("/sources", response_model=list[SourceAccess])
async def list_source_access(user_id: str = Query()) -> list[SourceAccess]:
    """List metadata and capabilities without reading or returning source text."""

    user = _require_user(user_id)
    sources: list[SourceAccess] = []
    for metadata in services.repository.list_metadata():
        if metadata.tenant_id != user.tenant_id:
            continue
        permission = services.permissions.decide(user, metadata)
        capabilities = permission.capabilities
        sources.append(
            SourceAccess(
                document_id=metadata.id,
                title=(
                    metadata.title
                    if capabilities.can_retrieve or capabilities.requires_entitlement
                    else None
                ),
                kind=metadata.kind,
                access_policy=metadata.access_policy,
                published_at=metadata.published_at,
                preview_state=preview_state_for(permission),
                source_uri=(
                    metadata.source_uri
                    if capabilities.can_open_original
                    else None
                ),
                permission=permission,
            )
        )
    return sources


def _registry_source_view(
    source: RegisteredSource,
    *,
    allowed: bool,
    authorization_reason: str,
) -> RegistrySourceView:
    today = date.today()
    if not allowed:
        reason = authorization_reason
    elif source.ai_usage_rights != AIUsageRights.APPROVED:
        reason = f"ai_usage_rights_{source.ai_usage_rights}"
    elif source.superseded_by_source_id is not None:
        reason = "superseded"
    elif source.effective_date is not None and source.effective_date > today:
        reason = "not_yet_effective"
    elif source.status == "metadata_only":
        reason = "no_approved_passages"
    else:
        reason = "allowed"
    content_allowed = reason == "allowed"
    has_original = (
        content_allowed
        and source.hosting_permission == HostingPermission.PERMITTED
        and source.status == "original_and_passages_stored"
    )
    can_open_publisher = source.source_uri is not None
    return RegistrySourceView(
        source=source,
        capabilities=RegistrySourceCapabilities(
            can_retrieve_passages=content_allowed,
            can_preview=has_original,
            can_open_original=has_original,
            can_open_publisher=can_open_publisher,
            requires_entitlement=reason.startswith("missing_entitlement:"),
            reason=reason,
            preview_url=(
                f"/registry/sources/{source.id}/preview" if has_original else None
            ),
            original_url=(
                f"/registry/sources/{source.id}/file" if has_original else None
            ),
            publisher_url=source.source_uri if can_open_publisher else None,
        ),
    )


def _metadata_visible(
    source: RegisteredSource,
    allowed: bool,
    reason: str,
) -> bool:
    """Expose safe licensed metadata while hiding restricted or patient metadata."""

    if allowed:
        return True
    if source.patient_context_id is not None or source.access_type == AccessType.RESTRICTED:
        return False
    return reason.startswith("missing_entitlement:")


def _require_registry_source(
    source_id: str,
    user: User,
    patient_context_id: str | None,
) -> RegisteredSource:
    source = services.source_registry.get_source(source_id)
    if source is None or source.tenant_id != user.tenant_id:
        raise HTTPException(status_code=404, detail="Source not found")
    allowed, reason = authorize_source(user, source, patient_context_id)
    if not allowed:
        if reason.startswith("missing_entitlement:"):
            raise HTTPException(status_code=403, detail=reason)
        raise HTTPException(status_code=403, detail="Source access denied")
    return source


@app.post(
    "/registry/sources/upload",
    response_model=IngestionResult,
    status_code=201,
)
async def upload_registry_source(
    file: UploadFile = File(),
    user_id: str = Form(),
    title: str = Form(min_length=1, max_length=500),
    access_type: AccessType = Form(),
    ai_usage_rights: AIUsageRights = Form(),
    hosting_permission: HostingPermission = Form(),
    document_identity: str = Form(min_length=1, max_length=500),
    allowed_roles: str = Form(),
    passage_storage_permitted: bool = Form(False),
    required_entitlement: str | None = Form(None),
    patient_context_id: str | None = Form(None),
    publisher: str | None = Form(None),
    edition: str | None = Form(None),
    publication_date: date | None = Form(None),
    effective_date: date | None = Form(None),
    applicability: str | None = Form(None),
    source_uri: str | None = Form(None),
    supersedes_source_id: str | None = Form(None),
) -> IngestionResult:
    """Apply rights before parsing and persist only the explicitly permitted content."""

    user = _require_user(user_id)
    if not can_upload_sources(user):
        await file.close()
        raise HTTPException(status_code=403, detail="Role cannot upload sources")
    try:
        roles = {
            StaffRole(value.strip())
            for value in allowed_roles.split(",")
            if value.strip()
        }
    except ValueError as error:
        await file.close()
        raise HTTPException(status_code=422, detail="allowed_roles contains an unknown role") from error
    if not roles:
        await file.close()
        raise HTTPException(status_code=422, detail="allowed_roles must not be empty")

    try:
        registration = SourceRegistration(
            tenant_id=user.tenant_id,
            title=title,
            access_type=access_type,
            ai_usage_rights=ai_usage_rights,
            hosting_permission=hosting_permission,
            passage_storage_permitted=passage_storage_permitted,
            required_entitlement=required_entitlement,
            allowed_roles=roles,
            patient_context_id=patient_context_id,
            publisher=publisher,
            document_identity=document_identity,
            edition=edition,
            publication_date=publication_date,
            effective_date=effective_date,
            applicability=applicability,
            source_uri=source_uri,
            supersedes_source_id=supersedes_source_id,
        )
        result = await services.ingestion_gate.ingest(
            file,
            registration,
            created_by=user.id,
        )
    except (UploadValidationError, DocumentReadabilityError, ValidationError) as error:
        await file.close()
        raise HTTPException(status_code=422, detail=str(error)) from error
    except ValueError as error:
        await file.close()
        raise HTTPException(status_code=409, detail=str(error)) from error

    services.audit.record(
        tenant_id=user.tenant_id,
        user_id=user.id,
        action="source_upload",
        outcome=result.source.status,
        document_id=result.source.id,
        result_count=result.passage_count,
    )
    return result


@app.get("/registry/sources", response_model=list[RegistrySourceView])
async def list_registry_sources(
    user_id: str = Query(),
    patient_context_id: str | None = Query(None),
) -> list[RegistrySourceView]:
    """List authorized content-safe source metadata without reading any passage."""

    user = _require_user(user_id)
    views = []
    for source in services.source_registry.list_sources(user.tenant_id):
        allowed, reason = authorize_source(user, source, patient_context_id)
        if _metadata_visible(source, allowed, reason):
            views.append(
                _registry_source_view(
                    source,
                    allowed=allowed,
                    authorization_reason=reason,
                )
            )
    return views


@app.get("/registry/sources/{source_id}", response_model=RegistrySourceView)
async def get_registry_source(
    source_id: str,
    user_id: str = Query(),
    patient_context_id: str | None = Query(None),
) -> RegistrySourceView:
    """Return content-safe metadata after reauthorizing the source request."""

    user = _require_user(user_id)
    source = services.source_registry.get_source(source_id)
    if source is None or source.tenant_id != user.tenant_id:
        raise HTTPException(status_code=404, detail="Source not found")
    allowed, reason = authorize_source(user, source, patient_context_id)
    if not _metadata_visible(source, allowed, reason):
        raise HTTPException(status_code=404, detail="Source not found")
    return _registry_source_view(
        source,
        allowed=allowed,
        authorization_reason=reason,
    )


@app.get(
    "/registry/sources/{source_id}/passages",
    response_model=list[PassageRecord],
)
async def list_registry_passages(
    source_id: str,
    user_id: str = Query(),
    patient_context_id: str | None = Query(None),
) -> list[PassageRecord]:
    """Return exact stored passages only after current request authorization."""

    user = _require_user(user_id)
    source = _require_registry_source(source_id, user, patient_context_id)
    passages = services.source_registry.list_passages(source.id)
    services.audit.record(
        tenant_id=user.tenant_id,
        user_id=user.id,
        action="passage_list",
        outcome="allowed",
        document_id=source.id,
        result_count=len(passages),
    )
    return passages


@app.get("/registry/passages/search", response_model=list[PassageSearchResult])
async def search_registry_passages(
    user_id: str = Query(),
    q: str = Query(min_length=1, max_length=2000),
    patient_context_id: str | None = Query(None),
    limit: int = Query(5, ge=1, le=50),
    mode: PassageSearchMode = Query(PassageSearchMode.LEXICAL),
) -> list[PassageSearchResult]:
    """Search passages in one explicit mode with no fallback between modes."""

    user = _require_user(user_id)
    try:
        outcome = services.passage_index.search(
            user,
            q,
            mode=mode,
            patient_context_id=patient_context_id,
            limit=limit,
        )
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    services.audit.record(
        tenant_id=user.tenant_id,
        user_id=user.id,
        action="passage_search",
        outcome="allowed",
        result_count=len(outcome.results),
    )
    return outcome.results


@app.get("/registry/sources/{source_id}/preview", response_model=RegistryPreview)
async def preview_registry_source(
    source_id: str,
    user_id: str = Query(),
    patient_context_id: str | None = Query(None),
) -> RegistryPreview:
    """Reauthorize and return a bounded preview only for hosted originals."""

    user = _require_user(user_id)
    source = _require_registry_source(source_id, user, patient_context_id)
    original_path = services.source_registry.get_original_path(source.id)
    if original_path is None:
        response = RegistryPreview(source_id=source.id, state="citation_only")
    else:
        parsed = parse_document(original_path.read_bytes(), source.media_type)
        text = "\n\n".join(
            passage.exact_quote for passage in parsed.passages
        )[:4000]
        response = RegistryPreview(source_id=source.id, state="available", text=text)
    services.audit.record(
        tenant_id=user.tenant_id,
        user_id=user.id,
        action="source_preview",
        outcome=response.state,
        document_id=source.id,
    )
    return response


@app.get("/registry/sources/{source_id}/file")
async def open_registry_source_file(
    source_id: str,
    user_id: str = Query(),
    patient_context_id: str | None = Query(None),
) -> FileResponse:
    """Reauthorize every original-file request and serve only hosted bytes."""

    user = _require_user(user_id)
    source = _require_registry_source(source_id, user, patient_context_id)
    original_path = services.source_registry.get_original_path(source.id)
    if original_path is None:
        raise HTTPException(status_code=404, detail="Hosted original not available")
    services.audit.record(
        tenant_id=user.tenant_id,
        user_id=user.id,
        action="source_file",
        outcome="allowed",
        document_id=source.id,
    )
    return FileResponse(
        original_path,
        media_type=source.media_type,
        filename=source.original_filename,
    )


@app.get("/documents/{document_id}/preview", response_model=PreviewResponse)
async def preview_document(document_id: str, user_id: str = Query()) -> PreviewResponse:
    """Return a preview only after metadata authorization grants that capability."""

    user = _require_user(user_id)
    metadata = services.repository.get_metadata(document_id)
    if metadata is None:
        return PreviewResponse(document_id=document_id, state=PreviewState.NOT_FOUND)

    permission = services.permissions.decide(user, metadata)
    capabilities = permission.capabilities
    state = preview_state_for(permission)
    if state == PreviewState.AVAILABLE:
        document = services.repository.read_authorized_documents([document_id])[0]
        response = PreviewResponse(
            document_id=document_id,
            state=state,
            permission=permission,
            title=metadata.title,
            text=document.text,
        )
    elif state == PreviewState.ENTITLEMENT_REQUIRED:
        response = PreviewResponse(
            document_id=document_id,
            state=PreviewState.ENTITLEMENT_REQUIRED,
            permission=permission,
            title=metadata.title if metadata.tenant_id == user.tenant_id else None,
        )
    elif state == PreviewState.CITATION_ONLY:
        response = PreviewResponse(
            document_id=document_id,
            state=PreviewState.CITATION_ONLY,
            permission=permission,
            title=metadata.title,
        )
    else:
        response = PreviewResponse(
            document_id=document_id,
            state=PreviewState.DENIED,
            permission=permission,
        )

    services.audit.record(
        tenant_id=user.tenant_id,
        user_id=user.id,
        action="preview",
        outcome=response.state,
        document_id=document_id,
    )
    return response


@app.post("/chat", response_model=ChatResult)
async def chat(request: ChatRequest) -> ChatResult:
    """Return a complete grounded answer and authorization trace."""

    return await _chat(request)


@app.post("/chat/stream")
async def stream_chat(request: ChatRequest) -> StreamingResponse:
    """Stream answer text as server-sent events followed by the grounded result."""

    result = await _chat(request)

    async def events() -> AsyncIterator[str]:
        for token in result.answer.text.split():
            yield f"event: token\ndata: {json.dumps({'text': token + ' '})}\n\n"
        payload = result.model_dump(mode="json")
        yield f"event: final\ndata: {json.dumps(payload)}\n\n"

    return StreamingResponse(events(), media_type="text/event-stream")


@app.get("/audit", response_model=list[AuditEvent])
async def list_audit_events(user_id: str = Query()) -> list[AuditEvent]:
    """List PHI-free audit events for the requesting user's tenant."""

    user = _require_user(user_id)
    return services.audit.list_for_tenant(user.tenant_id)


@app.post("/demo/reset")
async def reset_demo() -> dict[str, str]:
    """Restore fixture data and clear registry and process-local audit state."""

    services.repository.reset()
    services.source_registry.clear()
    services.audit.clear()
    return {"status": "reset"}
