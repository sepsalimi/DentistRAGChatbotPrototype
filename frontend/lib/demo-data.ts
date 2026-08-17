// Supplies broad deterministic dental answers, source registry fixtures, and access metadata.
import type {
  AuditEvent,
  Connector,
  DemoAnswer,
  EvidenceSource,
  PatientContext,
  Persona,
  SourceAccess,
} from "./types";

const roles: Persona[] = ["student", "dentist", "hygienist", "reception"];

const publicAccess: SourceAccess = {
  scenario: "public",
  retrieved: true,
  preview: "full",
  original: "open",
  entitlement: "not-required",
};
const licensedAccess: SourceAccess = {
  scenario: "licensed-preview",
  retrieved: true,
  preview: "watermarked",
  original: "blocked-license",
  entitlement: "not-required",
};
const citationOnlyAccess: SourceAccess = {
  scenario: "citation-only",
  retrieved: true,
  preview: "metadata-only",
  original: "hidden",
  entitlement: "not-applicable",
};
const entitledAccess: SourceAccess = {
  scenario: "entitled",
  retrieved: true,
  preview: "full",
  original: "open",
  entitlement: "entitled",
};
const lockedAccess: SourceAccess = {
  scenario: "entitled",
  retrieved: false,
  preview: "none",
  original: "blocked-entitlement",
  entitlement: "not-entitled",
};
const excludedAccess: SourceAccess = {
  scenario: "excluded",
  retrieved: false,
  preview: "none",
  original: "hidden",
  entitlement: "not-applicable",
};

const allRoles = (policy: SourceAccess): Record<Persona, SourceAccess> => ({
  student: policy,
  dentist: policy,
  hygienist: policy,
  reception: policy,
});

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
    id: "iadt-trauma",
    title: "International Association of Dental Traumatology Guidelines: Avulsion",
    origin: "Publisher website",
    kind: "Clinical guideline",
    publisher: "International Association of Dental Traumatology",
    authors: ["Fouad AF", "Abbott PV", "Tsilingaridis G", "et al."],
    edition: "2020 guideline update",
    publicationDate: "2020-05-27",
    identifier: "DOI 10.1111/edt.12573",
    jurisdiction: "International",
    updatedAt: "May 27, 2020",
    recency: "Current published edition",
    access: allRoles(publicAccess),
    currentAccess: publicAccess,
    originalUrl: "https://onlinelibrary.wiley.com/doi/10.1111/edt.12573",
    excerpt: "A primary tooth should not be replanted. Management focuses on the child, the permanent successor, and prompt clinical assessment.",
    fullText: "Avulsion is one of the most serious dental injuries. Immediate management depends on whether the avulsed tooth is primary or permanent.\n\nA primary tooth should not be replanted. Management focuses on the child, the permanent successor, and prompt clinical assessment. Provide age-appropriate instructions and monitor healing.\n\nFor a permanent tooth, immediate replantation at the site of the accident is the best treatment when feasible. If this cannot be done, use an appropriate storage medium and arrange urgent dental care.",
    exactPassage: "A primary tooth should not be replanted. Management focuses on the child, the permanent successor, and prompt clinical assessment.",
    section: "2.1 Avulsed primary teeth",
    page: "Page 337",
    tags: ["Trauma", "Pediatric dentistry", "Guideline"],
    rights: {
      holder: "John Wiley & Sons and IADT",
      license: "Publisher terms; citation and external linking",
      allowedUse: "Indexed metadata and attributed passage preview",
      hosting: "publisher-link",
      retention: "Metadata retained; preview refreshed annually",
    },
    registry: {
      status: "ready",
      owner: "Clinical knowledge team",
      lastSync: "August 12, 2026",
      recordCount: "1 document · 42 passages",
    },
  },
  {
    id: "ada-prophylaxis",
    title: "Antibiotic Prophylaxis Prior to Dental Procedures",
    origin: "ADA.org",
    kind: "Clinical topic",
    publisher: "American Dental Association",
    authors: ["ADA Council on Scientific Affairs"],
    edition: "Living topic page",
    publicationDate: "2025-01-15",
    identifier: "ADA-ORAL-HEALTH-AP-2025",
    jurisdiction: "United States",
    updatedAt: "January 15, 2025",
    recency: "Updated 19 months ago",
    access: allRoles(publicAccess),
    currentAccess: publicAccess,
    originalUrl: "https://www.ada.org/resources/ada-library/oral-health-topics/antibiotic-prophylaxis",
    excerpt: "For infective endocarditis prevention, prophylaxis is reasonable only for patients with the highest-risk cardiac conditions undergoing procedures that manipulate gingival tissue or the periapical region.",
    fullText: "Clinical recommendations should be applied after reviewing the current medical history and the planned dental procedure.\n\nFor infective endocarditis prevention, prophylaxis is reasonable only for patients with the highest-risk cardiac conditions undergoing procedures that manipulate gingival tissue or the periapical region.\n\nRoutine prophylaxis is not recommended solely because a patient has a prosthetic joint. Consultation may be appropriate when the clinical situation is unclear.",
    exactPassage: "For infective endocarditis prevention, prophylaxis is reasonable only for patients with the highest-risk cardiac conditions undergoing procedures that manipulate gingival tissue or the periapical region.",
    section: "Infective endocarditis",
    page: "Web section 3",
    tags: ["Antibiotics", "Cardiology", "Stewardship"],
    rights: {
      holder: "American Dental Association",
      license: "Public web access",
      allowedUse: "Search, quotation, citation, and external open",
      hosting: "publisher-link",
      retention: "Metadata and passage cache reviewed quarterly",
    },
    registry: {
      status: "ready",
      owner: "Clinical knowledge team",
      lastSync: "Today, 8:35 AM",
      recordCount: "1 page · 18 passages",
    },
  },
  {
    id: "aapd-fluoride",
    title: "Fluoride Therapy: Best Practices",
    origin: "AAPD Reference Manual",
    kind: "Best practice",
    publisher: "American Academy of Pediatric Dentistry",
    authors: ["Council on Clinical Affairs"],
    edition: "2025–2026 Reference Manual",
    publicationDate: "2025-09-01",
    identifier: "AAPD-BP-FLUORIDE-25",
    jurisdiction: "United States",
    updatedAt: "September 1, 2025",
    recency: "Current manual",
    access: allRoles(publicAccess),
    currentAccess: publicAccess,
    originalUrl: "https://www.aapd.org/research/oral-health-policies--recommendations/fluoride-therapy/",
    excerpt: "Professionally applied fluoride treatment should be based on caries-risk assessment, with higher-risk children receiving fluoride varnish at appropriate recall intervals.",
    fullText: "Fluoride is effective in preventing and controlling dental caries when used appropriately.\n\nProfessionally applied fluoride treatment should be based on caries-risk assessment, with higher-risk children receiving fluoride varnish at appropriate recall intervals.\n\nHome-use recommendations should account for age, swallowing ability, total fluoride exposure, and individual caries risk.",
    exactPassage: "Professionally applied fluoride treatment should be based on caries-risk assessment, with higher-risk children receiving fluoride varnish at appropriate recall intervals.",
    section: "Professional topical fluoride",
    page: "Pages 352–358",
    tags: ["Prevention", "Pediatric dentistry", "Fluoride"],
    rights: {
      holder: "American Academy of Pediatric Dentistry",
      license: "Public professional guidance",
      allowedUse: "Search, attributed excerpts, citation, external open",
      hosting: "publisher-link",
      retention: "Annual edition review",
    },
    registry: {
      status: "ready",
      owner: "Preventive care lead",
      lastSync: "August 10, 2026",
      recordCount: "1 document · 31 passages",
    },
  },
  {
    id: "practice-emergency",
    title: "Northstar Dental Urgent Care and Trauma Protocol",
    origin: "Practice files",
    kind: "Practice protocol",
    publisher: "Northstar Dental",
    authors: ["Clinical governance committee"],
    edition: "Version 4.2",
    publicationDate: "2026-06-02",
    identifier: "NSD-POL-UC-042",
    jurisdiction: "Practice policy",
    updatedAt: "June 2, 2026",
    recency: "Updated 2 months ago",
    access: {
      student: citationOnlyAccess,
      dentist: licensedAccess,
      hygienist: licensedAccess,
      reception: licensedAccess,
    },
    currentAccess: licensedAccess,
    excerpt: "Avulsed primary teeth are not replanted. Reception staff should arrange same-day clinical triage, record time of injury, and avoid giving a definitive prognosis.",
    fullText: "Use the urgent-care script to establish airway safety, uncontrolled bleeding, head injury symptoms, and time of injury.\n\nAvulsed primary teeth are not replanted. Reception staff should arrange same-day clinical triage, record time of injury, and avoid giving a definitive prognosis.\n\nClinical staff document soft-tissue findings, account for the tooth, and provide written follow-up instructions.",
    exactPassage: "Avulsed primary teeth are not replanted. Reception staff should arrange same-day clinical triage, record time of injury, and avoid giving a definitive prognosis.",
    section: "Trauma triage",
    page: "Page 6",
    tags: ["Practice", "Emergency", "Workflow"],
    rights: {
      holder: "Northstar Dental",
      license: "Internal workforce license",
      allowedUse: "Internal retrieval and watermarked preview",
      hosting: "practice-hosted",
      retention: "Current version plus seven-year audit history",
    },
    registry: {
      status: "ready",
      owner: "Clinical operations",
      lastSync: "Today, 8:42 AM",
      recordCount: "1 document · 24 passages",
    },
  },
  {
    id: "cdt-reference",
    title: "CDT 2026 Dental Procedure Codes",
    origin: "Licensed reference",
    kind: "Code reference",
    publisher: "American Dental Association",
    authors: ["Code Maintenance Committee"],
    edition: "CDT 2026",
    publicationDate: "2025-09-01",
    identifier: "ISBN 978-1-68447-247-5",
    jurisdiction: "United States",
    updatedAt: "September 1, 2025",
    recency: "Current code year",
    access: allRoles(citationOnlyAccess),
    currentAccess: citationOnlyAccess,
    excerpt: "",
    fullText: "",
    exactPassage: "",
    section: "Preventive services",
    page: "Publisher lookup required",
    tags: ["Coding", "Administrative", "Licensed"],
    rights: {
      holder: "American Dental Association",
      license: "Citation-only registry entry",
      allowedUse: "Metadata and source identity only",
      hosting: "metadata-only",
      retention: "Metadata reviewed each code year",
    },
    registry: {
      status: "review-needed",
      owner: "Revenue cycle lead",
      lastSync: "July 29, 2026",
      recordCount: "Metadata only",
    },
  },
  {
    id: "benefit-handbook",
    title: "Dental Benefits Verification Handbook",
    origin: "Benefits workspace",
    kind: "Administrative handbook",
    publisher: "Northstar Dental",
    authors: ["Revenue cycle team"],
    edition: "Version 3.1",
    publicationDate: "2026-04-18",
    identifier: "NSD-RCM-BV-031",
    jurisdiction: "Practice policy",
    updatedAt: "April 18, 2026",
    recency: "Updated 4 months ago",
    access: {
      student: lockedAccess,
      dentist: lockedAccess,
      hygienist: lockedAccess,
      reception: entitledAccess,
    },
    currentAccess: lockedAccess,
    excerpt: "Before quoting an estimate, verify active eligibility, benefit period, deductible, annual maximum, frequency limits, waiting periods, and whether predetermination is recommended.",
    fullText: "Coverage information supports financial communication but does not determine clinical need.\n\nBefore quoting an estimate, verify active eligibility, benefit period, deductible, annual maximum, frequency limits, waiting periods, and whether predetermination is recommended.\n\nState that an estimate is not a guarantee of payment and document the verification date and channel.",
    exactPassage: "Before quoting an estimate, verify active eligibility, benefit period, deductible, annual maximum, frequency limits, waiting periods, and whether predetermination is recommended.",
    section: "Pre-service verification",
    page: "Page 12",
    tags: ["Benefits", "Estimate", "Scheduling"],
    rights: {
      holder: "Northstar Dental",
      license: "Revenue cycle team access",
      allowedUse: "Entitled internal retrieval and preview",
      hosting: "practice-hosted",
      retention: "Current version plus seven-year audit history",
    },
    registry: {
      status: "ready",
      owner: "Revenue cycle lead",
      lastSync: "Today, 7:55 AM",
      recordCount: "1 document · 39 passages",
    },
  },
  {
    id: "patient-chart",
    title: "Patient clinical chart",
    origin: "Practice management system",
    kind: "Patient record",
    publisher: "Northstar Dental",
    authors: ["Treating care team"],
    edition: "Current chart",
    publicationDate: "2026-07-28",
    identifier: "Withheld until patient context is enabled",
    jurisdiction: "Protected health information",
    updatedAt: "July 28, 2026",
    recency: "19 days old",
    access: {
      student: excludedAccess,
      dentist: entitledAccess,
      hygienist: entitledAccess,
      reception: excludedAccess,
    },
    currentAccess: entitledAccess,
    excerpt: "Generalized 4–5 mm probing depths with localized 6 mm sites. Bleeding on probing is documented at 38%.",
    fullText: "This synthetic chart content is available only to role-appropriate clinical users after patient context is explicitly enabled.\n\nGeneralized 4–5 mm probing depths with localized 6 mm sites. Additional clinical details remain within the entitled patient workflow.",
    exactPassage: "Generalized 4–5 mm probing depths with localized 6 mm sites.",
    section: "Periodontal chart",
    page: "Clinical record",
    tags: ["Patient", "Restricted", "Clinical"],
    rights: {
      holder: "Northstar Dental",
      license: "Treatment relationship and minimum-necessary access",
      allowedUse: "Patient-specific clinical support only",
      hosting: "practice-hosted",
      retention: "Clinical retention policy",
    },
    registry: {
      status: "blocked",
      owner: "Privacy officer",
      lastSync: "On demand",
      recordCount: "Excluded from general assistant",
    },
  },
];

const questions = {
  trauma: "What should we do when a child knocks out a primary tooth?",
  prophylaxis: "Who needs antibiotic prophylaxis before dental treatment?",
  fluoride: "How should fluoride varnish recommendations vary by caries risk?",
  estimate: "What should be checked before presenting a dental treatment estimate?",
} as const;

export const sampleQuestions = Object.values(questions);

const answerText: Record<keyof typeof questions, Record<Persona, string[]>> = {
  trauma: {
    student: [
      "Do not replant an avulsed primary tooth. First distinguish primary from permanent dentition, screen for other injuries, and arrange prompt dental assessment.",
      "For study purposes, contrast that with permanent-tooth avulsion, where immediate replantation or suitable storage can be time-critical.",
    ],
    dentist: [
      "Do not replant an avulsed primary tooth. Assess for soft-tissue injury, intrusion or aspiration concerns, occlusal injury, and possible effects on the permanent successor.",
      "Provide analgesia and hygiene instructions as appropriate, document the injury, and arrange follow-up based on the examination.",
    ],
    hygienist: [
      "Do not replant an avulsed primary tooth. Support urgent assessment, document the reported injury time and symptoms, and reinforce clinician-approved home-care and follow-up instructions.",
      "Escalate airway concerns, uncontrolled bleeding, altered consciousness, or suspected head injury immediately.",
    ],
    reception: [
      "Do not advise replanting a primary tooth. Arrange same-day clinical triage, record when the injury happened, and screen for emergency warning signs using the practice protocol.",
      "Avoid giving a prognosis or clinical treatment plan; route those questions to the treating clinician.",
    ],
  },
  prophylaxis: {
    student: [
      "Antibiotic prophylaxis is limited to specific high-risk cardiac conditions for procedures involving gingival manipulation, the periapical region, or oral mucosal perforation.",
      "A prosthetic joint alone is not a routine indication. Learn the qualifying cardiac categories and confirm current guidance rather than memorizing broad historical rules.",
    ],
    dentist: [
      "Consider prophylaxis only after confirming a highest-risk cardiac condition and that the planned procedure meets the procedural threshold.",
      "Review the current medical history, allergy profile, regimen, and timing. Coordinate with the physician when the cardiac history or recommendation is unclear.",
    ],
    hygienist: [
      "Before procedures that manipulate gingival tissue, verify whether a documented highest-risk cardiac condition is present and whether the dentist has confirmed prophylaxis.",
      "Do not infer eligibility from a vague heart-history note or prosthetic joint alone; pause and escalate unclear histories.",
    ],
    reception: [
      "Do not decide whether prophylaxis is needed. Collect the relevant medical-history update and any physician documentation, then route the decision to the clinical team.",
      "When instructed, help the patient confirm prescription timing and appointment logistics without giving new medication advice.",
    ],
  },
  fluoride: {
    student: [
      "Base professional fluoride on individual caries risk rather than age alone. Higher-risk patients generally need more intensive professional and home-prevention planning.",
      "Consider disease activity, fluoride exposure, diet, oral hygiene, medical factors, and ability to use home products safely.",
    ],
    dentist: [
      "Document caries risk and use it to set varnish frequency and the broader prevention plan. Higher-risk children generally need varnish at shorter recall intervals than low-risk children.",
      "Reassess risk as conditions change and tailor home fluoride to age, swallowing ability, total exposure, and active disease.",
    ],
    hygienist: [
      "Use the documented caries-risk assessment to guide varnish frequency, education, and recall recommendations. Reinforce toothpaste amount, supervision, diet, and adherence.",
      "Update risk indicators at preventive visits and flag new lesions or exposure changes for the dentist.",
    ],
    reception: [
      "Use the clinician’s documented fluoride and recall plan when scheduling. Do not assign a risk category or recommend a clinical frequency from the front desk.",
      "You can explain that recommendations vary by cavity risk and direct clinical questions to the hygienist or dentist.",
    ],
  },
  estimate: {
    student: [
      "Keep clinical need separate from coverage. A complete estimate workflow checks the treatment plan, coding source, eligibility, deductible, annual maximum, limitations, and authorization requirements.",
      "The patient should be told that an estimate is not a guarantee of insurer payment.",
    ],
    dentist: [
      "Confirm the clinical plan and documentation, then hand off benefit and fee verification to the entitled revenue-cycle role.",
      "Do not change the clinical recommendation solely to match an unverified coverage assumption.",
    ],
    hygienist: [
      "Confirm that recommended preventive or periodontal services are documented and that the care plan is clear before the estimate is prepared.",
      "Route benefit interpretation and patient-responsibility calculations to the entitled administrative team.",
    ],
    reception: [
      "Verify active eligibility, benefit period, deductible, annual maximum, frequency limits, waiting periods, network status, and predetermination requirements before presenting an estimate.",
      "Document when and how benefits were checked, use current fees and approved codes, and state clearly that the estimate is not a guarantee of payment.",
    ],
  },
};

const questionSources: Record<keyof typeof questions, string[]> = {
  trauma: ["iadt-trauma", "practice-emergency"],
  prophylaxis: ["ada-prophylaxis"],
  fluoride: ["aapd-fluoride"],
  estimate: ["benefit-handbook", "cdt-reference"],
};

const roleLabel: Record<Persona, string> = {
  student: "Dental student",
  dentist: "Dentist",
  hygienist: "Dental hygienist",
  reception: "Reception",
};

const makeAnswer = (key: keyof typeof questions, persona: Persona): DemoAnswer => {
  const sourceIds = questionSources[key].filter((id) => {
    const source = sources.find((item) => item.id === id);
    return source?.access[persona]?.retrieved;
  });
  const citationSources = sourceIds.map((id) => sources.find((source) => source.id === id)!);
  return {
    id: `${persona}-${key}`,
    prompt: questions[key],
    shortPrompt: questions[key],
    persona,
    answer: answerText[key][persona],
    citations: citationSources.map((source) => ({
      sourceId: source.id,
      label: `${source.publisher} · ${source.edition}`,
    })),
    claims: [
      {
        claim: answerText[key][persona][0],
        sourceIds,
        strength: sourceIds.length > 1 ? "strong" : sourceIds.length === 1 ? "moderate" : "limited",
        recency: citationSources.map((source) => source.recency).join(" · ") || "No entitled source retrieved",
        flag: sourceIds.length === 0 ? "unsupported" : undefined,
        note: sourceIds.length === 0 ? "This role is not entitled to retrieve the source text; the answer is limited to a safe handoff." : undefined,
      },
    ],
    evidenceTrace: [
      { stage: "scope", detail: `Applied the ${roleLabel[persona]} response scope`, result: "Role selected" },
      { stage: "access", detail: `Checked ${questionSources[key].length} source policies before text retrieval`, result: `${sourceIds.length} retrievable` },
      { stage: "retrieve", detail: "Loaded only passages allowed for this role", result: `${citationSources.length} passages` },
      { stage: "rank", detail: "Matched the question to source section and exact passage", result: "Deterministic order" },
      { stage: "compose", detail: "Separated clinical guidance, workflow, and access limits", result: "Citations attached" },
    ],
  };
};

export const demoAnswers: DemoAnswer[] = (Object.keys(questions) as Array<keyof typeof questions>)
  .flatMap((key) => roles.map((persona) => makeAnswer(key, persona)));

export const getAnswer = (persona: Persona, prompt: string) => {
  const key = (Object.keys(questions) as Array<keyof typeof questions>)
    .find((questionKey) => questions[questionKey] === prompt) ?? "trauma";
  return makeAnswer(key, persona);
};

export const connectors: Connector[] = [
  { id: "files", name: "Practice files", description: "Policies, consent templates, and clinical protocols.", status: "connected", lastSync: "Today, 8:42 AM", accessSummary: "Folder and role rules", recordCount: "128 documents" },
  { id: "publisher", name: "Publisher links", description: "Guidelines and professional reference metadata.", status: "connected", lastSync: "Today, 8:35 AM", accessSummary: "Rights-aware passage cache", recordCount: "346 records" },
  { id: "benefits", name: "Benefits workspace", description: "Entitled administrative guidance and verification scripts.", status: "needs-attention", lastSync: "Yesterday, 4:10 PM", accessSummary: "Reception role only", recordCount: "74 documents" },
  { id: "patient-context", name: "Patient context", description: "Optional clinical context, disabled by default.", status: "demo", lastSync: "Loaded only when enabled", accessSummary: "Clinical roles only", recordCount: "No active patient" },
];

export const auditEvents: AuditEvent[] = [
  { id: "evt-1", action: "Answer generated", actor: "Dr. Elena Ruiz", target: "Antibiotic prophylaxis question", time: "Today, 9:14 AM", detail: "Role scope applied; one current source cited.", outcome: "completed" },
  { id: "evt-2", action: "Source excluded", actor: "Access policy", target: "Patient clinical chart", time: "Today, 9:09 AM", detail: "General assistant request had no patient context.", outcome: "filtered" },
  { id: "evt-3", action: "Document opened", actor: "Jordan Lee", target: "Benefits verification handbook", time: "Today, 9:08 AM", detail: "Entitlement verified for reception role.", outcome: "allowed" },
  { id: "evt-4", action: "Evidence trace recorded", actor: "Dental Evidence", target: "Primary tooth avulsion answer", time: "Yesterday, 3:32 PM", detail: "Access was checked before two passages were ranked.", outcome: "completed" },
];
