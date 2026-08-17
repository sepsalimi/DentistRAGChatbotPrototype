"""Security and behavior tests for governed uploads, source access, and passages."""

from datetime import date, timedelta
from types import SimpleNamespace

from fastapi.testclient import TestClient

from dental_evidence.ingestion_gate import MAX_UPLOAD_BYTES
from dental_evidence.main import services
from dental_evidence.passage_index import PassageIndex, PassageSearchMode
from dental_evidence.source_registry import SQLiteSourceRegistry


def _upload(
    client: TestClient,
    *,
    body: bytes = b"Section\n\nApproved evidence says use fluoride varnish.",
    filename: str = "evidence.txt",
    media_type: str = "text/plain",
    user_id: str = "user-dentist",
    **overrides: str,
):
    fields = {
        "user_id": user_id,
        "title": "Fluoride Evidence",
        "access_type": "licensed",
        "ai_usage_rights": "approved",
        "hosting_permission": "permitted",
        "document_identity": "doi:10.1000/fluoride",
        "allowed_roles": "student,dentist,hygienist,reception",
        "passage_storage_permitted": "true",
        "publisher": "Evidence Publisher",
        "edition": "2",
        "publication_date": "2026-01-10",
        "effective_date": "2026-02-01",
        "applicability": "General dentistry",
        "source_uri": "https://evidence.example/fluoride",
    }
    fields.update(overrides)
    return client.post(
        "/registry/sources/upload",
        data=fields,
        files={"file": (filename, body, media_type)},
    )


def _minimal_pdf(text: str, second_text: str | None = None) -> bytes:
    commands = [f"BT /F1 12 Tf 72 150 Td ({text}) Tj ET"]
    if second_text is not None:
        commands.append(f"BT /F1 12 Tf 72 40 Td ({second_text}) Tj ET")
    stream = "\n".join(commands).encode()
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        (
            b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] "
            b"/Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>"
        ),
        b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"\nendstream",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    pdf = bytearray(b"%PDF-1.4\n")
    offsets = [0]
    for number, obj in enumerate(objects, start=1):
        offsets.append(len(pdf))
        pdf.extend(f"{number} 0 obj\n".encode())
        pdf.extend(obj)
        pdf.extend(b"\nendobj\n")
    xref = len(pdf)
    pdf.extend(f"xref\n0 {len(objects) + 1}\n".encode())
    pdf.extend(b"0000000000 65535 f \n")
    for offset in offsets[1:]:
        pdf.extend(f"{offset:010d} 00000 n \n".encode())
    pdf.extend(
        (
            f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\n"
            f"startxref\n{xref}\n%%EOF\n"
        ).encode()
    )
    return bytes(pdf)


def test_supported_role_contract_and_upload_matrix(client: TestClient) -> None:
    assert set(client.get("/roles").json()) == {
        "student",
        "dentist",
        "hygienist",
        "reception",
    }
    assert _upload(client, user_id="user-student").status_code == 403
    assert _upload(client, user_id="user-reception").status_code == 403
    assert _upload(client, user_id="user-hygienist").status_code == 201


def test_prohibited_and_unknown_canaries_never_enter_content_storage(
    client: TestClient,
) -> None:
    canaries = {
        "prohibited": b"PROHIBITED_UPLOAD_CANARY",
        "unknown": b"UNKNOWN_UPLOAD_CANARY",
    }
    for rights, canary in canaries.items():
        response = _upload(
            client,
            body=canary,
            ai_usage_rights=rights,
            hosting_permission="permitted",
        )
        assert response.status_code == 201
        result = response.json()
        source_id = result["source"]["id"]
        assert result["source"]["status"] == "metadata_only"
        assert result["passage_count"] == 0
        assert result["original_stored"] is False
        assert services.source_registry.get_original_path(source_id) is None
        assert services.source_registry.list_passages(source_id) == []

    serialized_registry = str(
        client.get(
            "/registry/sources", params={"user_id": "user-dentist"}
        ).json()
    )
    serialized_audit = str(
        client.get("/audit", params={"user_id": "user-dentist"}).json()
    )
    assert "UPLOAD_CANARY" not in serialized_registry
    assert "UPLOAD_CANARY" not in serialized_audit
    chat = client.post(
        "/chat",
        json={"user_id": "user-dentist", "question": "What does the canary protocol require?"},
    ).json()
    assert "UPLOAD_CANARY" not in str(chat)


def test_approved_hosted_text_has_highlights_search_preview_and_file(
    client: TestClient,
) -> None:
    body = b"Prevention\n\nUse fluoride varnish twice yearly for elevated risk."
    uploaded = _upload(client, body=body)
    assert uploaded.status_code == 201
    source_id = uploaded.json()["source"]["id"]

    passages = client.get(
        f"/registry/sources/{source_id}/passages",
        params={"user_id": "user-dentist"},
    ).json()
    assert passages[1]["exact_quote"].startswith("Use fluoride")
    assert body.decode()[passages[1]["start_offset"]:passages[1]["end_offset"]] == (
        passages[1]["exact_quote"]
    )

    results = client.get(
        "/registry/passages/search",
        params={"user_id": "user-dentist", "q": "fluoride elevated"},
    ).json()
    citation = results[0]["citation"]
    assert citation["source_id"] == source_id
    assert citation["passage_id"] == passages[1]["id"]
    assert citation["original_url"] == f"/registry/sources/{source_id}/file"

    preview = client.get(
        f"/registry/sources/{source_id}/preview",
        params={"user_id": "user-dentist"},
    )
    original = client.get(
        f"/registry/sources/{source_id}/file",
        params={"user_id": "user-dentist"},
    )
    assert preview.json()["text"] == body.decode()
    assert original.content == body

    reopened = SQLiteSourceRegistry(services.source_registry.database_path)
    assert reopened.get_source(source_id) is not None
    assert reopened.list_passages(source_id)[1].exact_quote.startswith("Use fluoride")


def test_uploaded_arbitrary_text_answers_chat_with_locked_passage_citation(
    client: TestClient,
) -> None:
    body = (
        b"Moonstone protocol\n\n"
        b"The moonstone protocol requires a cobalt rinse for exactly seven minutes."
    )
    source = _upload(
        client,
        body=body,
        title="Moonstone Clinical Protocol",
        publisher="Locked Publisher",
        document_identity="publisher:moonstone-7",
        edition="Locked edition",
        access_type="user_provided",
    ).json()["source"]

    response = client.post(
        "/chat",
        json={
            "user_id": "user-dentist",
            "question": "What does the moonstone protocol require?",
        },
    )
    assert response.status_code == 200
    result = response.json()
    assert "cobalt rinse for exactly seven minutes" in result["answer"]["text"]
    citation = result["answer"]["citations"][0]
    assert citation["document_id"] == source["id"]
    assert citation["publisher"] == "Locked Publisher"
    assert citation["document_identity"] == "publisher:moonstone-7"
    assert citation["edition"] == "Locked edition"
    assert citation["exact_quote"] == (
        "The moonstone protocol requires a cobalt rinse for exactly seven minutes."
    )
    assert citation["start_offset"] < citation["end_offset"]
    assert citation["source_access_action"] == "open_original"
    assert citation["source_access_url"] == (
        f"/registry/sources/{source['id']}/file"
    )
    assert citation["media_type"] == "text/plain"
    trace = result["trace"]
    assert citation["passage_id"] in trace["registry_candidate_passage_ids"]
    assert citation["passage_id"] in trace["registry_authorized_passage_ids"]
    assert trace["registry_ranked_passage_ids"][0] == citation["passage_id"]


def test_metadata_only_and_missing_entitlement_capabilities_are_safe(
    client: TestClient,
) -> None:
    metadata_only = _upload(
        client,
        ai_usage_rights="unknown",
        hosting_permission="permitted",
        access_type="user_provided",
    ).json()["source"]
    locked = _upload(
        client,
        title="Licensed Locked Metadata",
        required_entitlement="locked-library",
        allowed_roles="reception",
        access_type="licensed",
        source_uri="https://publisher.example/locked",
    ).json()["source"]

    dentist_sources = client.get(
        "/registry/sources", params={"user_id": "user-dentist"}
    ).json()
    metadata_view = next(
        item for item in dentist_sources if item["source"]["id"] == metadata_only["id"]
    )
    assert metadata_view["source"]["access_type"] == "user_provided"
    assert metadata_view["capabilities"]["reason"] == "ai_usage_rights_unknown"
    assert metadata_view["capabilities"]["can_preview"] is False
    assert metadata_view["capabilities"]["can_open_original"] is False
    assert metadata_view["capabilities"]["preview_url"] is None
    assert metadata_view["capabilities"]["original_url"] is None
    trace = client.post(
        "/chat",
        json={"user_id": "user-dentist", "question": "fluoride evidence"},
    ).json()["trace"]
    assert trace["registry_exclusion_reasons"][metadata_only["id"]] == (
        "ai_usage_rights_unknown"
    )

    reception_sources = client.get(
        "/registry/sources", params={"user_id": "user-reception"}
    ).json()
    locked_view = next(
        item for item in reception_sources if item["source"]["id"] == locked["id"]
    )
    assert locked_view["capabilities"]["requires_entitlement"] is True
    assert locked_view["capabilities"]["reason"] == (
        "missing_entitlement:locked-library"
    )
    assert locked_view["capabilities"]["can_retrieve_passages"] is False
    assert locked_view["capabilities"]["can_open_publisher"] is True
    assert locked_view["capabilities"]["publisher_url"] == (
        "https://publisher.example/locked"
    )
    assert client.get(
        f"/registry/sources/{locked['id']}",
        params={"user_id": "user-reception"},
    ).status_code == 200


class _FakeEmbeddings:
    def __init__(self) -> None:
        self.inputs: list[list[str]] = []

    def create(self, *, model: str, input: list[str]):
        self.inputs.append(input)
        return SimpleNamespace(
            data=[
                SimpleNamespace(embedding=[float(index + 1), 0.5])
                for index, _ in enumerate(input)
            ]
        )


class _FakeQdrant:
    def __init__(self) -> None:
        self.collection_names: set[str] = set()
        self.points = []
        self.query_count = 0

    def get_collections(self):
        return SimpleNamespace(
            collections=[
                SimpleNamespace(name=name) for name in self.collection_names
            ]
        )

    def create_collection(self, *, collection_name: str, vectors_config) -> None:
        self.collection_names.add(collection_name)

    def upsert(self, *, collection_name: str, points) -> None:
        self.points = points

    def query_points(self, **kwargs):
        self.query_count += 1
        return SimpleNamespace(
            points=[
                SimpleNamespace(payload=point.payload, score=0.91)
                for point in self.points
            ]
        )


def test_vector_passage_search_queries_and_reauthorizes_persistent_hits(
    client: TestClient,
    tmp_path,
) -> None:
    old_source = _upload(
        client,
        body=b"Vector evidence contains the zirconia retrieval canary.",
        title="Vector Evidence",
        document_identity="vector:zirconia",
    ).json()["source"]
    source = services.source_registry.get_source(old_source["id"])
    assert source is not None
    passages = services.source_registry.list_passages(source.id)
    embeddings = _FakeEmbeddings()
    qdrant = _FakeQdrant()
    index = PassageIndex(
        services.source_registry,
        vector_enabled=True,
        qdrant_path=tmp_path / "qdrant",
        openai_api_key=None,
        embedding_model="mock-embedding",
        embedding_client=SimpleNamespace(embeddings=embeddings),
        qdrant_client=qdrant,
    )
    index.index_passages(source, passages)
    user = services.repository.get_user("user-dentist")
    assert user is not None

    outcome = index.search(
        user,
        "zirconia retrieval",
        mode=PassageSearchMode.VECTOR,
        patient_context_id=None,
        limit=5,
    )
    assert qdrant.query_count == 1
    assert outcome.results[0].citation.passage_id == passages[0].id
    assert embeddings.inputs[-1] == ["zirconia retrieval"]

    _upload(
        client,
        body=b"Replacement zirconia evidence.",
        title="Replacement Vector Evidence",
        document_identity="vector:zirconia",
        supersedes_source_id=source.id,
    )
    reauthorized = index.search(
        user,
        "zirconia retrieval",
        mode=PassageSearchMode.VECTOR,
        patient_context_id=None,
        limit=5,
    )
    assert reauthorized.results == []
    assert reauthorized.trace.exclusion_reasons[passages[0].id] == "superseded"


def test_non_hosted_source_can_store_permitted_passages_but_not_full_file(
    client: TestClient,
) -> None:
    response = _upload(
        client,
        hosting_permission="not_permitted",
        passage_storage_permitted="true",
    )
    source_id = response.json()["source"]["id"]
    assert response.json()["source"]["status"] == "passages_stored"
    assert response.json()["original_stored"] is False
    assert client.get(
        f"/registry/sources/{source_id}/preview",
        params={"user_id": "user-dentist"},
    ).json() == {"source_id": source_id, "state": "citation_only", "text": None}
    assert client.get(
        f"/registry/sources/{source_id}/file",
        params={"user_id": "user-dentist"},
    ).status_code == 404


def test_registry_idor_role_entitlement_and_patient_context(
    client: TestClient,
) -> None:
    response = _upload(
        client,
        allowed_roles="dentist,hygienist",
        required_entitlement="implant-pro",
        patient_context_id="patient-maya",
    )
    source_id = response.json()["source"]["id"]

    assert client.get(
        f"/registry/sources/{source_id}",
        params={"user_id": "user-other-dentist", "patient_context_id": "patient-maya"},
    ).status_code == 404
    assert client.get(
        f"/registry/sources/{source_id}",
        params={"user_id": "user-reception", "patient_context_id": "patient-maya"},
    ).status_code == 404
    assert client.get(
        f"/registry/sources/{source_id}",
        params={"user_id": "user-hygienist", "patient_context_id": "patient-maya"},
    ).status_code == 404
    assert client.get(
        f"/registry/sources/{source_id}",
        params={"user_id": "user-dentist", "patient_context_id": "patient-noah"},
    ).status_code == 404
    assert client.get(
        f"/registry/sources/{source_id}",
        params={"user_id": "user-dentist", "patient_context_id": "patient-maya"},
    ).status_code == 200


def test_superseded_and_future_effective_sources_are_excluded(
    client: TestClient,
) -> None:
    old = _upload(
        client,
        body=b"OLD_SUPERSEDED_CANARY outdated polishing advice",
        title="Old Edition",
        document_identity="policy:polishing",
        edition="1",
        effective_date="2025-01-01",
    ).json()["source"]
    current = _upload(
        client,
        body=b"CURRENT_EDITION_CANARY current polishing advice",
        title="Current Edition",
        document_identity="policy:polishing",
        edition="2",
        supersedes_source_id=old["id"],
        effective_date="2026-01-01",
    ).json()["source"]
    _upload(
        client,
        body=b"FUTURE_EFFECTIVE_CANARY future polishing advice",
        title="Future Edition",
        document_identity="policy:future",
        effective_date=(date.today() + timedelta(days=30)).isoformat(),
    )

    results = client.get(
        "/registry/passages/search",
        params={"user_id": "user-dentist", "q": "polishing advice canary"},
    ).json()
    source_ids = {result["citation"]["source_id"] for result in results}
    assert current["id"] in source_ids
    assert old["id"] not in source_ids
    serialized = str(results)
    assert "OLD_SUPERSEDED_CANARY" not in serialized
    assert "FUTURE_EFFECTIVE_CANARY" not in serialized


def test_pdf_passages_have_exact_block_bboxes(client: TestClient) -> None:
    response = _upload(
        client,
        body=_minimal_pdf("PDF_HIGHLIGHT_CANARY", "SECOND_BLOCK_CANARY"),
        filename="highlight.pdf",
        media_type="application/pdf",
    )
    assert response.status_code == 201
    source_id = response.json()["source"]["id"]
    passages = client.get(
        f"/registry/sources/{source_id}/passages",
        params={"user_id": "user-dentist"},
    ).json()
    assert [passage["exact_quote"] for passage in passages] == [
        "PDF_HIGHLIGHT_CANARY",
        "SECOND_BLOCK_CANARY",
    ]
    assert all(passage["page_number"] == 1 for passage in passages)
    assert all(len(passage["pdf_bbox"]) == 4 for passage in passages)
    assert passages[0]["pdf_bbox"][3] < passages[1]["pdf_bbox"][1]


def test_uploaded_pdf_answers_chat_with_page_and_bbox(
    client: TestClient,
) -> None:
    source = _upload(
        client,
        body=_minimal_pdf("PDF_HIGHLIGHT_CANARY", "SECOND_BLOCK_CANARY"),
        filename="highlight.pdf",
        media_type="application/pdf",
        title="PDF Highlight Protocol",
        document_identity="publisher:pdf-highlight",
    ).json()["source"]
    result = client.post(
        "/chat",
        json={
            "user_id": "user-dentist",
            "question": "What does PDF_HIGHLIGHT_CANARY say?",
        },
    ).json()
    assert "PDF_HIGHLIGHT_CANARY" in result["answer"]["text"]
    citation = next(
        item
        for item in result["answer"]["citations"]
        if item["exact_quote"] == "PDF_HIGHLIGHT_CANARY"
    )
    assert citation["document_id"] == source["id"]
    assert citation["media_type"] == "application/pdf"
    assert citation["page_number"] == 1
    assert len(citation["pdf_bbox"]) == 4
    assert citation["source_access_action"] == "open_original"
    original = client.get(
        f"/registry/sources/{source['id']}/file",
        params={"user_id": "user-dentist"},
    )
    assert original.headers["content-type"].startswith("application/pdf")
    assert original.content.startswith(b"%PDF-1.4")


def test_upload_type_size_and_readability_validation(client: TestClient) -> None:
    assert _upload(
        client,
        filename="evidence.html",
        media_type="text/html",
    ).status_code == 422
    assert _upload(client, body=b"", filename="empty.txt").status_code == 422
    assert _upload(
        client,
        body=b"x" * (MAX_UPLOAD_BYTES + 1),
        ai_usage_rights="prohibited",
    ).status_code == 422
    assert _upload(
        client,
        body=b"%PDF-1.4\nnot a readable PDF",
        filename="broken.pdf",
        media_type="application/pdf",
    ).status_code == 422
