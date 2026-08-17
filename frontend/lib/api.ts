// Provides typed backend requests, SSE parsing, and snake_case-to-UI mapping.
import type {
  DemoAnswer,
  EvidenceSource,
  Persona,
  SourceAccess,
} from "./types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

type BackendAccessPolicy =
  | "public"
  | "licensed_internal"
  | "citation_only"
  | "entitlement_controlled"
  | "excluded"
  | "patient_restricted";
type BackendPreviewState =
  | "available"
  | "citation_only"
  | "entitlement_required"
  | "denied"
  | "not_found";

interface BackendCapabilities {
  can_retrieve: boolean;
  can_preview: boolean;
  can_open_original: boolean;
  requires_entitlement: boolean;
}

interface BackendPermission {
  tenant_id: string;
  user_id: string;
  document_id: string;
  policy_version: string;
  capabilities: BackendCapabilities;
  reason: string;
}

export interface BackendSourceAccess {
  document_id: string;
  title: string | null;
  kind: string;
  access_policy: BackendAccessPolicy;
  published_at: string;
  preview_state: BackendPreviewState;
  source_uri: string | null;
  permission: BackendPermission;
}

export interface BackendPreviewResponse {
  document_id: string;
  state: BackendPreviewState;
  permission: BackendPermission | null;
  title: string | null;
  text: string | null;
}

interface BackendCitation {
  id: string;
  document_id: string;
  title: string;
  published_at: string;
  source_uri: string | null;
  preview_state: BackendPreviewState;
  access_policy: BackendAccessPolicy;
  capabilities: BackendCapabilities;
}

interface BackendClaim {
  id: string;
  text: string;
  citation_ids: string[];
}

interface BackendDisagreement {
  topic: string;
  preferred_citation_id: string;
  conflicting_citation_id: string;
  explanation: string;
}

export interface BackendChatResult {
  answer: {
    text: string;
    claims: BackendClaim[];
    citations: BackendCitation[];
    disagreements: BackendDisagreement[];
    deterministic: boolean;
    policy_version: string;
  };
  trace: {
    candidate_metadata_ids: string[];
    authorized_document_ids: string[];
    ranked_document_ids: string[];
    mode: "offline" | "vector";
  };
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const personaToUserId = (persona: Persona) =>
  persona === "dentist" ? "user-dentist" : "user-front-desk";

const request = async (
  path: string,
  init?: RequestInit,
  fetcher: typeof fetch = fetch,
) => {
  const response = await fetcher(`${API_URL}${path}`, init);
  if (!response.ok) {
    const detail = await response.text();
    throw new ApiError(
      detail || `Backend request failed with status ${response.status}`,
      response.status,
    );
  }
  return response;
};

export const mapBackendAccess = (
  accessPolicy: BackendAccessPolicy,
  capabilities: BackendCapabilities,
): SourceAccess => {
  if (capabilities.requires_entitlement) {
    return {
      scenario: "entitled",
      retrieved: capabilities.can_retrieve,
      preview: capabilities.can_preview ? "full" : "none",
      original: capabilities.can_open_original ? "open" : "blocked-entitlement",
      entitlement: "not-entitled",
    };
  }

  if (!capabilities.can_retrieve) {
    return {
      scenario: "excluded",
      retrieved: false,
      preview: "none",
      original: "hidden",
      entitlement: "not-applicable",
    };
  }

  if (accessPolicy === "licensed_internal") {
    return {
      scenario: "licensed-preview",
      retrieved: true,
      preview: capabilities.can_preview ? "watermarked" : "none",
      original: "blocked-license",
      entitlement: "not-required",
    };
  }

  if (accessPolicy === "citation_only") {
    return {
      scenario: "citation-only",
      retrieved: true,
      preview: "metadata-only",
      original: "hidden",
      entitlement: "not-applicable",
    };
  }

  if (
    accessPolicy === "entitlement_controlled" ||
    accessPolicy === "patient_restricted"
  ) {
    return {
      scenario: "entitled",
      retrieved: true,
      preview: capabilities.can_preview ? "full" : "none",
      original: capabilities.can_open_original ? "open" : "blocked-entitlement",
      entitlement: capabilities.requires_entitlement ? "not-entitled" : "entitled",
    };
  }

  if (accessPolicy === "excluded") {
    return {
      scenario: "excluded",
      retrieved: false,
      preview: "none",
      original: "hidden",
      entitlement: "not-applicable",
    };
  }

  return {
    scenario: "public",
    retrieved: true,
    preview: capabilities.can_preview ? "full" : "none",
    original: capabilities.can_open_original ? "open" : "hidden",
    entitlement: "not-required",
  };
};

export const mapBackendSource = (source: BackendSourceAccess): EvidenceSource => {
  const policy = mapBackendAccess(
    source.access_policy,
    source.permission.capabilities,
  );
  return {
    id: source.document_id,
    title:
      source.title ??
      (policy.scenario === "entitled"
        ? "Entitlement-controlled source"
        : "Restricted source excluded"),
    origin: "Backend source",
    kind: source.kind.replaceAll("_", " "),
    updatedAt: source.published_at,
    recency: `Published ${source.published_at}`,
    access: { dentist: policy, frontDesk: policy },
    originalUrl: source.source_uri ?? undefined,
    excerpt: "",
    section: "Authorized preview",
    tags: [source.access_policy.replaceAll("_", " ")],
    live: true,
  };
};

const sourceFromCitation = (citation: BackendCitation): EvidenceSource => {
  const policy = mapBackendAccess(citation.access_policy, citation.capabilities);
  return {
    id: citation.document_id,
    title: citation.title,
    origin: "Backend citation",
    kind: citation.access_policy.replaceAll("_", " "),
    updatedAt: citation.published_at,
    recency: `Published ${citation.published_at}`,
    access: { dentist: policy, frontDesk: policy },
    originalUrl: citation.source_uri ?? undefined,
    excerpt: "",
    section: "Authorized preview",
    tags: [citation.preview_state.replaceAll("_", " ")],
    live: true,
  };
};

export const applyBackendPreview = (
  source: EvidenceSource,
  preview: BackendPreviewResponse,
): EvidenceSource => {
  const canRetainText =
    preview.state === "available" &&
    preview.permission?.capabilities.can_preview === true;
  return {
    ...source,
    title: preview.title ?? source.title,
    excerpt: canRetainText ? preview.text ?? "" : "",
  };
};

export const mapBackendChatResult = (
  result: BackendChatResult,
  question: string,
  persona: Persona = "dentist",
): { answer: DemoAnswer; citationSources: EvidenceSource[] } => {
  const citationsById = new Map(
    result.answer.citations.map((citation) => [citation.id, citation]),
  );
  const citationSources = result.answer.citations.map(sourceFromCitation);
  const sourceIdForCitation = (citationId: string) =>
    citationsById.get(citationId)?.document_id ?? citationId;

  return {
    answer: {
      id: `backend-${Date.now()}`,
      prompt: question,
      shortPrompt: question,
      persona,
      answer: [result.answer.text],
      citations: result.answer.citations.map((citation) => ({
        sourceId: citation.document_id,
        label: citation.title,
      })),
      claims: result.answer.claims.map((claim) => ({
        claim: claim.text,
        sourceIds: claim.citation_ids.map(sourceIdForCitation),
        strength: claim.citation_ids.length > 1 ? "strong" : claim.citation_ids.length === 1 ? "moderate" : "limited",
        recency: claim.citation_ids
          .map((id) => citationsById.get(id)?.published_at)
          .filter((date): date is string => Boolean(date))
          .join(", ") || "No supporting source date",
        flag: claim.citation_ids.length === 0 ? "unsupported" : undefined,
      })),
      researchSteps: [
        `Evaluated ${result.trace.candidate_metadata_ids.length} metadata candidates`,
        `Authorized ${result.trace.authorized_document_ids.length} sources before ranking`,
        `Ranked ${result.trace.ranked_document_ids.length} sources in ${result.trace.mode} mode`,
      ],
      disagreements: result.answer.disagreements.map((item) => ({
        topic: item.topic,
        explanation: item.explanation,
        preferredSourceId: sourceIdForCitation(item.preferred_citation_id),
        conflictingSourceId: sourceIdForCitation(item.conflicting_citation_id),
      })),
      retrievalMode: result.trace.mode,
      backend: true,
    },
    citationSources,
  };
};

export const fetchSources = async (
  persona: Persona,
  fetcher?: typeof fetch,
) => {
  const userId = personaToUserId(persona);
  const response = await request(
    `/sources?user_id=${encodeURIComponent(userId)}`,
    undefined,
    fetcher,
  );
  const sources = (await response.json()) as BackendSourceAccess[];
  return sources.map(mapBackendSource);
};

export const fetchDocumentPreview = async (
  documentId: string,
  persona: Persona,
  fetcher?: typeof fetch,
) => {
  const userId = personaToUserId(persona);
  const response = await request(
    `/documents/${encodeURIComponent(documentId)}/preview?user_id=${encodeURIComponent(userId)}`,
    undefined,
    fetcher,
  );
  return (await response.json()) as BackendPreviewResponse;
};

export const streamChat = async (
  question: string,
  persona: Persona,
  onToken: (text: string) => void,
  fetcher?: typeof fetch,
) => {
  const response = await request(
    "/chat/stream",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: personaToUserId(persona),
        question,
      }),
    },
    fetcher,
  );
  if (!response.body) throw new ApiError("Backend returned no response stream.");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalResult: BackendChatResult | null = null;

  const consumeFrame = (frame: string) => {
    const lines = frame.split(/\r?\n/);
    const event = lines.find((line) => line.startsWith("event:"))?.slice(6).trim();
    const data = lines
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n");
    if (!event || !data) return;
    if (event === "token") onToken((JSON.parse(data) as { text: string }).text);
    if (event === "final") finalResult = JSON.parse(data) as BackendChatResult;
  };

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const frames = buffer.split(/\r?\n\r?\n/);
    buffer = frames.pop() ?? "";
    frames.forEach(consumeFrame);
    if (done) break;
  }
  if (buffer.trim()) consumeFrame(buffer);
  if (!finalResult) throw new ApiError("Backend stream ended before the final result.");
  return finalResult;
};
