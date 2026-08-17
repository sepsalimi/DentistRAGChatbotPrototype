"""Synthetic demo identities, connectors, patients, and contradictory dental evidence."""

from datetime import date

from .schemas import (
    AccessPolicy,
    Connector,
    ConnectorKind,
    DocumentKind,
    DocumentMetadata,
    DocumentRecord,
    Patient,
    Persona,
    PersonaKind,
    User,
)

DEMO_TENANT_ID = "tenant-bright-smile"
OTHER_TENANT_ID = "tenant-river-dental"


def build_users() -> list[User]:
    """Create all staff roles, sample users, and a tenant-isolation user."""

    return [
        User(
            id="user-dentist",
            tenant_id=DEMO_TENANT_ID,
            display_name="Dr. Avery Chen",
            persona=PersonaKind.DENTIST,
            entitlements={"implant-pro"},
        ),
        User(
            id="user-front-desk",
            tenant_id=DEMO_TENANT_ID,
            display_name="Jordan Lee",
            persona=PersonaKind.FRONT_DESK,
        ),
        User(
            id="user-student",
            tenant_id=DEMO_TENANT_ID,
            display_name="Taylor Kim",
            persona=PersonaKind.STUDENT,
        ),
        User(
            id="user-hygienist",
            tenant_id=DEMO_TENANT_ID,
            display_name="Riley Shah",
            persona=PersonaKind.HYGIENIST,
        ),
        User(
            id="user-reception",
            tenant_id=DEMO_TENANT_ID,
            display_name="Casey Morgan",
            persona=PersonaKind.RECEPTION,
        ),
        User(
            id="user-other-dentist",
            tenant_id=OTHER_TENANT_ID,
            display_name="Dr. Morgan Diaz",
            persona=PersonaKind.DENTIST,
        ),
    ]


def build_personas() -> list[Persona]:
    """Create the two user-selectable demo personas."""

    return [
        Persona(
            id=PersonaKind.DENTIST,
            label="Dentist",
            description="Clinical evidence, patient records, and entitled protocols.",
            default_user_id="user-dentist",
        ),
        Persona(
            id=PersonaKind.FRONT_DESK,
            label="Front desk",
            description="Operational guidance and public evidence without patient charts.",
            default_user_id="user-front-desk",
        ),
    ]


def build_patients() -> list[Patient]:
    """Create wholly synthetic patients for the demonstration."""

    return [
        Patient(id="patient-maya", tenant_id=DEMO_TENANT_ID, display_name="Maya Brooks"),
        Patient(id="patient-noah", tenant_id=OTHER_TENANT_ID, display_name="Noah Rivera"),
    ]


def build_connectors() -> list[Connector]:
    """Create active local connectors and realistic non-networked mock connectors."""

    return [
        Connector(
            id="connector-synthetic",
            tenant_id=DEMO_TENANT_ID,
            name="Synthetic Patient Context",
            kind=ConnectorKind.SYNTHETIC,
            status="ready",
            description="Generated patient charts for the local prototype.",
        ),
        Connector(
            id="connector-local-sop",
            tenant_id=DEMO_TENANT_ID,
            name="Files",
            kind=ConnectorKind.LOCAL,
            status="ready",
            description="Local practice procedures and handouts.",
        ),
        Connector(
            id="connector-sharepoint",
            tenant_id=DEMO_TENANT_ID,
            name="SharePoint",
            kind=ConnectorKind.EVIDENCE_LIBRARY,
            status="mock_connected",
            description="Realistic mock of inherited document and group permissions.",
            mock=True,
        ),
        Connector(
            id="connector-google-drive",
            tenant_id=DEMO_TENANT_ID,
            name="Google Drive",
            kind=ConnectorKind.EVIDENCE_LIBRARY,
            status="needs_attention",
            description="Realistic mock with one folder permission requiring review.",
            mock=True,
        ),
        Connector(
            id="connector-open-dental",
            tenant_id=DEMO_TENANT_ID,
            name="Open Dental",
            kind=ConnectorKind.PRACTICE_MANAGEMENT,
            status="mock_connected",
            description="Realistic mock of a patient-record connector; no PHI or network calls.",
            mock=True,
        ),
        Connector(
            id="connector-ada",
            tenant_id=None,
            name="ADA Evidence Library",
            kind=ConnectorKind.EVIDENCE_LIBRARY,
            status="mock_connected",
            description="Realistic mock of licensed and public clinical evidence.",
            mock=True,
        ),
    ]


def _document(
    document_id: str,
    title: str,
    kind: DocumentKind,
    text: str,
    published_at: date,
    connector_id: str,
    source_uri: str,
    access_policy: AccessPolicy,
    *,
    tenant_id: str = DEMO_TENANT_ID,
    subject_id: str | None = None,
    required_entitlement: str | None = None,
) -> DocumentRecord:
    return DocumentRecord(
        metadata=DocumentMetadata(
            id=document_id,
            tenant_id=tenant_id,
            title=title,
            kind=kind,
            connector_id=connector_id,
            source_uri=source_uri,
            published_at=published_at,
            access_policy=access_policy,
            subject_id=subject_id,
            required_entitlement=required_entitlement,
        ),
        text=text,
    )


def build_documents() -> list[DocumentRecord]:
    """Create evidence spanning every required access and freshness state."""

    return [
        _document(
            "doc-patient-maya",
            "Maya Brooks Synthetic Medication Summary",
            DocumentKind.PATIENT,
            "Maya Brooks currently reports amoxicillin 500 mg three times daily and ibuprofen as needed.",
            date(2026, 7, 20),
            "connector-synthetic",
            "synthetic://patients/patient-maya/medications",
            AccessPolicy.PATIENT_RESTRICTED,
            subject_id="patient-maya",
        ),
        _document(
            "doc-extraction-current",
            "Post-extraction Care Guidance",
            DocumentKind.GUIDANCE,
            "After extraction, keep gauze in place for 30 to 45 minutes, do not rinse for 24 hours, and avoid smoking for 72 hours.",
            date(2026, 6, 1),
            "connector-ada",
            "https://evidence.example.org/extraction-care-2026",
            AccessPolicy.PUBLIC,
        ),
        _document(
            "doc-extraction-stale",
            "Archived Extraction Handout",
            DocumentKind.GUIDANCE,
            "After extraction, rinse with warm salt water immediately and avoid smoking for 24 hours.",
            date(2019, 3, 15),
            "connector-local-sop",
            "local://archive/extraction-handout-2019",
            AccessPolicy.LICENSED_INTERNAL,
        ),
        _document(
            "doc-emergency-sop",
            "Emergency Referral Front Desk SOP",
            DocumentKind.SOP,
            "For uncontrolled bleeding, spreading facial swelling, breathing difficulty, or trauma, alert the dentist and arrange immediate emergency evaluation. Do not give clinical advice.",
            date(2026, 5, 10),
            "connector-local-sop",
            "local://sop/emergency-referral",
            AccessPolicy.LICENSED_INTERNAL,
        ),
        _document(
            "doc-implant-licensed",
            "Licensed Implant Maintenance Protocol",
            DocumentKind.LICENSED,
            "For implant maintenance, assess peri-implant tissues and probing findings at recall, reinforce plaque control, and obtain radiographs when clinically indicated.",
            date(2026, 4, 2),
            "connector-ada",
            "licensed://implant-pro/maintenance",
            AccessPolicy.ENTITLEMENT_CONTROLLED,
            required_entitlement="implant-pro",
        ),
        _document(
            "doc-citation-only",
            "Systematic Review of Dry Socket Prevention",
            DocumentKind.CITATION_ONLY,
            "The systematic review reports that chlorhexidine interventions may reduce alveolar osteitis in selected extraction patients.",
            date(2025, 11, 12),
            "connector-ada",
            "https://doi.example.org/10.1000/dry-socket",
            AccessPolicy.CITATION_ONLY,
        ),
        _document(
            "doc-entitlement-only",
            "Premium Oral Surgery Decision Guide",
            DocumentKind.ENTITLEMENT,
            "Premium decision guidance for complex oral surgery referral and follow-up.",
            date(2026, 1, 8),
            "connector-ada",
            "licensed://oral-surgery-premium/decision-guide",
            AccessPolicy.ENTITLEMENT_CONTROLLED,
            required_entitlement="oral-surgery-premium",
        ),
        _document(
            "doc-excluded-secret",
            "Excluded Acquisition Notes",
            DocumentKind.EXCLUDED,
            "EXCLUDED_CANARY_TEXT must never be retrieved, ranked, previewed, or sent to a model.",
            date(2026, 7, 1),
            "connector-local-sop",
            "local://excluded/acquisition-notes",
            AccessPolicy.EXCLUDED,
        ),
        _document(
            "doc-other-tenant",
            "Noah Rivera Synthetic Clinical Chart",
            DocumentKind.PATIENT,
            "Noah Rivera has a synthetic allergy entry for penicillin.",
            date(2026, 7, 18),
            "connector-synthetic",
            "synthetic://patients/patient-noah/chart",
            AccessPolicy.PATIENT_RESTRICTED,
            tenant_id=OTHER_TENANT_ID,
            subject_id="patient-noah",
        ),
    ]
