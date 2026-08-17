"""Behavior tests for permissions, isolation, previews, retrieval, and grounding."""

import pytest
from fastapi.testclient import TestClient
from llama_index.core.embeddings import MockEmbedding

from dental_evidence.configuration import BackendSettings
from dental_evidence.main import services
from dental_evidence.schemas import RetrievalMode
from dental_evidence.vector_retrieval import AuthorizationFirstVectorRetriever


def test_patient_permissions_differ_by_persona() -> None:
    metadata = services.repository.get_metadata("doc-patient-maya")
    dentist = services.repository.get_user("user-dentist")
    front_desk = services.repository.get_user("user-front-desk")
    assert metadata and dentist and front_desk

    dentist_decision = services.permissions.decide(dentist, metadata)
    front_desk_decision = services.permissions.decide(front_desk, metadata)

    assert dentist_decision.capabilities.model_dump() == {
        "can_retrieve": True,
        "can_preview": True,
        "can_open_original": True,
        "requires_entitlement": False,
    }
    assert front_desk_decision.capabilities.can_retrieve is False
    assert front_desk_decision.reason == "clinical_record_requires_dentist"
    assert dentist_decision.policy_version == "dental-evidence-demo-v2"


def test_all_five_source_policy_scenarios_are_distinct() -> None:
    dentist = services.repository.get_user("user-dentist")
    front_desk = services.repository.get_user("user-front-desk")
    assert dentist and front_desk

    def capabilities(user_id: str, document_id: str) -> dict[str, bool]:
        user = services.repository.get_user(user_id)
        metadata = services.repository.get_metadata(document_id)
        assert user and metadata
        return services.permissions.decide(
            user, metadata
        ).capabilities.model_dump()

    assert capabilities("user-front-desk", "doc-extraction-current") == {
        "can_retrieve": True,
        "can_preview": True,
        "can_open_original": True,
        "requires_entitlement": False,
    }
    assert capabilities("user-front-desk", "doc-emergency-sop") == {
        "can_retrieve": True,
        "can_preview": True,
        "can_open_original": False,
        "requires_entitlement": False,
    }
    assert capabilities("user-front-desk", "doc-citation-only") == {
        "can_retrieve": True,
        "can_preview": False,
        "can_open_original": False,
        "requires_entitlement": False,
    }
    assert capabilities("user-dentist", "doc-implant-licensed") == {
        "can_retrieve": True,
        "can_preview": True,
        "can_open_original": True,
        "requires_entitlement": False,
    }
    assert capabilities("user-front-desk", "doc-implant-licensed") == {
        "can_retrieve": False,
        "can_preview": False,
        "can_open_original": False,
        "requires_entitlement": True,
    }
    assert capabilities("user-dentist", "doc-excluded-secret") == {
        "can_retrieve": False,
        "can_preview": False,
        "can_open_original": False,
        "requires_entitlement": False,
    }


def test_tenant_isolation_blocks_retrieval_and_preview(client: TestClient) -> None:
    other_document = services.repository.get_metadata("doc-other-tenant")
    dentist = services.repository.get_user("user-dentist")
    assert other_document and dentist
    decision = services.permissions.decide(dentist, other_document)

    assert decision.reason == "tenant_mismatch"
    assert decision.capabilities.can_retrieve is False

    response = client.get(
        "/documents/doc-other-tenant/preview",
        params={"user_id": "user-dentist"},
    )
    assert response.status_code == 200
    assert response.json()["state"] == "denied"
    assert response.json()["title"] is None
    assert "doc-other-tenant" not in services.repository.content_read_ids


def test_preview_states_do_not_read_unauthorized_text(client: TestClient) -> None:
    available = client.get(
        "/documents/doc-emergency-sop/preview",
        params={"user_id": "user-front-desk"},
    ).json()
    citation_only = client.get(
        "/documents/doc-citation-only/preview",
        params={"user_id": "user-front-desk"},
    ).json()
    entitlement = client.get(
        "/documents/doc-implant-licensed/preview",
        params={"user_id": "user-front-desk"},
    ).json()
    excluded = client.get(
        "/documents/doc-excluded-secret/preview",
        params={"user_id": "user-dentist"},
    ).json()

    assert available["state"] == "available"
    assert available["text"]
    assert citation_only["state"] == "citation_only"
    assert citation_only["text"] is None
    assert citation_only["permission"]["capabilities"]["can_open_original"] is False
    assert entitlement["state"] == "entitlement_required"
    assert entitlement["permission"]["capabilities"]["requires_entitlement"] is True
    assert excluded["state"] == "denied"
    assert services.repository.content_read_ids == ["doc-emergency-sop"]


def test_source_access_endpoint_exposes_capabilities_without_text(
    client: TestClient,
) -> None:
    response = client.get("/sources", params={"user_id": "user-front-desk"})
    assert response.status_code == 200
    sources = {source["document_id"]: source for source in response.json()}

    assert {
        source["access_policy"] for source in sources.values()
    } >= {
        "public",
        "licensed_internal",
        "citation_only",
        "entitlement_controlled",
        "excluded",
    }
    assert sources["doc-extraction-current"]["source_uri"]
    assert sources["doc-emergency-sop"]["source_uri"] is None
    assert sources["doc-emergency-sop"]["permission"]["capabilities"][
        "can_preview"
    ] is True
    assert sources["doc-citation-only"]["source_uri"] is None
    assert sources["doc-implant-licensed"]["title"] == (
        "Licensed Implant Maintenance Protocol"
    )
    assert sources["doc-patient-maya"]["title"] is None
    assert sources["doc-excluded-secret"]["title"] is None
    assert all("text" not in source for source in sources.values())
    assert services.repository.content_read_ids == []


def test_cors_allows_local_nextjs_origins(client: TestClient) -> None:
    response = client.options(
        "/chat",
        headers={
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "POST",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:3000"


def test_excluded_document_never_reaches_body_read_or_ranking(client: TestClient) -> None:
    response = client.post(
        "/chat",
        json={
            "user_id": "user-dentist",
            "question": "What is EXCLUDED_CANARY_TEXT in acquisition notes?",
        },
    )
    assert response.status_code == 200
    trace = response.json()["trace"]

    assert "doc-excluded-secret" in trace["candidate_metadata_ids"]
    assert "doc-excluded-secret" not in trace["authorized_document_ids"]
    assert "doc-excluded-secret" not in trace["ranked_document_ids"]
    assert "doc-excluded-secret" not in services.repository.content_read_ids
    assert "EXCLUDED_CANARY_TEXT" not in response.json()["answer"]["text"]


def test_deterministic_extraction_answer_surfaces_stale_disagreement(
    client: TestClient,
) -> None:
    request = {
        "user_id": "user-front-desk",
        "question": "What should we do after a tooth extraction?",
    }
    first = client.post("/chat", json=request).json()["answer"]
    second = client.post("/chat", json=request).json()["answer"]

    assert first == second
    assert first["deterministic"] is True
    assert "avoid smoking for 72 hours" in first["text"]
    assert first["disagreements"][0]["preferred_citation_id"] == (
        "citation-doc-extraction-current"
    )
    dates = {citation["document_id"]: citation["published_at"] for citation in first["citations"]}
    assert dates["doc-extraction-current"] > dates["doc-extraction-stale"]


def test_front_desk_patient_question_does_not_leak_patient_data(
    client: TestClient,
) -> None:
    response = client.post(
        "/chat",
        json={
            "user_id": "user-front-desk",
            "question": "What medications is Maya taking?",
        },
    ).json()

    assert response["answer"]["citations"] == []
    assert "amoxicillin" not in response["answer"]["text"].lower()
    assert "doc-patient-maya" not in response["trace"]["authorized_document_ids"]
    assert "doc-patient-maya" not in services.repository.content_read_ids


def test_dentist_patient_answer_claims_map_to_returned_sources(
    client: TestClient,
) -> None:
    answer = client.post(
        "/chat",
        json={
            "user_id": "user-dentist",
            "question": "What medications is patient Maya taking?",
        },
    ).json()["answer"]

    citation_ids = {citation["id"] for citation in answer["citations"]}
    mapped_ids = {
        citation_id
        for claim in answer["claims"]
        for citation_id in claim["citation_ids"]
    }
    assert mapped_ids == citation_ids == {"citation-doc-patient-maya"}
    assert all(claim["citation_ids"] for claim in answer["claims"])


def test_all_extraction_claim_mappings_reference_returned_citations(
    client: TestClient,
) -> None:
    answer = client.post(
        "/chat",
        json={
            "user_id": "user-dentist",
            "question": "What should we do after a tooth extraction?",
        },
    ).json()["answer"]
    citation_ids = {citation["id"] for citation in answer["citations"]}

    assert answer["claims"]
    assert all(
        set(claim["citation_ids"]).issubset(citation_ids)
        for claim in answer["claims"]
    )
    disagreement = answer["disagreements"][0]
    assert disagreement["preferred_citation_id"] in citation_ids
    assert disagreement["conflicting_citation_id"] in citation_ids


def test_streaming_endpoint_emits_tokens_and_final_grounded_result(
    client: TestClient,
) -> None:
    response = client.post(
        "/chat/stream",
        json={
            "user_id": "user-front-desk",
            "question": "What is the front desk emergency referral SOP?",
        },
    )

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
    assert "event: token" in response.text
    assert "event: final" in response.text
    assert "citation-doc-emergency-sop" in response.text


def test_audit_events_are_phi_free_and_tenant_scoped(client: TestClient) -> None:
    client.post(
        "/chat",
        json={
            "user_id": "user-dentist",
            "question": "What medications is patient Maya taking?",
        },
    )
    events = client.get("/audit", params={"user_id": "user-dentist"}).json()

    assert len(events) == 1
    assert set(events[0]) == {
        "id",
        "occurred_at",
        "tenant_id",
        "user_id",
        "action",
        "outcome",
        "document_id",
        "result_count",
    }
    serialized = str(events).lower()
    assert "maya" not in serialized
    assert "amoxicillin" not in serialized


def test_personas_connectors_and_reset_endpoints(client: TestClient) -> None:
    personas = client.get("/personas").json()
    connectors = client.get(
        "/connectors", params={"user_id": "user-front-desk"}
    ).json()
    client.post(
        "/chat",
        json={
            "user_id": "user-front-desk",
            "question": "What is the emergency referral SOP?",
        },
    )
    reset = client.post("/demo/reset")

    assert {persona["id"] for persona in personas} == {"dentist", "front_desk"}
    assert {
        connector["name"] for connector in connectors
    } >= {"Files", "SharePoint", "Google Drive", "Open Dental", "Synthetic Patient Context"}
    assert any(connector["mock"] for connector in connectors)
    assert reset.json() == {"status": "reset"}
    assert client.get("/audit", params={"user_id": "user-front-desk"}).json() == []


def test_offline_mode_is_explicit_and_does_not_use_api_key(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("DENTAL_RAG_MODE", "offline")
    monkeypatch.setenv("OPENAI_API_KEY", "unused-in-offline-mode")

    settings = BackendSettings.from_environment()

    assert settings.retrieval_mode == RetrievalMode.OFFLINE
    assert services.retriever.mode == RetrievalMode.OFFLINE


def test_vector_mode_requires_an_api_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DENTAL_RAG_MODE", "vector")
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)

    with pytest.raises(ValueError, match="OPENAI_API_KEY"):
        BackendSettings.from_environment()


def test_vector_ingestion_receives_only_authorized_bodies(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    dentist = services.repository.get_user("user-dentist")
    assert dentist
    retriever = AuthorizationFirstVectorRetriever(
        services.repository,
        services.permissions,
        api_key="test-key",
        embedding_model="text-embedding-3-small",
    )
    ingested_ids: list[str] = []

    def record_ingestion(user, question, records, limit):
        ingested_ids.extend(record.metadata.id for record in records)
        return records[:limit]

    monkeypatch.setattr(retriever, "_ingest_and_rank", record_ingestion)
    result = retriever.retrieve(dentist, "excluded acquisition notes")

    assert result.trace.mode == RetrievalMode.VECTOR
    assert "doc-excluded-secret" not in ingested_ids
    assert "doc-excluded-secret" not in services.repository.content_read_ids
    assert "doc-other-tenant" not in ingested_ids


def test_vector_mode_ingests_and_queries_qdrant_local() -> None:
    front_desk = services.repository.get_user("user-front-desk")
    assert front_desk
    retriever = AuthorizationFirstVectorRetriever(
        services.repository,
        services.permissions,
        api_key=None,
        embedding_model="unused-test-model",
        embed_model=MockEmbedding(embed_dim=8),
    )

    result = retriever.retrieve(front_desk, "emergency referral", limit=2)

    assert result.trace.mode == RetrievalMode.VECTOR
    assert len(result.documents) == 2
    assert set(result.trace.ranked_document_ids).issubset(
        result.trace.authorized_document_ids
    )
    assert "doc-patient-maya" not in result.trace.authorized_document_ids
    assert "doc-excluded-secret" not in result.trace.authorized_document_ids
