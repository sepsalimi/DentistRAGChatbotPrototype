// Defines shared contracts for backend-aligned roles, registry sources, citations, and rights.
export type Persona = "student" | "dentist" | "hygienist" | "reception";
export type AccessType = "public" | "internal" | "licensed" | "restricted" | "user_provided";
export type AIUsageRights = "approved" | "unknown" | "prohibited";
export type HostingPermission = "permitted" | "not_permitted";
export type IngestionStatus =
  | "metadata_only"
  | "passages_stored"
  | "original_and_passages_stored";
export type AccessScenario =
  | "public"
  | "licensed-preview"
  | "citation-only"
  | "entitled"
  | "excluded";
export type PreviewBehavior = "full" | "watermarked" | "metadata-only" | "none";
export type OriginalBehavior =
  | "open"
  | "blocked-license"
  | "blocked-entitlement"
  | "hidden";
export type EntitlementState =
  | "not-required"
  | "entitled"
  | "not-entitled"
  | "not-applicable";
export type SupportStrength = "strong" | "moderate" | "limited";
export type ConnectorStatus = "connected" | "needs-attention" | "demo";
export type RegistryStatus =
  | "ready"
  | "indexing"
  | "review-needed"
  | "blocked"
  | IngestionStatus;
export type HostingMode = "practice-hosted" | "publisher-link" | "metadata-only";

export interface SourceAccess {
  scenario: AccessScenario;
  retrieved: boolean;
  preview: PreviewBehavior;
  original: OriginalBehavior;
  entitlement: EntitlementState;
}

export interface PatientContext {
  id: string;
  name: string;
  age: number;
  pronouns: string;
  allergies: string[];
  medications: string[];
  conditions: string[];
  lastVisit: string;
}

export interface EvidenceSource {
  id: string;
  title: string;
  origin: string;
  kind: string;
  publisher: string;
  authors: string[];
  edition: string;
  publicationDate: string;
  identifier: string;
  jurisdiction: string;
  updatedAt: string;
  recency: string;
  access: Partial<Record<Persona, SourceAccess>>;
  currentAccess: SourceAccess;
  currentPersona?: Persona;
  originalUrl?: string;
  pdfUrl?: string;
  pdfPage?: number;
  pdfBBox?: number[];
  startOffset?: number;
  endOffset?: number;
  excerpt: string;
  fullText: string;
  exactPassage: string;
  section: string;
  page: string;
  tags: string[];
  rights: {
    holder: string;
    license: string;
    allowedUse: string;
    hosting: HostingMode;
    retention: string;
  };
  accessType?: AccessType;
  aiUsageRights?: AIUsageRights;
  hostingPermission?: HostingPermission;
  passageStoragePermitted?: boolean;
  passageStatus?: IngestionStatus;
  requiredEntitlement?: string;
  allowedRoles?: Persona[];
  patientContextId?: string;
  effectiveDate?: string;
  applicability?: string;
  supersedesSourceId?: string;
  supersededBySourceId?: string;
  capabilityReason?: string;
  sourceAccessAction?: string;
  sourceAccessUrl?: string;
  previewUrl?: string;
  fileUrl?: string;
  publisherUrl?: string;
  mediaType?: string;
  originalFilename?: string;
  createdAt?: string;
  registry: {
    status: RegistryStatus;
    owner: string;
    lastSync: string;
    recordCount: string;
  };
  live?: boolean;
}

export interface Citation {
  sourceId: string;
  label: string;
  passageId?: string;
  publisher?: string;
  documentIdentity?: string;
  edition?: string;
  effectiveDate?: string;
  pageNumber?: number;
  section?: string;
  exactQuote?: string;
  startOffset?: number;
  endOffset?: number;
  pdfBBox?: number[];
  accessType?: AccessType;
  sourceAccessAction?: string;
  sourceAccessUrl?: string;
}

export interface ClaimEvidence {
  claim: string;
  sourceIds: string[];
  strength: SupportStrength;
  recency: string;
  flag?: "conflict" | "unsupported";
  note?: string;
}

export interface EvidenceTraceStep {
  stage: "scope" | "access" | "retrieve" | "rank" | "compose";
  detail: string;
  result: string;
}

export interface DemoAnswer {
  id: string;
  prompt: string;
  shortPrompt: string;
  persona: Persona;
  answer: string[];
  citations: Citation[];
  claims: ClaimEvidence[];
  evidenceTrace: EvidenceTraceStep[];
  disagreements?: AnswerDisagreement[];
  retrievalMode?: string;
  backend?: boolean;
  registryTrace?: {
    candidateSourceIds: string[];
    candidatePassageIds: string[];
    authorizedPassageIds: string[];
    rankedPassageIds: string[];
    exclusionReasons: Record<string, string>;
  };
}

export interface AnswerDisagreement {
  topic: string;
  explanation: string;
  preferredSourceId: string;
  conflictingSourceId: string;
}

export interface Connector {
  id: string;
  name: string;
  description: string;
  status: ConnectorStatus;
  lastSync: string;
  accessSummary: string;
  recordCount: string;
}

export interface AuditEvent {
  id: string;
  action: string;
  actor: string;
  target: string;
  time: string;
  detail: string;
  outcome: "allowed" | "filtered" | "completed";
}
