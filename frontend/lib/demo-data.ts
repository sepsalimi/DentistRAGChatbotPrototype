// Supplies deterministic answers and all five source-access scenarios for the showcase.
import type {
  AuditEvent,
  Connector,
  DemoAnswer,
  EvidenceSource,
  PatientContext,
  Persona,
  SourceAccess,
} from "./types";

const access = {
  public: {
    scenario: "public",
    retrieved: true,
    preview: "full",
    original: "open",
    entitlement: "not-required",
  },
  licensedPreview: {
    scenario: "licensed-preview",
    retrieved: true,
    preview: "watermarked",
    original: "blocked-license",
    entitlement: "not-required",
  },
  citationOnly: {
    scenario: "citation-only",
    retrieved: true,
    preview: "metadata-only",
    original: "hidden",
    entitlement: "not-applicable",
  },
  entitled: {
    scenario: "entitled",
    retrieved: true,
    preview: "full",
    original: "open",
    entitlement: "entitled",
  },
  locked: {
    scenario: "entitled",
    retrieved: false,
    preview: "none",
    original: "blocked-entitlement",
    entitlement: "not-entitled",
  },
  excluded: {
    scenario: "excluded",
    retrieved: false,
    preview: "none",
    original: "hidden",
    entitlement: "not-applicable",
  },
} satisfies Record<string, SourceAccess>;

export const patient: PatientContext = {
  id: "PT-1042",
  name: "Maya Chen",
  age: 42,
  pronouns: "she/her",
  allergies: ["Penicillin"],
  medications: ["Lisinopril 10 mg"],
  conditions: ["Hypertension", "Stage II periodontitis"],
  lastVisit: "July 28, 2026",
};

export const sources: EvidenceSource[] = [
  {
    id: "ada-periodontal",
    title: "ADA Clinical Practice Guideline: Nonsurgical Periodontal Treatment",
    origin: "SharePoint",
    kind: "Clinical guideline",
    updatedAt: "May 14, 2025",
    recency: "15 months old",
    access: { dentist: access.public, frontDesk: access.public },
    originalUrl: "https://www.ada.org/resources/ada-library/oral-health-topics/periodontitis",
    excerpt: "For adults with periodontitis, scaling and root planing is recommended as the initial nonsurgical treatment. Re-evaluate periodontal response after the healing interval and reinforce home care.",
    section: "Recommendations 2–3",
    tags: ["Periodontics", "ADA", "Clinical"],
  },
  {
    id: "patient-chart",
    title: "Maya Chen — Clinical chart and periodontal measurements",
    origin: "Open Dental",
    kind: "Patient record",
    updatedAt: "July 28, 2026",
    recency: "19 days old",
    access: { dentist: access.entitled, frontDesk: access.excluded },
    originalUrl: "https://example.com/synthetic-open-dental/patients/PT-1042",
    excerpt: "Generalized 4–5 mm probing depths with localized 6 mm sites at #3 and #14. Bleeding on probing: 38%. Radiographic horizontal bone loss is consistent with Stage II periodontitis.",
    section: "Periodontal chart — July 28, 2026",
    tags: ["Patient", "Restricted", "Clinical"],
  },
  {
    id: "practice-protocol",
    title: "Northstar Dental Periodontal Care Protocol",
    origin: "Files",
    kind: "Practice protocol",
    updatedAt: "June 2, 2026",
    recency: "2 months old",
    access: { dentist: access.licensedPreview, frontDesk: access.licensedPreview },
    excerpt: "Schedule periodontal re-evaluation 4–6 weeks after scaling and root planing. Document bleeding, pocket depth changes, plaque control, and the maintenance interval.",
    section: "Post-treatment workflow",
    tags: ["Practice", "Workflow"],
  },
  {
    id: "benefit-summary",
    title: "Delta Dental PPO — synthetic benefit summary",
    origin: "Google Drive",
    kind: "Benefit document",
    updatedAt: "January 3, 2026",
    recency: "7 months old",
    access: { dentist: access.locked, frontDesk: access.entitled },
    originalUrl: "https://example.com/synthetic-benefits/delta-dental-ppo",
    excerpt: "Periodontal scaling and root planing is subject to plan frequency and quadrant limitations. Predetermination is recommended when estimated patient responsibility exceeds $300.",
    section: "Periodontal services",
    tags: ["Benefits", "Administrative"],
  },
  {
    id: "antibiotic-note",
    title: "Antibiotic Stewardship Chairside Note",
    origin: "SharePoint",
    kind: "Clinical note",
    updatedAt: "November 8, 2023",
    recency: "2 years 9 months old",
    access: { dentist: access.entitled, frontDesk: access.citationOnly },
    originalUrl: "https://example.com/synthetic-clinical-library/antibiotic-stewardship",
    excerpt: "Systemic antibiotics are not routinely indicated as an adjunct to scaling and root planing. Use only for defined clinical indications after reviewing allergy history.",
    section: "Periodontal prescribing",
    tags: ["Medication", "Stewardship"],
  },
];

const prompts = {
  periodontal: "What is the evidence-based next step for Maya's periodontal care?",
  explain: "How should we explain the proposed treatment and timing to Maya?",
  benefits: "What should we verify before scheduling the periodontal treatment?",
};

export const demoAnswers: DemoAnswer[] = [
  {
    id: "dentist-periodontal",
    prompt: prompts.periodontal,
    shortPrompt: "Recommend the next clinical step",
    persona: "dentist",
    answer: [
      "Maya’s findings support nonsurgical periodontal therapy with scaling and root planing as the next clinical step. Her chart documents generalized 4–5 mm pockets, localized 6 mm sites, bleeding on probing, and bone loss consistent with Stage II periodontitis.",
      "Plan a periodontal re-evaluation 4–6 weeks after treatment, measuring bleeding and pocket-depth response. Reinforce plaque control. Systemic antibiotics are not routinely indicated; her penicillin allergy should remain visible if a separate clinical indication arises.",
    ],
    citations: [
      { sourceId: "ada-periodontal", label: "ADA guideline" },
      { sourceId: "patient-chart", label: "Maya’s chart" },
      { sourceId: "practice-protocol", label: "Practice protocol" },
      { sourceId: "antibiotic-note", label: "Stewardship note" },
    ],
    claims: [
      { claim: "Scaling and root planing is the appropriate initial treatment.", sourceIds: ["ada-periodontal", "patient-chart"], strength: "strong", recency: "Guideline updated 2025; chart updated 19 days ago" },
      { claim: "Re-evaluate the periodontal response in 4–6 weeks.", sourceIds: ["practice-protocol", "ada-periodontal"], strength: "strong", recency: "Practice protocol updated 2 months ago" },
      { claim: "Routine systemic antibiotics are not indicated.", sourceIds: ["antibiotic-note"], strength: "moderate", recency: "Source is nearly 3 years old", flag: "conflict", note: "The source is older than the practice’s preferred 24-month clinical window." },
    ],
    researchSteps: ["Read the current periodontal guideline", "Matched Maya’s recent chart findings", "Checked the practice follow-up protocol", "Reviewed medication and allergy constraints"],
  },
  {
    id: "frontdesk-periodontal",
    prompt: prompts.periodontal,
    shortPrompt: "Recommend the next clinical step",
    persona: "frontDesk",
    answer: [
      "The accessible guideline supports initial nonsurgical periodontal treatment followed by re-evaluation. Clinical chart details are excluded from the front desk role, so this view cannot confirm patient-specific findings.",
      "Route diagnosis and treatment questions to the treating dentist. Front desk staff can explain the follow-up workflow and coordinate benefits verification before scheduling.",
    ],
    citations: [
      { sourceId: "ada-periodontal", label: "ADA guideline" },
      { sourceId: "practice-protocol", label: "Practice protocol" },
    ],
    claims: [
      { claim: "The workflow includes treatment followed by re-evaluation.", sourceIds: ["ada-periodontal", "practice-protocol"], strength: "moderate", recency: "Sources updated in 2025–2026" },
      { claim: "Maya’s chart supports the proposed treatment.", sourceIds: [], strength: "limited", recency: "Patient record excluded", flag: "unsupported", note: "This role cannot access the chart needed to verify the patient-specific claim." },
    ],
    researchSteps: ["Found citation metadata for the guideline", "Filtered the patient chart by role", "Read accessible workflow metadata", "Prepared an administrative handoff"],
  },
  {
    id: "dentist-explain",
    prompt: prompts.explain,
    shortPrompt: "Explain treatment to the patient",
    persona: "dentist",
    answer: [
      "Explain that the goal is to remove bacterial deposits below the gumline so inflamed tissues can heal. Maya’s measurements show areas that need more than routine cleaning. Treatment is followed by a focused healing check in 4–6 weeks.",
      "Avoid promising a specific outcome. At re-evaluation, compare bleeding and pocket depths, review home care, and decide on the maintenance interval.",
    ],
    citations: [{ sourceId: "patient-chart", label: "Maya’s chart" }, { sourceId: "practice-protocol", label: "Practice protocol" }],
    claims: [
      { claim: "Maya has sites requiring periodontal rather than routine preventive care.", sourceIds: ["patient-chart"], strength: "strong", recency: "Chart updated 19 days ago" },
      { claim: "A healing check should occur in 4–6 weeks.", sourceIds: ["practice-protocol"], strength: "strong", recency: "Protocol updated 2 months ago" },
    ],
    researchSteps: ["Reviewed Maya’s periodontal measurements", "Separated facts from patient-friendly language", "Checked the approved follow-up interval"],
  },
  {
    id: "frontdesk-explain",
    prompt: prompts.explain,
    shortPrompt: "Explain treatment to the patient",
    persona: "frontDesk",
    answer: [
      "Tell Maya that the dentist recommended a deeper gum treatment and a follow-up visit to check healing. Do not describe her clinical measurements from this role because the chart is excluded.",
      "Offer to review appointment length, benefits estimates, and follow-up timing. Refer questions about diagnosis, alternatives, risks, or expected outcomes to the dentist.",
    ],
    citations: [{ sourceId: "practice-protocol", label: "Practice protocol" }],
    claims: [
      { claim: "A follow-up is normally scheduled 4–6 weeks after treatment.", sourceIds: ["practice-protocol"], strength: "moderate", recency: "Protocol updated 2 months ago" },
      { claim: "The dentist has diagnosed Stage II periodontitis.", sourceIds: [], strength: "limited", recency: "Patient record excluded", flag: "unsupported", note: "Diagnosis details are intentionally unavailable to this role." },
    ],
    researchSteps: ["Filtered clinical details by role", "Read the scheduling portion of the practice protocol", "Separated administrative guidance from clinical counseling"],
  },
  {
    id: "dentist-benefits",
    prompt: prompts.benefits,
    shortPrompt: "Check scheduling requirements",
    persona: "dentist",
    answer: [
      "A benefits source is available, but this dentist persona is not entitled to retrieve its contents. I cannot state its coverage rules or estimate patient responsibility from this view.",
      "Keep the clinical plan separate from the insurer’s coverage decision and ask the front desk benefits team to verify current coverage before scheduling.",
    ],
    citations: [],
    claims: [{ claim: "Current plan requirements need verification by an entitled role.", sourceIds: [], strength: "limited", recency: "Restricted source was not retrieved", flag: "unsupported", note: "The access policy withheld the document before retrieval, so no coverage details are used in this answer." }],
    researchSteps: ["Located the benefit document", "Applied dentist-role access controls", "Prepared a benefits-team handoff"],
  },
  {
    id: "frontdesk-benefits",
    prompt: prompts.benefits,
    shortPrompt: "Check scheduling requirements",
    persona: "frontDesk",
    answer: [
      "Verify frequency and quadrant limits for scaling and root planing, then request predetermination if estimated patient responsibility is above $300. Record that the estimate is not a guarantee of payment.",
      "The benefit summary is seven months old, so confirm current eligibility and remaining benefits before giving Maya an estimate.",
    ],
    citations: [{ sourceId: "benefit-summary", label: "Benefit summary" }],
    claims: [
      { claim: "Predetermination is recommended above $300 estimated responsibility.", sourceIds: ["benefit-summary"], strength: "strong", recency: "Benefit summary updated 7 months ago" },
      { claim: "Current eligibility still needs live verification.", sourceIds: ["benefit-summary"], strength: "moderate", recency: "Source is not real-time" },
    ],
    researchSteps: ["Opened the accessible benefit summary", "Checked frequency and quadrant guidance", "Flagged the non-real-time eligibility limitation"],
  },
];

export const connectors: Connector[] = [
  { id: "files", name: "Files", description: "Practice policies, consent templates, and chairside notes.", status: "connected", lastSync: "Today, 8:42 AM", accessSummary: "Inherited folder permissions", recordCount: "128 documents" },
  { id: "sharepoint", name: "SharePoint", description: "Clinical guidelines and shared practice protocols.", status: "connected", lastSync: "Today, 8:35 AM", accessSummary: "2 role rules active", recordCount: "346 documents" },
  { id: "drive", name: "Google Drive", description: "Benefits references and administrative resources.", status: "needs-attention", lastSync: "Yesterday, 4:10 PM", accessSummary: "1 folder needs review", recordCount: "74 documents" },
  { id: "open-dental", name: "Open Dental", description: "Synthetic clinical charts and treatment history.", status: "demo", lastSync: "Demo snapshot: July 28", accessSummary: "Clinical roles only", recordCount: "24 synthetic patients" },
  { id: "patient-context", name: "Synthetic patient context", description: "Safe fixture data used by the prototype showcase.", status: "demo", lastSync: "Bundled with app", accessSummary: "Persona-filtered fields", recordCount: "1 active patient" },
];

export const auditEvents: AuditEvent[] = [
  { id: "evt-1", action: "Answer generated", actor: "Dr. Elena Ruiz", target: "Maya Chen periodontal question", time: "Today, 9:14 AM", detail: "4 sources evaluated; 4 citations displayed.", outcome: "completed" },
  { id: "evt-2", action: "Source excluded", actor: "Access policy", target: "Maya Chen clinical chart", time: "Today, 9:09 AM", detail: "Front desk persona cannot retrieve clinical chart content.", outcome: "filtered" },
  { id: "evt-3", action: "Document opened", actor: "Jordan Lee", target: "Delta Dental PPO benefit summary", time: "Today, 9:08 AM", detail: "Full preview allowed through administrative role.", outcome: "allowed" },
  { id: "evt-4", action: "Research completed", actor: "Dr. Elena Ruiz", target: "Periodontal treatment evidence", time: "Yesterday, 3:32 PM", detail: "Bounded to 5 indexed sources; no external search.", outcome: "completed" },
];

export const getAnswer = (persona: Persona, prompt: string) =>
  demoAnswers.find((answer) => answer.persona === persona && answer.prompt === prompt) ??
  demoAnswers.find((answer) => answer.persona === persona && answer.prompt === prompts.periodontal)!;

export const showcasePrompts = Object.values(prompts);
