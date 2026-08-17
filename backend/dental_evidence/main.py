"""FastAPI application exposing authorization-first dental evidence workflows."""

import asyncio
import json
from collections.abc import AsyncIterator

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from .answers import AnswerService
from .audit import AuditLog
from .configuration import BackendSettings
from .live_rag import LiveRagGenerator
from .permissions import PermissionService, preview_state_for
from .repository import DemoRepository
from .retrieval import AuthorizationFirstRetriever, EvidenceRetriever
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
            )
            generator = LiveRagGenerator(
                api_key=settings.openai_api_key,
                model=settings.openai_model,
            )
        self.answers = AnswerService(self.permissions, generator)
        self.audit = AuditLog()


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
    retrieval = await asyncio.to_thread(
        services.retriever.retrieve, user, request.question
    )
    answer = await services.answers.answer(user, request.question, retrieval.documents)
    services.audit.record(
        tenant_id=user.tenant_id,
        user_id=user.id,
        action="chat",
        outcome="answered",
        result_count=len(answer.citations),
    )
    return ChatResult(answer=answer, trace=retrieval.trace)


@app.get("/health")
async def health() -> dict[str, str]:
    """Report process health without touching external services."""

    return {"status": "ok", "mode": services.settings.retrieval_mode}


@app.get("/personas", response_model=list[Persona])
async def list_personas() -> list[Persona]:
    """List the two deterministic showcase personas."""

    return services.repository.list_personas()


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
    """Restore fixture data and clear process-local audit state."""

    services.repository.reset()
    services.audit.clear()
    return {"status": "reset"}
