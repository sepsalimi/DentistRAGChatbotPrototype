// Isolates the live backend contract, registry mapping, request scope, and multipart upload.
import type {
  AIUsageRights,
  DemoAnswer,
  EvidenceSource,
  HostingPermission,
  IngestionStatus,
  Persona,
  SourceAccess,
  AccessType,
} from "./types";

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
export const PATIENT_CONTEXT_ID = "patient-maya";

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

export interface BackendRegistrySource {
  id: string;
  tenant_id: string;
  title: string;
  media_type: string;
  original_filename: string;
  access_type: AccessType;
  ai_usage_rights: AIUsageRights;
  hosting_permission: HostingPermission;
  passage_storage_permitted: boolean;
  required_entitlement: string | null;
  allowed_roles: Persona[];
  patient_context_id: string | null;
  publisher: string | null;
  document_identity: string;
  edition: string | null;
  publication_date: string | null;
  effective_date: string | null;
  applicability: string | null;
  source_uri: string | null;
  supersedes_source_id: string | null;
  superseded_by_source_id: string | null;
  status: IngestionStatus;
  created_by: string;
  created_at: string;
}

export interface BackendRegistryCapabilities {
  can_retrieve_passages: boolean;
  can_preview: boolean;
  can_open_original: boolean;
  can_open_publisher: boolean;
  requires_entitlement: boolean;
  reason: string;
  preview_url: string | null;
  original_url: string | null;
  publisher_url: string | null;
}

export interface BackendRegistrySourceView {
  source: BackendRegistrySource;
  capabilities: BackendRegistryCapabilities;
}

export interface BackendRegistryPreview {
  source_id: string;
  state: "available" | "citation_only";
  text: string | null;
}

export interface BackendCitation {
  id: string;
  document_id: string;
  title: string;
  published_at: string | null;
  source_uri: string | null;
  preview_state: BackendPreviewState;
  access_policy: BackendAccessPolicy | null;
  capabilities: BackendCapabilities;
  passage_id: string | null;
  publisher: string | null;
  document_identity: string | null;
  edition: string | null;
  effective_date: string | null;
  page_number: number | null;
  section: string | null;
  exact_quote: string | null;
  start_offset: number | null;
  end_offset: number | null;
  pdf_bbox: number[] | null;
  access_type: AccessType | null;
  source_access_action: string | null;
  source_access_url: string | null;
  media_type?: string | null;
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
    registry_candidate_source_ids: string[];
    registry_candidate_passage_ids: string[];
    registry_authorized_passage_ids: string[];
    registry_ranked_passage_ids: string[];
    registry_exclusion_reasons: Record<string, string>;
  };
}

export interface BackendIngestionResult {
  source: BackendRegistrySource;
  passage_count: number;
  original_stored: boolean;
}

export class ApiError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = "ApiError";
  }
}

const backendUserIds: Record<Persona, string> = {
  student: "user-student",
  dentist: "user-dentist",
  hygienist: "user-hygienist",
  reception: "user-reception",
};

export const personaToUserId = (persona: Persona) => backendUserIds[persona];

const withApiPrefix = (url: string | null | undefined) => {
  if (!url) return undefined;
  if (/^https?:\/\//.test(url)) return url;
  return `${API_URL}${url.startsWith("/") ? url : `/${url}`}`;
};

const scopedQuery = (persona: Persona, patientContextId?: string) => {
  const query = new URLSearchParams({ user_id: personaToUserId(persona) });
  if (patientContextId) query.set("patient_context_id", patientContextId);
  return query.toString();
};

const request = async (
  path: string,
  init?: RequestInit,
  fetcher: typeof fetch = fetch,
) => {
  const response = await fetcher(`${API_URL}${path}`, init);
  if (!response.ok) {
    const detail = await response.text();
    throw new ApiError(detail || `Backend request failed with status ${response.status}`, response.status);
  }
  return response;
};

export const mapBackendAccess = (
  accessPolicy: BackendAccessPolicy | null,
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
      original: capabilities.can_open_original ? "open" : "blocked-license",
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
  if (accessPolicy === "entitlement_controlled" || accessPolicy === "patient_restricted") {
    return {
      scenario: "entitled",
      retrieved: true,
      preview: capabilities.can_preview ? "full" : "metadata-only",
      original: capabilities.can_open_original ? "open" : "blocked-entitlement",
      entitlement: "entitled",
    };
  }
  return {
    scenario: "public",
    retrieved: true,
    preview: capabilities.can_preview ? "full" : "metadata-only",
    original: capabilities.can_open_original ? "open" : "hidden",
    entitlement: "not-required",
  };
};

const mapRegistryAccess = (
  view: BackendRegistrySourceView,
): SourceAccess => {
  const { source, capabilities } = view;
  if (capabilities.requires_entitlement) {
    return {
      scenario: "entitled",
      retrieved: false,
      preview: "none",
      original: "blocked-entitlement",
      entitlement: "not-entitled",
    };
  }
  if (!capabilities.can_retrieve_passages) {
    return {
      scenario: source.ai_usage_rights === "approved" ? "excluded" : "citation-only",
      retrieved: false,
      preview: "metadata-only",
      original: capabilities.can_open_publisher ? "open" : "hidden",
      entitlement: "not-applicable",
    };
  }
  return {
    scenario: source.access_type === "licensed" ? "licensed-preview" : source.access_type === "public" ? "public" : "entitled",
    retrieved: true,
    preview: capabilities.can_preview ? "full" : "metadata-only",
    original: capabilities.can_open_original ? "open" : capabilities.can_open_publisher ? "open" : "hidden",
    entitlement: source.required_entitlement ? "entitled" : "not-required",
  };
};

export const mapRegistrySource = (
  view: BackendRegistrySourceView,
  persona: Persona,
  patientContextId?: string,
): EvidenceSource => {
  const { source, capabilities } = view;
  const policy = mapRegistryAccess(view);
  const query = scopedQuery(persona, patientContextId);
  const fileUrl = capabilities.original_url
    ? `${withApiPrefix(capabilities.original_url)}?${query}`
    : undefined;
  const previewUrl = capabilities.preview_url
    ? `${withApiPrefix(capabilities.preview_url)}?${query}`
    : undefined;
  const publisherUrl = capabilities.publisher_url ?? source.source_uri ?? undefined;
  const sourceAction = capabilities.can_open_original
    ? "Open authorized file"
    : capabilities.can_open_publisher
      ? "Open publisher source"
      : capabilities.requires_entitlement
        ? "Request entitlement"
        : capabilities.reason.replaceAll("_", " ");
  return {
    id: source.id,
    title: source.title,
    origin: "Source Registry",
    kind: source.media_type === "application/pdf" ? "PDF source" : "Text source",
    publisher: source.publisher ?? "Publisher not supplied",
    authors: [],
    edition: source.edition ?? "Edition not supplied",
    publicationDate: source.publication_date ?? "Not supplied",
    identifier: source.document_identity,
    jurisdiction: source.applicability ?? "Not supplied",
    updatedAt: source.created_at,
    recency: source.effective_date ? `Effective ${source.effective_date}` : `Registered ${source.created_at}`,
    access: { [persona]: policy },
    currentAccess: policy,
    currentPersona: persona,
    originalUrl: capabilities.can_open_original ? fileUrl : publisherUrl,
    pdfUrl: source.media_type === "application/pdf" && capabilities.can_open_original ? fileUrl : undefined,
    excerpt: "",
    fullText: "",
    exactPassage: "",
    section: "No passage selected",
    page: "Registry metadata",
    tags: [source.access_type, source.ai_usage_rights, source.status],
    rights: {
      holder: source.publisher ?? "Not supplied",
      license: source.ai_usage_rights,
      allowedUse: capabilities.reason,
      hosting: source.hosting_permission === "permitted"
        ? "practice-hosted"
        : source.source_uri ? "publisher-link" : "metadata-only",
      retention: source.passage_storage_permitted ? "Passage storage permitted" : "No passage storage permission",
    },
    accessType: source.access_type,
    aiUsageRights: source.ai_usage_rights,
    hostingPermission: source.hosting_permission,
    passageStoragePermitted: source.passage_storage_permitted,
    passageStatus: source.status,
    requiredEntitlement: source.required_entitlement ?? undefined,
    allowedRoles: source.allowed_roles,
    patientContextId: source.patient_context_id ?? undefined,
    effectiveDate: source.effective_date ?? undefined,
    applicability: source.applicability ?? undefined,
    supersedesSourceId: source.supersedes_source_id ?? undefined,
    supersededBySourceId: source.superseded_by_source_id ?? undefined,
    capabilityReason: capabilities.reason,
    sourceAccessAction: sourceAction,
    sourceAccessUrl: capabilities.can_open_original ? fileUrl : publisherUrl,
    previewUrl,
    fileUrl,
    publisherUrl,
    mediaType: source.media_type,
    originalFilename: source.original_filename,
    createdAt: source.created_at,
    registry: {
      status: source.status,
      owner: source.created_by,
      lastSync: source.created_at,
      recordCount: source.status === "metadata_only" ? "Metadata only" : "Approved passages available",
    },
    live: true,
  };
};

export const mapBackendSource = (
  source: BackendSourceAccess,
  persona: Persona = "dentist",
): EvidenceSource => {
  const policy = mapBackendAccess(source.access_policy, source.permission.capabilities);
  return {
    id: source.document_id,
    title: source.title ?? (policy.scenario === "entitled" ? "Entitlement-controlled source" : "Restricted source excluded"),
    origin: "Legacy source",
    kind: source.kind.replaceAll("_", " "),
    publisher: "Publisher not supplied",
    authors: [],
    edition: "Edition not supplied",
    publicationDate: source.published_at,
    identifier: source.document_id,
    jurisdiction: "Not supplied",
    updatedAt: source.published_at,
    recency: `Published ${source.published_at}`,
    access: { [persona]: policy },
    currentAccess: policy,
    currentPersona: persona,
    originalUrl: source.source_uri ?? undefined,
    excerpt: "",
    fullText: "",
    exactPassage: "",
    section: "Authorized preview",
    page: "Page not supplied",
    tags: [source.access_policy],
    rights: {
      holder: "Not supplied",
      license: source.access_policy,
      allowedUse: source.permission.reason,
      hosting: source.source_uri ? "publisher-link" : "metadata-only",
      retention: "Legacy backend policy",
    },
    capabilityReason: source.permission.reason,
    registry: {
      status: "ready",
      owner: "Legacy repository",
      lastSync: source.published_at,
      recordCount: "Legacy document",
    },
    live: true,
  };
};

const mapRegistryCitationAccess = (citation: BackendCitation): SourceAccess => {
  if (citation.capabilities.requires_entitlement) {
    return {
      scenario: "entitled",
      retrieved: false,
      preview: "none",
      original: "blocked-entitlement",
      entitlement: "not-entitled",
    };
  }
  if (!citation.capabilities.can_retrieve) {
    return {
      scenario: "excluded",
      retrieved: false,
      preview: "none",
      original: "hidden",
      entitlement: "not-applicable",
    };
  }
  if (
    citation.source_access_action === "open_publisher"
    || citation.source_access_action === "citation_only"
  ) {
    return {
      scenario: "citation-only",
      retrieved: true,
      preview: "metadata-only",
      original: citation.source_access_action === "open_publisher" ? "open" : "hidden",
      entitlement: "not-applicable",
    };
  }
  if (citation.access_type === "licensed" || citation.access_type === "restricted") {
    return {
      scenario: "entitled",
      retrieved: true,
      preview: "full",
      original: "open",
      entitlement: "entitled",
    };
  }
  if (citation.access_type === "internal" || citation.access_type === "user_provided") {
    return {
      scenario: "licensed-preview",
      retrieved: true,
      preview: "full",
      original: "open",
      entitlement: "not-required",
    };
  }
  return {
    scenario: "public",
    retrieved: true,
    preview: "full",
    original: "open",
    entitlement: "not-required",
  };
};

const sourceFromCitation = (
  citation: BackendCitation,
  persona: Persona,
  patientContextId?: string,
): EvidenceSource => {
  const isRegistryCitation = Boolean(citation.passage_id);
  const policy = isRegistryCitation
    ? mapRegistryCitationAccess(citation)
    : mapBackendAccess(citation.access_policy, citation.capabilities);
  const internalFileUrl = isRegistryCitation && citation.source_access_action === "open_original"
    ? `${API_URL}/registry/sources/${encodeURIComponent(citation.document_id)}/file?${scopedQuery(persona, patientContextId)}`
    : undefined;
  const actionUrl = internalFileUrl ?? withApiPrefix(citation.source_access_url) ?? citation.source_uri ?? undefined;
  const mediaType = citation.media_type ?? undefined;
  return {
    id: citation.document_id,
    title: citation.title,
    origin: isRegistryCitation ? "Source Registry citation" : "Legacy citation",
    kind: citation.access_type ? `${citation.access_type.replaceAll("_", " ")} source` : "Evidence source",
    publisher: citation.publisher ?? "Publisher not supplied",
    authors: [],
    edition: citation.edition ?? "Edition not supplied",
    publicationDate: citation.published_at ?? "Not supplied",
    identifier: citation.document_identity ?? citation.document_id,
    jurisdiction: "Not supplied",
    updatedAt: citation.effective_date ?? citation.published_at ?? "Not supplied",
    recency: citation.effective_date ? `Effective ${citation.effective_date}` : `Published ${citation.published_at ?? "date unavailable"}`,
    access: { [persona]: policy },
    currentAccess: policy,
    currentPersona: persona,
    originalUrl: actionUrl,
    pdfUrl: mediaType === "application/pdf" ? internalFileUrl : undefined,
    pdfPage: citation.page_number ?? undefined,
    pdfBBox: citation.pdf_bbox ?? undefined,
    startOffset: citation.start_offset ?? undefined,
    endOffset: citation.end_offset ?? undefined,
    excerpt: citation.exact_quote ?? "",
    fullText: "",
    exactPassage: citation.exact_quote ?? "",
    section: citation.section ?? "Section not supplied",
    page: citation.page_number ? `Page ${citation.page_number}` : "Page not supplied",
    tags: [citation.access_type ?? citation.preview_state, citation.passage_id ? "passage citation" : "legacy citation"],
    rights: {
      holder: citation.publisher ?? "Not supplied",
      license: citation.access_type ?? citation.access_policy ?? "Not supplied",
      allowedUse: citation.source_access_action ?? "Citation only",
      hosting: citation.source_access_action === "open_original"
        ? "practice-hosted"
        : citation.source_access_url ? "publisher-link" : "metadata-only",
      retention: citation.passage_id ? "Registered passage policy" : "Legacy backend policy",
    },
    accessType: citation.access_type ?? undefined,
    effectiveDate: citation.effective_date ?? undefined,
    sourceAccessAction: citation.source_access_action ?? undefined,
    sourceAccessUrl: actionUrl,
    fileUrl: internalFileUrl,
    publisherUrl: citation.source_access_action === "open_publisher" ? actionUrl : undefined,
    mediaType,
    passageStatus: citation.passage_id ? "passages_stored" : undefined,
    registry: {
      status: citation.passage_id ? "passages_stored" : "ready",
      owner: "Backend registry",
      lastSync: citation.effective_date ?? citation.published_at ?? "Not supplied",
      recordCount: citation.passage_id ?? "Legacy document",
    },
    live: true,
  };
};

export const applyBackendPreview = (
  source: EvidenceSource,
  preview: BackendPreviewResponse,
): EvidenceSource => {
  const canRetainText = preview.state === "available" && preview.permission?.capabilities.can_preview === true;
  return {
    ...source,
    title: preview.title ?? source.title,
    excerpt: canRetainText ? preview.text ?? "" : "",
    fullText: canRetainText ? preview.text ?? "" : "",
  };
};

export const applyRegistryPreview = (
  source: EvidenceSource,
  preview: BackendRegistryPreview,
): EvidenceSource => ({
  ...source,
  fullText: preview.state === "available" ? preview.text ?? "" : "",
});

export const mapBackendChatResult = (
  result: BackendChatResult,
  question: string,
  persona: Persona = "dentist",
  patientContextId?: string,
): { answer: DemoAnswer; citationSources: EvidenceSource[] } => {
  const citationsById = new Map(result.answer.citations.map((citation) => [citation.id, citation]));
  const citationSources = result.answer.citations.map((citation) => sourceFromCitation(citation, persona, patientContextId));
  const sourceIdForCitation = (citationId: string) => citationsById.get(citationId)?.document_id ?? citationId;
  const registryTrace = {
    candidateSourceIds: result.trace.registry_candidate_source_ids,
    candidatePassageIds: result.trace.registry_candidate_passage_ids,
    authorizedPassageIds: result.trace.registry_authorized_passage_ids,
    rankedPassageIds: result.trace.registry_ranked_passage_ids,
    exclusionReasons: result.trace.registry_exclusion_reasons,
  };
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
        passageId: citation.passage_id ?? undefined,
        publisher: citation.publisher ?? undefined,
        documentIdentity: citation.document_identity ?? undefined,
        edition: citation.edition ?? undefined,
        effectiveDate: citation.effective_date ?? undefined,
        pageNumber: citation.page_number ?? undefined,
        section: citation.section ?? undefined,
        exactQuote: citation.exact_quote ?? undefined,
        startOffset: citation.start_offset ?? undefined,
        endOffset: citation.end_offset ?? undefined,
        pdfBBox: citation.pdf_bbox ?? undefined,
        accessType: citation.access_type ?? undefined,
        sourceAccessAction: citation.source_access_action ?? undefined,
        sourceAccessUrl: citation.source_access_url ?? undefined,
      })),
      claims: result.answer.claims.map((claim) => ({
        claim: claim.text,
        sourceIds: claim.citation_ids.map(sourceIdForCitation),
        strength: claim.citation_ids.length > 1 ? "strong" : claim.citation_ids.length === 1 ? "moderate" : "limited",
        recency: claim.citation_ids
          .map((id) => citationsById.get(id)?.effective_date ?? citationsById.get(id)?.published_at)
          .filter((date): date is string => Boolean(date))
          .join(", ") || "No supporting source date",
        flag: claim.citation_ids.length === 0 ? "unsupported" : undefined,
      })),
      evidenceTrace: [
        { stage: "scope", detail: `Applied ${persona} role${patientContextId ? ` and ${patientContextId}` : ""}`, result: personaToUserId(persona) },
        { stage: "access", detail: `Authorized registry passages: ${registryTrace.authorizedPassageIds.join(", ") || "none"}`, result: `${registryTrace.authorizedPassageIds.length} authorized` },
        { stage: "retrieve", detail: `Candidate passages: ${registryTrace.candidatePassageIds.join(", ") || "none"}`, result: `${registryTrace.candidateSourceIds.length} sources` },
        { stage: "rank", detail: `Ranked passages: ${registryTrace.rankedPassageIds.join(", ") || "none"}`, result: result.trace.mode },
        { stage: "compose", detail: "Mapped exact quotes and locations to claims", result: `${result.answer.citations.length} citations` },
      ],
      disagreements: result.answer.disagreements.map((item) => ({
        topic: item.topic,
        explanation: item.explanation,
        preferredSourceId: sourceIdForCitation(item.preferred_citation_id),
        conflictingSourceId: sourceIdForCitation(item.conflicting_citation_id),
      })),
      retrievalMode: result.trace.mode,
      backend: true,
      registryTrace,
    },
    citationSources,
  };
};

export const fetchRegistrySources = async (
  persona: Persona,
  patientContextId?: string,
  fetcher?: typeof fetch,
) => {
  const response = await request(`/registry/sources?${scopedQuery(persona, patientContextId)}`, undefined, fetcher);
  const views = (await response.json()) as BackendRegistrySourceView[];
  return views.map((view) => mapRegistrySource(view, persona, patientContextId));
};

export const fetchRegistryPreview = async (
  sourceId: string,
  persona: Persona,
  patientContextId?: string,
  fetcher?: typeof fetch,
) => {
  const response = await request(
    `/registry/sources/${encodeURIComponent(sourceId)}/preview?${scopedQuery(persona, patientContextId)}`,
    undefined,
    fetcher,
  );
  return (await response.json()) as BackendRegistryPreview;
};

export const fetchRegistryTextFile = async (
  sourceId: string,
  persona: Persona,
  patientContextId?: string,
  fetcher?: typeof fetch,
) => {
  const response = await request(
    `/registry/sources/${encodeURIComponent(sourceId)}/file?${scopedQuery(persona, patientContextId)}`,
    undefined,
    fetcher,
  );
  return response.text();
};

export const fetchDocumentPreview = async (
  documentId: string,
  persona: Persona,
  fetcher?: typeof fetch,
) => {
  const response = await request(
    `/documents/${encodeURIComponent(documentId)}/preview?user_id=${encodeURIComponent(personaToUserId(persona))}`,
    undefined,
    fetcher,
  );
  return (await response.json()) as BackendPreviewResponse;
};

export const uploadRegistrySource = async (
  formData: FormData,
  fetcher?: typeof fetch,
) => {
  const response = await request(
    "/registry/sources/upload",
    { method: "POST", body: formData },
    fetcher,
  );
  return (await response.json()) as BackendIngestionResult;
};

export const streamChat = async (
  question: string,
  persona: Persona,
  patientContextId: string | undefined,
  onToken: (text: string) => void,
  fetcher?: typeof fetch,
) => {
  const body: { user_id: string; question: string; patient_context_id?: string } = {
    user_id: personaToUserId(persona),
    question,
  };
  if (patientContextId) body.patient_context_id = patientContextId;
  const response = await request(
    "/chat/stream",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
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
    const data = lines.filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart()).join("\n");
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
