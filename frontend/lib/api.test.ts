// Verifies actual registry, citation, role, patient-scope, and multipart backend integration.
import { describe, expect, it, vi } from "vitest";
import {
  API_URL,
  fetchRegistrySources,
  fetchRegistryPreview,
  fetchRegistryTextFile,
  mapBackendChatResult,
  mapRegistrySource,
  personaToUserId,
  streamChat,
  uploadRegistrySource,
  type BackendChatResult,
  type BackendRegistrySourceView,
} from "./api";

const registryView: BackendRegistrySourceView = {
  source: {
    id: "source-1",
    tenant_id: "tenant-demo",
    title: "Registered guideline",
    media_type: "application/pdf",
    original_filename: "guideline.pdf",
    access_type: "licensed",
    ai_usage_rights: "approved",
    hosting_permission: "permitted",
    passage_storage_permitted: true,
    required_entitlement: "clinical-library",
    allowed_roles: ["dentist", "hygienist"],
    patient_context_id: "patient-maya",
    publisher: "Publisher",
    document_identity: "DOI 10/example",
    edition: "2026",
    publication_date: "2026-01-02",
    effective_date: "2026-02-01",
    applicability: "United States",
    source_uri: "https://publisher.example/guideline",
    supersedes_source_id: "source-old",
    superseded_by_source_id: null,
    status: "original_and_passages_stored",
    created_by: "user-dentist",
    created_at: "2026-08-16T12:00:00Z",
  },
  capabilities: {
    can_retrieve_passages: true,
    can_preview: true,
    can_open_original: true,
    can_open_publisher: true,
    requires_entitlement: false,
    reason: "allowed",
    preview_url: "/registry/sources/source-1/preview",
    original_url: "/registry/sources/source-1/file",
    publisher_url: "https://publisher.example/guideline",
  },
};

const chatResult: BackendChatResult = {
  answer: {
    text: "Grounded answer",
    claims: [{ id: "claim-1", text: "Grounded answer", citation_ids: ["citation-passage-1"] }],
    citations: [{
      id: "citation-passage-1",
      document_id: "source-1",
      title: "Registered guideline",
      published_at: "2026-01-02",
      source_uri: "https://publisher.example/guideline",
      preview_state: "available",
      access_policy: null,
      capabilities: {
        can_retrieve: true,
        can_preview: true,
        can_open_original: true,
        requires_entitlement: false,
      },
      passage_id: "passage-1",
      publisher: "Publisher",
      document_identity: "DOI 10/example",
      edition: "2026",
      effective_date: "2026-02-01",
      page_number: 7,
      section: "Recommendation 2",
      exact_quote: "Exact supporting quote.",
      start_offset: 120,
      end_offset: 143,
      pdf_bbox: [72, 100, 420, 130],
      access_type: "licensed",
      source_access_action: "open_original",
      source_access_url: "/registry/sources/source-1/file",
      media_type: "application/pdf",
    }],
    disagreements: [],
    deterministic: true,
    policy_version: "demo-v1",
  },
  trace: {
    candidate_metadata_ids: [],
    authorized_document_ids: [],
    ranked_document_ids: [],
    mode: "offline",
    registry_candidate_source_ids: ["source-1", "source-2"],
    registry_candidate_passage_ids: ["passage-1", "passage-2"],
    registry_authorized_passage_ids: ["passage-1"],
    registry_ranked_passage_ids: ["passage-1"],
    registry_exclusion_reasons: { "source-2": "role_not_allowed" },
  },
};

describe("backend API mapping", () => {
  it("uses the backend reception role and user ID", () => {
    expect(personaToUserId("student")).toBe("user-student");
    expect(personaToUserId("dentist")).toBe("user-dentist");
    expect(personaToUserId("hygienist")).toBe("user-hygienist");
    expect(personaToUserId("reception")).toBe("user-reception");
  });

  it("maps every RegistrySourceView field without inferring other roles", () => {
    const source = mapRegistrySource(registryView, "dentist", "patient-maya");
    expect(source).toMatchObject({
      id: "source-1",
      accessType: "licensed",
      aiUsageRights: "approved",
      hostingPermission: "permitted",
      passageStatus: "original_and_passages_stored",
      effectiveDate: "2026-02-01",
      supersedesSourceId: "source-old",
      capabilityReason: "allowed",
      sourceAccessAction: "Open authorized file",
      mediaType: "application/pdf",
    });
    expect(source.access).toEqual({ dentist: source.currentAccess });
    expect(source.fileUrl).toBe(
      `${API_URL}/registry/sources/source-1/file?user_id=user-dentist&patient_context_id=patient-maya`,
    );
  });

  it("maps passage citations, exact locators, actions, and registry trace", () => {
    const mapped = mapBackendChatResult(chatResult, "Question", "dentist", "patient-maya");
    expect(mapped.answer.citations[0]).toMatchObject({
      passageId: "passage-1",
      documentIdentity: "DOI 10/example",
      effectiveDate: "2026-02-01",
      pageNumber: 7,
      section: "Recommendation 2",
      exactQuote: "Exact supporting quote.",
      startOffset: 120,
      endOffset: 143,
      pdfBBox: [72, 100, 420, 130],
      accessType: "licensed",
      sourceAccessAction: "open_original",
    });
    expect(mapped.citationSources[0].mediaType).toBe("application/pdf");
    expect(mapped.citationSources[0].pdfUrl).toContain("/registry/sources/source-1/file");
    expect(mapped.citationSources[0].passageStatus).toBe("passages_stored");
    expect(mapped.citationSources[0].pdfUrl).toContain("patient_context_id=patient-maya");
    expect(mapped.citationSources[0].currentAccess).toMatchObject({
      scenario: "entitled",
      preview: "full",
      entitlement: "entitled",
    });
    expect(mapped.answer.registryTrace).toEqual({
      candidateSourceIds: ["source-1", "source-2"],
      candidatePassageIds: ["passage-1", "passage-2"],
      authorizedPassageIds: ["passage-1"],
      rankedPassageIds: ["passage-1"],
      exclusionReasons: { "source-2": "role_not_allowed" },
    });
  });

  it("propagates patient context only when supplied to chat", async () => {
    const bodies: Array<Record<string, string>> = [];
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)));
      const body = `event: final\ndata: ${JSON.stringify(chatResult)}\n\n`;
      return new Response(body, { status: 200 });
    }) as unknown as typeof fetch;

    await streamChat("Question", "dentist", "patient-maya", vi.fn(), fetcher);
    await streamChat("Question", "reception", undefined, vi.fn(), fetcher);
    expect(bodies[0]).toMatchObject({ user_id: "user-dentist", patient_context_id: "patient-maya" });
    expect(bodies[1]).toEqual({ user_id: "user-reception", question: "Question" });
  });

  it("scopes registry requests and omits patient context when disabled", async () => {
    const urls: string[] = [];
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      urls.push(String(input));
      return Response.json([registryView]);
    }) as unknown as typeof fetch;
    await fetchRegistrySources("hygienist", "patient-maya", fetcher);
    await fetchRegistrySources("reception", undefined, fetcher);
    expect(urls[0]).toContain("user_id=user-hygienist&patient_context_id=patient-maya");
    expect(urls[1]).toContain("user_id=user-reception");
    expect(urls[1]).not.toContain("patient_context_id");
  });

  it("propagates patient context to registry preview and file requests", async () => {
    const urls: string[] = [];
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      urls.push(String(input));
      return urls.length === 1
        ? Response.json({ source_id: "source-1", state: "available", text: "Bounded" })
        : new Response("Full exact text");
    }) as unknown as typeof fetch;
    await fetchRegistryPreview("source-1", "dentist", "patient-maya", fetcher);
    await fetchRegistryTextFile("source-1", "dentist", "patient-maya", fetcher);
    expect(urls[0]).toContain("/registry/sources/source-1/preview?user_id=user-dentist&patient_context_id=patient-maya");
    expect(urls[1]).toContain("/registry/sources/source-1/file?user_id=user-dentist&patient_context_id=patient-maya");
  });

  it("posts multipart data without setting a JSON content type", async () => {
    const formData = new FormData();
    formData.set("user_id", "user-dentist");
    formData.set("title", "Uploaded source");
    formData.set("allowed_roles", "dentist,hygienist");
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe(`${API_URL}/registry/sources/upload`);
      expect(init?.body).toBe(formData);
      expect(init?.headers).toBeUndefined();
      return Response.json({
        source: { ...registryView.source, title: "Uploaded source" },
        passage_count: 2,
        original_stored: true,
      }, { status: 201 });
    }) as unknown as typeof fetch;
    const result = await uploadRegistrySource(formData, fetcher);
    expect(result.passage_count).toBe(2);
  });

  it("maps hosted text citations without treating them as PDFs", () => {
    const mapped = mapBackendChatResult({
      ...chatResult,
      answer: {
        ...chatResult.answer,
        citations: [{
          ...chatResult.answer.citations[0],
          access_type: "user_provided",
          media_type: "text/plain",
        }],
      },
    }, "Question", "dentist");
    expect(mapped.citationSources[0].mediaType).toBe("text/plain");
    expect(mapped.citationSources[0].pdfUrl).toBeUndefined();
    expect(mapped.citationSources[0].fileUrl).toContain("/registry/sources/source-1/file");
    expect(mapped.citationSources[0].currentAccess).toMatchObject({
      preview: "full",
      original: "open",
    });
  });

  it("keeps publisher-only citations metadata-only", () => {
    const mapped = mapBackendChatResult({
      ...chatResult,
      answer: {
        ...chatResult.answer,
        citations: [{
          ...chatResult.answer.citations[0],
          capabilities: {
            can_retrieve: true,
            can_preview: false,
            can_open_original: false,
            requires_entitlement: false,
          },
          preview_state: "citation_only",
          source_access_action: "open_publisher",
          source_access_url: "https://publisher.example/guideline",
          media_type: "application/pdf",
        }],
      },
    }, "Question", "dentist");
    expect(mapped.citationSources[0].currentAccess).toMatchObject({
      scenario: "citation-only",
      preview: "metadata-only",
      original: "open",
    });
    expect(mapped.citationSources[0].pdfUrl).toBeUndefined();
    expect(mapped.citationSources[0].publisherUrl).toBe("https://publisher.example/guideline");
  });
});
