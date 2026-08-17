// Verifies persona mapping, backend capability mapping, and explicit failures.
import { describe, expect, it, vi } from "vitest";
import {
  ApiError,
  applyBackendPreview,
  mapBackendSource,
  personaToUserId,
  streamChat,
  type BackendChatResult,
  type BackendSourceAccess,
} from "./api";

const sourceFixture: BackendSourceAccess = {
  document_id: "doc-citation-only",
  title: "Citation source",
  kind: "citation_only",
  access_policy: "citation_only",
  published_at: "2026-01-02",
  preview_state: "citation_only",
  source_uri: null,
  permission: {
    tenant_id: "tenant-demo",
    user_id: "user-front-desk",
    document_id: "doc-citation-only",
    policy_version: "demo-v1",
    capabilities: {
      can_retrieve: true,
      can_preview: false,
      can_open_original: false,
      requires_entitlement: false,
    },
    reason: "citation_only",
  },
};

describe("backend API mapping", () => {
  it("maps personas to the backend demo user IDs", () => {
    expect(personaToUserId("dentist")).toBe("user-dentist");
    expect(personaToUserId("frontDesk")).toBe("user-front-desk");
  });

  it("maps snake_case capabilities without retaining denied text", () => {
    const source = mapBackendSource(sourceFixture);
    const updated = applyBackendPreview(source, {
      document_id: source.id,
      state: "denied",
      permission: null,
      title: null,
      text: "restricted text must not be retained",
    });

    expect(source.access.frontDesk).toMatchObject({
      scenario: "citation-only",
      preview: "metadata-only",
      original: "hidden",
    });
    expect(updated.excerpt).toBe("");
  });

  it("keeps missing entitlement distinct from exclusion", () => {
    const source = mapBackendSource({
      ...sourceFixture,
      document_id: "doc-entitled",
      title: null,
      access_policy: "entitlement_controlled",
      preview_state: "entitlement_required",
      permission: {
        ...sourceFixture.permission,
        document_id: "doc-entitled",
        capabilities: {
          can_retrieve: false,
          can_preview: false,
          can_open_original: false,
          requires_entitlement: true,
        },
      },
    });

    expect(source.title).toBe("Entitlement-controlled source");
    expect(source.access.dentist).toMatchObject({
      scenario: "entitled",
      retrieved: false,
      entitlement: "not-entitled",
      original: "blocked-entitlement",
    });
  });

  it("surfaces backend errors and sends the selected persona", async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(JSON.parse(String(init?.body))).toMatchObject({
        user_id: "user-front-desk",
        question: "A live question",
      });
      return new Response("backend unavailable", { status: 503 });
    }) as unknown as typeof fetch;

    await expect(
      streamChat("A live question", "frontDesk", vi.fn(), fetcher),
    ).rejects.toEqual(new ApiError("backend unavailable", 503));
  });

  it("emits streamed tokens and returns the final grounded result", async () => {
    const finalResult: BackendChatResult = {
      answer: {
        text: "Grounded answer",
        claims: [],
        citations: [],
        disagreements: [],
        deterministic: true,
        policy_version: "demo-v1",
      },
      trace: {
        candidate_metadata_ids: ["doc-1"],
        authorized_document_ids: ["doc-1"],
        ranked_document_ids: ["doc-1"],
        mode: "offline",
      },
    };
    const body = [
      `event: token\ndata: ${JSON.stringify({ text: "Grounded " })}`,
      `event: token\ndata: ${JSON.stringify({ text: "answer" })}`,
      `event: final\ndata: ${JSON.stringify(finalResult)}`,
      "",
    ].join("\n\n");
    const fetcher = vi.fn(async () => new Response(body, { status: 200 })) as unknown as typeof fetch;
    const tokens: string[] = [];

    const result = await streamChat(
      "Question",
      "dentist",
      (token) => tokens.push(token),
      fetcher,
    );

    expect(tokens.join("")).toBe("Grounded answer");
    expect(result).toEqual(finalResult);
  });
});
