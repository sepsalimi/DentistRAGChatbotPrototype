// Defines shared contracts for evidence, five access scenarios, and demo content.
export type Persona = "dentist" | "frontDesk";
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
  updatedAt: string;
  recency: string;
  access: Record<Persona, SourceAccess>;
  originalUrl?: string;
  excerpt: string;
  section: string;
  tags: string[];
  live?: boolean;
}

export interface Citation {
  sourceId: string;
  label: string;
}

export interface ClaimEvidence {
  claim: string;
  sourceIds: string[];
  strength: SupportStrength;
  recency: string;
  flag?: "conflict" | "unsupported";
  note?: string;
}

export interface DemoAnswer {
  id: string;
  prompt: string;
  shortPrompt: string;
  persona: Persona;
  answer: string[];
  citations: Citation[];
  claims: ClaimEvidence[];
  researchSteps: string[];
  disagreements?: AnswerDisagreement[];
  retrievalMode?: string;
  backend?: boolean;
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
