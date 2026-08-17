// Coordinates the general dental assistant, backend role scope, patient context, and evidence.
"use client";

import { FormEvent, useState } from "react";
import {
  applyBackendPreview,
  applyRegistryPreview,
  fetchDocumentPreview,
  fetchRegistryPreview,
  fetchRegistrySources,
  fetchRegistryTextFile,
  mapBackendChatResult,
  PATIENT_CONTEXT_ID,
  personaToUserId,
  streamChat,
} from "@/lib/api";
import { getAnswer, patient, sampleQuestions, sources as fixtureSources } from "@/lib/demo-data";
import type { DemoAnswer, EvidenceSource, Persona } from "@/lib/types";
import { SourcePanel, type PanelTab } from "./SourcePanel";

const staticDeployment = process.env.NEXT_PUBLIC_STATIC_DEMO === "true";

const roleOptions: Array<{ id: Persona; label: string; initials: string }> = [
  { id: "student", label: "Student", initials: "ST" },
  { id: "dentist", label: "Dentist", initials: "DR" },
  { id: "hygienist", label: "Hygienist", initials: "DH" },
  { id: "reception", label: "Reception", initials: "RC" },
];

const accessAction = (source: EvidenceSource, persona: Persona) => {
  const policy = source.access[persona] ?? source.currentAccess;
  if (policy.scenario === "excluded") return "Excluded before retrieval";
  if (policy.entitlement === "not-entitled") return "Request entitlement";
  if (policy.preview === "metadata-only") return "View citation metadata";
  if (policy.original === "open") return "Preview or open original";
  if (policy.preview === "watermarked") return "Open licensed preview";
  return "View source details";
};

export function ChatExperience() {
  const [persona, setPersona] = useState<Persona>("dentist");
  const [prompt, setPrompt] = useState<string>(sampleQuestions[0]);
  const [displayedQuestion, setDisplayedQuestion] = useState<string>(sampleQuestions[0]);
  const [input, setInput] = useState("");
  const [patientContext, setPatientContext] = useState(false);
  const [sourcePanelOpen, setSourcePanelOpen] = useState(false);
  const [selectedSourceId, setSelectedSourceId] = useState("iadt-trauma");
  const [panelTab, setPanelTab] = useState<PanelTab>("sources");
  const [responseMode, setResponseMode] = useState<"demo" | "live">("demo");
  const [liveAnswer, setLiveAnswer] = useState<DemoAnswer | null>(null);
  const [liveSources, setLiveSources] = useState<EvidenceSource[]>([]);
  const [streamedText, setStreamedText] = useState("");
  const [loading, setLoading] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const answer = responseMode === "demo" ? getAnswer(persona, prompt) : liveAnswer;
  const activeSources = responseMode === "demo" ? fixtureSources : liveSources;
  const activeRole = roleOptions.find((role) => role.id === persona)!;
  const patientContextAllowed = persona === "dentist" || persona === "hygienist";
  const activePatientContextId = patientContext ? PATIENT_CONTEXT_ID : undefined;

  const selectSource = async (sourceId: string) => {
    setSelectedSourceId(sourceId);
    setPanelTab("sources");
    setSourcePanelOpen(true);
    setPreviewError(null);
    if (responseMode !== "live") return;

    const source = liveSources.find((item) => item.id === sourceId);
    const policy = source ? source.access[persona] ?? source.currentAccess : undefined;
    if (
      !source
      || !policy
      || policy.preview === "none"
      || policy.preview === "metadata-only"
      || source.fullText
    ) return;

    if (source.mediaType === "application/pdf" && source.pdfUrl) return;

    setPreviewLoading(true);
    try {
      const isRegistrySource = Boolean(source.passageStatus) || source.origin.includes("Registry");
      if (isRegistrySource) {
        const preview = await fetchRegistryPreview(sourceId, persona, activePatientContextId);
        const fullText = preview.state === "available"
          ? await fetchRegistryTextFile(sourceId, persona, activePatientContextId)
          : "";
        setLiveSources((current) =>
          current.map((item) => item.id === sourceId
            ? applyRegistryPreview(item, { ...preview, text: fullText })
            : item),
        );
        return;
      }
      const preview = await fetchDocumentPreview(sourceId, persona);
      setLiveSources((current) =>
        current.map((item) => item.id === sourceId ? applyBackendPreview(item, preview) : item),
      );
    } catch (error) {
      setPreviewError(error instanceof Error ? error.message : "Preview request failed.");
    } finally {
      setPreviewLoading(false);
    }
  };

  const askSampleQuestion = (nextPrompt: string) => {
    setResponseMode("demo");
    setPrompt(nextPrompt);
    setDisplayedQuestion(nextPrompt);
    setInput("");
    setConnectionError(null);
    setStreamedText("");
    setLiveAnswer(null);
    setSourcePanelOpen(false);
  };

  const runLiveQuestion = async (question: string, activePersona: Persona) => {
    setResponseMode("live");
    setDisplayedQuestion(question);
    setLiveAnswer(null);
    setLiveSources([]);
    setStreamedText("");
    setConnectionError(null);
    setSourcePanelOpen(false);
    setLoading(true);
    try {
      const patientId =
        patientContext && (activePersona === "dentist" || activePersona === "hygienist")
          ? PATIENT_CONTEXT_ID
          : undefined;
      const result = await streamChat(question, activePersona, patientId, (token) => {
        setStreamedText((current) => current + token);
      });
      const sourceResults = await fetchRegistrySources(activePersona, patientId);
      const mapped = mapBackendChatResult(result, question, activePersona, patientId);
      const citedById = new Map(mapped.citationSources.map((source) => [source.id, source]));
      const mergedSources = sourceResults.map((source) => {
        const cited = citedById.get(source.id);
        return cited ? {
          ...source,
          ...cited,
          mediaType: source.mediaType,
          passageStatus: source.passageStatus,
          aiUsageRights: source.aiUsageRights,
          hostingPermission: source.hostingPermission,
          allowedRoles: source.allowedRoles,
        } : source;
      });
      const knownIds = new Set(mergedSources.map((source) => source.id));
      setLiveSources([
        ...mergedSources,
        ...mapped.citationSources.filter((source) => !knownIds.has(source.id)),
      ]);
      setLiveAnswer(mapped.answer);
      setSelectedSourceId(mapped.answer.citations[0]?.sourceId ?? sourceResults[0]?.id ?? "");
    } catch (error) {
      setConnectionError(
        error instanceof Error ? error.message : "The backend request failed without an error message.",
      );
    } finally {
      setLoading(false);
    }
  };

  const changePersona = (nextPersona: Persona) => {
    setPersona(nextPersona);
    setPreviewError(null);
    if (nextPersona === "student" || nextPersona === "reception") setPatientContext(false);
    if (responseMode === "live" && !staticDeployment) {
      void runLiveQuestion(displayedQuestion, nextPersona);
    }
  };

  const submitQuestion = (event: FormEvent) => {
    event.preventDefault();
    const question = input.trim();
    if (!question) return;
    const matchedPrompt = sampleQuestions.find((item) => item.toLowerCase() === question.toLowerCase());
    setInput("");
    if (matchedPrompt) {
      askSampleQuestion(matchedPrompt);
      return;
    }
    if (staticDeployment) {
      setResponseMode("live");
      setDisplayedQuestion(question);
      setLiveAnswer(null);
      setLiveSources([]);
      setStreamedText("");
      setConnectionError(
        "Live questions and uploads are disabled on GitHub Pages. Run the frontend with the local FastAPI service to use live retrieval, or choose a sample question.",
      );
      setSourcePanelOpen(false);
      return;
    }
    void runLiveQuestion(question, persona);
  };

  return (
    <main className="chat-layout">
      <aside className="chat-sidebar">
        <button className="new-chat" type="button" onClick={() => askSampleQuestion(sampleQuestions[0])}>
          <span>+</span> New conversation
        </button>
        <div className="sidebar-section">
          <span className="sidebar-label">Sample questions</span>
          {sampleQuestions.map((item) => (
            <button
              className={responseMode === "demo" && prompt === item ? "active" : ""}
              key={item}
              onClick={() => askSampleQuestion(item)}
              type="button"
            >
              {item}
            </button>
          ))}
        </div>
        <div className="sidebar-note">
          <strong>{responseMode === "demo" ? "Sample answer" : "Live retrieval"}</strong>
          <p>
            {responseMode === "demo"
              ? "Choose a sample question or ask the live evidence service when running locally."
              : staticDeployment
                ? "Static hosting keeps uploads and private retrieval disabled."
                : `Live requests use ${personaToUserId(persona)} with backend authorization.`}
          </p>
        </div>
      </aside>

      <section className="conversation">
        <header className="conversation-header">
          <div className="assistant-context">
            <span className="eyebrow">{patientContext ? "Optional patient context" : "General dental assistant"}</span>
            {patientContext ? (
              <>
                <div className="patient-heading">
                  <h1>{patient.name}</h1>
                  <span>{patient.id}</span>
                  <span>{patient.age} years</span>
                </div>
                <p>
                  {`Last visit ${patient.lastVisit} · ${patient.conditions.join(" · ")} · Allergy: ${patient.allergies.join(", ")}`}
                </p>
              </>
            ) : (
              <>
                <h1>Ask across clinical care, prevention, education, and practice workflow</h1>
                <p>No patient record is attached to this conversation.</p>
              </>
            )}
          </div>
          <div className="header-controls">
            <div className="persona-control">
              <span>Answer for</span>
              <div>
                {roleOptions.map((role) => (
                  <button
                    disabled={loading}
                    className={persona === role.id ? "active" : ""}
                    key={role.id}
                    onClick={() => changePersona(role.id)}
                    type="button"
                  >
                    {role.label}
                  </button>
                ))}
              </div>
            </div>
            <label className={`patient-context-control ${!patientContextAllowed ? "disabled" : ""}`}>
              <input
                checked={patientContext}
                disabled={!patientContextAllowed || loading}
                onChange={(event) => setPatientContext(event.target.checked)}
                type="checkbox"
              />
              Patient context {patientContextAllowed ? "(optional)" : "available to clinical roles only"}
            </label>
          </div>
        </header>

        <div className="message-scroll">
          <div className="demo-prompts" aria-label="Sample questions">
            {sampleQuestions.map((item) => (
              <button key={item} onClick={() => askSampleQuestion(item)} type="button">{item}</button>
            ))}
          </div>

          <div className="message user-message">
            <div className="avatar user-avatar">{activeRole.initials}</div>
            <div>
              <span className="message-author">{activeRole.label} view</span>
              <p>{displayedQuestion}</p>
            </div>
          </div>

          <div className="message assistant-message">
            <div className="avatar assistant-avatar">DE</div>
            <div className="answer-body">
              <div className="answer-heading">
                <div>
                  <span className="message-author">Dental Evidence</span>
                  <small>
                    {responseMode === "demo"
                      ? `Sample answer · ${activeRole.label}`
                      : staticDeployment
                        ? "Sample answer · live service unavailable"
                        : `Live backend · ${personaToUserId(persona)}${answer?.retrievalMode ? ` · ${answer.retrievalMode}` : ""}`}
                  </small>
                </div>
                {answer && (
                  <button className="why-button" onClick={() => {
                    setPanelTab("evidence");
                    setSourcePanelOpen(true);
                  }} type="button">
                    Evidence trace
                  </button>
                )}
              </div>
              {loading && (
                <div className="backend-loading" role="status">
                  <strong>Receiving authorized backend answer</strong>
                  <p>{streamedText || "Connecting to the evidence service…"}</p>
                </div>
              )}
              {connectionError && (
                <div className="backend-error" role="alert">
                  <strong>Live request unavailable</strong>
                  <p>{connectionError}</p>
                  <span>No sample answer was substituted.</span>
                </div>
              )}
              {answer && !loading && !connectionError && (
                <>
                  {answer.answer.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
                  <div className="citation-card-row" aria-label="Citations">
                    {answer.citations.map((citation, index) => {
                      const source = activeSources.find((item) => item.id === citation.sourceId);
                      if (!source) return null;
                      return (
                        <button key={citation.sourceId} onClick={() => selectSource(citation.sourceId)} type="button">
                          <span className="citation-number">{index + 1}</span>
                          <strong>{source.title}</strong>
                          <small>{source.publisher} · {source.edition}</small>
                          <small>{source.section} · {source.page}</small>
                          <span className="citation-action">{accessAction(source, persona)}</span>
                        </button>
                      );
                    })}
                  </div>
                  <div className="answer-disclaimer">
                    Educational and decision support only. Confirm clinical judgment, patient factors, and current guidance.
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="composer-wrap">
          <form className="composer" onSubmit={submitQuestion}>
            <input
              aria-label="Ask Dental Evidence"
              disabled={loading}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Ask a general dental question"
              value={input}
            />
            <button disabled={loading} type="submit">{loading ? "Working" : "Ask"}</button>
          </form>
          <small>
            {responseMode === "demo"
              ? "Sample response · Patient context off by default"
              : staticDeployment
                ? "GitHub Pages · Run locally for live retrieval and uploads"
                : `Live mode · ${personaToUserId(persona)} · ${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}`}
          </small>
        </div>
      </section>

      {answer && (
        <SourcePanel
          answer={answer}
          sources={activeSources}
          onClose={() => setSourcePanelOpen(false)}
          onSelectSource={selectSource}
          onTabChange={setPanelTab}
          open={sourcePanelOpen}
          tab={panelTab}
          persona={persona}
          previewError={previewError}
          previewLoading={previewLoading}
          selectedSourceId={selectedSourceId}
        />
      )}
      {sourcePanelOpen && <button className="panel-backdrop" aria-label="Close evidence panel" onClick={() => setSourcePanelOpen(false)} type="button" />}
    </main>
  );
}
