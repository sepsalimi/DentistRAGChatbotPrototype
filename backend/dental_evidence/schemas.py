"""API and domain schemas for users, evidence, authorization, claims, and answers."""

from datetime import date, datetime
from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field


class PersonaKind(StrEnum):
    STUDENT = "student"
    DENTIST = "dentist"
    HYGIENIST = "hygienist"
    RECEPTION = "reception"
    FRONT_DESK = "front_desk"


class DocumentKind(StrEnum):
    PATIENT = "patient"
    GUIDANCE = "guidance"
    SOP = "sop"
    LICENSED = "licensed"
    CITATION_ONLY = "citation_only"
    ENTITLEMENT = "entitlement"
    EXCLUDED = "excluded"


class AccessPolicy(StrEnum):
    """The distinct source-access scenarios demonstrated by the prototype."""

    PUBLIC = "public"
    LICENSED_INTERNAL = "licensed_internal"
    CITATION_ONLY = "citation_only"
    ENTITLEMENT_CONTROLLED = "entitlement_controlled"
    EXCLUDED = "excluded"
    PATIENT_RESTRICTED = "patient_restricted"


class RetrievalMode(StrEnum):
    """Explicit retrieval choices with no automatic runtime fallback."""

    OFFLINE = "offline"
    VECTOR = "vector"


class PreviewState(StrEnum):
    AVAILABLE = "available"
    CITATION_ONLY = "citation_only"
    ENTITLEMENT_REQUIRED = "entitlement_required"
    DENIED = "denied"
    NOT_FOUND = "not_found"


class ConnectorKind(StrEnum):
    LOCAL = "local"
    SYNTHETIC = "synthetic"
    PRACTICE_MANAGEMENT = "practice_management"
    EVIDENCE_LIBRARY = "evidence_library"


class User(BaseModel):
    """A demo staff identity scoped to one tenant."""

    id: str
    tenant_id: str
    display_name: str
    persona: PersonaKind
    entitlements: set[str] = Field(default_factory=set)


class Persona(BaseModel):
    """A selectable demo persona and its intended workflow."""

    id: PersonaKind
    label: str
    description: str
    default_user_id: str


class Patient(BaseModel):
    """Synthetic patient metadata that contains no real-world identity."""

    id: str
    tenant_id: str
    display_name: str


class DocumentMetadata(BaseModel):
    """Non-content document attributes safe to evaluate during authorization."""

    id: str
    tenant_id: str
    title: str
    kind: DocumentKind
    connector_id: str
    source_uri: str
    published_at: date
    access_policy: AccessPolicy
    subject_id: str | None = None
    required_entitlement: str | None = None


class DocumentRecord(BaseModel):
    """A document body paired with metadata inside the private repository."""

    metadata: DocumentMetadata
    text: str


class PermissionCapabilities(BaseModel):
    """Independent evidence capabilities returned by the policy engine."""

    can_retrieve: bool
    can_preview: bool
    can_open_original: bool
    requires_entitlement: bool


class PermissionDecision(BaseModel):
    """An auditable authorization result bound to tenant, user, and policy."""

    tenant_id: str
    user_id: str
    document_id: str
    policy_version: str
    capabilities: PermissionCapabilities
    reason: str


class PreviewResponse(BaseModel):
    """A document preview state with text only when preview is permitted."""

    document_id: str
    state: PreviewState
    permission: PermissionDecision | None = None
    title: str | None = None
    text: str | None = None


class Citation(BaseModel):
    """A source reference attached to one or more answer claims."""

    id: str
    document_id: str
    title: str
    published_at: date | None
    source_uri: str | None
    preview_state: PreviewState
    access_policy: AccessPolicy | None = None
    capabilities: PermissionCapabilities
    passage_id: str | None = None
    publisher: str | None = None
    document_identity: str | None = None
    edition: str | None = None
    effective_date: date | None = None
    page_number: int | None = None
    section: str | None = None
    exact_quote: str | None = None
    start_offset: int | None = None
    end_offset: int | None = None
    pdf_bbox: list[float] | None = None
    access_type: str | None = None
    source_access_action: str | None = None
    source_access_url: str | None = None
    media_type: str | None = None


class SourceAccess(BaseModel):
    """Content-free source metadata and user-specific access capabilities."""

    document_id: str
    title: str | None
    kind: DocumentKind
    access_policy: AccessPolicy
    published_at: date
    preview_state: PreviewState
    source_uri: str | None
    permission: PermissionDecision


class Claim(BaseModel):
    """An atomic answer statement mapped to supporting citations."""

    id: str
    text: str
    citation_ids: list[str]


class SourceDisagreement(BaseModel):
    """A conflict between sources with explicit recency resolution."""

    topic: str
    preferred_citation_id: str
    conflicting_citation_id: str
    explanation: str


class Answer(BaseModel):
    """A grounded response with claim/source mapping and retrieval metadata."""

    text: str
    claims: list[Claim]
    citations: list[Citation]
    disagreements: list[SourceDisagreement] = Field(default_factory=list)
    deterministic: bool
    policy_version: str


class ChatRequest(BaseModel):
    """A tenant-scoped chat request made as a known demo user."""

    user_id: str
    question: str = Field(min_length=1, max_length=2000)
    patient_context_id: str | None = None


class Connector(BaseModel):
    """A local, synthetic, or realistic mock evidence connector."""

    id: str
    tenant_id: str | None
    name: str
    kind: ConnectorKind
    status: str
    description: str
    mock: bool = False


class AuditEvent(BaseModel):
    """A PHI-free event containing identifiers and counts, never content."""

    model_config = ConfigDict(frozen=True)

    id: str
    occurred_at: datetime
    tenant_id: str
    user_id: str
    action: str
    outcome: str
    document_id: str | None = None
    result_count: int | None = None


class RetrievalTrace(BaseModel):
    """A diagnostic proof of metadata filtering before content ranking."""

    candidate_metadata_ids: list[str]
    authorized_document_ids: list[str]
    ranked_document_ids: list[str]
    mode: RetrievalMode
    registry_candidate_source_ids: list[str] = Field(default_factory=list)
    registry_candidate_passage_ids: list[str] = Field(default_factory=list)
    registry_authorized_passage_ids: list[str] = Field(default_factory=list)
    registry_ranked_passage_ids: list[str] = Field(default_factory=list)
    registry_exclusion_reasons: dict[str, str] = Field(default_factory=dict)


class ChatResult(BaseModel):
    """An answer and its authorization-first retrieval trace."""

    answer: Answer
    trace: RetrievalTrace
